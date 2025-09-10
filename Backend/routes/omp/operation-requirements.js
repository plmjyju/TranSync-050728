import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";

const router = express.Router();
const { OperationRequirement } = db;

// 获取所有操作需求选项（支持基本筛选）
router.get(
  "/operation-requirements",
  authenticate,
  checkPermission("omp.operation_requirements.view"),
  async (req, res) => {
    try {
      const {
        is_active,
        page = 1,
        limit = 50,
        search,
        handling_mode,
        carrier,
      } = req.query;
      const offset = (page - 1) * limit;
      const whereCondition = {};

      if (is_active !== undefined)
        whereCondition.is_active = is_active === "true";
      if (handling_mode) whereCondition.handling_mode = handling_mode;
      if (carrier) whereCondition.carrier = carrier;

      if (search) {
        whereCondition[db.Sequelize.Op.or] = [
          { requirement_code: { [db.Sequelize.Op.like]: `%${search}%` } },
          { requirement_name: { [db.Sequelize.Op.like]: `%${search}%` } },
          { label_abbr: { [db.Sequelize.Op.like]: `%${search}%` } },
        ];
      }

      const { count, rows } = await OperationRequirement.findAndCountAll({
        where: whereCondition,
        order: [
          ["sort_order", "ASC"],
          ["requirement_code", "ASC"],
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      res.json({
        requirements: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error("获取操作需求选项失败:", error);
      res.status(500).json({ error: "获取操作需求选项失败" });
    }
  }
);

// 创建新的操作需求（简化字段）
router.post(
  "/operation-requirements",
  authenticate,
  checkPermission("omp.operation_requirements.create"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const {
        requirement_code,
        requirement_name,
        description,
        handling_mode,
        carrier,
        label_abbr,
        sort_order = 0,
      } = req.body;
      if (!requirement_code || !requirement_name || !handling_mode) {
        await t.rollback();
        return res
          .status(400)
          .json({
            error: "requirement_code、requirement_name、handling_mode 为必填",
          });
      }

      const existed = await OperationRequirement.findOne({
        where: { requirement_code },
        transaction: t,
      });
      if (existed) {
        await t.rollback();
        return res.status(400).json({ error: "操作需求代码已存在" });
      }

      const created = await OperationRequirement.create(
        {
          requirement_code: requirement_code.toUpperCase(),
          requirement_name,
          description,
          handling_mode,
          carrier,
          label_abbr,
          sort_order,
          created_by: req.user.id,
          updated_by: req.user.id,
        },
        { transaction: t }
      );

      await t.commit();
      res.status(201).json({ message: "创建成功", requirement: created });
    } catch (error) {
      await t.rollback();
      console.error("创建操作需求失败:", error);
      res.status(500).json({ error: "创建操作需求失败" });
    }
  }
);

// 更新
router.put(
  "/operation-requirements/:requirement_id",
  authenticate,
  checkPermission("omp.operation_requirements.edit"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { requirement_id } = req.params;
      const {
        requirement_name,
        description,
        handling_mode,
        carrier,
        label_abbr,
        sort_order,
        is_active,
      } = req.body;

      const r = await OperationRequirement.findByPk(requirement_id, {
        transaction: t,
      });
      if (!r) {
        await t.rollback();
        return res.status(404).json({ error: "操作需求不存在" });
      }

      await r.update(
        {
          requirement_name,
          description,
          handling_mode,
          carrier,
          label_abbr,
          sort_order,
          is_active,
          updated_by: req.user.id,
        },
        { transaction: t }
      );

      await t.commit();
      res.json({ message: "更新成功", requirement: r });
    } catch (error) {
      await t.rollback();
      console.error("更新操作需求失败:", error);
      res.status(500).json({ error: "更新操作需求失败" });
    }
  }
);

// 删除（沿用包裹引用检查）
router.delete(
  "/operation-requirements/:requirement_id",
  authenticate,
  checkPermission("omp.operation_requirements.delete"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { requirement_id } = req.params;
      const r = await OperationRequirement.findByPk(requirement_id, {
        transaction: t,
      });
      if (!r) {
        await t.rollback();
        return res.status(404).json({ error: "操作需求不存在" });
      }

      const packagesCount = await db.Package.count({
        where: { operation_requirement_id: r.id },
        transaction: t,
      });
      if (packagesCount > 0) {
        await t.rollback();
        return res.status(400).json({
          error: `无法删除，当前有 ${packagesCount} 个包裹正在使用该操作需求`,
        });
      }

      await r.destroy({ transaction: t });
      await t.commit();
      res.json({ message: "删除成功", requirement_code: r.requirement_code });
    } catch (error) {
      await t.rollback();
      console.error("删除操作需求失败:", error);
      res.status(500).json({ error: "删除操作需求失败" });
    }
  }
);

// 启用/停用
router.patch(
  "/operation-requirements/:requirement_id/toggle-status",
  authenticate,
  checkPermission("omp.operation_requirements.edit"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { requirement_id } = req.params;
      const r = await OperationRequirement.findByPk(requirement_id, {
        transaction: t,
      });
      if (!r) {
        await t.rollback();
        return res.status(404).json({ error: "操作需求不存在" });
      }

      await r.update(
        { is_active: !r.is_active, updated_by: req.user.id },
        { transaction: t }
      );
      await t.commit();
      res.json({
        message: `操作需求已${r.is_active ? "停用" : "启用"}`,
        requirement: {
          id: r.id,
          requirement_code: r.requirement_code,
          requirement_name: r.requirement_name,
          is_active: r.is_active,
        },
      });
    } catch (error) {
      await t.rollback();
      console.error("切换操作需求状态失败:", error);
      res.status(500).json({ error: "切换操作需求状态失败" });
    }
  }
);

export default router;
