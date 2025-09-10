import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import { withRedisLock } from "../../utils/withRedisLock.js";
import { writeAudit } from "../../utils/auditHelper.js";
import { getRedis } from "../../utils/redisClient.js";
import { generateRepackPalletCode } from "../../utils/generateRepackPalletCode.js";
import { writeFtzInternalMoveLedger } from "../../utils/ftzLedger.js";
import { Op, Sequelize } from "sequelize"; // add Sequelize for aggregation
import crypto from "crypto";
import {
  splitScanCounter,
  splitFinalizeCounter,
  finalizeDurationHist,
} from "../../metrics/prometheus.js";

// Ensure status constants available
const STAT = db.SplitOrder?.STATUSES || {
  CREATED: "created",
  ASSIGNED: "assigned",
  PROCESSING: "processing",
  VERIFYING: "verifying",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

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

async function generateSplitOrderNumber() {
  const now = new Date();
  const ds = now.toISOString().slice(2, 10).replace(/-/g, "");
  const key = `seq:split:${ds}`;
  try {
    const r = await getRedis();
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 3 * 24 * 3600);
    return `SPK${ds}-${String(n).padStart(2, "0")}`;
  } catch {
    const count = await db.SplitOrder.count();
    return `SPK${ds}-F${count + 1}`;
  }
}

// 创建分板单
router.post(
  "/split-orders",
  authenticate,
  checkPermission("warehouse.split_order.create"),
  async (req, res) => {
    const { awb, source_pmc_pallet_ids = [], remark } = req.body || {};
    if (
      !awb ||
      !Array.isArray(source_pmc_pallet_ids) ||
      source_pmc_pallet_ids.length === 0
    )
      return res
        .status(400)
        .json(
          buildFail("SPLIT_CREATE_MISSING", "缺少 awb 或 source_pmc_pallet_ids")
        );
    const pallets = await db.Pallet.findAll({
      where: {
        id: source_pmc_pallet_ids,
        tenant_id: req.user.tenant_id,
        warehouse_id: req.user.warehouse_id,
      },
    });
    if (pallets.length !== source_pmc_pallet_ids.length)
      return res
        .status(404)
        .json(
          buildFail("SPLIT_SOURCE_PALLET_NOT_FOUND", "部分源板不存在或越权")
        );
    const palletIds = pallets.map((p) => p.id);
    const packages = await db.Package.findAll({
      where: { pallet_id: palletIds },
      include: [
        {
          model: db.OperationRequirement,
          as: "operationRequirement",
          attributes: [
            "id",
            "requirement_code",
            "requirement_name_en",
            "requirement_name",
            "label_abbr",
          ],
        },
      ],
    });
    const totalPackagesExpected = packages.length;
    const reqGrouped = new Map();
    for (const pkg of packages) {
      const rid = pkg.operation_requirement_id;
      if (!reqGrouped.has(rid)) reqGrouped.set(rid, { count: 0, pkg });
      reqGrouped.get(rid).count++;
    }
    const number = await generateSplitOrderNumber();
    const created = await db.SplitOrder.create({
      split_order_number: number,
      awb,
      source_pmc_pallet_ids: JSON.stringify(palletIds),
      total_packages_expected: totalPackagesExpected,
      distinct_operation_requirements_expected: reqGrouped.size,
      created_by: req.user.id,
      remark,
      tenant_id: req.user.tenant_id,
      warehouse_id: req.user.warehouse_id,
    });
    // 初始化 requirement stats 期望数量
    for (const [rid, info] of reqGrouped.entries()) {
      const opReq = info.pkg.operationRequirement;
      let abbr = null;
      if (opReq) {
        abbr = opReq.label_abbr || abbr;
        if (!abbr) {
          if (opReq.requirement_name_en)
            abbr = opReq.requirement_name_en
              .split(/\s+/)
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 4);
          else if (opReq.requirement_name)
            abbr = opReq.requirement_name
              .split(/\s+/)
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 4);
          else abbr = (opReq.requirement_code || "").slice(0, 4).toUpperCase();
        }
      }
      await db.SplitOrderRequirementStat.create({
        split_order_id: created.id,
        operation_requirement_id: rid,
        requirement_abbr: abbr,
        expected_package_count: info.count,
        scanned_package_count: 0,
        pallet_group_index:
          reqGrouped.size > 1 ? [...reqGrouped.keys()].indexOf(rid) + 1 : 1,
      });
    }
    writeAudit({
      module: "warehouse",
      entityType: "SplitOrder",
      entityId: created.id,
      action: "split-order-create",
      user: req.user,
      before: null,
      after: created.toJSON(),
      extra: {
        total_packages_expected: totalPackagesExpected,
        distinct_requirements: reqGrouped.size,
      },
    });
    return res
      .status(201)
      .json(buildResp("分板单创建成功", { split_order: created }));
  }
);

