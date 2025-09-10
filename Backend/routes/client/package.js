import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import { Op } from "sequelize";
import {
  writeAudit,
  pickSnapshot,
  PACKAGE_AUDIT_FIELDS,
  PACKAGE_ITEM_AUDIT_FIELDS,
} from "../../utils/auditHelper.js";
import { logRead, logViewDetail } from "../../utils/logRead.js";
import { buildError } from "../../utils/errors.js";
import {
  nextPackageSequence,
  formatPackageCode,
} from "../../utils/sequence.js";

const router = express.Router();

// 生成包裹代码（使用 Redis INCR 保证原子性, fallback count）
async function generateSequentialPackageCode(
  inbondId,
  inbondCode,
  transaction
) {
  const seq = await nextPackageSequence(inbondId);
  return formatPackageCode(inbondCode, seq);
}

// 创建单个包裹（单一 operation_requirement_code）
router.post(
  "/inbond/:inbondId/add-package",
  authenticate,
  checkPermission("client.package.create"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const customerId = req.user.id;
      const { inbondId } = req.params;
      const {
        operation_requirement_code,
        length_cm = 0,
        width_cm = 0,
        height_cm = 0,
        weight_kg = 0,
        split_action = "direct",
        remark,
      } = req.body;

      if (!operation_requirement_code) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: "operation_requirement_code 不能为空" });
      }

      const inbond = await db.Inbond.findOne({
        where: { id: inbondId, client_id: customerId, status: "draft" },
        transaction: t,
      });
      if (!inbond) {
        await t.rollback();
        return res.status(404).json({ error: "Inbond 不存在或不可修改" });
      }

      const opReq = await db.OperationRequirement.findOne({
        where: { requirement_code: operation_requirement_code },
        transaction: t,
      });
      if (!opReq) {
        await t.rollback();
        return res.status(400).json({
          error: `无效的 operation_requirement_code: ${operation_requirement_code}`,
        });
      }
      // 新增：校验用户可选的操作需求
      const allow = await db.UserOperationRequirement.findOne({
        where: {
          user_id: customerId,
          operation_requirement_id: opReq.id,
          is_selectable: true,
          is_enabled: true,
        },
        transaction: t,
      });
      if (!allow) {
        await t.rollback();
        return res
          .status(403)
          .json(
            buildError(
              "PKG_REQUIREMENT_NOT_ALLOWED",
              "当前用户不可选择该操作需求"
            )
          );
      }

      const package_code = await generateSequentialPackageCode(
        inbondId,
        inbond.inbond_code,
        t
      );

      const pkg = await db.Package.create(
        {
          package_code,
          inbond_id: inbondId,
          client_id: customerId,
          operation_requirement_id: opReq.id,
          length_cm: parseFloat(length_cm) || 0,
          width_cm: parseFloat(width_cm) || 0,
          height_cm: parseFloat(height_cm) || 0,
          weight_kg: parseFloat(weight_kg) || 0,
          split_action,
          status: "prepared",
          clearance_status: "docs_insufficient",
          tax_type_id: inbond.tax_type_id,
          remark: remark || null,
        },
        { transaction: t }
      );

      await t.commit();
      writeAudit({
        module: "client",
        entityType: "Package",
        entityId: pkg.id,
        action: "create",
        user: req.user,
        before: null,
        after: pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS),
        extra: { inbond_id: inbondId },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.status(201).json({
        message: "包裹创建成功",
        package: {
          id: pkg.id,
          package_code: pkg.package_code,
          operation_requirement_code: opReq.requirement_code,
          status: pkg.status,
          clearance_status: pkg.clearance_status,
          length_cm: pkg.length_cm,
          width_cm: pkg.width_cm,
          height_cm: pkg.height_cm,
          weight_kg: pkg.weight_kg,
          remark: pkg.remark,
        },
      });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ error: "创建包裹失败" });
    }
  }
);

