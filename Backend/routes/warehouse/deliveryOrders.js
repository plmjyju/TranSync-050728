import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import { withRedisLock } from "../../utils/withRedisLock.js";
import { recalcDeliveryOrderStats } from "../../utils/deliveryOrderStats.js";
import { recalcForecastPalletProgress } from "../../utils/forecastProgress.js";
import { getRedis } from "../../utils/redisClient.js";
import { writeAudit } from "../../utils/auditHelper.js";
import { writeFtzInboundLedger } from "../../utils/ftzLedger.js";
import { Op } from "sequelize";

const router = express.Router();
const buildResp = (message, extra = {}) => ({
  success: true,
  message,
  ...extra,
});
const buildFail = (code, message, extra = {}) => ({
  success: false,
  code,
  message,
  ...extra,
});

// 生成 DO 号: DO<YYMMDD>-<序号>
async function generateDONumber() {
  const now = new Date();
  const ds = now.toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD
  const key = `seq:do:${ds}`;
  try {
    const r = await getRedis();
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 3 * 24 * 3600);
    return `DO${ds}-${String(n).padStart(2, "0")}`;
  } catch {
    const count = await db.DeliveryOrder.count();
    return `DO${ds}-F${count + 1}`;
  }
}

// 创建提货单 (支持部分板)
router.post(
  "/delivery-orders",
  authenticate,
  checkPermission("warehouse.delivery_order.create"),
  async (req, res) => {
    const {
      driver_name,
      driver_id_number,
      vehicle_plate,
      pickup_location,
      pallets = [],
      packages = [],
      management_type = "pallet",
      remark,
    } = req.body || {};
    if (!driver_name || !driver_id_number || !vehicle_plate || !pickup_location)
      return res
        .status(400)
        .json(buildFail("DO_CREATE_MISSING_FIELDS", "缺少必要字段"));
    const t = await db.sequelize.transaction();
    try {
      const do_number = await generateDONumber();
      const created = await db.DeliveryOrder.create(
        {
          do_number,
          status: "pending",
          driver_name,
          driver_id_number,
          vehicle_plate,
          pickup_location,
          management_type,
          created_by: req.user.id,
          remark,
        },
        { transaction: t }
      );
      // 绑定板
      for (const p of pallets) {
        if (!p.pallet_id) continue;
        const pallet = await db.Pallet.findByPk(p.pallet_id, {
          transaction: t,
        });
        if (!pallet) continue;
        await db.DeliveryOrderPallet.create(
          {
            delivery_order_id: created.id,
            pallet_id: pallet.id,
            forecast_id: pallet.forecast_id,
            loading_sequence: p.loading_sequence || null,
            awb: p.awb || pallet.pallet_code,
            total_package_count: pallet.box_count || 0,
          },
          { transaction: t }
        );
      }
      // 绑定包裹 (包裹模式)
      for (const pkgId of packages) {
        const pkg = await db.Package.findByPk(pkgId, { transaction: t });
        if (!pkg) continue;
        await db.DeliveryOrderPackage.create(
          { delivery_order_id: created.id, package_id: pkg.id },
          { transaction: t }
        );
      }
      await recalcDeliveryOrderStats(created.id, { transaction: t });
      await t.commit();
      writeAudit({
        module: "warehouse",
        entityType: "DeliveryOrder",
        entityId: created.id,
        action: "create",
        user: req.user,
        before: null,
        after: created.toJSON(),
        extra: { pallets: pallets.length, packages: packages.length },
      });
      return res
        .status(201)
        .json(buildResp("提货单创建成功", { delivery_order: created }));
    } catch (e) {
      await t.rollback();
      console.error("create delivery order error", e);
      return res
        .status(500)
        .json(buildFail("DO_CREATE_FAILED", "提货单创建失败"));
    }
  }
);

// 查询提货单（简单分页）
router.get(
  "/delivery-orders",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    let { page = 1, pageSize = 20, status } = req.query;
    page = parseInt(page) || 1;
    pageSize = Math.min(100, parseInt(pageSize) || 20);
    const where = {};
    if (status) where.status = status;
    const { rows, count } = await db.DeliveryOrder.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      attributes: [
        "id",
        "do_number",
        "status",
        "planned_pallet_count",
        "picked_pallet_count",
        "total_package_count",
        "picked_package_count",
        "driver_name",
        "vehicle_plate",
        "pickup_time",
        "departure_time",
        "arrival_time",
        "delivery_time",
        "created_at",
      ],
    });
    return res.json(
      buildResp("提货单列表", {
        page,
        pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
        list: rows,
      })
    );
  }
);

