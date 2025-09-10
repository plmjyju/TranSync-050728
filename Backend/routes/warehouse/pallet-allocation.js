import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";

const router = express.Router();
const {
  PalletAllocation,
  Package,
  WarehouseLocation,
  OperationRequirement,
  PalletAllocationLog,
  User,
  Forecast,
} = db;

// 创建板子分配
router.post(
  "/pallet-allocations",
  authenticate,
  checkPermission("warehouse.pallet.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        pallet_number,
        awb_number,
        total_package_count,
        operation_requirements = [],
        warehouse_location_id,
        priority_level = "medium",
        notes,
      } = req.body;

      // 验证必填字段
      if (!pallet_number || !awb_number || !total_package_count) {
        await transaction.rollback();
        return res.status(400).json({
          error: "板号、AWB编号和箱子总数为必填字段",
        });
      }

      // 检查板号是否已存在
      const existingPallet = await PalletAllocation.findOne({
        where: { pallet_number },
        transaction,
      });

      if (existingPallet) {
        await transaction.rollback();
        return res.status(400).json({ error: "板号已存在" });
      }

      // 验证仓库库位
      if (warehouse_location_id) {
        const location = await WarehouseLocation.findByPk(
          warehouse_location_id,
          {
            transaction,
          }
        );
        if (!location || !location.is_active || location.is_blocked) {
          await transaction.rollback();
          return res.status(400).json({ error: "无效的库位或库位不可用" });
        }
      }

      // 验证操作需求
      if (operation_requirements.length > 0) {
        const validRequirements = await OperationRequirement.findAll({
          where: {
            id: { [db.Sequelize.Op.in]: operation_requirements },
            is_active: true,
          },
          transaction,
        });

        if (validRequirements.length !== operation_requirements.length) {
          await transaction.rollback();
          return res.status(400).json({ error: "部分操作需求无效或已停用" });
        }
      }

      // 创建板子分配
      const palletAllocation = await PalletAllocation.create(
        {
          pallet_number,
          awb_number,
          total_package_count,
          warehouse_location_id,
          operation_requirements,
          priority_level,
          notes,
          created_by: req.user.id,
          status: "created",
        },
        { transaction }
      );

      // 记录操作日志
      await PalletAllocationLog.create(
        {
          pallet_allocation_id: palletAllocation.id,
          action: "created",
          operator_id: req.user.id,
          details: {
            pallet_number,
            awb_number,
            total_package_count,
            warehouse_location_id,
            operation_requirements,
            priority_level,
          },
          notes: `创建板子分配: ${pallet_number}`,
        },
        { transaction }
      );

      await transaction.commit();

      res.status(201).json({
        message: "板子分配创建成功",
        pallet_allocation: palletAllocation,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("创建板子分配失败:", error);
      res.status(500).json({ error: "创建板子分配失败" });
    }
  }
);