// 指派
router.post(
  "/split-orders/:id/assign",
  authenticate,
  checkPermission("warehouse.split_order.assign"),
  async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body || {};
    if (!user_id)
      return res
        .status(400)
        .json(buildFail("SPLIT_ASSIGN_USER_MISSING", "缺少 user_id"));
    const so = await db.SplitOrder.findOne({
      where: {
        id,
        tenant_id: req.user.tenant_id,
        warehouse_id: req.user.warehouse_id,
      },
    });
    if (!so)
      return res.status(404).json(buildFail("SPLIT_NOT_FOUND", "分板单不存在"));
    if (![STAT.CREATED, STAT.ASSIGNED].includes(so.status))
      return res
        .status(400)
        .json(buildFail("SPLIT_ASSIGN_STATUS_INVALID", "状态不允许指派"));
    const before = so.toJSON();
    await so.update({
      assigned_user_id: user_id,
      status: STAT.ASSIGNED,
      assigned_at: so.assigned_at || new Date(),
    });
    writeAudit({
      module: "warehouse",
      entityType: "SplitOrder",
      entityId: so.id,
      action: "split-order-assign",
      user: req.user,
      before,
      after: so.toJSON(),
      extra: { assigned_user_id: user_id },
    });
    return res.json(buildResp("指派成功", {}));
  }
);