// 批量创建包裹（每个对象一个 operation_requirement_code）
router.post(
  "/inbond/:inbondId/add-packages-batch",
  authenticate,
  checkPermission("client.package.create"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const customerId = req.user.id;
      const { inbondId } = req.params;
      const { packages } = req.body;
      if (!Array.isArray(packages) || packages.length === 0) {
        await t.rollback();
        return res.status(400).json({ error: "packages 不能为空" });
      }
      if (packages.length > 200) {
        await t.rollback();
        return res.status(400).json({ error: "一次最多200个" });
      }
      const inbond = await db.Inbond.findOne({
        where: { id: inbondId, client_id: customerId, status: "draft" },
        transaction: t,
      });
      if (!inbond) {
        await t.rollback();
        return res.status(404).json({ error: "Inbond 不存在或不可修改" });
      }

      // 校验 & 收集 code
      for (let i = 0; i < packages.length; i++) {
        if (!packages[i].operation_requirement_code) {
          await t.rollback();
          return res
            .status(400)
            .json({ error: `第${i}个包裹缺少 operation_requirement_code` });
        }
      }
      const codeSet = [
        ...new Set(packages.map((p) => p.operation_requirement_code)),
      ];
      const opReqs = await db.OperationRequirement.findAll({
        where: { requirement_code: codeSet },
        transaction: t,
      });
      if (opReqs.length !== codeSet.length) {
        const found = new Set(opReqs.map((r) => r.requirement_code));
        const missing = codeSet.filter((c) => !found.has(c));
        await t.rollback();
        return res.status(400).json({ error: "存在无效操作需求代码", missing });
      }
      const reqMap = Object.fromEntries(
        opReqs.map((r) => [r.requirement_code, r])
      );
      // 新增：一次性校验用户允许的 requirement 集合
      const reqIds = opReqs.map((r) => r.id);
      const allowedRows = await db.UserOperationRequirement.findAll({
        where: {
          user_id: customerId,
          operation_requirement_id: reqIds,
          is_selectable: true,
          is_enabled: true,
        },
        transaction: t,
      });
      const allowedSet = new Set(
        allowedRows.map((a) => a.operation_requirement_id)
      );
      const notAllowedCodes = [];
      for (const c of codeSet) {
        const r = reqMap[c];
        if (!r || !allowedSet.has(r.id)) notAllowedCodes.push(c);
      }
      if (notAllowedCodes.length > 0) {
        await t.rollback();
        return res
          .status(403)
          .json(
            buildError(
              "PKG_REQUIREMENT_NOT_ALLOWED",
              "存在当前用户不可选择的操作需求",
              { not_allowed: notAllowedCodes }
            )
          );
      }

      const existingCount = await db.Package.count({
        where: { inbond_id: inbondId },
        transaction: t,
      });
      let seqBase = existingCount;
      const created = [];
      const auditBatch = [];
      for (const p of packages) {
        seqBase += 1;
        const seq = seqBase.toString().padStart(3, "0");
        const package_code = `${inbond.inbond_code}-${seq}`;
        const opReq = reqMap[p.operation_requirement_code];
        // opReq 必然允许（前面已整体校验）
        const pkg = await db.Package.create(
          {
            package_code,
            inbond_id: inbondId,
            client_id: customerId,
            operation_requirement_id: opReq.id,
            length_cm: parseFloat(p.length_cm) || 0,
            width_cm: parseFloat(p.width_cm) || 0,
            height_cm: parseFloat(p.height_cm) || 0,
            weight_kg: parseFloat(p.weight_kg) || 0,
            split_action: p.split_action || "direct",
            status: "prepared",
            clearance_status: "docs_insufficient",
            tax_type_id: inbond.tax_type_id,
            remark: p.remark || null,
          },
          { transaction: t }
        );
        created.push({
          id: pkg.id,
          package_code: pkg.package_code,
          operation_requirement_code: opReq.requirement_code,
          status: pkg.status,
          clearance_status: pkg.clearance_status,
          weight_kg: pkg.weight_kg,
        });
        auditBatch.push({
          id: pkg.id,
          snap: pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS),
        });
      }
      await t.commit();
      for (const a of auditBatch) {
        writeAudit({
          module: "client",
          entityType: "Package",
          entityId: a.id,
          action: "create",
          user: req.user,
          before: null,
          after: a.snap,
          extra: { batch: true, inbond_id: inbondId },
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }
      return res.status(201).json({
        message: `创建 ${created.length} 个包裹成功`,
        packages: created,
      });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ error: "批量创建失败" });
    }
  }
);

// 查询 inbond 的包裹 加入只读审计
router.get(
  "/inbond/:inbondId/packages",
  authenticate,
  checkPermission("client.package.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      const customerId = req.user.id;
      const { inbondId } = req.params;
      const inbond = await db.Inbond.findOne({
        where: { id: inbondId, client_id: customerId },
      });
      if (!inbond) return res.status(404).json({ error: "Inbond 不存在" });
      const rows = await db.Package.findAll({
        where: { inbond_id: inbondId },
        include: [
          {
            model: db.OperationRequirement,
            as: "operationRequirement",
            attributes: ["id", "requirement_code", "requirement_name"],
          },
        ],
        order: [["package_code", "ASC"]],
      });
      res.json({ packages: rows });
      logRead(req, {
        entityType: "Package",
        page: 1,
        pageSize: rows.length,
        resultCount: rows.length,
        startAt,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "查询失败" });
    }
  }
);

