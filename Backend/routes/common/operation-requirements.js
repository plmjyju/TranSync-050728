import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";
import config from "../../config/environment.js";
import {
  writeAudit,
  pickSnapshot,
  PACKAGE_AUDIT_FIELDS,
} from "../../utils/auditHelper.js";

const router = express.Router();
const { OperationRequirement, Package } = db;

// 获取可用的操作需求选项（简化版）
router.get(
  "/operation-requirements/available",
  authenticate,
  async (req, res) => {
    try {
      const { handling_mode, carrier, search } = req.query;

      const whereCondition = { is_active: true };
      if (handling_mode) whereCondition.handling_mode = handling_mode;
      if (carrier) whereCondition.carrier = carrier;
      if (search) {
        whereCondition[db.Sequelize.Op.or] = [
          { requirement_code: { [db.Sequelize.Op.like]: `%${search}%` } },
          { requirement_name: { [db.Sequelize.Op.like]: `%${search}%` } },
          { label_abbr: { [db.Sequelize.Op.like]: `%${search}%` } },
        ];
      }

      const requirements = await OperationRequirement.findAll({
        where: whereCondition,
        attributes: [
          "id",
          "requirement_code",
          "requirement_name",
          "description",
          "handling_mode",
          "carrier",
          "label_abbr",
          "sort_order",
          "is_active",
        ],
        order: [
          ["sort_order", "ASC"],
          ["requirement_code", "ASC"],
        ],
      });

      res.json({ success: true, requirements });
    } catch (error) {
      console.error("获取操作需求选项失败:", error);
      res.status(500).json({ success: false, error: "获取操作需求选项失败" });
    }
  }
);

// 别名: /operation-requirements -> 与 /operation-requirements/available 相同返回
router.get("/operation-requirements", authenticate, async (req, res) => {
  try {
    const { handling_mode, carrier, search } = req.query;
    const whereCondition = { is_active: true };
    if (handling_mode) whereCondition.handling_mode = handling_mode;
    if (carrier) whereCondition.carrier = carrier;
    if (search) {
      whereCondition[db.Sequelize.Op.or] = [
        { requirement_code: { [db.Sequelize.Op.like]: `%${search}%` } },
        { requirement_name: { [db.Sequelize.Op.like]: `%${search}%` } },
        { label_abbr: { [db.Sequelize.Op.like]: `%${search}%` } },
      ];
    }

    const requirements = await db.OperationRequirement.findAll({
      where: whereCondition,
      attributes: [
        "id",
        "requirement_code",
        "requirement_name",
        "description",
        "handling_mode",
        "carrier",
        "label_abbr",
        "sort_order",
        "is_active",
      ],
      order: [
        ["sort_order", "ASC"],
        ["requirement_code", "ASC"],
      ],
    });
    res.json({ success: true, requirements, alias: true });
  } catch (error) {
    console.error("获取操作需求别名接口失败:", error);
    res.status(500).json({ success: false, error: "获取操作需求失败" });
  }
});

// 更新包裹的单一 operation_requirement_code（保持不变）
router.patch(
  "/packages/:package_id/operation-requirement",
  authenticate,
  checkPermission("client.package.update"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { package_id } = req.params;
      const { operation_requirement_code } = req.body;
      if (!operation_requirement_code) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          code: "PKG_REQUIREMENT_CODE_MISSING",
          message: "operation_requirement_code 不能为空",
        });
      }
      const pkg = await Package.findOne({
        where: { id: package_id, client_id: req.user.id, status: "prepared" },
        transaction: t,
      });
      if (!pkg) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          code: "PKG_NOT_FOUND_OR_FORBIDDEN",
          message: "包裹不存在或不可修改",
        });
      }
      const opReq = await OperationRequirement.findOne({
        where: { requirement_code: operation_requirement_code },
        transaction: t,
      });
      if (!opReq) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          code: "PKG_REQUIREMENT_CODE_INVALID",
          message: `无效的 operation_requirement_code: ${operation_requirement_code}`,
        });
      }
      const beforeSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
      pkg.operation_requirement_id = opReq.id;
      await pkg.save({ transaction: t });
      const afterSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "client",
        entityType: "Package",
        entityId: pkg.id,
        action: "update-requirement",
        user: req.user,
        before: beforeSnap,
        after: afterSnap,
        extra: { new_requirement_code: opReq.requirement_code },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json({
        success: true,
        message: "操作需求更新成功",
        package_id: pkg.id,
        operation_requirement_code: opReq.requirement_code,
      });
    } catch (e) {
      await t.rollback();
      console.error("更新包裹操作需求失败", e);
      return res.status(500).json({
        success: false,
        code: "PKG_REQUIREMENT_UPDATE_ERROR",
        message: "更新包裹操作需求失败",
      });
    }
  }
);

// 仅返回“当前用户可选”的操作需求列表
router.get(
  "/operation-requirements/user-allowed",
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { handling_mode, carrier, search } = req.query;
      const Op = db.Sequelize.Op;

      // 取用户允许的 requirement id 列表
      const uors = await db.UserOperationRequirement.findAll({
        where: {
          user_id: userId,
          is_selectable: true,
          is_enabled: true,
        },
        attributes: ["operation_requirement_id", "notes"],
        raw: true,
      });
      const ids = [...new Set(uors.map((r) => r.operation_requirement_id))];
      const notesMap = new Map();
      for (const r of uors) notesMap.set(r.operation_requirement_id, r.notes);

      const where = { is_active: true };
      if (ids.length > 0) where.id = { [Op.in]: ids };
      if (handling_mode) where.handling_mode = handling_mode;
      if (carrier) where.carrier = carrier;
      if (search) {
        where[Op.or] = [
          { requirement_code: { [Op.like]: `%${search}%` } },
          { requirement_name: { [Op.like]: `%${search}%` } },
          { label_abbr: { [Op.like]: `%${search}%` } },
        ];
      }

      const requirements = await db.OperationRequirement.findAll({
        where,
        attributes: [
          "id",
          "requirement_code",
          "requirement_name",
          "description",
          "handling_mode",
          "carrier",
          "label_abbr",
          "sort_order",
          "is_active",
        ],
        order: [
          ["sort_order", "ASC"],
          ["requirement_code", "ASC"],
        ],
        raw: true,
      });

      // 附带用户备注（未绑定时为空）
      const enriched = requirements.map((r) => ({
        ...r,
        user_notes: notesMap.get(r.id) || null,
      }));

      return res.json({
        success: true,
        requirements: enriched,
        fallback_all: ids.length === 0,
      });
    } catch (error) {
      console.error("获取用户可选操作需求失败:", error);
      res.status(500).json({ success: false, error: "获取失败" });
    }
  }
);

export default router;