// 扫描包裹（逐个）
router.post(
  "/split-orders/:id/scan",
  authenticate,
  checkPermission("warehouse.split_order.scan"),
  async (req, res) => {
    const { id } = req.params;
    const { package_code } = req.body || {};
    if (!package_code)
      return res
        .status(400)
        .json(buildFail("SPLIT_SCAN_CODE_MISSING", "缺少 package_code"));
    try {
      return await withRedisLock(`lock:split:${id}`, 8, async () => {
        const t = await db.sequelize.transaction();
        try {
          const split = await db.SplitOrder.findOne({
            where: {
              id,
              tenant_id: req.user.tenant_id,
              warehouse_id: req.user.warehouse_id,
            },
            transaction: t,
          });
          if (!split) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("SPLIT_NOT_FOUND", "分板单不存在"));
          }
          if (![STAT.ASSIGNED, STAT.PROCESSING].includes(split.status)) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("SPLIT_SCAN_STATUS_INVALID", "状态不允许扫描"));
          }
          if (split.status === STAT.ASSIGNED)
            await split.update(
              { status: STAT.PROCESSING, started_at: new Date() },
              { transaction: t }
            );
          const sourceIds = JSON.parse(split.source_pmc_pallet_ids || "[]");
          const pkg = await db.Package.findOne({
            where: { package_code },
            include: [
              { model: db.OperationRequirement, as: "operationRequirement" },
            ],
            transaction: t,
          });
          if (!pkg) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("SPLIT_PKG_NOT_FOUND", "包裹不存在"));
          }
          if (!sourceIds.includes(pkg.pallet_id)) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("SPLIT_PKG_NOT_IN_SOURCE", "包裹不在源 PMC 板"));
          }
          // 跨分板单占用校验：同一包裹不可同时参与其他未完成分板单
          const occupied = await db.SplitOrderPackageScan.findOne({
            where: { package_id: pkg.id },
            include: [
              {
                model: db.SplitOrder,
                as: "splitOrder",
                where: {
                  status: {
                    [Op.in]: [
                      STAT.CREATED,
                      STAT.ASSIGNED,
                      STAT.PROCESSING,
                      STAT.VERIFYING,
                    ],
                  },
                  id: { [Op.ne]: split.id },
                },
              },
            ],
            transaction: t,
          });
          if (occupied) {
            await t.rollback();
            return res
              .status(400)
              .json(
                buildFail(
                  "SPLIT_PKG_IN_OTHER_SPLIT",
                  "包裹已在另一未完成分板单"
                )
              );
          }
          // 重复扫描检测
          const existScan = await db.SplitOrderPackageScan.findOne({
            where: { split_order_id: id, package_id: pkg.id },
            transaction: t,
          });
          if (existScan) {
            await t.commit();
            return res.json(
              buildResp("重复扫描", {
                duplicate: true,
                temp_pallet_id: existScan.temp_pallet_id,
              })
            );
          }
          // requirement stat & temp pallet
          let stat = await db.SplitOrderRequirementStat.findOne({
            where: {
              split_order_id: id,
              operation_requirement_id: pkg.operation_requirement_id,
            },
            transaction: t,
          });
          if (!stat) {
            const groupIndex =
              (await db.SplitOrderRequirementStat.count({
                where: { split_order_id: id },
                transaction: t,
              })) + 1;
            // abbreviation derive
            const opReq = pkg.operationRequirement;
            let abbr = null;
            if (opReq) {
              abbr = opReq.label_abbr || abbr;
              if (!abbr) {
                if (opReq.requirement_name_en) {
                  abbr = opReq.requirement_name_en
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 4);
                } else if (opReq.requirement_name) {
                  abbr = opReq.requirement_name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 4);
                } else {
                  abbr = (opReq.requirement_code || "")
                    .slice(0, 4)
                    .toUpperCase();
                }
              }
            }
            stat = await db.SplitOrderRequirementStat.create(
              {
                split_order_id: id,
                operation_requirement_id: pkg.operation_requirement_id,
                requirement_abbr: abbr,
                expected_package_count: 0,
                scanned_package_count: 0,
                pallet_group_index: groupIndex,
              },
              { transaction: t }
            );
            // create first temp pallet
            await db.SplitOrderPalletTemp.create(
              {
                split_order_id: id,
                operation_requirement_id: pkg.operation_requirement_id,
                group_index: groupIndex,
                sequence_no: 1,
              },
              { transaction: t }
            );
          }
          // open temp pallet
          let temp = await db.SplitOrderPalletTemp.findOne({
            where: {
              split_order_id: id,
              operation_requirement_id: pkg.operation_requirement_id,
              status: PALLET_TEMP_STATUS.OPEN,
            },
            order: [["sequence_no", "DESC"]],
            transaction: t,
          });
          if (!temp) {
            // all full -> create next
            const maxSeq =
              (await db.SplitOrderPalletTemp.max("sequence_no", {
                where: {
                  split_order_id: id,
                  operation_requirement_id: pkg.operation_requirement_id,
                },
                transaction: t,
              })) || 0;
            temp = await db.SplitOrderPalletTemp.create(
              {
                split_order_id: id,
                operation_requirement_id: pkg.operation_requirement_id,
                group_index: stat.pallet_group_index,
                sequence_no: maxSeq + 1,
              },
              { transaction: t }
            );
          }
          // optimized scan sequence generation (Redis incr fallback to count)
          let scanSeq;
          let expectedSeq = split.scanned_package_count + 1; // authoritative next sequence
          try {
            const r = await getRedis();
            scanSeq = await r.incr(`split:${id}:scan_seq`);
          } catch {
            scanSeq = expectedSeq; // fallback
          }
          // Gap detection & self-heal: if redis-based scanSeq drifts, correct it
          if (scanSeq !== expectedSeq) {
            // reset to authoritative expectedSeq
            const old = scanSeq;
            scanSeq = expectedSeq;
            try {
              const r = await getRedis();
              await r.set(`split:${id}:scan_seq`, scanSeq); // reseed
            } catch {}
            writeAudit({
              module: "warehouse",
              entityType: "SplitOrder",
              entityId: split.id,
              action: "split-order-scan-seq-fix",
              user: req.user,
              before: null,
              after: null,
              extra: {
                old_seq: old,
                fixed_seq: scanSeq,
                expected_seq: expectedSeq,
              },
            });
          }
          const scan = await db.SplitOrderPackageScan.create(
            {
              split_order_id: id,
              package_id: pkg.id,
              operation_requirement_id: pkg.operation_requirement_id,
              temp_pallet_id: temp.id,
              sequence_in_order: scanSeq,
              scanned_by: req.user.id,
            },
            { transaction: t }
          );
          await stat.update(
            { scanned_package_count: stat.scanned_package_count + 1 },
            { transaction: t }
          );
          await split.update(
            { scanned_package_count: split.scanned_package_count + 1 },
            { transaction: t }
          );
          await temp.update(
            { scanned_package_count: temp.scanned_package_count + 1 },
            { transaction: t }
          );
          await t.commit();
          splitScanCounter.inc({
            tenant: String(req.user.tenant_id || 0),
            warehouse: String(req.user.warehouse_id || 0),
          });
          writeAudit({
            module: "warehouse",
            entityType: "SplitOrder",
            entityId: split.id,
            action: "split-order-scan",
            user: req.user,
            before: null,
            after: null,
            extra: { package_id: pkg.id, temp_pallet_id: temp.id },
          });
          return res.json(
            buildResp("扫描成功", {
              temp_pallet_id: temp.id,
              group_index: temp.group_index,
              sequence_no: temp.sequence_no,
            })
          );
        } catch (e) {
          await t.rollback();
          console.error("split scan error", e);
          return res
            .status(500)
            .json(buildFail("SPLIT_SCAN_ERROR", "扫描失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res.status(429).json(buildFail("SPLIT_SCAN_BUSY", "分板单繁忙"));
      throw e;
    }
  }
);