// 获取板子分配列表
router.get(
  "/pallet-allocations",
  authenticate,
  checkPermission("warehouse.pallet.view"),
  async (req, res) => {
    try {
      const {
        status,
        awb_number,
        warehouse_location_id,
        page = 1,
        limit = 20,
        search,
      } = req.query;

      const offset = (page - 1) * limit;
      let whereCondition = {};

      // 状态筛选
      if (status) {
        whereCondition.status = status;
      }

      // AWB筛选
      if (awb_number) {
        whereCondition.awb_number = {
          [db.Sequelize.Op.like]: `%${awb_number}%`,
        };
      }

      // 库位筛选
      if (warehouse_location_id) {
        whereCondition.warehouse_location_id = warehouse_location_id;
      }

      // 搜索条件
      if (search) {
        whereCondition[db.Sequelize.Op.or] = [
          { pallet_number: { [db.Sequelize.Op.like]: `%${search}%` } },
          { awb_number: { [db.Sequelize.Op.like]: `%${search}%` } },
        ];
      }

      const { count, rows: palletAllocations } =
        await PalletAllocation.findAndCountAll({
          where: whereCondition,
          include: [
            {
              model: User,
              as: "creator",
              attributes: ["id", "username", "name"],
            },
            {
              model: User,
              as: "allocator",
              attributes: ["id", "username", "name"],
            },
            {
              model: WarehouseLocation,
              as: "warehouseLocation",
              attributes: [
                "id",
                "location_code",
                "location_name",
                "warehouse_zone",
              ],
            },
            {
              model: Package,
              as: "packages",
              attributes: ["id", "package_code", "tracking_no", "status"],
            },
          ],
          order: [["created_at", "DESC"]],
          limit: parseInt(limit),
          offset: parseInt(offset),
        });

      res.json({
        pallet_allocations: palletAllocations,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error("获取板子分配列表失败:", error);
      res.status(500).json({ error: "获取板子分配列表失败" });
    }
  }
);

// 分配包裹到板子
router.post(
  "/pallet-allocations/:pallet_id/allocate-packages",
  authenticate,
  checkPermission("warehouse.pallet.allocate"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { pallet_id } = req.params;
      const { package_ids } = req.body;

      const palletAllocation = await PalletAllocation.findByPk(pallet_id, {
        transaction,
      });

      if (!palletAllocation) {
        await transaction.rollback();
        return res.status(404).json({ error: "板子分配不存在" });
      }

      if (palletAllocation.status === "completed") {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "板子分配已完成，无法继续分配包裹" });
      }

      // 验证包裹
      const packages = await Package.findAll({
        where: {
          id: { [db.Sequelize.Op.in]: package_ids },
          assigned_pallet_number: null, // 确保包裹未被分配
        },
        include: [
          {
            model: Forecast,
            as: "forecast",
            where: { mawb: palletAllocation.awb_number },
          },
        ],
        transaction,
      });

      if (packages.length !== package_ids.length) {
        await transaction.rollback();
        return res.status(400).json({
          error: "部分包裹不存在、已被分配或不属于该AWB",
        });
      }

      // 检查是否超过总数量
      const newAllocatedCount =
        palletAllocation.allocated_package_count + packages.length;
      if (newAllocatedCount > palletAllocation.total_package_count) {
        await transaction.rollback();
        return res.status(400).json({
          error: `超过板子容量，最多还能分配 ${
            palletAllocation.total_package_count -
            palletAllocation.allocated_package_count
          } 个包裹`,
        });
      }

      // 分配包裹
      await Package.update(
        { assigned_pallet_number: palletAllocation.pallet_number },
        {
          where: { id: { [db.Sequelize.Op.in]: package_ids } },
          transaction,
        }
      );

      // 更新分配数量
      await palletAllocation.update(
        {
          allocated_package_count: newAllocatedCount,
          status:
            newAllocatedCount === palletAllocation.total_package_count
              ? "completed"
              : "allocating",
          allocated_by: req.user.id,
          allocated_at:
            newAllocatedCount === palletAllocation.total_package_count
              ? new Date()
              : palletAllocation.allocated_at,
        },
        { transaction }
      );

      // 记录操作日志
      await PalletAllocationLog.create(
        {
          pallet_allocation_id: palletAllocation.id,
          action: "package_allocated",
          operator_id: req.user.id,
          details: {
            allocated_packages: packages.map((pkg) => ({
              id: pkg.id,
              package_code: pkg.package_code,
              tracking_no: pkg.tracking_no,
            })),
            allocated_count: packages.length,
            total_allocated: newAllocatedCount,
          },
          notes: `分配 ${packages.length} 个包裹到板子`,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "包裹分配成功",
        allocated_packages: packages.length,
        total_allocated: newAllocatedCount,
        is_completed:
          newAllocatedCount === palletAllocation.total_package_count,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("分配包裹失败:", error);
      res.status(500).json({ error: "分配包裹失败" });
    }
  }
);

// 更新板子库位
router.patch(
  "/pallet-allocations/:pallet_id/location",
  authenticate,
  checkPermission("warehouse.pallet.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { pallet_id } = req.params;
      const { warehouse_location_id, notes } = req.body;

      const palletAllocation = await PalletAllocation.findByPk(pallet_id, {
        include: [
          {
            model: WarehouseLocation,
            as: "warehouseLocation",
            attributes: ["id", "location_code"],
          },
        ],
        transaction,
      });

      if (!palletAllocation) {
        await transaction.rollback();
        return res.status(404).json({ error: "板子分配不存在" });
      }

      // 验证新库位
      const newLocation = await WarehouseLocation.findByPk(
        warehouse_location_id,
        {
          transaction,
        }
      );

      if (!newLocation || !newLocation.is_active || newLocation.is_blocked) {
        await transaction.rollback();
        return res.status(400).json({ error: "无效的库位或库位不可用" });
      }

      const oldLocationId = palletAllocation.warehouse_location_id;
      const oldLocation = palletAllocation.warehouseLocation;

      // 更新库位
      await palletAllocation.update(
        { warehouse_location_id, notes },
        { transaction }
      );

      // 记录操作日志
      await PalletAllocationLog.create(
        {
          pallet_allocation_id: palletAllocation.id,
          action: "location_changed",
          operator_id: req.user.id,
          old_value: {
            warehouse_location_id: oldLocationId,
            location_code: oldLocation?.location_code,
          },
          new_value: {
            warehouse_location_id: warehouse_location_id,
            location_code: newLocation.location_code,
          },
          notes:
            notes ||
            `库位变更: ${oldLocation?.location_code || "无"} → ${
              newLocation.location_code
            }`,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "库位更新成功",
        old_location: oldLocation?.location_code,
        new_location: newLocation.location_code,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新库位失败:", error);
      res.status(500).json({ error: "更新库位失败" });
    }
  }
);

// 获取板子详情
router.get(
  "/pallet-allocations/:pallet_id",
  authenticate,
  checkPermission("warehouse.pallet.view"),
  async (req, res) => {
    try {
      const { pallet_id } = req.params;

      const palletAllocation = await PalletAllocation.findByPk(pallet_id, {
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["id", "username", "name"],
          },
          {
            model: User,
            as: "allocator",
            attributes: ["id", "username", "name"],
          },
          {
            model: User,
            as: "storer",
            attributes: ["id", "username", "name"],
          },
          {
            model: WarehouseLocation,
            as: "warehouseLocation",
            attributes: [
              "id",
              "location_code",
              "location_name",
              "warehouse_zone",
              "location_type",
            ],
          },
          {
            model: Package,
            as: "packages",
            attributes: [
              "id",
              "package_code",
              "tracking_no",
              "status",
              "weight_kg",
            ],
            include: [
              {
                model: OperationRequirement,
                as: "operationRequirement", // updated to single relation
                attributes: [
                  "id",
                  "requirement_code",
                  "requirement_name",
                  "handling_mode",
                  "carrier",
                  "label_abbr",
                ],
              },
            ],
          },
          {
            model: PalletAllocationLog,
            as: "logs",
            include: [
              {
                model: User,
                as: "operator",
                attributes: ["id", "username", "name"],
              },
            ],
            order: [["created_at", "DESC"]],
            limit: 20,
          },
        ],
      });

      if (!palletAllocation) {
        return res.status(404).json({ error: "板子分配不存在" });
      }

      res.json({
        pallet_allocation: palletAllocation,
      });
    } catch (error) {
      console.error("获取板子详情失败:", error);
      res.status(500).json({ error: "获取板子详情失败" });
    }
  }
);