// 更新包裹（只允许 prepared + draft inbond）
router.put(
  "/package/:packageId",
  authenticate,
  checkPermission("client.package.update"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const customerId = req.user.id;
      const { packageId } = req.params;
      const {
        length_cm,
        width_cm,
        height_cm,
        weight_kg,
        split_action,
        remark,
        operation_requirement_code,
      } = req.body;
      const pkg = await db.Package.findOne({
        where: { id: packageId, client_id: customerId, status: "prepared" },
        include: [
          { model: db.Inbond, as: "inbond", where: { status: "draft" } },
          { model: db.OperationRequirement, as: "operationRequirement" },
        ],
        transaction: t,
      });
      if (!pkg) {
        await t.rollback();
        return res.status(404).json({ error: "包裹不存在或不可修改" });
      }
      const beforeSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
      if (length_cm !== undefined) pkg.length_cm = parseFloat(length_cm) || 0;
      if (width_cm !== undefined) pkg.width_cm = parseFloat(width_cm) || 0;
      if (height_cm !== undefined) pkg.height_cm = parseFloat(height_cm) || 0;
      if (weight_kg !== undefined) pkg.weight_kg = parseFloat(weight_kg) || 0;
      if (split_action) pkg.split_action = split_action;
      if (remark !== undefined) pkg.remark = remark;
      if (operation_requirement_code) {
        const opReq = await db.OperationRequirement.findOne({
          where: { requirement_code: operation_requirement_code },
          transaction: t,
        });
        if (!opReq) {
          await t.rollback();
          return res
            .status(400)
            .json({ error: "无效的 operation_requirement_code" });
        }
        // 新增：校验用户可选性
        const allow = await db.UserOperationRequirement.findOne({
          where: {
            user_id: customerId,
            operation_requirement_id: opReq.id,
            is_selectable: true,
            is_enabled: true,
          },
          transaction: t,
        });
        if (!allow) {
          await t.rollback();
          return res
            .status(403)
            .json(
              buildError(
                "PKG_REQUIREMENT_NOT_ALLOWED",
                "当前用户不可选择该操作需求"
              )
            );
        }
        pkg.operation_requirement_id = opReq.id;
      }
      await pkg.save({ transaction: t });
      const afterSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "client",
        entityType: "Package",
        entityId: pkg.id,
        action: "update",
        user: req.user,
        before: beforeSnap,
        after: afterSnap,
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json({ message: "更新成功", package: pkg });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ error: "更新失败" });
    }
  }
);

// 批量更新（仅尺寸/重量/remark/需求）
router.put(
  "/packages-batch",
  authenticate,
  checkPermission("client.package.update"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const customerId = req.user.id;
      const { packages } = req.body;
      if (!Array.isArray(packages) || packages.length === 0)
        return res.status(400).json({ error: "packages 不能为空" });
      if (packages.length > 200)
        return res.status(400).json({ error: "最多200条" });
      const results = [];
      const errors = [];
      const audits = [];
      for (let i = 0; i < packages.length; i++) {
        const p = packages[i];
        try {
          const pkg = await db.Package.findOne({
            where: { id: p.id, client_id: customerId, status: "prepared" },
            include: [
              { model: db.Inbond, as: "inbond", where: { status: "draft" } },
            ],
            transaction: t,
          });
          if (!pkg) {
            errors.push({ index: i, id: p.id, error: "不可修改" });
            continue;
          }
          const beforeSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
          if (p.length_cm !== undefined)
            pkg.length_cm = parseFloat(p.length_cm) || 0;
          if (p.width_cm !== undefined)
            pkg.width_cm = parseFloat(p.width_cm) || 0;
          if (p.height_cm !== undefined)
            pkg.height_cm = parseFloat(p.height_cm) || 0;
          if (p.weight_kg !== undefined)
            pkg.weight_kg = parseFloat(p.weight_kg) || 0;
          if (p.split_action) pkg.split_action = p.split_action;
          if (p.remark !== undefined) pkg.remark = p.remark;
          if (p.operation_requirement_code) {
            const opReq = await db.OperationRequirement.findOne({
              where: { requirement_code: p.operation_requirement_code },
              transaction: t,
            });
            if (!opReq) {
              errors.push({ index: i, id: p.id, error: "需求代码无效" });
              continue;
            }
            // 新增：校验用户可选性
            const allow = await db.UserOperationRequirement.findOne({
              where: {
                user_id: customerId,
                operation_requirement_id: opReq.id,
                is_selectable: true,
                is_enabled: true,
              },
              transaction: t,
            });
            if (!allow) {
              errors.push({
                index: i,
                id: p.id,
                error: "该操作需求对当前用户不可选",
              });
              continue;
            }
            pkg.operation_requirement_id = opReq.id;
          }
          await pkg.save({ transaction: t });
          const afterSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
          audits.push({ id: pkg.id, before: beforeSnap, after: afterSnap });
          results.push({ id: pkg.id, package_code: pkg.package_code });
        } catch (inner) {
          errors.push({ index: i, id: p.id, error: inner.message });
        }
      }
      if (errors.length > 0) {
        await t.rollback();
        return res.status(400).json({ error: "部分失败", errors });
      }
      await t.commit();
      for (const a of audits) {
        writeAudit({
          module: "client",
          entityType: "Package",
          entityId: a.id,
          action: "update",
          user: req.user,
          before: a.before,
          after: a.after,
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }
      return res.json({
        message: `更新 ${results.length} 条成功`,
        updated: results,
      });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ error: "批量更新失败" });
    }
  }
);