// 满板 (P1 #20: only create next temp pallet if not all packages scanned)
router.post(
  "/split-orders/:id/pallets/:temp_id/full",
  authenticate,
  checkPermission("warehouse.split_order.pallet_full"),
  async (req, res) => {
    const { id, temp_id } = req.params;
    try {
      return await withRedisLock(`lock:split:${id}`, 8, async () => {
        const t = await db.sequelize.transaction();
        try {
          const temp = await db.SplitOrderPalletTemp.findByPk(temp_id, {
            transaction: t,
          });
          if (!temp || temp.split_order_id != id) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("SPLIT_TEMP_NOT_FOUND", "临时板不存在"));
          }
          if (temp.status !== PALLET_TEMP_STATUS.OPEN) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("SPLIT_TEMP_NOT_OPEN", "临时板不可标记满板"));
          }
          await temp.update(
            { status: PALLET_TEMP_STATUS.FULL },
            { transaction: t }
          );
          // fetch split for decision
          const split = await db.SplitOrder.findByPk(id, { transaction: t });
          let createdNext = false;
          if (
            split &&
            split.scanned_package_count < split.total_packages_expected
          ) {
            const maxSeq =
              (await db.SplitOrderPalletTemp.max("sequence_no", {
                where: {
                  split_order_id: id,
                  operation_requirement_id: temp.operation_requirement_id,
                },
                transaction: t,
              })) || temp.sequence_no;
            const next = await db.SplitOrderPalletTemp.create(
              {
                split_order_id: id,
                operation_requirement_id: temp.operation_requirement_id,
                group_index: temp.group_index,
                sequence_no: maxSeq + 1,
              },
              { transaction: t }
            );
            createdNext = true;
            await t.commit();
            writeAudit({
              module: "warehouse",
              entityType: "SplitOrder",
              entityId: id,
              action: "split-order-pallet-full",
              user: req.user,
              before: null,
              after: null,
              extra: { temp_pallet_id: temp.id, next_temp_pallet_id: next.id },
            });
            return res.json(
              buildResp("已满板，已创建下一板", {
                next_temp_pallet_id: next.id,
              })
            );
          }
          // no next created
          await t.commit();
          writeAudit({
            module: "warehouse",
            entityType: "SplitOrder",
            entityId: id,
            action: "split-order-pallet-full",
            user: req.user,
            before: null,
            after: null,
            extra: { temp_pallet_id: temp.id, created_next: createdNext },
          });
          return res.json(buildResp("已满板（无需再创建新板）", {}));
        } catch (e) {
          await t.rollback();
          console.error(e);
          return res
            .status(500)
            .json(buildFail("SPLIT_PALLET_FULL_ERROR", "满板操作失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res.status(429).json(buildFail("SPLIT_FULL_BUSY", "分板单繁忙"));
      throw e;
    }
  }
);

// 进度
router.get(
  "/split-orders/:id/progress",
  authenticate,
  checkPermission("warehouse.split_order.view"),
  async (req, res) => {
    const { id } = req.params;
    const split = await db.SplitOrder.findOne({
      where: {
        id,
        tenant_id: req.user.tenant_id,
        warehouse_id: req.user.warehouse_id,
      },
      include: [
        { model: db.SplitOrderRequirementStat, as: "requirementStats" },
        { model: db.SplitOrderPalletTemp, as: "tempPallets" },
      ],
    });
    if (!split)
      return res.status(404).json(buildFail("SPLIT_NOT_FOUND", "分板单不存在"));
    return res.json(buildResp("进度", { split_order: split }));
  }
);

// 校验开始 (P1 #15: auto-fill expected=0 requirements)
router.post(
  "/split-orders/:id/verify-start",
  authenticate,
  checkPermission("warehouse.split_order.verify"),
  async (req, res) => {
    const { id } = req.params;
    try {
      return await withRedisLock(`lock:split:${id}`, 8, async () => {
        const t = await db.sequelize.transaction();
        try {
          const split = await db.SplitOrder.findOne({
            where: {
              id,
              tenant_id: req.user.tenant_id,
              warehouse_id: req.user.warehouse_id,
            },
            include: [
              { model: db.SplitOrderRequirementStat, as: "requirementStats" },
            ],
            transaction: t,
          });
          if (!split) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("SPLIT_NOT_FOUND", "分板单不存在"));
          }
          if (split.status !== STAT.PROCESSING) {
            await t.rollback();
            return res
              .status(400)
              .json(
                buildFail("SPLIT_VERIFY_STATUS_INVALID", "当前状态不可进入校验")
              );
          }
          if (split.scanned_package_count !== split.total_packages_expected) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("SPLIT_SCAN_COUNT_MISMATCH", "总包裹数不一致"));
          }
          // Auto-fill expected where expected=0 (dynamic requirement) (#15)
          for (const stat of split.requirementStats) {
            if (
              stat.expected_package_count === 0 &&
              stat.scanned_package_count > 0
            ) {
              await stat.update(
                { expected_package_count: stat.scanned_package_count },
                { transaction: t }
              );
            }
          }
          // Re-fetch after potential updates (optional minimal)
          for (const stat of split.requirementStats) {
            if (
              stat.scanned_package_count !== stat.expected_package_count &&
              stat.expected_package_count > 0
            ) {
              await t.rollback();
              return res
                .status(400)
                .json(
                  buildFail("SPLIT_REQ_COUNT_MISMATCH", "需求包裹数不一致")
                );
            }
          }
          await split.update(
            { status: STAT.VERIFYING, verify_started_at: new Date() },
            { transaction: t }
          );
          await t.commit();
          writeAudit({
            module: "warehouse",
            entityType: "SplitOrder",
            entityId: split.id,
            action: "split-order-verify-start",
            user: req.user,
            before: null,
            after: null,
          });
          return res.json(buildResp("进入校验阶段", {}));
        } catch (e) {
          await t.rollback();
          console.error(e);
          return res
            .status(500)
            .json(buildFail("SPLIT_VERIFY_ERROR", "进入校验失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("SPLIT_VERIFY_BUSY", "分板单繁忙"));
      throw e;
    }
  }
);

// 终结(生成真实新板 & 迁移包裹) with idempotency (#11) and detailed move audit (#7)
router.post(
  "/split-orders/:id/finalize",
  authenticate,
  checkPermission("warehouse.split_order.finalize"),
  async (req, res) => {
    const { id } = req.params;
    const { pallets = [], idempotency_key } = req.body || {}; // pallets: [{ temp_pallet_id, confirmed_count, input_pallet_code }]
    try {
      return await withRedisLock(`lock:split:${id}`, 30, async () => {
        const t = await db.sequelize.transaction();
        try {
          const split = await db.SplitOrder.findOne({
            where: {
              id,
              tenant_id: req.user.tenant_id,
              warehouse_id: req.user.warehouse_id,
            },
            include: [
              { model: db.SplitOrderPalletTemp, as: "tempPallets" },
              { model: db.SplitOrderRequirementStat, as: "requirementStats" },
            ],
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!split) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("SPLIT_NOT_FOUND", "分板单不存在"));
          }

          // Prepare idempotency hash (#11) stable ordering
          const normPallets = [...pallets]
            .map((p) => ({
              temp_pallet_id: p.temp_pallet_id,
              confirmed_count: p.confirmed_count,
              input_pallet_code: p.input_pallet_code || null,
            }))
            .sort((a, b) => a.temp_pallet_id - b.temp_pallet_id);
          const reqHash = crypto
            .createHash("sha256")
            .update(JSON.stringify(normPallets))
            .digest("hex");
          const r = await getRedis();
          const hashKey = `split:${id}:finalize:hash`;
          const storedHash = await r.get(hashKey);

          if (split.status === STAT.COMPLETED) {
            if (storedHash && storedHash === reqHash) {
              await t.rollback();
              return res.json(buildResp("已完成(幂等)", { completed: true }));
            }
            await t.rollback();
            return res
              .status(409)
              .json(
                buildFail(
                  "SPLIT_FINALIZED_DIFFERENT",
                  "分板单已完成，提交参数与原完成记录不同"
                )
              );
          }
          if (split.status === STAT.CANCELLED) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("SPLIT_ALREADY_CANCELLED", "已取消"));
          }
          if (![STAT.VERIFYING, STAT.PROCESSING].includes(split.status)) {
            await t.rollback();
            return res
              .status(400)
              .json(
                buildFail(
                  "SPLIT_FINALIZE_STATUS_INVALID",
                  "当前状态不可 finalize"
                )
              );
          }
          if (split.finalize_in_progress) {
            await t.rollback();
            return res
              .status(409)
              .json(buildFail("SPLIT_FINALIZE_RUNNING", "Finalize 正在进行"));
          }

          await split.update(
            { finalize_in_progress: true, last_finalize_error: null },
            { transaction: t }
          );
          // requirement 校验
          for (const stat of split.requirementStats) {
            if (
              stat.expected_package_count > 0 &&
              stat.scanned_package_count !== stat.expected_package_count
            ) {
              await split.update(
                { finalize_in_progress: false },
                { transaction: t }
              );
              await t.rollback();
              return res
                .status(400)
                .json(
                  buildFail("SPLIT_REQ_COUNT_MISMATCH", "需求包裹数不一致")
                );
            }
          }
          if (split.scanned_package_count !== split.total_packages_expected) {
            await split.update(
              { finalize_in_progress: false },
              { transaction: t }
            );
            await t.rollback();
            return res
              .status(400)
              .json(
                buildFail("SPLIT_FINALIZE_SCAN_MISMATCH", "包裹数量未对齐")
              );
          }
          if (split.status === STAT.PROCESSING) {
            await split.update(
              {
                status: STAT.VERIFYING,
                verify_started_at: split.verify_started_at || new Date(),
              },
              { transaction: t }
            );
          }
          const tempsById = new Map(split.tempPallets.map((tp) => [tp.id, tp]));
          const effectiveTemps = split.tempPallets.filter(
            (tp) => tp.scanned_package_count > 0
          );
          if (effectiveTemps.length === 0) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("SPLIT_FINALIZE_NO_DATA", "无可生成板"));
          }
          if (pallets.length !== effectiveTemps.length) {
            await t.rollback();
            return res
              .status(400)
              .json(
                buildFail(
                  "SPLIT_FINALIZE_PALLET_LIST_MISMATCH",
                  "提交板数量与实际不符"
                )
              );
          }
          for (const pdef of pallets) {
            const temp = tempsById.get(pdef.temp_pallet_id);
            if (!temp || temp.scanned_package_count === 0) {
              await t.rollback();
              return res
                .status(400)
                .json(
                  buildFail("SPLIT_FINALIZE_TEMP_INVALID", "存在无效临时板")
                );
            }
            if (pdef.confirmed_count !== temp.scanned_package_count) {
              await t.rollback();
              return res
                .status(400)
                .json(buildFail("PALLET_COUNT_MISMATCH", "板包裹数不一致"));
            }
          }
          const scans = await db.SplitOrderPackageScan.findAll({
            where: { split_order_id: id },
            transaction: t,
          });
          const packageIds = [...new Set(scans.map((s) => s.package_id))];
          const packages = await db.Package.findAll({
            where: { id: packageIds },
            transaction: t,
          });
          // PackageItem pagination / memory optimization
          const itemsByPkg = new Map();
          if (db.PackageItem) {
            const BATCH_SIZE = 800;
            if (packageIds.length <= BATCH_SIZE) {
              const allItems = await db.PackageItem.findAll({
                where: { package_id: packageIds },
                transaction: t,
              });
              for (const it of allItems) {
                if (!itemsByPkg.has(it.package_id))
                  itemsByPkg.set(it.package_id, []);
                itemsByPkg.get(it.package_id).push(it);
              }
            } else {
              for (let i = 0; i < packageIds.length; i += BATCH_SIZE) {
                const slice = packageIds.slice(i, i + BATCH_SIZE);
                const batchItems = await db.PackageItem.findAll({
                  where: { package_id: slice },
                  transaction: t,
                });
                for (const it of batchItems) {
                  if (!itemsByPkg.has(it.package_id))
                    itemsByPkg.set(it.package_id, []);
                  itemsByPkg.get(it.package_id).push(it);
                }
              }
            }
          }
          const moveLedgerPayload = [];
          const newPallets = [];
          const affectedSourcePallets = new Set();
          const updatesPerNewPallet = [];
          for (const pdef of pallets) {
            const temp = tempsById.get(pdef.temp_pallet_id);
            const scList = scansByTemp.get(temp.id) || [];
            const pkgs = scList
              .map((sc) => pkgMap.get(sc.package_id))
              .filter(Boolean);
            if (pkgs.length === 0) continue;
            const first = pkgs[0];
            const newCode =
              pdef.input_pallet_code ||
              (await generateRepackPalletCode(split.awb));
            const newPallet = await db.Pallet.create(
              {
                pallet_code: newCode,
                custom_board_no: pdef.input_pallet_code || null,
                forecast_id: first.forecast_id,
                pallet_type: "REPACK",
                box_count: pkgs.length, // use known length, no recount later
                status: "stored",
                source_type: "repacked",
                origin_awb: split.awb,
                origin_pmc_pallet_id: first.pallet_id || null,
              },
              { transaction: t }
            );
            newPallets.push(newPallet);
            const pkgIds = pkgs.map((p) => p.id);
            updatesPerNewPallet.push({ newPalletId: newPallet.id, pkgIds });
            for (const p of pkgs) {
              const srcPid = p.pallet_id;
              affectedSourcePallets.add(srcPid);
              const its = itemsByPkg.get(p.id) || [];
              moveLedgerPayload.push({
                package: p,
                old_pallet_id: srcPid,
                new_pallet_id: newPallet.id,
                items: its,
              });
            }
            await temp.update(
              { status: PALLET_TEMP_STATUS.CONFIRMED, pallet_id: newPallet.id },
              { transaction: t }
            );
          }
          if (newPallets.length === 0) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("SPLIT_FINALIZE_NONE", "没有生成任何新板"));
          }

          // Bulk update packages pallet_id
          for (const grp of updatesPerNewPallet) {
            await db.Package.update(
              { pallet_id: grp.newPalletId },
              { where: { id: grp.pkgIds }, transaction: t }
            );
          }

          // Batch compute remaining counts for source pallets (#14 optimization)
          if (affectedSourcePallets.size > 0) {
            const srcIds = [...affectedSourcePallets];
            const remainRows = await db.Package.findAll({
              attributes: [
                "pallet_id",
                [Sequelize.fn("COUNT", Sequelize.col("id")), "cnt"],
              ],
              where: { pallet_id: srcIds },
              group: ["pallet_id"],
              transaction: t,
              raw: true,
            });
            const remainMap = new Map(
              remainRows.map((r) => [Number(r.pallet_id), Number(r.cnt)])
            );
            const srcPallets = await db.Pallet.findAll({
              where: { id: srcIds },
              transaction: t,
            });
            for (const sp of srcPallets) {
              const remain = remainMap.get(sp.id) || 0;
              await sp.update(
                {
                  box_count: remain,
                  is_unpacked: remain === 0 ? true : sp.is_unpacked,
                  status: remain === 0 ? "unpacked" : sp.status,
                },
                { transaction: t }
              );
            }
          }

          // locate insertion point after source pallets update and before split.update
          const ledgerResult = await writeSplitInternalMoveLedgerHelper({
            moveLedgerPayload,
            req,
            transaction: t,
            splitId: split.id,
          });

          await split.update(
            {
              status: STAT.COMPLETED,
              completed_at: new Date(),
              finalize_in_progress: false,
            },
            { transaction: t }
          );
          await t.commit();
          endTimer();
          splitFinalizeCounter.inc({
            tenant: String(req.user.tenant_id || 0),
            warehouse: String(req.user.warehouse_id || 0),
            result: "success",
          });

          // Store idempotency hash after success & set scan seq key expire
          try {
            await r.set(hashKey, reqHash, { EX: 24 * 3600 });
            await r.expire(`split:${id}:scan_seq`, 3600); // auto cleanup scan sequence counter after 1h
          } catch (_) {}

          // Build detailed move mapping (#7) with truncation safeguard
          const packageMoves = moveLedgerPayload.map((mv) => ({
            package_id: mv.package.id,
            old_pallet_id: mv.old_pallet_id,
            new_pallet_id: mv.new_pallet_id,
          }));
          let movesForAudit = packageMoves;
          let truncated = false;
          if (packageMoves.length > 500) {
            // truncate large payloads
            movesForAudit = packageMoves.slice(0, 500);
            truncated = true;
          }
          const mapping = moveLedgerPayload.reduce((acc, mv) => {
            (acc[mv.old_pallet_id] ||= new Set()).add(mv.new_pallet_id);
            return acc;
          }, {});
          const mappingObj = Object.fromEntries(
            Object.entries(mapping).map(([k, v]) => [k, [...v]])
          );
          writeAudit({
            module: "warehouse",
            entityType: "SplitOrder",
            entityId: split.id,
            action: "split-order-finalize",
            user: req.user,
            before: null,
            after: null,
            extra: {
              pallets_input: normPallets,
              pallet_mapping: mappingObj,
              package_moves: movesForAudit,
              package_moves_total: packageMoves.length,
              package_moves_truncated: truncated,
              idempotency_hash: reqHash,
              idempotency_key,
              ledger_written_count: ledgerResult.written,
            },
          });
          return res.json(buildResp("Finalize 成功", { completed: true }));
        } catch (e) {
          try {
            await db.SplitOrder.update(
              {
                finalize_in_progress: false,
                last_finalize_error: e.message?.slice(0, 500),
              },
              { where: { id } }
            );
          } catch (_) {}
          await t.rollback();
          console.error(e);
          splitFinalizeCounter.inc({
            tenant: String(req.user.tenant_id || 0),
            warehouse: String(req.user.warehouse_id || 0),
            result: "error",
          });
          return res
            .status(500)
            .json(buildFail("SPLIT_FINALIZE_ERROR", "Finalize 失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("SPLIT_FINALIZE_BUSY", "分板单繁忙"));
      throw e;
    }
  }
);

