import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";
import config from "../../config/environment.js";

const router = express.Router();
const { OperationRequirement, Package, PackageOperationRequirement, User } = db;

// 获取可用的操作需求选项（通用接口）
router.get(
  "/operation-requirements/available",
  authenticate,
  async (req, res) => {
    try {
      const { category, search } = req.query;

      let whereCondition = {
        is_active: true, // 只返回启用的选项
      };

      // 分类筛选
      if (category) {
        whereCondition.category = category;
      }

      // 搜索筛选
      if (search) {
        whereCondition[db.Sequelize.Op.or] = [
          { requirement_code: { [db.Sequelize.Op.like]: `%${search}%` } },
          { requirement_name: { [db.Sequelize.Op.like]: `%${search}%` } },
          { requirement_name_en: { [db.Sequelize.Op.like]: `%${search}%` } },
        ];
      }

      const requirements = await OperationRequirement.findAll({
        where: whereCondition,
        attributes: [
          "id",
          "requirement_code",
          "requirement_name",
          "requirement_name_en",
          "description",
          "category",
          "priority_level",
          "icon_class",
          "color_code",
          "sort_order",
        ],
        order: [
          ["sort_order", "ASC"],
          ["requirement_code", "ASC"],
        ],
      });

      res.json({
        requirements,
        categories: [
          { value: "handling", label: "搬运要求" },
          { value: "storage", label: "存储要求" },
          { value: "transport", label: "运输要求" },
          { value: "temperature", label: "温度要求" },
          { value: "security", label: "安全要求" },
          { value: "special", label: "特殊要求" },
          { value: "other", label: "其他" },
        ],
      });
    } catch (error) {
      console.error("获取操作需求选项失败:", error);
      res.status(500).json({ error: "获取操作需求选项失败" });
    }
  }
);

// 为包裹添加操作需求
router.post(
  "/packages/:package_id/operation-requirements",
  authenticate,
  checkPermission("client.packages.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { package_id } = req.params;
      const { operation_requirement_ids, additional_notes, priority_override } =
        req.body;

      // 验证包裹存在且属于当前用户（如果是客户）
      let packageWhere = { id: package_id };
      if (req.user.role === "client") {
        packageWhere.client_id = req.user.id;
      }

      const pkg = await Package.findOne({
        where: packageWhere,
        transaction,
      });

      if (!pkg) {
        await transaction.rollback();
        return res.status(404).json({ error: "包裹不存在或无权限访问" });
      }

      // 验证操作需求ID
      const requirements = await OperationRequirement.findAll({
        where: {
          id: { [db.Sequelize.Op.in]: operation_requirement_ids },
          is_active: true,
        },
        transaction,
      });

      if (requirements.length !== operation_requirement_ids.length) {
        await transaction.rollback();
        return res.status(400).json({ error: "部分操作需求无效或已停用" });
      }

      // 批量创建包裹操作需求关联
      const packageRequirements = operation_requirement_ids.map((reqId) => ({
        package_id: package_id,
        operation_requirement_id: reqId,
        additional_notes,
        priority_override,
        created_by: req.user.id,
        status: "pending",
      }));

      // 先删除已存在的关联（避免重复）
      await PackageOperationRequirement.destroy({
        where: {
          package_id: package_id,
          operation_requirement_id: {
            [db.Sequelize.Op.in]: operation_requirement_ids,
          },
        },
        transaction,
      });

      // 创建新的关联
      await PackageOperationRequirement.bulkCreate(packageRequirements, {
        transaction,
      });

      await transaction.commit();

      res.json({
        message: "操作需求添加成功",
        package_id: package_id,
        added_requirements: requirements.length,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("添加包裹操作需求失败:", error);
      res.status(500).json({ error: "添加包裹操作需求失败" });
    }
  }
);

// 获取包裹的操作需求
router.get(
  "/packages/:package_id/operation-requirements",
  authenticate,
  async (req, res) => {
    try {
      const { package_id } = req.params;

      // 验证包裹访问权限
      let packageWhere = { id: package_id };
      if (req.user.role === "client") {
        packageWhere.client_id = req.user.id;
      }

      const pkg = await Package.findOne({
        where: packageWhere,
        include: [
          {
            model: OperationRequirement,
            as: "operationRequirements",
            attributes: [
              "id",
              "requirement_code",
              "requirement_name",
              "requirement_name_en",
              "description",
              "category",
              "priority_level",
              "icon_class",
              "color_code",
            ],
            through: {
              as: "packageRequirement",
              attributes: [
                "additional_notes",
                "priority_override",
                "status",
                "fulfilled_at",
                "fulfillment_notes",
                "created_at",
                "created_by",
              ],
            },
          },
        ],
      });

      if (!pkg) {
        return res.status(404).json({ error: "包裹不存在或无权限访问" });
      }

      res.json({
        package_id: package_id,
        package_code: pkg.package_code,
        operation_requirements: pkg.operationRequirements,
      });
    } catch (error) {
      console.error("获取包裹操作需求失败:", error);
      res.status(500).json({ error: "获取包裹操作需求失败" });
    }
  }
);

// 移除包裹的操作需求
router.delete(
  "/packages/:package_id/operation-requirements/:requirement_id",
  authenticate,
  checkPermission("client.packages.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { package_id, requirement_id } = req.params;

      // 验证包裹权限
      let packageWhere = { id: package_id };
      if (req.user.role === "client") {
        packageWhere.client_id = req.user.id;
      }

      const pkg = await Package.findOne({
        where: packageWhere,
        transaction,
      });

      if (!pkg) {
        await transaction.rollback();
        return res.status(404).json({ error: "包裹不存在或无权限访问" });
      }

      // 删除关联
      const deletedCount = await PackageOperationRequirement.destroy({
        where: {
          package_id: package_id,
          operation_requirement_id: requirement_id,
        },
        transaction,
      });

      if (deletedCount === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: "操作需求关联不存在" });
      }

      await transaction.commit();

      res.json({
        message: "操作需求移除成功",
        package_id: package_id,
        requirement_id: requirement_id,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("移除包裹操作需求失败:", error);
      res.status(500).json({ error: "移除包裹操作需求失败" });
    }
  }
);

// 更新操作需求执行状态（仓库操作员使用）
router.patch(
  "/packages/:package_id/operation-requirements/:requirement_id/status",
  authenticate,
  checkPermission("warehouse.packages.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { package_id, requirement_id } = req.params;
      const { status, fulfillment_notes } = req.body;

      const packageRequirement = await PackageOperationRequirement.findOne({
        where: {
          package_id: package_id,
          operation_requirement_id: requirement_id,
        },
        transaction,
      });

      if (!packageRequirement) {
        await transaction.rollback();
        return res.status(404).json({ error: "操作需求关联不存在" });
      }

      const updateData = {
        status,
        fulfillment_notes,
      };

      // 如果状态为完成，记录完成时间和操作员
      if (status === "completed") {
        updateData.fulfilled_at = new Date();
        updateData.fulfilled_by = req.user.id;
      }

      await packageRequirement.update(updateData, { transaction });

      await transaction.commit();

      res.json({
        message: "操作需求状态更新成功",
        package_id: package_id,
        requirement_id: requirement_id,
        status: status,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新操作需求状态失败:", error);
      res.status(500).json({ error: "更新操作需求状态失败" });
    }
  }
);

export default router;