// 批量删除
router.delete(
  "/packages-batch",
  authenticate,
  checkPermission("client.package.delete"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { packageIds } = req.body;
      const customerId = req.user.id;
      if (!Array.isArray(packageIds) || packageIds.length === 0)
        return res.status(400).json({ error: "packageIds 不能为空" });
      if (packageIds.length > 200)
        return res.status(400).json({ error: "最多200条" });
      const deleted = [];
      const errors = [];
      const auditList = [];
      for (let i = 0; i < packageIds.length; i++) {
        const id = packageIds[i];
        try {
          const pkg = await db.Package.findOne({
            where: { id, client_id: customerId, status: "prepared" },
            include: [
              { model: db.Inbond, as: "inbond", where: { status: "draft" } },
            ],
            transaction: t,
          });
          if (!pkg) {
            errors.push({ index: i, id, error: "不可删除" });
            continue;
          }
          const beforeSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
          await pkg.destroy({ transaction: t });
          auditList.push({ id, before: beforeSnap });
          deleted.push(id);
        } catch (inner) {
          errors.push({ index: i, id, error: inner.message });
        }
      }
      if (errors.length > 0) {
        await t.rollback();
        return res.status(400).json({ error: "部分删除失败", errors });
      }
      await t.commit();
      for (const a of auditList) {
        writeAudit({
          module: "client",
          entityType: "Package",
          entityId: a.id,
          action: "delete",
          user: req.user,
          before: a.before,
          after: null,
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }
      return res.json({ message: `删除 ${deleted.length} 条成功`, deleted });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ error: "批量删除失败" });
    }
  }
);

// 单个删除
router.delete(
  "/package/:packageId",
  authenticate,
  checkPermission("client.package.delete"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { packageId } = req.params;
      const customerId = req.user.id;
      const pkg = await db.Package.findOne({
        where: { id: packageId, client_id: customerId, status: "prepared" },
        include: [
          { model: db.Inbond, as: "inbond", where: { status: "draft" } },
        ],
        transaction: t,
      });
      if (!pkg) {
        await t.rollback();
        return res.status(404).json({ error: "包裹不存在或不可删除" });
      }
      const beforeSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
      await pkg.destroy({ transaction: t });
      await t.commit();
      writeAudit({
        module: "client",
        entityType: "Package",
        entityId: packageId,
        action: "delete",
        user: req.user,
        before: beforeSnap,
        after: null,
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json({ message: "删除成功" });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ error: "删除失败" });
    }
  }
);

// 添加包裹明细
router.post(
  "/package/:packageCode/add-item",
  authenticate,
  checkPermission("client.package.item.add"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { packageCode } = req.params;
      const customerId = req.user.id;
      const item = req.body;
      const pkg = await db.Package.findOne({
        where: {
          package_code: packageCode,
          client_id: customerId,
          status: "prepared",
        },
        include: [
          { model: db.Inbond, as: "inbond", where: { status: "draft" } },
        ],
        transaction: t,
      });
      if (!pkg) {
        await t.rollback();
        return res.status(404).json({ error: "包裹不存在或不可修改" });
      }
      const created = await db.PackageItem.create(
        {
          package_id: pkg.id,
          tracking_no: item.tracking_no,
          client_code: item.client_code,
          file_number: item.file_number,
          receiver_name: item.receiver_name,
          receiver_country: item.receiver_country,
          receiver_state: item.receiver_state,
          receiver_city: item.receiver_city,
          receiver_postcode: item.receiver_postcode,
          receiver_email: item.receiver_email,
          receiver_phone: item.receiver_phone,
          receiver_address1: item.receiver_address1,
          receiver_address2: item.receiver_address2,
          sender_name: item.sender_name,
          sender_country: item.sender_country,
          sender_province: item.sender_province,
          sender_city: item.sender_city,
          sender_postcode: item.sender_postcode,
          sender_address1: item.sender_address1,
          sender_address2: item.sender_address2,
          sender_license: item.sender_license,
          sender_email: item.sender_email,
          sender_phone: item.sender_phone,
          weight_kg: item.weight_kg ? parseFloat(item.weight_kg) : null,
          quantity: item.quantity ? parseInt(item.quantity) : null,
          length_cm: item.length_cm ? parseInt(item.length_cm) : null,
          width_cm: item.width_cm ? parseInt(item.width_cm) : null,
          height_cm: item.height_cm ? parseInt(item.height_cm) : null,
          hs_code: item.hs_code,
          product_name_en: item.product_name_en,
          product_description: item.product_description,
          material: item.material,
          origin_country: item.origin_country,
          url: item.url,
          unit_price: item.unit_price ? parseFloat(item.unit_price) : null,
          total_price: item.total_price ? parseFloat(item.total_price) : null,
          item_count: item.item_count ? parseInt(item.item_count) : null,
          is_fda:
            item.is_fda === true || item.is_fda === "true" || item.is_fda === 1,
          manufacturer_mid: item.manufacturer_mid,
          custom_note: item.custom_note,
        },
        { transaction: t }
      );
      await t.commit();
      writeAudit({
        module: "client",
        entityType: "PackageItem",
        entityId: created.id,
        action: "create",
        user: req.user,
        before: null,
        after: pickSnapshot(created, PACKAGE_ITEM_AUDIT_FIELDS),
        extra: { package_id: pkg.id },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.status(201).json({ message: "明细创建成功", item: created });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ error: "添加明细失败" });
    }
  }
);

