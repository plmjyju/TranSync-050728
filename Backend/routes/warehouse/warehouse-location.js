import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";

const router = express.Router();
const { WarehouseLocation, WarehouseLocationLog, User, PalletAllocation } = db;

// 创建库位
router.post(
  "/warehouse-locations",
  authenticate,
  checkPermission("warehouse.location.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        location_code,
        location_name,
        warehouse_zone,
        aisle,
        rack,
        level,
        location_type = "standard",
        capacity = 1,
        max_weight_kg,
        max_height_cm,
        temperature_min,
        temperature_max,
        special_requirements,
        notes,
      } = req.body;

      // 验证必填字段
      if (!location_code || !warehouse_zone || !aisle || !rack || !level) {
        await transaction.rollback();
        return res.status(400).json({
          error: "库位编号、仓库区域、巷道号、货架号、层级号为必填字段",
        });
      }

      // 检查库位编号是否已存在
      const existingLocation = await WarehouseLocation.findOne({
        where: { location_code },
        transaction,
      });

      if (existingLocation) {
        await transaction.rollback();
        return res.status(400).json({ error: "库位编号已存在" });
      }

      // 创建库位
      const warehouseLocation = await WarehouseLocation.create(
        {
          location_code,
          location_name,
          warehouse_zone,
          aisle,
          rack,
          level,
          location_type,
          capacity,
          max_weight_kg,
          max_height_cm,
          temperature_min,
          temperature_max,
          special_requirements,
          notes,
          created_by: req.user.id,
        },
        { transaction }
      );

      // 记录操作日志
      await WarehouseLocationLog.create(
        {
          warehouse_location_id: warehouseLocation.id,
          action: "created",
          operator_id: req.user.id,
          details: {
            location_code,
            warehouse_zone,
            aisle,
            rack,
            level,
            location_type,
            capacity,
          },
          notes: `创建库位: ${location_code}`,
        },
        { transaction }
      );

      await transaction.commit();

      res.status(201).json({
        message: "库位创建成功",
        warehouse_location: warehouseLocation,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("创建库位失败:", error);
      res.status(500).json({ error: "创建库位失败" });
    }
  }
);

