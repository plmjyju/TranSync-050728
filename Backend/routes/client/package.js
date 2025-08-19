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

export default router;