// 查看详情
router.get(
  "/delivery-orders/:id",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    const { id } = req.params;
    const doObj = await db.DeliveryOrder.findByPk(id, {
      include: [
        { model: db.DeliveryOrderPallet, as: "pallets" },
        { model: db.DeliveryOrderPackage, as: "packages" },
      ],
    });
    if (!doObj)
      return res.status(404).json(buildFail("DO_NOT_FOUND", "提货单不存在"));
    return res.json(buildResp("提货单详情", { delivery_order: doObj }));
  }
);

// 开始提货(状态 pending -> picked_up 部分 或保持 pending 直接扫描也可)
router.post(
  "/delivery-orders/:id/pick-start",
  authenticate,
  checkPermission("warehouse.delivery_order.pick"),
  async (req, res) => {
    const { id } = req.params;
    const doObj = await db.DeliveryOrder.findByPk(id);
    if (!doObj)
      return res.status(404).json(buildFail("DO_NOT_FOUND", "提货单不存在"));
    if (doObj.status !== "pending")
      return res.status(400).json(buildFail("DO_STATUS_INVALID", "状态不允许"));
    const before = doObj.toJSON();
    await doObj.update({
      status: "picked_up",
      pickup_time: new Date(),
      operator: req.user.username,
      operator_id: req.user.id,
    });
    writeAudit({
      module: "warehouse",
      entityType: "DeliveryOrder",
      entityId: doObj.id,
      action: "pick-start",
      user: req.user,
      before,
      after: doObj.toJSON(),
    });
    return res.json(buildResp("提货开始", { id: doObj.id }));
  }
);

// 板扫描提货（部分）: 支持一次只提部分板，剩余留待后续车次
router.post(
  "/delivery-orders/:id/pick-pallets",
  authenticate,
  checkPermission("warehouse.delivery_order.pick"),
  async (req, res) => {
    const { id } = req.params;
    const { pallet_ids = [] } = req.body || {};
    if (!Array.isArray(pallet_ids) || pallet_ids.length === 0)
      return res
        .status(400)
        .json(buildFail("DO_PICK_INPUT_EMPTY", "缺少 pallet_ids"));
    try {
      return await withRedisLock(`lock:do:${id}:pick`, 5, async () => {
        const t = await db.sequelize.transaction();
        try {
          const doObj = await db.DeliveryOrder.findByPk(id, { transaction: t });
          if (!doObj) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("DO_NOT_FOUND", "提货单不存在"));
          }
          if (!["pending", "picked_up"].includes(doObj.status)) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("DO_STATUS_INVALID", "当前状态不允许提货"));
          }
          const doPallets = await db.DeliveryOrderPallet.findAll({
            where: { delivery_order_id: id, pallet_id: pallet_ids },
            transaction: t,
          });
          if (doPallets.length === 0) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("DO_PALLETS_NOT_FOUND", "无匹配板"));
          }
          for (const rel of doPallets) {
            if (rel.pickup_status === "picked") continue; // 幂等
            rel.pickup_status = "picked";
            rel.picked_package_count = rel.total_package_count;
            await rel.save({ transaction: t });
          }
          await recalcDeliveryOrderStats(id, { transaction: t });
          const afterPallets = await db.DeliveryOrderPallet.findAll({
            where: { delivery_order_id: id },
            transaction: t,
          });
          const allPicked = afterPallets.every(
            (p) => p.pickup_status === "picked"
          );
          const beforeDO = doObj.toJSON();
          if (allPicked) {
            await doObj.update(
              {
                status: "in_transit",
                departure_time: doObj.departure_time || new Date(),
              },
              { transaction: t }
            );
          } else if (
            doObj.status === "pending" ||
            doObj.status === "picked_up"
          ) {
            await doObj.update(
              { status: "partial_picked" },
              { transaction: t }
            );
          }
          const afterDO = doObj.toJSON();
          await t.commit();
          writeAudit({
            module: "warehouse",
            entityType: "DeliveryOrder",
            entityId: doObj.id,
            action: "pick-pallets",
            user: req.user,
            before: beforeDO,
            after: afterDO,
            extra: { pallet_ids, allPicked },
          });
          return res.json(buildResp("板提货成功", { id: doObj.id, allPicked }));
        } catch (e) {
          await t.rollback();
          console.error("pick pallets error", e);
          return res
            .status(500)
            .json(buildFail("DO_PICK_PALLETS_FAILED", "板提货失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res.status(429).json(buildFail("DO_PICK_BUSY", "提货处理中"));
      throw e;
    }
  }
);