// 从模板批量导入包裹明细
router.post(
  "/package/:packageCode/add-items-from-templates",
  authenticate,
  checkPermission("client.package.item.add"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { packageCode } = req.params;
      const { template_ids } = req.body || {};
      const clientId = req.user.id;

      if (!Array.isArray(template_ids) || template_ids.length === 0) {
        await t.rollback();
        return res.status(400).json({
          error: "template_ids 不能为空",
          code: "TEMPLATE_IDS_REQUIRED",
        });
      }

      // 校验包裹归属与可编辑
      const pkg = await db.Package.findOne({
        where: {
          package_code: packageCode,
          client_id: clientId,
          status: "prepared",
        },
        include: [
          { model: db.Inbond, as: "inbond", where: { status: "draft" } },
        ],
        transaction: t,
      });
      if (!pkg) {
        await t.rollback();
        return res.status(404).json({ error: "包裹不存在或不可修改" });
      }

      // 读取模板（仅当前客户）
      const templates = await db.ItemTemplate.findAll({
        where: { id: template_ids, client_id: clientId },
        transaction: t,
      });
      if (templates.length === 0) {
        await t.rollback();
        return res.status(404).json({ error: "未找到模板" });
      }

      // 创建明细
      const createdItems = [];
      for (const tpl of templates) {
        const created = await db.PackageItem.create(
          {
            package_id: pkg.id,
            // 模板字段映射到包裹明细，尽量保留有用信息
            product_description: tpl.description_of_good,
            hs_code: tpl.hs_code,
            quantity: tpl.qty ? parseInt(tpl.qty) : null,
            unit_price: tpl.unit_price_usd
              ? parseFloat(tpl.unit_price_usd)
              : null,
            total_price: tpl.total_value_usd
              ? parseFloat(tpl.total_value_usd)
              : null,
            item_count: tpl.total_boxes ? parseInt(tpl.total_boxes) : null,
            origin_country: tpl.country_of_origin,
            manufacturer_mid: tpl.manufacturer,
            // 其他接收人、尺寸、重量等模板不包含，保持为空，由用户后续补充
          },
          { transaction: t }
        );
        createdItems.push(created);
      }

      await t.commit();

      // 审计
      for (const it of createdItems) {
        writeAudit({
          module: "client",
          entityType: "PackageItem",
          entityId: it.id,
          action: "create",
          user: req.user,
          before: null,
          after: pickSnapshot(it, PACKAGE_ITEM_AUDIT_FIELDS),
          extra: { package_id: pkg.id, imported_from_template: true },
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }

      return res.json({
        success: true,
        message: `导入 ${createdItems.length} 条明细成功`,
        count: createdItems.length,
      });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ error: "批量导入失败" });
    }
  }
);

// 获取包裹明细
router.get(
  "/package/:packageCode/items",
  authenticate,
  checkPermission("client.package.item.view"),
  async (req, res) => {
    try {
      const { packageCode } = req.params;
      const customerId = req.user.id;
      const pkg = await db.Package.findOne({
        where: { package_code: packageCode, client_id: customerId },
      });
      if (!pkg) return res.status(404).json({ error: "包裹不存在" });
      const items = await db.PackageItem.findAll({
        where: { package_id: pkg.id },
        order: [["created_at", "ASC"]],
      });
      return res.json({
        package: {
          id: pkg.id,
          package_code: pkg.package_code,
          status: pkg.status,
        },
        items,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "获取失败" });
    }
  }
);

// 统一包裹列表（分页 + 过滤） 加入只读审计
router.get(
  "/packages",
  authenticate,
  checkPermission("client.package.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      const clientId = req.user.id;
      let {
        page = 1,
        pageSize = 20,
        status,
        inbond_id,
        operation_requirement_code,
        code,
        created_from,
        created_to,
      } = req.query;
      page = parseInt(page) || 1;
      pageSize = Math.min(100, parseInt(pageSize) || 20);

      const where = { client_id: clientId };
      if (status) where.status = status;
      if (inbond_id) where.inbond_id = inbond_id;
      if (code) where.package_code = { [Op.like]: `${code}%` };
      if (created_from || created_to) {
        where.created_at = {};
        if (created_from) where.created_at[Op.gte] = new Date(created_from);
        if (created_to) where.created_at[Op.lte] = new Date(created_to);
      }

      const include = [
        {
          model: db.OperationRequirement,
          as: "operationRequirement",
          attributes: ["id", "requirement_code", "requirement_name"],
          ...(operation_requirement_code
            ? { where: { requirement_code: operation_requirement_code } }
            : {}),
        },
        {
          model: db.Inbond,
          as: "inbond",
          attributes: ["id", "inbond_code", "status"],
        },
      ];

      const { rows, count } = await db.Package.findAndCountAll({
        where,
        include,
        order: [["created_at", "DESC"]],
        offset: (page - 1) * pageSize,
        limit: pageSize,
      });
      res.json({
        success: true,
        message: "包裹列表",
        page,
        pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
        packages: rows,
      });
      logRead(req, {
        entityType: "Package",
        page,
        pageSize,
        resultCount: rows.length,
        startAt,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "查询失败" });
    }
  }
);