// 取消
router.post(
  "/split-orders/:id/cancel",
  authenticate,
  checkPermission("warehouse.split_order.cancel"),
  async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    try {
      return await withRedisLock(`lock:split:${id}`, 10, async () => {
        const t = await db.sequelize.transaction();
        try {
          const split = await db.SplitOrder.findOne({
            where: {
              id,
              tenant_id: req.user.tenant_id,
              warehouse_id: req.user.warehouse_id,
            },
            transaction: t,
          });
          if (!split) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("SPLIT_NOT_FOUND", "分板单不存在"));
          }
          if (!["created", "assigned", "processing"].includes(split.status)) {
            await t.rollback();
            return res
              .status(400)
              .json(
                buildFail("SPLIT_CANCEL_STATUS_INVALID", "当前状态不可取消")
              );
          }
          const before = split.toJSON();
          await db.SplitOrderPackageScan.destroy({
            where: { split_order_id: id },
            transaction: t,
          });
          await db.SplitOrderPalletTemp.destroy({
            where: { split_order_id: id },
            transaction: t,
          });
          await db.SplitOrderRequirementStat.destroy({
            where: { split_order_id: id },
            transaction: t,
          });
          await split.update(
            {
              status: STAT.CANCELLED,
              cancelled_at: new Date(),
              cancel_reason: reason || null,
            },
            { transaction: t }
          );
          await t.commit();
          writeAudit({
            module: "warehouse",
            entityType: "SplitOrder",
            entityId: split.id,
            action: "split-order-cancel",
            user: req.user,
            before,
            after: split.toJSON(),
            extra: { reason, cleaned: true },
          });
          return res.json(buildResp("分板单已取消并清理", {}));
        } catch (e) {
          await t.rollback();
          console.error(e);
          return res
            .status(500)
            .json(buildFail("SPLIT_CANCEL_ERROR", "取消失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("SPLIT_CANCEL_BUSY", "分板单繁忙"));
      throw e;
    }
  }
);

export default router;

// finalize route augmentation: add tenant/warehouse filters & internal move ledger writing
// 查找并替换现有 finalize 实现（这里只追加写 ledger 逻辑, 假设上方已有 finalize 代码, 我们在成功 commit 后追加 ledger 调用）
// 为简洁仅在文件末尾附加一个后置中间件方式不可行, 需在原 finalize 成功路径中写入; 这里示例：拦截 res.json 返回包装
// 简化：提供一个工具函数供原 finalize 调用时可插入 ledger (需要手动在 finalize 逻辑中调用)
export async function writeSplitInternalMoveLedgerHelper({
  moveLedgerPayload,
  req,
  transaction,
  splitId,
}) {
  try {
    if (!moveLedgerPayload || moveLedgerPayload.length === 0)
      return { written: 0 };
    const result = await writeFtzInternalMoveLedger({
      moves: moveLedgerPayload,
      user: req.user,
      transaction,
      split_order_id: splitId,
    });
    return result;
  } catch (e) {
    console.error("internal_move ledger write failed", e);
    // Fallback: 写入 Outbox 以便异步补偿
    try {
      const minimalMoves = moveLedgerPayload.map((mv) => ({
        package_id: mv.package?.id,
        old_pallet_id: mv.old_pallet_id,
        new_pallet_id: mv.new_pallet_id,
        item_count: mv.items?.length || 0,
        items: (mv.items || []).slice(0, 20).map((it) => ({
          // snapshot limit 20 per package
          id: it.id,
          tracking_no: it.tracking_no,
          weight_kg: it.weight_kg,
          quantity: it.quantity,
          total_price: it.total_price,
          hs_code: it.hs_code,
        })),
      }));
      await db.FtzInventoryLedgerOutbox.create(
        {
          direction: "internal_move",
          status: "pending",
          split_order_id: splitId,
          tenant_id: req.user.tenant_id,
          warehouse_id: req.user.warehouse_id,
          version: 2,
          payload_json: JSON.stringify({ moves: minimalMoves, version: 2 }),
          last_error: e.message?.slice(0, 500) || null,
          attempts: 0,
        },
        { transaction }
      );
      writeAudit({
        module: "warehouse",
        entityType: "SplitOrder",
        entityId: splitId,
        action: "split-order-ledger-outbox-create",
        user: req.user,
        before: null,
        after: null,
        extra: { moves_count: minimalMoves.length, version: 2 },
      });
    } catch (oboxErr) {
      console.error("ledger outbox write failed", oboxErr);
    }
    writeAudit({
      module: "warehouse",
      entityType: "SplitOrder",
      entityId: splitId,
      action: "split-order-ledger-error",
      user: req.user,
      before: null,
      after: null,
      extra: { error: e.message },
    });
    return { written: 0, error: e.message, outboxed: true };
  }
}

// NOTE: 需手动在 finalize 成功 commit 前调用: await writeSplitInternalMoveLedgerHelper({ moveLedgerPayload, req, transaction: t, splitId: split.id })