// 部分混装新增板(后续车次或混其它 AWB)
router.post(
  "/delivery-orders/:id/append-pallets",
  authenticate,
  checkPermission("warehouse.delivery_order.edit"),
  async (req, res) => {
    const { id } = req.params;
    const { pallets = [] } = req.body || {};
    if (!Array.isArray(pallets) || pallets.length === 0)
      return res.status(400).json(buildFail("DO_APPEND_EMPTY", "缺少 pallets"));
    const t = await db.sequelize.transaction();
    try {
      const doObj = await db.DeliveryOrder.findByPk(id, { transaction: t });
      if (!doObj) {
        await t.rollback();
        return res.status(404).json(buildFail("DO_NOT_FOUND", "提货单不存在"));
      }
      if (!["pending", "picked_up", "in_transit"].includes(doObj.status)) {
        await t.rollback();
        return res
          .status(400)
          .json(buildFail("DO_APPEND_FORBIDDEN_STATUS", "当前状态不可追加"));
      }
      for (const p of pallets) {
        if (!p.pallet_id) continue;
        const pallet = await db.Pallet.findByPk(p.pallet_id, {
          transaction: t,
        });
        if (!pallet) continue;
        const exist = await db.DeliveryOrderPallet.findOne({
          where: { delivery_order_id: id, pallet_id: pallet.id },
          transaction: t,
        });
        if (exist) continue;
        await db.DeliveryOrderPallet.create(
          {
            delivery_order_id: id,
            pallet_id: pallet.id,
            forecast_id: pallet.forecast_id,
            loading_sequence: p.loading_sequence || null,
            awb: p.awb || pallet.pallet_code,
            total_package_count: pallet.box_count || 0,
          },
          { transaction: t }
        );
      }
      await recalcDeliveryOrderStats(id, { transaction: t });
      const before = doObj.toJSON();
      // 追加后如果此前是 in_transit 需要回退? 这里保持不变, 若业务需要可加逻辑
      await t.commit();
      writeAudit({
        module: "warehouse",
        entityType: "DeliveryOrder",
        entityId: doObj.id,
        action: "append-pallets",
        user: req.user,
        before,
        after: doObj.toJSON(),
        extra: { appended: pallets.length },
      });
      return res.json(buildResp("追加板成功", {}));
    } catch (e) {
      await t.rollback();
      console.error("append pallets error", e);
      return res
        .status(500)
        .json(buildFail("DO_APPEND_PALLETS_FAILED", "追加板失败"));
    }
  }
);