// 按包裹代码查询详情 加入只读审计
router.get(
  "/package/by-code/:packageCode",
  authenticate,
  checkPermission("client.package.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      const clientId = req.user.id;
      const { packageCode } = req.params;
      const pkg = await db.Package.findOne({
        where: { package_code: packageCode, client_id: clientId },
        include: [
          {
            model: db.OperationRequirement,
            as: "operationRequirement",
            attributes: ["requirement_code", "requirement_name"],
          },
          {
            model: db.Inbond,
            as: "inbond",
            attributes: ["inbond_code", "status"],
          },
        ],
      });
      if (!pkg) return res.status(404).json({ error: "包裹不存在" });
      res.json({ success: true, package: pkg });
      logViewDetail(req, {
        entityType: "Package",
        entityId: pkg.id,
        startAt,
        resultExists: true,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "获取失败" });
    }
  }
);

// 简化版：表格编辑单个明细
router.put(
  "/item/:itemId",
  authenticate,
  checkPermission("client.package.item.update"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const clientId = req.user.id;
      const { itemId } = req.params;
      const body = req.body || {};

      const item = await db.PackageItem.findOne({
        where: { id: itemId },
        include: [
          {
            model: db.Package,
            as: "package",
            where: { client_id: clientId, status: "prepared" },
            include: [
              { model: db.Inbond, as: "inbond", where: { status: "draft" } },
            ],
          },
        ],
        transaction: t,
      });
      if (!item) {
        await t.rollback();
        return res
          .status(404)
          .json({
            success: false,
            code: "ITEM_NOT_EDITABLE",
            message: "明细不存在或不可编辑",
          });
      }

      const before = pickSnapshot(item, PACKAGE_ITEM_AUDIT_FIELDS);

      // 商用规格：仅允许四个字段，并进行严格校验
      const updates = {};

      if (body.product_description !== undefined) {
        const v = String(body.product_description).trim();
        if (v.length > 500) {
          await t.rollback();
          return res
            .status(400)
            .json({
              success: false,
              code: "ITEM_DESC_TOO_LONG",
              message: "物品名称/描述最长500字符",
            });
        }
        updates.product_description = v || null;
      }

      if (body.quantity !== undefined) {
        const n = Number(body.quantity);
        if (!Number.isInteger(n) || n < 0 || n > 999999) {
          await t.rollback();
          return res
            .status(400)
            .json({
              success: false,
              code: "ITEM_QUANTITY_INVALID",
              message: "数量需为0-999999的整数",
            });
        }
        updates.quantity = n;
      }

      if (body.total_price !== undefined) {
        const n = Number(body.total_price);
        if (!Number.isFinite(n) || n < 0 || n > 1e12) {
          await t.rollback();
          return res
            .status(400)
            .json({
              success: false,
              code: "ITEM_TOTAL_PRICE_INVALID",
              message: "总价需为>=0的数值",
            });
        }
        // 保留两位精度
        updates.total_price = parseFloat(n.toFixed(2));
      }

      if (body.custom_note !== undefined) {
        const v = String(body.custom_note).trim();
        if (v.length > 500) {
          await t.rollback();
          return res
            .status(400)
            .json({
              success: false,
              code: "ITEM_NOTE_TOO_LONG",
              message: "备注最长500字符",
            });
        }
        updates.custom_note = v || null;
      }

      Object.assign(item, updates);

      await item.save({ transaction: t });
      const after = pickSnapshot(item, PACKAGE_ITEM_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "client",
        entityType: "PackageItem",
        entityId: item.id,
        action: "update",
        user: req.user,
        before,
        after,
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json({ success: true, message: "更新成功", item });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res
        .status(500)
        .json({
          success: false,
          code: "ITEM_UPDATE_ERROR",
          message: "更新明细失败",
        });
    }
  }
);

