import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";

const router = express.Router();
const { OperationRequirement, User } = db;

// 获取所有操作需求选项（支持筛选）
router.get(
  "/operation-requirements",
  authenticate,
  checkPermission("omp.operation_requirements.view"),
  async (req, res) => {
    try {
      const {
        category,
        is_active,
        priority_level,
        page = 1,
        limit = 50,
        search,
      } = req.query;

      const offset = (page - 1) * limit;
      let whereCondition = {};

      // 筛选条件
      if (category) {
        whereCondition.category = category;
      }

      if (is_active !== undefined) {
        whereCondition.is_active = is_active === "true";
      }

      if (priority_level) {
        whereCondition.priority_level = priority_level;
      }

      // 搜索条件
      if (search) {
        whereCondition[db.Sequelize.Op.or] = [
          { requirement_code: { [db.Sequelize.Op.like]: `%${search}%` } },
          { requirement_name: { [db.Sequelize.Op.like]: `%${search}%` } },
          { requirement_name_en: { [db.Sequelize.Op.like]: `%${search}%` } },
        ];
      }

      const { count, rows: requirements } =
        await OperationRequirement.findAndCountAll({
          where: whereCondition,
          include: [
            {
              model: User,
              as: "creator",
              attributes: ["id", "username", "name"],
            },
            {
              model: User,
              as: "updater",
              attributes: ["id", "username", "name"],
            },
          ],
          order: [
            ["sort_order", "ASC"],
            ["requirement_code", "ASC"],
          ],
          limit: parseInt(limit),
          offset: parseInt(offset),
        });

      res.json({
        requirements,
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

// 创建新的操作需求
router.post(
  "/operation-requirements",
  authenticate,
  checkPermission("omp.operation_requirements.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        requirement_code,
        requirement_name,
        requirement_name_en,
        description,
        category = "handling",
        priority_level = "medium",
        icon_class,
        color_code,
        sort_order = 0,
      } = req.body;

      // 验证必填字段
      if (!requirement_code || !requirement_name) {
        await transaction.rollback();
        return res.status(400).json({
          error: "操作需求代码和名称为必填字段",
        });
      }

      // 检查代码是否已存在
      const existingRequirement = await OperationRequirement.findOne({
        where: { requirement_code },
        transaction,
      });

      if (existingRequirement) {
        await transaction.rollback();
        return res.status(400).json({
          error: "操作需求代码已存在",
        });
      }

      const newRequirement = await OperationRequirement.create(
        {
          requirement_code: requirement_code.toUpperCase(),
          requirement_name,
          requirement_name_en,
          description,
          category,
          priority_level,
          icon_class,
          color_code,
          sort_order,
          created_by: req.user.id,
          updated_by: req.user.id,
        },
        { transaction }
      );

      await transaction.commit();

      // 获取完整信息返回
      const createdRequirement = await OperationRequirement.findByPk(
        newRequirement.id,
        {
          include: [
            {
              model: User,
              as: "creator",
              attributes: ["id", "username", "name"],
            },
          ],
        }
      );

      res.status(201).json({
        message: "操作需求创建成功",
        requirement: createdRequirement,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("创建操作需求失败:", error);
      res.status(500).json({ error: "创建操作需求失败" });
    }
  }
);

// 更新操作需求
router.put(
  "/operation-requirements/:requirement_id",
  authenticate,
  checkPermission("omp.operation_requirements.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { requirement_id } = req.params;
      const {
        requirement_name,
        requirement_name_en,
        description,
        category,
        priority_level,
        icon_class,
        color_code,
        sort_order,
        is_active,
      } = req.body;

      const requirement = await OperationRequirement.findByPk(requirement_id, {
        transaction,
      });

      if (!requirement) {
        await transaction.rollback();
        return res.status(404).json({ error: "操作需求不存在" });
      }

      await requirement.update(
        {
          requirement_name,
          requirement_name_en,
          description,
          category,
          priority_level,
          icon_class,
          color_code,
          sort_order,
          is_active,
          updated_by: req.user.id,
        },
        { transaction }
      );

      await transaction.commit();

      // 获取更新后的完整信息
      const updatedRequirement = await OperationRequirement.findByPk(
        requirement_id,
        {
          include: [
            {
              model: User,
              as: "creator",
              attributes: ["id", "username", "name"],
            },
            {
              model: User,
              as: "updater",
              attributes: ["id", "username", "name"],
            },
          ],
        }
      );

      res.json({
        message: "操作需求更新成功",
        requirement: updatedRequirement,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新操作需求失败:", error);
      res.status(500).json({ error: "更新操作需求失败" });
    }
  }
);

// 删除操作需求
router.delete(
  "/operation-requirements/:requirement_id",
  authenticate,
  checkPermission("omp.operation_requirements.delete"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { requirement_id } = req.params;

      const requirement = await OperationRequirement.findByPk(requirement_id, {
        transaction,
      });

      if (!requirement) {
        await transaction.rollback();
        return res.status(404).json({ error: "操作需求不存在" });
      }

      // 检查是否有包裹在使用该操作需求
      const packagesCount = await requirement.countPackages({ transaction });

      if (packagesCount > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: `无法删除，当前有 ${packagesCount} 个包裹正在使用该操作需求`,
        });
      }

      await requirement.destroy({ transaction });
      await transaction.commit();

      res.json({
        message: "操作需求删除成功",
        requirement_code: requirement.requirement_code,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("删除操作需求失败:", error);
      res.status(500).json({ error: "删除操作需求失败" });
    }
  }
);

// 启用/停用操作需求
router.patch(
  "/operation-requirements/:requirement_id/toggle-status",
  authenticate,
  checkPermission("omp.operation_requirements.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { requirement_id } = req.params;

      const requirement = await OperationRequirement.findByPk(requirement_id, {
        transaction,
      });

      if (!requirement) {
        await transaction.rollback();
        return res.status(404).json({ error: "操作需求不存在" });
      }

      await requirement.update(
        {
          is_active: !requirement.is_active,
          updated_by: req.user.id,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: `操作需求已${requirement.is_active ? "停用" : "启用"}`,
        requirement: {
          id: requirement.id,
          requirement_code: requirement.requirement_code,
          requirement_name: requirement.requirement_name,
          is_active: requirement.is_active,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("切换操作需求状态失败:", error);
      res.status(500).json({ error: "切换操作需求状态失败" });
    }
  }
);

// 批量更新排序
router.patch(
  "/operation-requirements/batch-sort",
  authenticate,
  checkPermission("omp.operation_requirements.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { requirements } = req.body; // [{ id, sort_order }, ...]

      if (!Array.isArray(requirements)) {
        await transaction.rollback();
        return res.status(400).json({ error: "请提供有效的排序数据" });
      }

      const updatePromises = requirements.map((item) =>
        OperationRequirement.update(
          {
            sort_order: item.sort_order,
            updated_by: req.user.id,
          },
          {
            where: { id: item.id },
            transaction,
          }
        )
      );

      await Promise.all(updatePromises);
      await transaction.commit();

      res.json({
        message: "排序更新成功",
        updated_count: requirements.length,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("批量更新排序失败:", error);
      res.status(500).json({ error: "批量更新排序失败" });
    }
  }
);

export default router;