// 获取库位列表
router.get(
  "/warehouse-locations",
  authenticate,
  checkPermission("warehouse.location.view"),
  async (req, res) => {
    try {
      const {
        warehouse_zone,
        location_type,
        is_active,
        is_blocked,
        available_only,
        page = 1,
        limit = 50,
        search,
      } = req.query;

      const offset = (page - 1) * limit;
      let whereCondition = {};

      // 区域筛选
      if (warehouse_zone) {
        whereCondition.warehouse_zone = warehouse_zone;
      }

      // 类型筛选
      if (location_type) {
        whereCondition.location_type = location_type;
      }

      // 状态筛选
      if (is_active !== undefined) {
        whereCondition.is_active = is_active === "true";
      }

      if (is_blocked !== undefined) {
        whereCondition.is_blocked = is_blocked === "true";
      }

      // 只显示可用库位
      if (available_only === "true") {
        whereCondition.is_active = true;
        whereCondition.is_blocked = false;
        whereCondition[db.Sequelize.Op.or] = [
          {
            current_occupancy: {
              [db.Sequelize.Op.lt]: db.Sequelize.col("capacity"),
            },
          },
          { current_occupancy: null },
        ];
      }

      // 搜索条件
      if (search) {
        whereCondition[db.Sequelize.Op.or] = [
          { location_code: { [db.Sequelize.Op.like]: `%${search}%` } },
          { location_name: { [db.Sequelize.Op.like]: `%${search}%` } },
        ];
      }

      const { count, rows: locations } =
        await WarehouseLocation.findAndCountAll({
          where: whereCondition,
          include: [
            {
              model: User,
              as: "creator",
              attributes: ["id", "username", "name"],
            },
            {
              model: PalletAllocation,
              as: "palletAllocations",
              attributes: ["id", "pallet_number", "status"],
              required: false,
            },
          ],
          order: [
            ["warehouse_zone", "ASC"],
            ["aisle", "ASC"],
            ["rack", "ASC"],
            ["level", "ASC"],
          ],
          limit: parseInt(limit),
          offset: parseInt(offset),
        });

      res.json({
        warehouse_locations: locations,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error("获取库位列表失败:", error);
      res.status(500).json({ error: "获取库位列表失败" });
    }
  }
);

// 更新库位信息
router.put(
  "/warehouse-locations/:location_id",
  authenticate,
  checkPermission("warehouse.location.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { location_id } = req.params;
      const {
        location_name,
        location_type,
        capacity,
        max_weight_kg,
        max_height_cm,
        temperature_min,
        temperature_max,
        special_requirements,
        notes,
      } = req.body;

      const warehouseLocation = await WarehouseLocation.findByPk(location_id, {
        transaction,
      });

      if (!warehouseLocation) {
        await transaction.rollback();
        return res.status(404).json({ error: "库位不存在" });
      }

      // 记录变更前的值
      const oldValues = {
        location_name: warehouseLocation.location_name,
        location_type: warehouseLocation.location_type,
        capacity: warehouseLocation.capacity,
        max_weight_kg: warehouseLocation.max_weight_kg,
        max_height_cm: warehouseLocation.max_height_cm,
        temperature_min: warehouseLocation.temperature_min,
        temperature_max: warehouseLocation.temperature_max,
        special_requirements: warehouseLocation.special_requirements,
      };

      // 更新库位
      await warehouseLocation.update(
        {
          location_name,
          location_type,
          capacity,
          max_weight_kg,
          max_height_cm,
          temperature_min,
          temperature_max,
          special_requirements,
          notes,
          updated_by: req.user.id,
        },
        { transaction }
      );

      // 记录操作日志
      await WarehouseLocationLog.create(
        {
          warehouse_location_id: warehouseLocation.id,
          action: "updated",
          operator_id: req.user.id,
          old_value: oldValues,
          new_value: {
            location_name,
            location_type,
            capacity,
            max_weight_kg,
            max_height_cm,
            temperature_min,
            temperature_max,
            special_requirements,
          },
          notes: `更新库位信息: ${warehouseLocation.location_code}`,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "库位更新成功",
        warehouse_location: warehouseLocation,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新库位失败:", error);
      res.status(500).json({ error: "更新库位失败" });
    }
  }
);

// 阻塞/解除阻塞库位
router.patch(
  "/warehouse-locations/:location_id/block",
  authenticate,
  checkPermission("warehouse.location.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { location_id } = req.params;
      const { is_blocked, block_reason, notes } = req.body;

      const warehouseLocation = await WarehouseLocation.findByPk(location_id, {
        transaction,
      });

      if (!warehouseLocation) {
        await transaction.rollback();
        return res.status(404).json({ error: "库位不存在" });
      }

      // 如果要阻塞库位且当前有占用，需要确认
      if (is_blocked && warehouseLocation.current_occupancy > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: "库位当前有占用，无法阻塞。请先清空库位或强制操作。",
        });
      }

      await warehouseLocation.update(
        {
          is_blocked,
          block_reason: is_blocked ? block_reason : null,
          updated_by: req.user.id,
        },
        { transaction }
      );

      // 记录操作日志
      await WarehouseLocationLog.create(
        {
          warehouse_location_id: warehouseLocation.id,
          action: is_blocked ? "blocked" : "unblocked",
          operator_id: req.user.id,
          details: {
            block_reason: is_blocked ? block_reason : null,
            current_occupancy: warehouseLocation.current_occupancy,
          },
          notes:
            notes ||
            `${is_blocked ? "阻塞" : "解除阻塞"}库位: ${
              warehouseLocation.location_code
            }`,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: `库位${is_blocked ? "阻塞" : "解除阻塞"}成功`,
        location_code: warehouseLocation.location_code,
        is_blocked,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("库位阻塞操作失败:", error);
      res.status(500).json({ error: "库位阻塞操作失败" });
    }
  }
);

// 启用/停用库位
router.patch(
  "/warehouse-locations/:location_id/toggle-status",
  authenticate,
  checkPermission("warehouse.location.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { location_id } = req.params;
      const { notes } = req.body;

      const warehouseLocation = await WarehouseLocation.findByPk(location_id, {
        transaction,
      });

      if (!warehouseLocation) {
        await transaction.rollback();
        return res.status(404).json({ error: "库位不存在" });
      }

      const newStatus = !warehouseLocation.is_active;

      // 如果要停用库位且当前有占用，需要确认
      if (!newStatus && warehouseLocation.current_occupancy > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: "库位当前有占用，无法停用。请先清空库位。",
        });
      }

      await warehouseLocation.update(
        {
          is_active: newStatus,
          updated_by: req.user.id,
        },
        { transaction }
      );

      // 记录操作日志
      await WarehouseLocationLog.create(
        {
          warehouse_location_id: warehouseLocation.id,
          action: newStatus ? "enabled" : "disabled",
          operator_id: req.user.id,
          details: {
            previous_status: warehouseLocation.is_active,
            new_status: newStatus,
            current_occupancy: warehouseLocation.current_occupancy,
          },
          notes:
            notes ||
            `${newStatus ? "启用" : "停用"}库位: ${
              warehouseLocation.location_code
            }`,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: `库位${newStatus ? "启用" : "停用"}成功`,
        location_code: warehouseLocation.location_code,
        is_active: newStatus,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("库位状态切换失败:", error);
      res.status(500).json({ error: "库位状态切换失败" });
    }
  }
);

// 获取库位详情
router.get(
  "/warehouse-locations/:location_id",
  authenticate,
  checkPermission("warehouse.location.view"),
  async (req, res) => {
    try {
      const { location_id } = req.params;

      const warehouseLocation = await WarehouseLocation.findByPk(location_id, {
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
          {
            model: PalletAllocation,
            as: "palletAllocations",
            attributes: [
              "id",
              "pallet_number",
              "awb_number",
              "status",
              "total_package_count",
            ],
          },
          {
            model: WarehouseLocationLog,
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

      if (!warehouseLocation) {
        return res.status(404).json({ error: "库位不存在" });
      }

      res.json({
        warehouse_location: warehouseLocation,
      });
    } catch (error) {
      console.error("获取库位详情失败:", error);
      res.status(500).json({ error: "获取库位详情失败" });
    }
  }
);

// 批量创建库位
router.post(
  "/warehouse-locations/batch",
  authenticate,
  checkPermission("warehouse.location.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        warehouse_zone,
        aisle_range, // { start: "01", end: "05" }
        rack_range, // { start: "01", end: "10" }
        level_range, // { start: "01", end: "04" }
        location_type = "standard",
        capacity = 1,
        max_weight_kg,
        max_height_cm,
      } = req.body;

      if (!warehouse_zone || !aisle_range || !rack_range || !level_range) {
        await transaction.rollback();
        return res.status(400).json({
          error: "仓库区域和范围参数为必填字段",
        });
      }

      const locations = [];
      const aisleStart = parseInt(aisle_range.start);
      const aisleEnd = parseInt(aisle_range.end);
      const rackStart = parseInt(rack_range.start);
      const rackEnd = parseInt(rack_range.end);
      const levelStart = parseInt(level_range.start);
      const levelEnd = parseInt(level_range.end);

      // 生成库位
      for (let a = aisleStart; a <= aisleEnd; a++) {
        for (let r = rackStart; r <= rackEnd; r++) {
          for (let l = levelStart; l <= levelEnd; l++) {
            const aisle = a.toString().padStart(2, "0");
            const rack = r.toString().padStart(2, "0");
            const level = l.toString().padStart(2, "0");
            const location_code = `${warehouse_zone}-${aisle}-${rack}-${level}`;

            locations.push({
              location_code,
              location_name: `${warehouse_zone}区${aisle}巷${rack}架${level}层`,
              warehouse_zone,
              aisle,
              rack,
              level,
              location_type,
              capacity,
              max_weight_kg,
              max_height_cm,
              created_by: req.user.id,
            });
          }
        }
      }

      // 批量创建
      const createdLocations = await WarehouseLocation.bulkCreate(locations, {
        ignoreDuplicates: true,
        transaction,
      });

      // 记录操作日志
      await WarehouseLocationLog.create(
        {
          warehouse_location_id: null, // 批量操作
          action: "created",
          operator_id: req.user.id,
          details: {
            batch_operation: true,
            warehouse_zone,
            aisle_range,
            rack_range,
            level_range,
            created_count: createdLocations.length,
            total_attempted: locations.length,
          },
          notes: `批量创建库位: ${warehouse_zone}区, 共创建 ${createdLocations.length} 个库位`,
        },
        { transaction }
      );

      await transaction.commit();

      res.status(201).json({
        message: "批量创建库位成功",
        created_count: createdLocations.length,
        total_attempted: locations.length,
        warehouse_zone,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("批量创建库位失败:", error);
      res.status(500).json({ error: "批量创建库位失败" });
    }
  }
);

export default router;