// 简化版：批量新增或更新明细（用于表格一次性提交）
router.post(
  "/package/:packageCode/items/bulk",
  authenticate,
  checkPermission("client.package.item.update"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const clientId = req.user.id;
      const { packageCode } = req.params;
      const { items } = req.body || {};
      if (!Array.isArray(items)) {
        await t.rollback();
        return res
          .status(400)
          .json({
            success: false,
            code: "ITEMS_ARRAY_REQUIRED",
            message: "items 需要为数组",
          });
      }
      if (items.length > 500) {
        await t.rollback();
        return res
          .status(400)
          .json({
            success: false,
            code: "BULK_TOO_LARGE",
            message: "一次最多500条",
          });
      }

      const pkg = await db.Package.findOne({
        where: {
          package_code: packageCode,
          client_id: clientId,
          status: "prepared",
        },
        include: [
          { model: db.Inbond, as: "inbond", where: { status: "draft" } },
        ],
        transaction: t,
      });
      if (!pkg) {
        await t.rollback();
        return res
          .status(404)
          .json({
            success: false,
            code: "PACKAGE_NOT_EDITABLE",
            message: "包裹不存在或不可编辑",
          });
      }

      // 校验函数：仅构建四个字段
      function buildPayload(row) {
        const payload = {};
        // product_description
        if (row.product_description !== undefined) {
          const v = String(row.product_description).trim();
          if (v.length > 500) {
            return {
              error: {
                code: "ITEM_DESC_TOO_LONG",
                message: "物品名称/描述最长500字符",
              },
            };
          }
          payload.product_description = v || null;
        }
        // quantity
        if (row.quantity !== undefined) {
          const n = Number(row.quantity);
          if (!Number.isInteger(n) || n < 0 || n > 999999) {
            return {
              error: {
                code: "ITEM_QUANTITY_INVALID",
                message: "数量需为0-999999的整数",
              },
            };
          }
          payload.quantity = n;
        }
        // total_price
        if (row.total_price !== undefined) {
          const n = Number(row.total_price);
          if (!Number.isFinite(n) || n < 0 || n > 1e12) {
            return {
              error: {
                code: "ITEM_TOTAL_PRICE_INVALID",
                message: "总价需为>=0的数值",
              },
            };
          }
          payload.total_price = parseFloat(n.toFixed(2));
        }
        // custom_note
        if (row.custom_note !== undefined) {
          const v = String(row.custom_note).trim();
          if (v.length > 500) {
            return {
              error: { code: "ITEM_NOTE_TOO_LONG", message: "备注最长500字符" },
            };
          }
          payload.custom_note = v || null;
        }
        return { payload };
      }

      const created = [];
      const updated = [];
      const errors = [];
      const auditCreates = [];
      const auditUpdates = [];

      for (let i = 0; i < items.length; i++) {
        const row = items[i] || {};
        if (row.id) {
          const it = await db.PackageItem.findOne({
            where: { id: row.id, package_id: pkg.id },
            transaction: t,
          });
          if (!it) {
            errors.push({
              index: i,
              id: row.id,
              code: "ITEM_NOT_FOUND",
              message: "明细不存在",
            });
            continue;
          }
          const { payload, error } = buildPayload(row);
          if (error) {
            errors.push({ index: i, id: row.id, ...error });
            continue;
          }
          const before = pickSnapshot(it, PACKAGE_ITEM_AUDIT_FIELDS);
          Object.assign(it, payload);
          await it.save({ transaction: t });
          const after = pickSnapshot(it, PACKAGE_ITEM_AUDIT_FIELDS);
          auditUpdates.push({ id: it.id, before, after });
          updated.push(it.id);
        } else {
          const { payload, error } = buildPayload(row);
          if (error) {
            errors.push({ index: i, id: null, ...error });
            continue;
          }
          const it = await db.PackageItem.create(
            { package_id: pkg.id, ...payload },
            { transaction: t }
          );
          auditCreates.push(it);
          created.push(it.id);
        }
      }

      if (errors.length > 0) {
        await t.rollback();
        return res
          .status(400)
          .json({
            success: false,
            code: "BULK_VALIDATE_FAILED",
            message: "部分数据校验失败",
            errors,
          });
      }

      await t.commit();

      // 审计：批量创建/更新
      for (const it of auditCreates) {
        writeAudit({
          module: "client",
          entityType: "PackageItem",
          entityId: it.id,
          action: "create",
          user: req.user,
          before: null,
          after: pickSnapshot(it, PACKAGE_ITEM_AUDIT_FIELDS),
          extra: { package_id: pkg.id, bulk: true },
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }
      for (const a of auditUpdates) {
        writeAudit({
          module: "client",
          entityType: "PackageItem",
          entityId: a.id,
          action: "update",
          user: req.user,
          before: a.before,
          after: a.after,
          extra: { package_id: pkg.id, bulk: true },
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }

      return res.json({ success: true, message: "提交成功", created, updated });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res
        .status(500)
        .json({
          success: false,
          code: "BULK_SAVE_ERROR",
          message: "批量提交失败",
        });
    }
  }
);

// 物品联想下拉（根据输入筛选），用于表格中点击“物品名称”弹出的下拉
router.get(
  "/package-items/suggestions",
  authenticate,
  checkPermission("client.package.item.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      const clientId = req.user.id;
      const { keyword = "", limit = 10 } = req.query;
      const kw = String(keyword).trim();
      const lim = Math.min(50, parseInt(limit) || 10);

      // 1) 来自历史 PackageItem（限定当前客户）
      const fromItems = await db.PackageItem.findAll({
        attributes: [
          "product_name_en",
          "product_description",
          "material",
          "origin_country",
          "hs_code",
          "length_cm",
          "width_cm",
          "height_cm",
        ],
        include: [
          {
            model: db.Package,
            as: "package",
            attributes: [],
            where: { client_id: clientId },
            required: true,
          },
        ],
        where: kw
          ? {
              [Op.or]: [
                { product_name_en: { [Op.like]: `%${kw}%` } },
                { product_description: { [Op.like]: `%${kw}%` } },
                { material: { [Op.like]: `%${kw}%` } },
                { hs_code: { [Op.like]: `%${kw}%` } },
              ],
            }
          : undefined,
        order: [["created_at", "DESC"]],
        limit: lim,
        subQuery: false,
      });

      // 2) 来自 ItemTemplate（限定当前客户）
      const fromTpls = await db.ItemTemplate.findAll({
        attributes: [
          [db.sequelize.col("description_of_good"), "product_description"],
          [db.sequelize.col("materials"), "material"],
          [db.sequelize.col("country_of_origin"), "origin_country"],
          [db.sequelize.col("hs_code"), "hs_code"],
        ],
        where: {
          client_id: clientId,
          ...(kw
            ? {
                [Op.or]: [
                  { description_of_good: { [Op.like]: `%${kw}%` } },
                  { materials: { [Op.like]: `%${kw}%` } },
                  { hs_code: { [Op.like]: `%${kw}%` } },
                ],
              }
            : {}),
        },
        order: [["updated_at", "DESC"]],
        limit: lim,
      });

      // 合并与去重（按 name+desc+material+origin+hs）
      const uniq = new Map();
      const pushUniq = (r) => {
        const key = [
          r.product_name_en || "",
          r.product_description || "",
          r.material || "",
          r.origin_country || "",
          r.hs_code || "",
        ].join("|");
        if (!uniq.has(key)) uniq.set(key, r);
      };
      fromItems.forEach((it) =>
        pushUniq({
          product_name_en: it.product_name_en || null,
          product_description: it.product_description || null,
          material: it.material || null,
          origin_country: it.origin_country || null,
          hs_code: it.hs_code || null,
          length_cm: it.length_cm || null,
          width_cm: it.width_cm || null,
          height_cm: it.height_cm || null,
        })
      );
      fromTpls.forEach((t) =>
        pushUniq({
          product_name_en: null, // 模板没有英文名字段，留空
          product_description: t.get("product_description") || null,
          material: t.get("material") || null,
          origin_country: t.get("origin_country") || null,
          hs_code: t.get("hs_code") || null,
          length_cm: null,
          width_cm: null,
          height_cm: null,
        })
      );

      const list = Array.from(uniq.values()).slice(0, lim);
      res.json({ success: true, suggestions: list });
      logRead(req, {
        entityType: "PackageItemSuggestion",
        page: 1,
        pageSize: list.length,
        resultCount: list.length,
        startAt,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: "获取建议失败" });
    }
  }
);

// “新物品”弹窗：创建 ItemTemplate 以便下次快速选择
router.post(
  "/item-templates",
  authenticate,
  checkPermission("client.package.item.add"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const clientId = req.user.id;
      const {
        sku,
        product_name_en, // 可选，保存到备注或前缀
        product_description,
        material,
        origin_country,
        hs_code,
        unit_price_usd,
        total_value_usd,
      } = req.body || {};

      if (!product_description) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          code: "ITEM_TEMPLATE_DESC_REQUIRED",
          message: "产品用途/描述必填",
        });
      }

      const tpl = await db.ItemTemplate.create(
        {
          client_id: clientId,
          sku: sku || null,
          description_of_good: product_description,
          materials: material || null,
          country_of_origin: origin_country || null,
          hs_code: hs_code || null,
          unit_price_usd: unit_price_usd ? parseFloat(unit_price_usd) : null,
          total_value_usd: total_value_usd ? parseFloat(total_value_usd) : null,
        },
        { transaction: t }
      );

      await t.commit();
      writeAudit({
        module: "client",
        entityType: "ItemTemplate",
        entityId: tpl.id,
        action: "create",
        user: req.user,
        before: null,
        after: null,
        extra: {
          client_id: clientId,
          sku: tpl.sku,
          description_of_good: tpl.description_of_good,
          materials: tpl.materials,
          country_of_origin: tpl.country_of_origin,
          hs_code: tpl.hs_code,
        },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json({
        success: true,
        message: "新物品已创建",
        template: tpl,
      });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ success: false, error: "创建失败" });
    }
  }
);

export default router;