// 通过板号更新库位号 - 便捷接口
router.patch(
  "/update-pallet-location",
  authenticate,
  checkPermission("warehouse.pallet.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { pallet_number, location_code, notes } = req.body;

      // 验证必填字段
      if (!pallet_number || !location_code) {
        await transaction.rollback();
        return res.status(400).json({
          error: "板号和库位号为必填字段",
        });
      }

      // 查找板子分配记录
      const palletAllocation = await PalletAllocation.findOne({
        where: { pallet_number },
        include: [
          {
            model: WarehouseLocation,
            as: "warehouseLocation",
            attributes: ["id", "location_code", "location_name"],
          },
        ],
        transaction,
      });

      if (!palletAllocation) {
        await transaction.rollback();
        return res.status(404).json({ error: "板子不存在" });
      }

      // 查找新库位
      const newLocation = await WarehouseLocation.findOne({
        where: { location_code },
        transaction,
      });

      if (!newLocation) {
        await transaction.rollback();
        return res.status(404).json({ error: "库位号不存在" });
      }

      if (!newLocation.is_active || newLocation.is_blocked) {
        await transaction.rollback();
        return res.status(400).json({ error: "库位不可用或已被锁定" });
      }

      const oldLocationId = palletAllocation.warehouse_location_id;
      const oldLocation = palletAllocation.warehouseLocation;

      // 如果库位没有变化，直接返回
      if (oldLocationId === newLocation.id) {
        await transaction.rollback();
        return res.json({
          message: "库位未发生变化",
          pallet_number,
          location_code: newLocation.location_code,
        });
      }

      // 更新库位
      await palletAllocation.update(
        {
          warehouse_location_id: newLocation.id,
          notes: notes || palletAllocation.notes,
        },
        { transaction }
      );

      // 记录操作日志
      await PalletAllocationLog.create(
        {
          pallet_allocation_id: palletAllocation.id,
          action: "location_changed",
          operator_id: req.user.id,
          old_value: {
            warehouse_location_id: oldLocationId,
            location_code: oldLocation?.location_code,
          },
          new_value: {
            warehouse_location_id: newLocation.id,
            location_code: newLocation.location_code,
          },
          notes:
            notes ||
            `库位变更: ${oldLocation?.location_code || "无"} → ${
              newLocation.location_code
            }`,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "库位号更新成功",
        pallet_number,
        old_location: oldLocation?.location_code || "无",
        new_location: newLocation.location_code,
        location_name: newLocation.location_name,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新库位号失败:", error);
      res.status(500).json({ error: "更新库位号失败" });
    }
  }
);

export default router;