// 到仓扫描接收板（部分到仓） -> 语义: 到仓(不强制 AWB), 与 inbound 共享同一锁键避免交叉并发
router.post(
  "/delivery-orders/:id/arrive-pallets",
  authenticate,
  checkPermission("warehouse.delivery_order.inbound"),
  async (req, res) => {
    const { id } = req.params;
    const { pallet_ids = [], pallet_codes = [], awb } = req.body || {};
    // 输入统一转换为 codes；pallet_ids 反查时加入租户/仓库过滤
    let codes = [];
    if (Array.isArray(pallet_codes) && pallet_codes.length) {
      codes = pallet_codes;
    } else if (Array.isArray(pallet_ids) && pallet_ids.length) {
      const palletIdWhere = { id: pallet_ids };
      if (req.user.tenant_id && db.Pallet.rawAttributes?.tenant_id) {
        palletIdWhere.tenant_id = req.user.tenant_id;
      }
      if (req.user.warehouse_id && db.Pallet.rawAttributes?.warehouse_id) {
        palletIdWhere.warehouse_id = req.user.warehouse_id;
      }
      const ps = await db.Pallet.findAll({ where: palletIdWhere });
      codes = ps.map((p) => p.pallet_code);
    } else {
      return res
        .status(400)
        .json(
          buildFail("DO_ARRIVE_INPUT_EMPTY", "缺少 pallet_ids/pallet_codes")
        );
    }
    try {
      // 统一使用 inbound 锁键: lock:do:{id}:inbound
      return await withRedisLock(`lock:do:${id}:inbound`, 10, async () => {
        const t = await db.sequelize.transaction();
        try {
          const doObj = await db.DeliveryOrder.findByPk(id, { transaction: t });
          if (!doObj) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("DO_NOT_FOUND", "提货单不存在"));
          }
          // arrive 不强制 awb; 仅当客户端传入时才校验
          const result = await inboundStorePallets({
            doObj,
            palletCodes: codes,
            awb, // 可选
            user: req.user,
            transaction: t,
            expectTenantId: req.user.tenant_id,
            expectWarehouseId: req.user.warehouse_id,
          });
          if (result.error) {
            await t.rollback();
            return res
              .status(result.error.code?.startsWith("INBOUND") ? 400 : 404)
              .json(result.error);
          }
          const {
            newlyInbound,
            updatedPackages,
            totalSku,
            allStored,
            beforeDO,
            afterDO,
            beforePalletMap,
            changedPallets,
            pallets,
            noop,
            palletIds,
            palletCodes,
          } = result;
          await t.commit();
          if (!noop) {
            writeAudit({
              module: "warehouse",
              entityType: "DeliveryOrder",
              entityId: doObj.id,
              action: "arrive-pallets",
              user: req.user,
              before: beforeDO,
              after: afterDO,
              extra: {
                pallet_ids: palletIds,
                pallet_codes: palletCodes,
                awb,
                newly_inbound_pallets: newlyInbound,
                updated_packages: updatedPackages,
                total_sku: totalSku,
                allArrived: allStored,
              },
            });
            for (const pallet of changedPallets) {
              writeAudit({
                module: "warehouse",
                entityType: "Pallet",
                entityId: pallet.id,
                action: "arrive-store",
                user: req.user,
                before: beforePalletMap.get(pallet.id),
                after: pallet.toJSON(),
                extra: { do_id: doObj.id },
              });
            }
          }
          return res.json(
            buildResp(noop ? "已到仓(幂等)" : "板到仓成功", {
              do_id: doObj.id,
              pallet_ids: palletIds,
              pallet_codes: palletCodes,
              newly_inbound_pallets: newlyInbound,
              updated_packages: updatedPackages,
              total_sku: totalSku,
              allArrived: allStored,
              noop,
            })
          );
        } catch (e) {
          await t.rollback();
          console.error("arrive pallets error", e);
          return res
            .status(500)
            .json(buildFail("DO_ARRIVE_PALLETS_FAILED", "到仓处理失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res.status(429).json(buildFail("DO_ARRIVE_BUSY", "到仓处理中"));
      throw e;
    }
  }
);

// 完成交付（全部板到仓且已拆分或无需拆分）
router.post(
  "/delivery-orders/:id/complete",
  authenticate,
  checkPermission("warehouse.delivery_order.inbound"),
  async (req, res) => {
    const { id } = req.params;
    const doObj = await db.DeliveryOrder.findByPk(id);
    if (!doObj)
      return res.status(404).json(buildFail("DO_NOT_FOUND", "提货单不存在"));
    if (!["arrived", "in_transit"].includes(doObj.status))
      return res
        .status(400)
        .json(buildFail("DO_COMPLETE_FORBIDDEN_STATUS", "状态不允许完成"));
    const before = doObj.toJSON();
    await doObj.update({ status: "delivered", delivery_time: new Date() });
    writeAudit({
      module: "warehouse",
      entityType: "DeliveryOrder",
      entityId: doObj.id,
      action: "complete",
      user: req.user,
      before,
      after: doObj.toJSON(),
    });
    return res.json(buildResp("提货单完成", { id: doObj.id }));
  }
);

// 申请结算(进入待上传签字DO)
router.post(
  "/delivery-orders/:id/request-settlement",
  authenticate,
  checkPermission("warehouse.delivery_order.settlement"),
  async (req, res) => {
    const { id } = req.params;
    const doObj = await db.DeliveryOrder.findByPk(id);
    if (!doObj)
      return res.status(404).json(buildFail("DO_NOT_FOUND", "提货单不存在"));
    if (doObj.status !== "delivered")
      return res
        .status(400)
        .json(
          buildFail(
            "DO_REQUEST_SETTLEMENT_STATUS_INVALID",
            "仅已完成(delivered)的DO可申请结算"
          )
        );
    if (!["pending", "awaiting_proof"].includes(doObj.settlement_state))
      return res
        .status(400)
        .json(buildFail("DO_SETTLEMENT_FLOW_INVALID", "当前结算状态不可申请"));
    const before = doObj.toJSON();
    await doObj.update({
      settlement_state: "awaiting_proof",
      operator: req.user.username,
      operator_id: req.user.id,
    });
    writeAudit({
      module: "warehouse",
      entityType: "DeliveryOrder",
      entityId: doObj.id,
      action: "request-settlement",
      user: req.user,
      before,
      after: doObj.toJSON(),
    });
    return res.json(
      buildResp("已进入待上传签字DO", {
        id: doObj.id,
        settlement_state: doObj.settlement_state,
      })
    );
  }
);

// 上传签字DO/司机签名(支持二次更新替换)
router.post(
  "/delivery-orders/:id/upload-proof",
  authenticate,
  checkPermission("warehouse.delivery_order.settlement"),
  async (req, res) => {
    const { id } = req.params;
    const { signed_do_url, driver_signature_image_url } = req.body || {};
    if (!signed_do_url && !driver_signature_image_url)
      return res
        .status(400)
        .json(buildFail("DO_PROOF_MISSING", "缺少上传文件URL"));
    const doObj = await db.DeliveryOrder.findByPk(id);
    if (!doObj)
      return res.status(404).json(buildFail("DO_NOT_FOUND", "提货单不存在"));
    if (!["awaiting_proof", "proof_uploaded"].includes(doObj.settlement_state))
      return res
        .status(400)
        .json(
          buildFail(
            "DO_UPLOAD_PROOF_STATE_INVALID",
            "当前状态不允许上传或替换凭证"
          )
        );
    const before = doObj.toJSON();
    const patch = { operator: req.user.username, operator_id: req.user.id };
    if (signed_do_url) patch.signed_do_url = signed_do_url;
    if (driver_signature_image_url)
      patch.driver_signature_image_url = driver_signature_image_url;
    patch.settlement_state = "proof_uploaded";
    if (!doObj.settlement_proof_uploaded_at)
      patch.settlement_proof_uploaded_at = new Date();
    await doObj.update(patch);
    writeAudit({
      module: "warehouse",
      entityType: "DeliveryOrder",
      entityId: doObj.id,
      action: "upload-settlement-proof",
      user: req.user,
      before,
      after: doObj.toJSON(),
      extra: {
        signed_do_url: !!signed_do_url,
        driver_signature_image_url: !!driver_signature_image_url,
      },
    });
    return res.json(
      buildResp("凭证上传成功", {
        id: doObj.id,
        settlement_state: doObj.settlement_state,
      })
    );
  }
);

// 审核结算
router.post(
  "/delivery-orders/:id/settle",
  authenticate,
  checkPermission("warehouse.delivery_order.settlement.confirm"),
  async (req, res) => {
    const { id } = req.params;
    const { approve = true } = req.body || {}; // 未来可扩展驳回
    const doObj = await db.DeliveryOrder.findByPk(id);
    if (!doObj)
      return res.status(404).json(buildFail("DO_NOT_FOUND", "提货单不存在"));
    if (doObj.settlement_state !== "proof_uploaded")
      return res
        .status(400)
        .json(buildFail("DO_SETTLE_STATE_INVALID", "当前状态不可结算"));
    const before = doObj.toJSON();
    await doObj.update({
      settlement_state: approve ? "settled" : "proof_uploaded",
      settlement_confirmed_by: req.user.id,
      settlement_confirmed_at: new Date(),
      operator: req.user.username,
      operator_id: req.user.id,
    });
    writeAudit({
      module: "warehouse",
      entityType: "DeliveryOrder",
      entityId: doObj.id,
      action: "settle",
      user: req.user,
      before,
      after: doObj.toJSON(),
      extra: { approved: approve },
    });
    return res.json(
      buildResp("结算完成", {
        id: doObj.id,
        settlement_state: doObj.settlement_state,
      })
    );
  }
);

// 按 AWB 聚合进度（跨多个 DO）
router.get(
  "/delivery-orders/awb-progress",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    const { awb } = req.query;
    if (!awb)
      return res.status(400).json(buildFail("AWB_REQUIRED", "缺少 awb"));
    // 汇总 DeliveryOrderPallet (冗余 awb 字段) 与 Pallet -> box_count 统计
    const rels = await db.DeliveryOrderPallet.findAll({
      where: { awb },
      include: [
        {
          model: db.Pallet,
          as: "pallet",
          attributes: ["id", "box_count", "status"],
        },
        {
          model: db.DeliveryOrder,
          as: "deliveryOrder",
          attributes: ["id", "status"],
        },
      ],
    });
    if (rels.length === 0)
      return res.json(
        buildResp("AWB进度", {
          awb,
          total_pallets: 0,
          picked_pallets: 0,
          arrived_pallets: 0,
          delivered_pallets: 0,
          details: [],
        })
      );
    let total = 0,
      picked = 0,
      arrived = 0,
      delivered = 0,
      totalPkgs = 0,
      pickedPkgs = 0;
    const details = rels.map((r) => {
      total += 1;
      if (r.pickup_status === "picked") picked += 1;
      if (
        r.pallet &&
        [
          "stored",
          "waiting_clear",
          "delivered",
          "dispatched",
          "unpacked",
        ].includes(r.pallet.status)
      )
        arrived += 1;
      if (r.pallet && ["delivered"].includes(r.pallet.status)) delivered += 1;
      totalPkgs += r.total_package_count || 0;
      pickedPkgs += r.picked_package_count || 0;
      return {
        delivery_order_id: r.deliveryOrder?.id,
        pallet_id: r.pallet_id,
        pickup_status: r.pickup_status,
        pallet_status: r.pallet?.status,
        total_package_count: r.total_package_count,
        picked_package_count: r.picked_package_count,
      };
    });
    return res.json(
      buildResp("AWB进度", {
        awb,
        total_pallets: total,
        picked_pallets: picked,
        arrived_pallets: arrived,
        delivered_pallets: delivered,
        total_packages: totalPkgs,
        picked_packages: pickedPkgs,
        details,
      })
    );
  }
);

// 入库扫描(按 DO ID + pallet_code + awb) 整板入库
router.post(
  "/delivery-orders/:id/inbound/scan-pallet",
  authenticate,
  checkPermission("warehouse.delivery_order.inbound"),
  async (req, res) => {
    const { id } = req.params;
    const { pallet_code, awb } = req.body || {};
    if (!pallet_code || !awb)
      return res
        .status(400)
        .json(buildFail("INBOUND_SCAN_MISSING", "缺少 pallet_code 或 awb"));
    // 使用 DO 级锁，避免与批量接口并发冲突
    try {
      return await withRedisLock(`lock:do:${id}:inbound`, 12, async () => {
        const t = await db.sequelize.transaction();
        try {
          const doObj = await db.DeliveryOrder.findByPk(id, { transaction: t });
          if (!doObj) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("DO_NOT_FOUND", "提货单不存在"));
          }
          const result = await inboundStorePallets({
            doObj,
            palletCodes: [pallet_code],
            awb,
            user: req.user,
            transaction: t,
          });
          if (result.error) {
            await t.rollback();
            return res
              .status(result.error.code?.startsWith("INBOUND") ? 400 : 404)
              .json(result.error);
          }
          const {
            newlyInbound,
            updatedPackages,
            totalSku,
            allStored,
            beforeDO,
            afterDO,
            beforePalletMap,
            changedPallets,
            pallets,
            noop,
            palletIds,
            palletCodes,
          } = result;
          await t.commit();
          if (!noop) {
            writeAudit({
              module: "warehouse",
              entityType: "DeliveryOrder",
              entityId: doObj.id,
              action: "inbound-scan-pallet",
              user: req.user,
              before: beforeDO,
              after: afterDO,
              extra: {
                pallet_ids: palletIds,
                pallet_codes: palletCodes,
                awb,
                updated_packages: updatedPackages,
                total_sku: totalSku,
                newly_inbound_pallets: newlyInbound,
                allArrived: allStored,
              },
            });
            for (const pallet of changedPallets) {
              writeAudit({
                module: "warehouse",
                entityType: "Pallet",
                entityId: pallet.id,
                action: "inbound-store",
                user: req.user,
                before: beforePalletMap.get(pallet.id),
                after: pallet.toJSON(),
                extra: { do_id: doObj.id },
              });
            }
          }
          return res.json(
            buildResp(noop ? "已入库(幂等)" : "整板入库成功", {
              do_id: doObj.id,
              pallet_ids: palletIds,
              pallet_codes: palletCodes,
              newly_inbound_pallets: newlyInbound,
              updated_packages: updatedPackages,
              total_sku: totalSku,
              allArrived: allStored,
              noop,
            })
          );
        } catch (e) {
          await t.rollback();
          console.error("inbound scan pallet error", e);
          return res
            .status(500)
            .json(buildFail("INBOUND_SCAN_FAILED", "入库失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("INBOUND_SCAN_BUSY", "入库处理中"));
      throw e;
    }
  }
);

// 批量入库扫描 (同一 DO + 单一 AWB + 多个板号) 一次性整板入库
router.post(
  "/delivery-orders/:id/inbound/scan-pallets",
  authenticate,
  checkPermission("warehouse.delivery_order.inbound"),
  async (req, res) => {
    const { id } = req.params;
    const { awb, pallet_codes = [] } = req.body || {};
    if (!awb || !Array.isArray(pallet_codes) || pallet_codes.length === 0)
      return res
        .status(400)
        .json(buildFail("INBOUND_BATCH_MISSING", "缺少 awb 或 pallet_codes"));
    try {
      return await withRedisLock(`lock:do:${id}:inbound`, 20, async () => {
        const t = await db.sequelize.transaction();
        try {
          const doObj = await db.DeliveryOrder.findByPk(id, { transaction: t });
          if (!doObj) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("DO_NOT_FOUND", "提货单不存在"));
          }
          const result = await inboundStorePallets({
            doObj,
            palletCodes: pallet_codes,
            awb,
            user: req.user,
            transaction: t,
          });
          if (result.error) {
            await t.rollback();
            return res
              .status(result.error.code?.startsWith("INBOUND") ? 400 : 404)
              .json(result.error);
          }
          const {
            newlyInbound,
            updatedPackages,
            totalSku,
            allStored,
            beforeDO,
            afterDO,
            beforePalletMap,
            changedPallets,
            pallets,
            noop,
            palletIds,
            palletCodes,
          } = result;
          await t.commit();
          if (!noop) {
            writeAudit({
              module: "warehouse",
              entityType: "DeliveryOrder",
              entityId: doObj.id,
              action: "inbound-scan-pallets",
              user: req.user,
              before: beforeDO,
              after: afterDO,
              extra: {
                pallet_ids: palletIds,
                pallet_codes: palletCodes,
                awb,
                newly_inbound_pallets: newlyInbound,
                updated_packages: updatedPackages,
                total_sku: totalSku,
                allArrived: allStored,
              },
            });
            for (const pallet of changedPallets) {
              writeAudit({
                module: "warehouse",
                entityType: "Pallet",
                entityId: pallet.id,
                action: "inbound-store",
                user: req.user,
                before: beforePalletMap.get(pallet.id),
                after: pallet.toJSON(),
                extra: { do_id: doObj.id, batch: true },
              });
            }
          }
          return res.json(
            buildResp(noop ? "全部已入库(幂等)" : "批量整板入库成功", {
              do_id: doObj.id,
              pallet_ids: palletIds,
              pallet_codes: palletCodes,
              newly_inbound_pallets: newlyInbound,
              updated_packages: updatedPackages,
              total_sku: totalSku,
              allArrived: allStored,
              noop,
            })
          );
        } catch (e) {
          await t.rollback();
          console.error("inbound batch scan pallets error", e);
          return res
            .status(500)
            .json(buildFail("INBOUND_BATCH_FAILED", "批量入库失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("INBOUND_BATCH_BUSY", "批量入库处理中"));
      throw e;
    }
  }
);

// 入库扫描 (通过 DO 编号) 便于手持终端仅扫描条码
router.post(
  "/delivery-orders/by-number/:do_number/inbound/scan-pallet",
  authenticate,
  checkPermission("warehouse.delivery_order.inbound"),
  async (req, res) => {
    const { do_number } = req.params;
    const { pallet_code, awb } = req.body || {};
    if (!pallet_code || !awb)
      return res
        .status(400)
        .json(buildFail("INBOUND_SCAN_MISSING", "缺少 pallet_code 或 awb"));
    const doObj = await db.DeliveryOrder.findOne({ where: { do_number } });
    if (!doObj)
      return res.status(404).json(buildFail("DO_NOT_FOUND", "提货单不存在"));
    try {
      return await withRedisLock(
        `lock:do:${doObj.id}:inbound`,
        12,
        async () => {
          const t = await db.sequelize.transaction();
          try {
            const result = await inboundStorePallets({
              doObj,
              palletCodes: [pallet_code],
              awb,
              user: req.user,
              transaction: t,
            });
            if (result.error) {
              await t.rollback();
              return res
                .status(result.error.code?.startsWith("INBOUND") ? 400 : 404)
                .json(result.error);
            }
            const {
              newlyInbound,
              updatedPackages,
              totalSku,
              allStored,
              beforeDO,
              afterDO,
              beforePalletMap,
              changedPallets,
              pallets,
              noop,
              palletIds,
              palletCodes,
            } = result;
            await t.commit();
            if (!noop) {
              writeAudit({
                module: "warehouse",
                entityType: "DeliveryOrder",
                entityId: doObj.id,
                action: "inbound-scan-pallet",
                user: req.user,
                before: beforeDO,
                after: afterDO,
                extra: {
                  pallet_ids: palletIds,
                  pallet_codes: palletCodes,
                  awb,
                  updated_packages: updatedPackages,
                  total_sku: totalSku,
                  newly_inbound_pallets: newlyInbound,
                  allArrived: allStored,
                  by_number: true,
                },
              });
              for (const pallet of changedPallets) {
                writeAudit({
                  module: "warehouse",
                  entityType: "Pallet",
                  entityId: pallet.id,
                  action: "inbound-store",
                  user: req.user,
                  before: beforePalletMap.get(pallet.id),
                  after: pallet.toJSON(),
                  extra: { do_id: doObj.id, by_number: true },
                });
              }
            }
            return res.json(
              buildResp(noop ? "已入库(幂等)" : "整板入库成功", {
                do_id: doObj.id,
                pallet_ids: palletIds,
                pallet_codes: palletCodes,
                newly_inbound_pallets: newlyInbound,
                updated_packages: updatedPackages,
                total_sku: totalSku,
                allArrived: allStored,
                noop,
              })
            );
          } catch (e) {
            await t.rollback();
            console.error("inbound by-number scan pallet error", e);
            return res
              .status(500)
              .json(buildFail("INBOUND_SCAN_FAILED", "入库失败"));
          }
        }
      );
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("INBOUND_SCAN_BUSY", "入库处理中"));
      throw e;
    }
  }
);

// 可存储(视为已到仓)的板状态集合
const STORED_STATES = [
  "stored",
  "waiting_clear",
  "delivered",
  "dispatched",
  "unpacked",
];

// 公共函数: 处理 DO 下指定板(同一 AWB)的整板入库 (加入 stats 重算, 统一返回结构字段)
async function inboundStorePallets({
  doObj,
  palletCodes,
  awb,
  user,
  transaction,
  expectTenantId,
  expectWarehouseId,
}) {
  const codes = [...new Set(palletCodes.filter(Boolean))];
  if (codes.length === 0)
    return { error: buildFail("INBOUND_EMPTY_CODES", "无有效板号") };
  // 租户/仓库过滤(若模型具备相应字段). 若没有字段则跳过
  const relWhere = { delivery_order_id: doObj.id };
  if (expectTenantId && db.DeliveryOrderPallet.rawAttributes?.tenant_id) {
    relWhere.tenant_id = expectTenantId;
  }
  if (expectWarehouseId && db.DeliveryOrderPallet.rawAttributes?.warehouse_id) {
    relWhere.warehouse_id = expectWarehouseId;
  }
  const rels = await db.DeliveryOrderPallet.findAll({
    where: relWhere,
    include: [
      {
        model: db.Pallet,
        as: "pallet",
        where: { pallet_code: codes },
        required: true,
      },
    ],
    transaction,
  });
  const foundCodes = rels.map((r) => r.pallet.pallet_code);
  const missing = codes.filter((c) => !foundCodes.includes(c));
  if (missing.length)
    return {
      error: buildFail(
        "DO_PALLETS_PARTIAL_NOT_FOUND",
        `以下板不在该DO: ${missing.join(",")}`
      ),
    };
  const mismatch = awb && rels.find((r) => r.awb !== awb);
  if (mismatch)
    return { error: buildFail("INBOUND_AWB_MISMATCH", "部分板 AWB 不匹配") };

  const palletIds = rels.map((r) => r.pallet_id);
  const palletWhere = { id: palletIds };
  if (expectTenantId && db.Pallet.rawAttributes?.tenant_id) {
    palletWhere.tenant_id = expectTenantId;
  }
  if (expectWarehouseId && db.Pallet.rawAttributes?.warehouse_id) {
    palletWhere.warehouse_id = expectWarehouseId;
  }
  const pallets = await db.Pallet.findAll({
    where: palletWhere,
    transaction,
  });
  const beforePalletMap = new Map(pallets.map((p) => [p.id, p.toJSON()]));

  let newlyInbound = 0;
  const changedPallets = [];
  for (const pallet of pallets) {
    if (!STORED_STATES.includes(pallet.status)) {
      pallet.status = "stored";
      pallet.inbound_time = pallet.inbound_time || new Date();
      await pallet.save({ transaction });
      newlyInbound++;
      changedPallets.push(pallet);
    }
  }
  const packages = await db.Package.findAll({
    where: { pallet_id: palletIds },
    include: [
      {
        model: db.PackageItem,
        as: "items",
        attributes: [
          "id",
          "hs_code",
          "product_name_en",
          "product_description",
          "origin_country",
          "weight_kg",
          "quantity",
          "item_count",
          "tracking_no",
          "ftz_zone_code",
          "unit_price",
          "total_price",
        ],
      },
    ],
    transaction,
  });
  let updatedPackages = 0;
  let totalSku = 0;
  // 收集全部 items 用于台账
  const allItems = packages.flatMap((p) =>
    (p.items || []).map((it) => ({
      ...it.toJSON(),
      package_id: p.id,
      pallet_id: p.pallet_id,
    }))
  );
  for (const pkg of packages) {
    const needUpdate = pkg.inbound_status !== "received";
    totalSku += pkg.items?.length || 0;
    if (needUpdate) {
      pkg.inbound_status = "received";
      pkg.storage_time = pkg.storage_time || new Date();
      pkg.storage_operator = pkg.storage_operator || user.username;
      await pkg.save({ transaction });
      updatedPackages++;
    }
  }
  const relationIdsRaw = await db.DeliveryOrderPallet.findAll({
    attributes: ["pallet_id"],
    where: relWhere,
    raw: true,
    transaction,
  });
  const allPalletIds = relationIdsRaw.map((r) => r.pallet_id);
  const notStoredCount = await db.Pallet.count({
    where: { id: allPalletIds, status: { [Op.notIn]: STORED_STATES } },
    transaction,
  });
  const allStored = notStoredCount === 0;

  const beforeDO = doObj.toJSON();
  let doStatusChanged = false;
  if (allStored) {
    if (doObj.status !== "arrived") {
      await doObj.update(
        { status: "arrived", arrival_time: doObj.arrival_time || new Date() },
        { transaction }
      );
      doStatusChanged = true;
    }
  } else if (!["arrived", "partial_arrived"].includes(doObj.status)) {
    await doObj.update({ status: "partial_arrived" }, { transaction });
    doStatusChanged = true;
  }
  try {
    await recalcDeliveryOrderStats(doObj.id, { transaction });
  } catch {}
  const afterDO = doObj.toJSON();
  const noop = newlyInbound === 0 && updatedPackages === 0 && !doStatusChanged;
  try {
    // 仅当有真正新入库板时写 FTZ 台账
    if (changedPallets.length) {
      await writeFtzInboundLedger({
        doObj,
        changedPallets,
        rels,
        packages,
        items: allItems,
        user,
        transaction,
      });
    }
  } catch (e) {
    // 不阻断主流程, 但记录
    console.error("FTZ ledger write error", e);
  }
  return {
    newlyInbound,
    updatedPackages,
    totalSku,
    allStored,
    beforeDO,
    afterDO,
    beforePalletMap,
    changedPallets,
    pallets,
    noop,
    palletIds,
    palletCodes: codes,
  };
}

export default router;
