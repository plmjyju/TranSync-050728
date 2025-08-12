import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";
import { generateDONumber } from "../../utils/generateDONumber.js";
import {
  syncStatusOnDOCreation,
  syncStatusOnDODelivery,
} from "../../utils/syncDeliveryStatus.js";

const {
  DeliveryOrder,
  DeliveryOrderPallet,
  DeliveryOrderPackage,
  DeliveryOrderLog,
  Pallet,
  Forecast,
  Package,
  User,
} = db;
const router = express.Router();

// 获取所有DO列表
router.get(
  "/",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        do_number,
        driver_name,
        search,
      } = req.query;

      const offset = (page - 1) * limit;
      const where = {};

      if (status) where.status = status;
      if (do_number)
        where.do_number = { [db.Sequelize.Op.like]: `%${do_number}%` };
      if (driver_name)
        where.driver_name = { [db.Sequelize.Op.like]: `%${driver_name}%` };
      if (search) {
        where[db.Sequelize.Op.or] = [
          { do_number: { [db.Sequelize.Op.like]: `%${search}%` } },
          { driver_name: { [db.Sequelize.Op.like]: `%${search}%` } },
          { vehicle_plate: { [db.Sequelize.Op.like]: `%${search}%` } },
          { pickup_location: { [db.Sequelize.Op.like]: `%${search}%` } },
        ];
      }

      const deliveryOrders = await DeliveryOrder.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["id", "username"],
          },
          {
            model: Pallet,
            as: "pallets",
            attributes: [
              "id",
              "pallet_code",
              "custom_board_no",
              "box_count",
              "weight_kg",
            ],
            through: { attributes: ["loading_sequence"] },
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb"],
              },
            ],
          },
        ],
        limit: parseInt(limit),
        offset,
        order: [["created_at", "DESC"]],
      });

      res.json({
        delivery_orders: deliveryOrders.rows,
        pagination: {
          total: deliveryOrders.count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(deliveryOrders.count / limit),
        },
      });
    } catch (error) {
      console.error("获取DO列表失败:", error);
      res.status(500).json({ error: "获取DO列表失败" });
    }
  }
);

// 获取可用的预报单和板（在途状态）
router.get(
  "/available-forecasts",
  authenticate,
  checkPermission("warehouse.delivery_order.create"),
  async (req, res) => {
    try {
      // 查找在途的预报单
      const forecasts = await Forecast.findAll({
        where: {
          status: "in_transit", // 在途状态
        },
        include: [
          {
            model: Pallet,
            as: "pallets",
            where: {
              status: "stored", // 已入仓的板
            },
            attributes: [
              "id",
              "pallet_code",
              "custom_board_no",
              "pallet_type",
              "box_count",
              "weight_kg",
              "location_code",
            ],
            required: false,
          },
        ],
        attributes: ["id", "forecast_code", "mawb", "flight_no"],
        order: [["created_at", "DESC"]],
      });

      res.json({ forecasts });
    } catch (error) {
      console.error("获取可用预报单失败:", error);
      res.status(500).json({ error: "获取可用预报单失败" });
    }
  }
);

// 获取可用的包裹（按MAWB/HAWB分组）
router.get(
  "/available-packages",
  authenticate,
  checkPermission("warehouse.delivery_order.create"),
  async (req, res) => {
    try {
      const { mawb, hawb, forecast_id } = req.query;

      let whereCondition = {
        status: "arrived", // 已到达的包裹
        pallet_id: { [db.Sequelize.Op.not]: null }, // 已装板的包裹
      };

      if (mawb) {
        whereCondition.mawb = mawb;
      }
      if (hawb) {
        whereCondition.hawb = hawb;
      }
      if (forecast_id) {
        whereCondition.forecast_id = forecast_id;
      }

      // 查找可用的包裹
      const packages = await Package.findAll({
        where: whereCondition,
        include: [
          {
            model: Forecast,
            as: "forecast",
            where: { status: "in_transit" },
            attributes: ["id", "forecast_code", "mawb"],
          },
          {
            model: Pallet,
            as: "pallet",
            attributes: [
              "id",
              "pallet_code",
              "custom_board_no",
              "location_code",
            ],
          },
          {
            model: User,
            as: "client",
            attributes: ["id", "username", "company_name"],
          },
        ],
        attributes: [
          "id",
          "package_code",
          "mawb",
          "hawb",
          "weight_kg",
          "status",
          "tracking_no",
        ],
        order: [
          ["mawb", "ASC"],
          ["hawb", "ASC"],
          ["package_code", "ASC"],
        ],
      });

      // 按MAWB/HAWB分组
      const grouped = packages.reduce((acc, pkg) => {
        const key = `${pkg.mawb || "NO_MAWB"}-${pkg.hawb || "NO_HAWB"}`;
        if (!acc[key]) {
          acc[key] = {
            mawb: pkg.mawb,
            hawb: pkg.hawb,
            forecast: pkg.forecast,
            packages: [],
            total_count: 0,
            total_weight: 0,
          };
        }
        acc[key].packages.push(pkg);
        acc[key].total_count++;
        acc[key].total_weight += parseFloat(pkg.weight_kg) || 0;
        return acc;
      }, {});

      res.json({
        grouped_packages: Object.values(grouped),
        total_packages: packages.length,
      });
    } catch (error) {
      console.error("获取可用包裹失败:", error);
      res.status(500).json({ error: "获取可用包裹失败" });
    }
  }
);

// 创建新DO
router.post(
  "/",
  authenticate,
  checkPermission("warehouse.delivery_order.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        management_type = "pallet", // "pallet" 或 "package"
        pallet_ids = [], // 板ID数组（按板管理时使用）
        package_ids = [], // 包裹ID数组（按包裹管理时使用）
        driver_name,
        driver_id_number,
        vehicle_plate,
        usdot_number,
        pickup_location,
        pickup_details,
        remark,
      } = req.body;

      // 验证必填字段
      if (
        !driver_name ||
        !driver_id_number ||
        !vehicle_plate ||
        !pickup_location
      ) {
        await transaction.rollback();
        return res.status(400).json({ error: "请填写完整的司机和车辆信息" });
      }

      // 根据管理模式验证数据
      if (management_type === "pallet") {
        if (
          !pallet_ids ||
          !Array.isArray(pallet_ids) ||
          pallet_ids.length === 0
        ) {
          await transaction.rollback();
          return res.status(400).json({ error: "按板管理时请选择至少一个板" });
        }

        // 验证板是否存在且可用
        const pallets = await Pallet.findAll({
          where: {
            id: pallet_ids,
            status: "stored",
          },
          include: [
            {
              model: Forecast,
              as: "forecast",
              where: { status: "in_transit" },
              attributes: ["id", "forecast_code", "mawb"],
            },
          ],
          transaction,
        });

        if (pallets.length !== pallet_ids.length) {
          await transaction.rollback();
          return res.status(400).json({ error: "部分板不存在或状态不可用" });
        }
      } else if (management_type === "package") {
        if (
          !package_ids ||
          !Array.isArray(package_ids) ||
          package_ids.length === 0
        ) {
          await transaction.rollback();
          return res
            .status(400)
            .json({ error: "按包裹管理时请选择至少一个包裹" });
        }

        // 验证包裹是否存在且可用
        const packages = await Package.findAll({
          where: {
            id: package_ids,
            status: "arrived",
            pallet_id: { [db.Sequelize.Op.not]: null },
          },
          include: [
            {
              model: Forecast,
              as: "forecast",
              where: { status: "in_transit" },
              attributes: ["id", "forecast_code", "mawb"],
            },
          ],
          transaction,
        });

        if (packages.length !== package_ids.length) {
          await transaction.rollback();
          return res.status(400).json({ error: "部分包裹不存在或状态不可用" });
        }
      } else {
        await transaction.rollback();
        return res.status(400).json({ error: "无效的管理模式" });
      }

      // 生成DO号
      const doNumber = await generateDONumber();

      // 创建DO
      const deliveryOrder = await DeliveryOrder.create(
        {
          do_number: doNumber,
          management_type,
          total_package_count:
            management_type === "package" ? package_ids.length : 0,
          driver_name,
          driver_id_number,
          vehicle_plate,
          usdot_number,
          pickup_location,
          pickup_details,
          created_by: req.user.id,
          operator: req.user.username,
          operator_id: req.user.id,
          remark,
        },
        { transaction }
      );

      // 根据管理模式创建关联记录
      if (management_type === "pallet") {
        // 关联板到DO
        const pallets = await Pallet.findAll({
          where: { id: pallet_ids },
          transaction,
        });

        const dopalletRecords = pallets.map((pallet, index) => ({
          delivery_order_id: deliveryOrder.id,
          pallet_id: pallet.id,
          forecast_id: pallet.forecast_id,
          loading_sequence: index + 1,
        }));

        await DeliveryOrderPallet.bulkCreate(dopalletRecords, { transaction });

        // 记录操作日志
        await DeliveryOrderLog.create(
          {
            delivery_order_id: deliveryOrder.id,
            action: "created",
            new_status: "pending",
            operator: req.user.username,
            operator_id: req.user.id,
            description: `创建DO: ${doNumber}，按板管理，包含${pallets.length}个板`,
            metadata: {
              management_type: "pallet",
              pallet_count: pallets.length,
              forecast_codes: pallets.map((p) => p.forecast.forecast_code),
              pallet_codes: pallets.map((p) => p.pallet_code),
            },
          },
          { transaction }
        );
      } else {
        // 关联包裹到DO
        const packages = await Package.findAll({
          where: { id: package_ids },
          transaction,
        });

        const doPackageRecords = packages.map((pkg) => ({
          delivery_order_id: deliveryOrder.id,
          package_id: pkg.id,
        }));

        await DeliveryOrderPackage.bulkCreate(doPackageRecords, {
          transaction,
        });

        // 记录操作日志
        await DeliveryOrderLog.create(
          {
            delivery_order_id: deliveryOrder.id,
            action: "created",
            new_status: "pending",
            operator: req.user.username,
            operator_id: req.user.id,
            description: `创建DO: ${doNumber}，按包裹管理，包含${packages.length}个包裹`,
            metadata: {
              management_type: "package",
              package_count: packages.length,
              mawb_hawb_list: packages.map((p) => `${p.mawb}-${p.hawb}`),
              package_codes: packages.map((p) => p.package_code),
            },
          },
          { transaction }
        );
      }

      // 同步相关实体状态
      await syncStatusOnDOCreation(deliveryOrder.id, transaction);

      await transaction.commit();

      // 返回完整的DO信息
      const includeOptions = [
        {
          model: User,
          as: "creator",
          attributes: ["id", "username"],
        },
      ];

      if (management_type === "pallet") {
        includeOptions.push({
          model: Pallet,
          as: "pallets",
          attributes: [
            "id",
            "pallet_code",
            "custom_board_no",
            "box_count",
            "weight_kg",
          ],
          through: { attributes: ["loading_sequence"] },
          include: [
            {
              model: Forecast,
              as: "forecast",
              attributes: ["id", "forecast_code", "mawb"],
            },
          ],
        });
      } else {
        includeOptions.push({
          model: Package,
          as: "packages",
          attributes: [
            "id",
            "package_code",
            "mawb",
            "hawb",
            "weight_kg",
            "tracking_no",
          ],
          through: { attributes: ["pickup_status"] },
          include: [
            {
              model: Forecast,
              as: "forecast",
              attributes: ["id", "forecast_code", "mawb"],
            },
            {
              model: User,
              as: "client",
              attributes: ["id", "username", "company_name"],
            },
          ],
        });
      }

      const newDO = await DeliveryOrder.findByPk(deliveryOrder.id, {
        include: includeOptions,
      });

      res.status(201).json({
        message: "DO创建成功",
        delivery_order: newDO,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("创建DO失败:", error);
      res.status(500).json({ error: "创建DO失败" });
    }
  }
);

// 更新DO信息
router.put(
  "/:id",
  authenticate,
  checkPermission("warehouse.delivery_order.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        driver_name,
        driver_id_number,
        vehicle_plate,
        usdot_number,
        pickup_location,
        pickup_details,
        remark,
      } = req.body;

      const deliveryOrder = await DeliveryOrder.findByPk(id, { transaction });
      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (deliveryOrder.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({ error: "只能修改待提货状态的DO" });
      }

      const oldData = {
        driver_name: deliveryOrder.driver_name,
        vehicle_plate: deliveryOrder.vehicle_plate,
      };

      // 更新DO信息
      await deliveryOrder.update(
        {
          driver_name,
          driver_id_number,
          vehicle_plate,
          usdot_number,
          pickup_location,
          pickup_details,
          operator: req.user.username,
          operator_id: req.user.id,
          remark,
        },
        { transaction }
      );

      // 记录操作日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: deliveryOrder.id,
          action: "updated",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `更新DO信息`,
          metadata: {
            old_data: oldData,
            new_data: {
              driver_name,
              vehicle_plate,
            },
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "DO更新成功",
        delivery_order: deliveryOrder,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新DO失败:", error);
      res.status(500).json({ error: "更新DO失败" });
    }
  }
);

// 确认提货
router.post(
  "/:id/pickup",
  authenticate,
  checkPermission("warehouse.delivery_order.pickup"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { remark } = req.body;

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Pallet,
            as: "pallets",
            through: { attributes: [] },
          },
        ],
        transaction,
      });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (deliveryOrder.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({ error: "DO状态不允许提货操作" });
      }

      // 更新DO状态
      await deliveryOrder.update(
        {
          status: "picked_up",
          pickup_time: new Date(),
          operator: req.user.username,
          operator_id: req.user.id,
          remark: remark || deliveryOrder.remark,
        },
        { transaction }
      );

      // 更新相关板的状态
      await Pallet.update(
        {
          status: "dispatched",
          operator: req.user.username,
          operator_id: req.user.id,
          position_updated_at: new Date(),
        },
        {
          where: {
            id: deliveryOrder.pallets.map((p) => p.id),
          },
          transaction,
        }
      );

      // 记录操作日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: deliveryOrder.id,
          action: "picked_up",
          old_status: "pending",
          new_status: "picked_up",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `确认提货，包含${deliveryOrder.pallets.length}个板`,
          metadata: {
            pallet_count: deliveryOrder.pallets.length,
            pickup_time: new Date(),
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "提货确认成功",
        delivery_order: deliveryOrder,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("确认提货失败:", error);
      res.status(500).json({ error: "确认提货失败" });
    }
  }
);

// 获取DO详情
router.get(
  "/:id",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["id", "username"],
          },
          {
            model: User,
            as: "operatorUser",
            attributes: ["id", "username"],
          },
          {
            model: Pallet,
            as: "pallets",
            attributes: [
              "id",
              "pallet_code",
              "custom_board_no",
              "pallet_type",
              "box_count",
              "weight_kg",
              "location_code",
            ],
            through: {
              attributes: ["loading_sequence"],
              as: "deliveryOrderPallet",
            },
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb", "flight_no"],
              },
              {
                model: Package,
                as: "packages",
                attributes: ["id", "package_code", "weight_kg", "client_id"],
                include: [
                  {
                    model: User,
                    as: "client",
                    attributes: ["id", "username", "company_name"],
                  },
                ],
              },
            ],
          },
        ],
        order: [
          [
            { model: Pallet, as: "pallets" },
            { model: db.DeliveryOrderPallet, as: "deliveryOrderPallet" },
            "loading_sequence",
            "ASC",
          ],
        ],
      });

      if (!deliveryOrder) {
        return res.status(404).json({ error: "DO不存在" });
      }

      res.json({ delivery_order: deliveryOrder });
    } catch (error) {
      console.error("获取DO详情失败:", error);
      res.status(500).json({ error: "获取DO详情失败" });
    }
  }
);

// 获取DO仓库确认信息（供仓库操作人员确认使用）
router.get(
  "/:id/warehouse-info",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["id", "username"],
          },
          {
            model: Pallet,
            as: "pallets",
            attributes: [
              "id",
              "pallet_code",
              "custom_board_no",
              "box_count",
              "weight_kg",
              "pallet_type",
            ],
            through: { attributes: ["loading_sequence"] },
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb", "hawb"],
              },
            ],
          },
          {
            model: Package,
            as: "packages",
            attributes: ["id", "package_code", "weight_kg"],
            through: { attributes: ["pickup_status"] },
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb", "hawb"],
              },
            ],
          },
        ],
        order: [
          [
            { model: Pallet, as: "pallets" },
            { model: DeliveryOrderPallet, as: "DeliveryOrderPallet" },
            "loading_sequence",
            "ASC",
          ],
        ],
      });

      if (!deliveryOrder) {
        return res.status(404).json({ error: "DO不存在" });
      }

      // 计算预期数量
      const expectedPalletCount = deliveryOrder.pallets?.length || 0;
      const expectedPackageCount =
        deliveryOrder.management_type === "package"
          ? deliveryOrder.total_package_count
          : deliveryOrder.pallets?.reduce(
              (sum, pallet) => sum + (pallet.box_count || 0),
              0
            ) || 0;

      // 计算总重量
      const totalWeight =
        deliveryOrder.management_type === "package"
          ? deliveryOrder.packages?.reduce(
              (sum, pkg) => sum + parseFloat(pkg.weight_kg || 0),
              0
            ) || 0
          : deliveryOrder.pallets?.reduce(
              (sum, pallet) => sum + parseFloat(pallet.weight_kg || 0),
              0
            ) || 0;

      // 获取相关的MAWB/HAWB信息
      const mawbInfo = {};
      if (deliveryOrder.pallets?.length > 0) {
        deliveryOrder.pallets.forEach((pallet) => {
          if (pallet.forecast) {
            const mawb = pallet.forecast.mawb;
            if (!mawbInfo[mawb]) {
              mawbInfo[mawb] = {
                mawb,
                hawbs: new Set(),
                forecast_codes: new Set(),
                pallet_count: 0,
                package_count: 0,
              };
            }
            mawbInfo[mawb].pallet_count++;
            mawbInfo[mawb].package_count += pallet.box_count || 0;
            if (pallet.forecast.hawb) {
              mawbInfo[mawb].hawbs.add(pallet.forecast.hawb);
            }
            mawbInfo[mawb].forecast_codes.add(pallet.forecast.forecast_code);
          }
        });
      }

      // 转换Set为Array
      Object.values(mawbInfo).forEach((info) => {
        info.hawbs = Array.from(info.hawbs);
        info.forecast_codes = Array.from(info.forecast_codes);
      });

      res.json({
        do_number: deliveryOrder.do_number,
        status: deliveryOrder.status,
        management_type: deliveryOrder.management_type,
        driver_info: {
          driver_name: deliveryOrder.driver_name,
          driver_id_number: deliveryOrder.driver_id_number,
          vehicle_plate: deliveryOrder.vehicle_plate,
          usdot_number: deliveryOrder.usdot_number,
        },
        pickup_info: {
          pickup_location: deliveryOrder.pickup_location,
          pickup_details: deliveryOrder.pickup_details,
          pickup_time: deliveryOrder.pickup_time,
        },
        transport_info: {
          departure_time: deliveryOrder.departure_time,
          arrival_time: deliveryOrder.arrival_time,
          current_location: deliveryOrder.current_location,
          target_warehouse: deliveryOrder.target_warehouse,
        },
        expected_quantities: {
          pallet_count: expectedPalletCount,
          package_count: expectedPackageCount,
          total_weight_kg: totalWeight,
        },
        cargo_details: {
          pallets: deliveryOrder.pallets,
          packages: deliveryOrder.packages,
          mawb_summary: Object.values(mawbInfo),
        },
        creator: deliveryOrder.creator,
        remark: deliveryOrder.remark,
        confirmation_template: {
          actual_pallet_count: expectedPalletCount,
          actual_package_count: expectedPackageCount,
          warehouse_receiver: "",
          discrepancy_notes: "",
          remark: "",
        },
      });
    } catch (error) {
      console.error("获取DO仓库确认信息失败:", error);
      res.status(500).json({ error: "获取DO仓库确认信息失败" });
    }
  }
);

// 获取DO操作日志
router.get(
  "/:id/logs",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const logs = await DeliveryOrderLog.findAndCountAll({
        where: { delivery_order_id: id },
        include: [
          {
            model: User,
            as: "operatorUser",
            attributes: ["id", "username"],
          },
        ],
        limit: parseInt(limit),
        offset,
        order: [["created_at", "DESC"]],
      });

      res.json({
        logs: logs.rows,
        pagination: {
          total: logs.count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(logs.count / limit),
        },
      });
    } catch (error) {
      console.error("获取DO日志失败:", error);
      res.status(500).json({ error: "获取DO日志失败" });
    }
  }
);

// 取消DO
router.post(
  "/:id/cancel",
  authenticate,
  checkPermission("warehouse.delivery_order.cancel"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { remark } = req.body;

      const deliveryOrder = await DeliveryOrder.findByPk(id, { transaction });
      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (deliveryOrder.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({ error: "只能取消待提货状态的DO" });
      }

      // 更新DO状态
      await deliveryOrder.update(
        {
          status: "cancelled",
          operator: req.user.username,
          operator_id: req.user.id,
          remark: remark || deliveryOrder.remark,
        },
        { transaction }
      );

      // 记录操作日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: deliveryOrder.id,
          action: "cancelled",
          old_status: "pending",
          new_status: "cancelled",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `取消DO`,
          metadata: { reason: remark },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "DO取消成功",
        delivery_order: deliveryOrder,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("取消DO失败:", error);
      res.status(500).json({ error: "取消DO失败" });
    }
  }
);

// 修改DO中的板（添加/移除板）
router.patch(
  "/:id/pallets",
  authenticate,
  checkPermission("warehouse.delivery_order.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { add_pallet_ids = [], remove_pallet_ids = [], remark } = req.body;

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Pallet,
            as: "pallets",
            through: { attributes: ["loading_sequence"] },
          },
        ],
        transaction,
      });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (deliveryOrder.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({ error: "只能修改待提货状态的DO" });
      }

      let changes = [];

      // 移除板
      if (remove_pallet_ids.length > 0) {
        await DeliveryOrderPallet.destroy({
          where: {
            delivery_order_id: id,
            pallet_id: remove_pallet_ids,
          },
          transaction,
        });

        const removedPallets = await Pallet.findAll({
          where: { id: remove_pallet_ids },
          attributes: ["id", "pallet_code"],
          transaction,
        });

        changes.push({
          action: "removed",
          pallets: removedPallets.map((p) => p.pallet_code),
        });
      }

      // 添加板
      if (add_pallet_ids.length > 0) {
        // 验证要添加的板是否可用
        const palletsToAdd = await Pallet.findAll({
          where: {
            id: add_pallet_ids,
            status: "stored",
          },
          include: [
            {
              model: Forecast,
              as: "forecast",
              where: { status: "in_transit" },
              attributes: ["id", "forecast_code"],
            },
          ],
          transaction,
        });

        if (palletsToAdd.length !== add_pallet_ids.length) {
          await transaction.rollback();
          return res
            .status(400)
            .json({ error: "部分要添加的板不存在或状态不可用" });
        }

        // 检查板是否已被其他DO使用
        const existingDOPallets = await DeliveryOrderPallet.findAll({
          where: {
            pallet_id: add_pallet_ids,
          },
          include: [
            {
              model: DeliveryOrder,
              as: "deliveryOrder",
              where: {
                status: ["pending", "picked_up"],
              },
            },
          ],
          transaction,
        });

        if (existingDOPallets.length > 0) {
          await transaction.rollback();
          return res.status(400).json({
            error: "部分板已被其他DO使用",
            conflicting_dos: existingDOPallets.map(
              (dp) => dp.deliveryOrder.do_number
            ),
          });
        }

        // 获取当前最大装载序号
        const maxSequence =
          (await DeliveryOrderPallet.max("loading_sequence", {
            where: { delivery_order_id: id },
            transaction,
          })) || 0;

        // 添加新的板关联
        const newDOPalletRecords = palletsToAdd.map((pallet, index) => ({
          delivery_order_id: id,
          pallet_id: pallet.id,
          forecast_id: pallet.forecast_id,
          loading_sequence: maxSequence + index + 1,
        }));

        await DeliveryOrderPallet.bulkCreate(newDOPalletRecords, {
          transaction,
        });

        changes.push({
          action: "added",
          pallets: palletsToAdd.map((p) => p.pallet_code),
        });
      }

      // 记录操作日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: id,
          action: "updated",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `修改DO板列表`,
          metadata: {
            changes,
            remark,
          },
        },
        { transaction }
      );

      await transaction.commit();

      // 返回更新后的DO信息
      const updatedDO = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Pallet,
            as: "pallets",
            attributes: [
              "id",
              "pallet_code",
              "custom_board_no",
              "box_count",
              "weight_kg",
            ],
            through: { attributes: ["loading_sequence"] },
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb"],
              },
            ],
          },
        ],
        order: [
          [
            { model: Pallet, as: "pallets" },
            { model: DeliveryOrderPallet, as: "DeliveryOrderPallet" },
            "loading_sequence",
            "ASC",
          ],
        ],
      });

      res.json({
        message: "DO板列表修改成功",
        delivery_order: updatedDO,
        changes,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("修改DO板列表失败:", error);
      res.status(500).json({ error: "修改DO板列表失败" });
    }
  }
);

// 部分提货（只提取部分板）
router.post(
  "/:id/partial-pickup",
  authenticate,
  checkPermission("warehouse.delivery_order.pickup"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { picked_pallet_ids, remark } = req.body;

      if (
        !picked_pallet_ids ||
        !Array.isArray(picked_pallet_ids) ||
        picked_pallet_ids.length === 0
      ) {
        await transaction.rollback();
        return res.status(400).json({ error: "请选择要提取的板" });
      }

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Pallet,
            as: "pallets",
            through: { attributes: [] },
          },
        ],
        transaction,
      });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (deliveryOrder.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({ error: "DO状态不允许提货操作" });
      }

      // 验证选择的板是否都属于当前DO
      const allPalletIds = deliveryOrder.pallets.map((p) => p.id);
      const invalidPalletIds = picked_pallet_ids.filter(
        (id) => !allPalletIds.includes(id)
      );

      if (invalidPalletIds.length > 0) {
        await transaction.rollback();
        return res.status(400).json({ error: "部分板不属于当前DO" });
      }

      const remainingPalletIds = allPalletIds.filter(
        (id) => !picked_pallet_ids.includes(id)
      );

      if (remainingPalletIds.length === 0) {
        // 如果提取了所有板，执行完整提货
        await deliveryOrder.update(
          {
            status: "picked_up",
            pickup_time: new Date(),
            operator: req.user.username,
            operator_id: req.user.id,
            remark: remark || deliveryOrder.remark,
          },
          { transaction }
        );

        // 更新所有板的状态
        await Pallet.update(
          {
            status: "dispatched",
            operator: req.user.username,
            operator_id: req.user.id,
            position_updated_at: new Date(),
          },
          {
            where: { id: picked_pallet_ids },
            transaction,
          }
        );

        await DeliveryOrderLog.create(
          {
            delivery_order_id: id,
            action: "picked_up",
            old_status: "pending",
            new_status: "picked_up",
            operator: req.user.username,
            operator_id: req.user.id,
            description: `完整提货，包含${picked_pallet_ids.length}个板`,
            metadata: {
              pickup_type: "full",
              pallet_count: picked_pallet_ids.length,
              pickup_time: new Date(),
            },
          },
          { transaction }
        );
      } else {
        // 部分提货：创建新的DO给剩余的板
        const newDONumber = await generateDONumber();

        const newDeliveryOrder = await DeliveryOrder.create(
          {
            do_number: newDONumber,
            driver_name: deliveryOrder.driver_name,
            driver_id_number: deliveryOrder.driver_id_number,
            vehicle_plate: deliveryOrder.vehicle_plate,
            usdot_number: deliveryOrder.usdot_number,
            pickup_location: deliveryOrder.pickup_location,
            pickup_details: deliveryOrder.pickup_details,
            created_by: req.user.id,
            operator: req.user.username,
            operator_id: req.user.id,
            remark: `原DO ${deliveryOrder.do_number} 部分提货后的剩余板`,
          },
          { transaction }
        );

        // 将剩余板转移到新DO
        await DeliveryOrderPallet.update(
          { delivery_order_id: newDeliveryOrder.id },
          {
            where: {
              delivery_order_id: id,
              pallet_id: remainingPalletIds,
            },
            transaction,
          }
        );

        // 更新原DO状态为已提货
        await deliveryOrder.update(
          {
            status: "picked_up",
            pickup_time: new Date(),
            operator: req.user.username,
            operator_id: req.user.id,
            remark: remark || deliveryOrder.remark,
          },
          { transaction }
        );

        // 更新已提取板的状态
        await Pallet.update(
          {
            status: "dispatched",
            operator: req.user.username,
            operator_id: req.user.id,
            position_updated_at: new Date(),
          },
          {
            where: { id: picked_pallet_ids },
            transaction,
          }
        );

        // 记录原DO的部分提货日志
        await DeliveryOrderLog.create(
          {
            delivery_order_id: id,
            action: "picked_up",
            old_status: "pending",
            new_status: "picked_up",
            operator: req.user.username,
            operator_id: req.user.id,
            description: `部分提货，提取${picked_pallet_ids.length}个板，剩余${remainingPalletIds.length}个板转移到${newDONumber}`,
            metadata: {
              pickup_type: "partial",
              picked_pallet_count: picked_pallet_ids.length,
              remaining_pallet_count: remainingPalletIds.length,
              new_do_number: newDONumber,
              pickup_time: new Date(),
            },
          },
          { transaction }
        );

        // 记录新DO的创建日志
        await DeliveryOrderLog.create(
          {
            delivery_order_id: newDeliveryOrder.id,
            action: "created",
            new_status: "pending",
            operator: req.user.username,
            operator_id: req.user.id,
            description: `从${deliveryOrder.do_number}部分提货后创建，包含${remainingPalletIds.length}个剩余板`,
            metadata: {
              origin_do_number: deliveryOrder.do_number,
              pallet_count: remainingPalletIds.length,
              creation_reason: "partial_pickup",
            },
          },
          { transaction }
        );
      }

      await transaction.commit();

      res.json({
        message:
          remainingPalletIds.length > 0
            ? "部分提货成功，剩余板已转移到新DO"
            : "完整提货成功",
        original_do: deliveryOrder.do_number,
        picked_pallet_count: picked_pallet_ids.length,
        remaining_pallet_count: remainingPalletIds.length,
        new_do_number:
          remainingPalletIds.length > 0 ? await generateDONumber() : null,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("部分提货失败:", error);
      res.status(500).json({ error: "部分提货失败" });
    }
  }
);

// 创建补充DO（为同一批货物补充遗漏的板）
router.post(
  "/:id/create-supplement",
  authenticate,
  checkPermission("warehouse.delivery_order.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { pallet_ids, remark } = req.body;

      if (
        !pallet_ids ||
        !Array.isArray(pallet_ids) ||
        pallet_ids.length === 0
      ) {
        await transaction.rollback();
        return res.status(400).json({ error: "请选择要补充的板" });
      }

      const originalDO = await DeliveryOrder.findByPk(id, { transaction });
      if (!originalDO) {
        await transaction.rollback();
        return res.status(404).json({ error: "原DO不存在" });
      }

      // 验证板是否存在且可用
      const pallets = await Pallet.findAll({
        where: {
          id: pallet_ids,
          status: "stored",
        },
        include: [
          {
            model: Forecast,
            as: "forecast",
            where: { status: "in_transit" },
            attributes: ["id", "forecast_code", "mawb"],
          },
        ],
        transaction,
      });

      if (pallets.length !== pallet_ids.length) {
        await transaction.rollback();
        return res.status(400).json({ error: "部分板不存在或状态不可用" });
      }

      // 生成补充DO号
      const supplementDONumber = await generateDONumber();

      // 创建补充DO
      const supplementDO = await DeliveryOrder.create(
        {
          do_number: supplementDONumber,
          driver_name: originalDO.driver_name,
          driver_id_number: originalDO.driver_id_number,
          vehicle_plate: originalDO.vehicle_plate,
          usdot_number: originalDO.usdot_number,
          pickup_location: originalDO.pickup_location,
          pickup_details: originalDO.pickup_details,
          created_by: req.user.id,
          operator: req.user.username,
          operator_id: req.user.id,
          remark: `${originalDO.do_number} 的补充DO - ${
            remark || "补充遗漏的板"
          }`,
        },
        { transaction }
      );

      // 关联板到补充DO
      const supplementDOPalletRecords = pallets.map((pallet, index) => ({
        delivery_order_id: supplementDO.id,
        pallet_id: pallet.id,
        forecast_id: pallet.forecast_id,
        loading_sequence: index + 1,
      }));

      await DeliveryOrderPallet.bulkCreate(supplementDOPalletRecords, {
        transaction,
      });

      // 记录补充DO的创建日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: supplementDO.id,
          action: "created",
          new_status: "pending",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `创建补充DO: ${supplementDONumber}，补充${originalDO.do_number}遗漏的${pallets.length}个板`,
          metadata: {
            original_do_number: originalDO.do_number,
            supplement_reason: remark || "补充遗漏的板",
            pallet_count: pallets.length,
            forecast_codes: pallets.map((p) => p.forecast.forecast_code),
            pallet_codes: pallets.map((p) => p.pallet_code),
          },
        },
        { transaction }
      );

      // 在原DO中记录补充DO的创建
      await DeliveryOrderLog.create(
        {
          delivery_order_id: id,
          action: "updated",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `创建补充DO ${supplementDONumber}，补充${pallets.length}个遗漏的板`,
          metadata: {
            supplement_do_number: supplementDONumber,
            supplement_pallet_count: pallets.length,
          },
        },
        { transaction }
      );

      await transaction.commit();

      // 返回补充DO信息
      const newSupplementDO = await DeliveryOrder.findByPk(supplementDO.id, {
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["id", "username"],
          },
          {
            model: Pallet,
            as: "pallets",
            attributes: [
              "id",
              "pallet_code",
              "custom_board_no",
              "box_count",
              "weight_kg",
            ],
            through: { attributes: ["loading_sequence"] },
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb"],
              },
            ],
          },
        ],
      });

      res.status(201).json({
        message: "补充DO创建成功",
        original_do_number: originalDO.do_number,
        supplement_do: newSupplementDO,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("创建补充DO失败:", error);
      res.status(500).json({ error: "创建补充DO失败" });
    }
  }
);

// 按包裹部分提货
router.post(
  "/:id/partial-pickup-packages",
  authenticate,
  checkPermission("warehouse.delivery_order.pickup"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { picked_package_ids, remark } = req.body;

      if (
        !picked_package_ids ||
        !Array.isArray(picked_package_ids) ||
        picked_package_ids.length === 0
      ) {
        await transaction.rollback();
        return res.status(400).json({ error: "请选择要提取的包裹" });
      }

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Package,
            as: "packages",
            through: { attributes: ["pickup_status"] },
          },
        ],
        transaction,
      });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (deliveryOrder.management_type !== "package") {
        await transaction.rollback();
        return res.status(400).json({ error: "此功能仅适用于按包裹管理的DO" });
      }

      if (deliveryOrder.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({ error: "DO状态不允许提货操作" });
      }

      // 验证选择的包裹是否都属于当前DO
      const allPackageIds = deliveryOrder.packages.map((p) => p.id);
      const invalidPackageIds = picked_package_ids.filter(
        (id) => !allPackageIds.includes(id)
      );

      if (invalidPackageIds.length > 0) {
        await transaction.rollback();
        return res.status(400).json({ error: "部分包裹不属于当前DO" });
      }

      // 更新已提取包裹的状态
      await DeliveryOrderPackage.update(
        {
          pickup_status: "picked_up",
          pickup_time: new Date(),
        },
        {
          where: {
            delivery_order_id: id,
            package_id: picked_package_ids,
          },
          transaction,
        }
      );

      // 更新DO的提取统计
      const pickedCount =
        deliveryOrder.picked_package_count + picked_package_ids.length;
      const isFullyPicked = pickedCount >= deliveryOrder.total_package_count;

      await deliveryOrder.update(
        {
          picked_package_count: pickedCount,
          status: isFullyPicked ? "picked_up" : "pending",
          pickup_time: isFullyPicked ? new Date() : deliveryOrder.pickup_time,
          operator: req.user.username,
          operator_id: req.user.id,
          remark: remark || deliveryOrder.remark,
        },
        { transaction }
      );

      // 记录操作日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: id,
          action: isFullyPicked ? "picked_up" : "updated",
          old_status: "pending",
          new_status: isFullyPicked ? "picked_up" : "pending",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `${isFullyPicked ? "完成" : "部分"}提货，提取${
            picked_package_ids.length
          }个包裹，累计${pickedCount}/${deliveryOrder.total_package_count}个`,
          metadata: {
            pickup_type: isFullyPicked ? "completed" : "partial",
            picked_package_count: picked_package_ids.length,
            total_picked: pickedCount,
            total_packages: deliveryOrder.total_package_count,
            pickup_time: new Date(),
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: isFullyPicked ? "包裹提货完成" : "部分包裹提货成功",
        do_number: deliveryOrder.do_number,
        picked_package_count: picked_package_ids.length,
        total_picked: pickedCount,
        total_packages: deliveryOrder.total_package_count,
        remaining_packages: deliveryOrder.total_package_count - pickedCount,
        status: isFullyPicked ? "picked_up" : "pending",
      });
    } catch (error) {
      await transaction.rollback();
      console.error("包裹部分提货失败:", error);
      res.status(500).json({ error: "包裹部分提货失败" });
    }
  }
);

// 创建多车灵活提货DO（为整个MAWB预创建多个DO）
router.post(
  "/create-flexible",
  authenticate,
  checkPermission("warehouse.delivery_order.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        mawb,
        hawb,
        vehicle_count,
        vehicles,
        pickup_location,
        pickup_details,
        remark,
      } = req.body;

      // 验证必填字段
      if (
        !mawb ||
        !vehicle_count ||
        !vehicles ||
        !Array.isArray(vehicles) ||
        vehicles.length !== vehicle_count
      ) {
        await transaction.rollback();
        return res.status(400).json({ error: "请提供完整的MAWB和车辆信息" });
      }

      // 验证车辆信息
      for (let vehicle of vehicles) {
        if (
          !vehicle.driver_name ||
          !vehicle.driver_id_number ||
          !vehicle.vehicle_plate
        ) {
          await transaction.rollback();
          return res.status(400).json({ error: "请填写完整的司机和车辆信息" });
        }
      }

      // 查找该MAWB的所有可用包裹
      let whereCondition = {
        mawb: mawb,
        status: "arrived",
        pallet_id: { [db.Sequelize.Op.not]: null },
      };

      if (hawb) {
        whereCondition.hawb = hawb;
      }

      const packages = await Package.findAll({
        where: whereCondition,
        include: [
          {
            model: Forecast,
            as: "forecast",
            where: { status: "in_transit" },
            attributes: ["id", "forecast_code", "mawb"],
          },
        ],
        transaction,
      });

      if (packages.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: "该MAWB下没有可用的包裹" });
      }

      // 检查包裹是否已被其他DO使用
      const existingDOPackages = await DeliveryOrderPackage.findAll({
        where: {
          package_id: packages.map((p) => p.id),
        },
        include: [
          {
            model: DeliveryOrder,
            as: "deliveryOrder",
            where: {
              status: ["pending", "picked_up"],
            },
          },
        ],
        transaction,
      });

      if (existingDOPackages.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: "部分包裹已被其他DO使用",
          conflicting_dos: [
            ...new Set(
              existingDOPackages.map((dp) => dp.deliveryOrder.do_number)
            ),
          ],
        });
      }

      const createdDOs = [];

      // 为每辆车创建一个DO
      for (let i = 0; i < vehicle_count; i++) {
        const vehicle = vehicles[i];
        const doNumber = await generateDONumber();

        const deliveryOrder = await DeliveryOrder.create(
          {
            do_number: doNumber,
            management_type: "package",
            status: "allocated", // 新状态：已分配但未确定具体包裹
            total_package_count: 0, // 初始为0，后续分配时更新
            driver_name: vehicle.driver_name,
            driver_id_number: vehicle.driver_id_number,
            vehicle_plate: vehicle.vehicle_plate,
            usdot_number: vehicle.usdot_number,
            pickup_location,
            pickup_details,
            created_by: req.user.id,
            operator: req.user.username,
            operator_id: req.user.id,
            remark: `${mawb}${hawb ? "-" + hawb : ""} 多车提货 车辆${
              i + 1
            }/${vehicle_count} - ${remark || ""}`,
          },
          { transaction }
        );

        // 记录操作日志
        await DeliveryOrderLog.create(
          {
            delivery_order_id: deliveryOrder.id,
            action: "created",
            new_status: "allocated",
            operator: req.user.username,
            operator_id: req.user.id,
            description: `创建多车提货DO: ${doNumber}，MAWB: ${mawb}，车辆${
              i + 1
            }/${vehicle_count}，待现场分配包裹`,
            metadata: {
              mawb,
              hawb,
              vehicle_count,
              vehicle_index: i,
              total_available_packages: packages.length,
              estimated_capacity: vehicle.estimated_capacity,
            },
          },
          { transaction }
        );

        createdDOs.push({
          id: deliveryOrder.id,
          do_number: doNumber,
          vehicle_index: i,
          driver_name: vehicle.driver_name,
          vehicle_plate: vehicle.vehicle_plate,
          estimated_capacity: vehicle.estimated_capacity || 0,
        });
      }

      await transaction.commit();

      res.status(201).json({
        message: `多车提货DO创建成功，已为${vehicle_count}辆车预创建DO`,
        mawb,
        hawb,
        total_available_packages: packages.length,
        delivery_orders: createdDOs,
        next_step:
          "现场分配包裹后，使用allocate-packages接口确定每车的具体包裹",
      });
    } catch (error) {
      await transaction.rollback();
      console.error("创建多车提货DO失败:", error);
      res.status(500).json({ error: "创建多车提货DO失败" });
    }
  }
);

// 现场分配包裹到多个DO
router.post(
  "/allocate-packages",
  authenticate,
  checkPermission("warehouse.delivery_order.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { allocations, mawb, hawb } = req.body;

      // allocations 格式: [{ do_id: "DO250802-01", package_ids: [1,2,3] }, ...]
      if (
        !allocations ||
        !Array.isArray(allocations) ||
        allocations.length === 0
      ) {
        await transaction.rollback();
        return res.status(400).json({ error: "请提供包裹分配信息" });
      }

      // 验证所有DO都存在且状态正确
      const doIds = allocations.map((a) => a.do_id);
      const deliveryOrders = await DeliveryOrder.findAll({
        where: {
          id: doIds,
          status: "allocated",
        },
        transaction,
      });

      if (deliveryOrders.length !== doIds.length) {
        await transaction.rollback();
        return res.status(400).json({ error: "部分DO不存在或状态不正确" });
      }

      // 收集所有要分配的包裹ID
      const allPackageIds = allocations.flatMap((a) => a.package_ids || []);

      if (allPackageIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: "没有包裹需要分配" });
      }

      // 验证包裹是否存在且可用
      let whereCondition = {
        id: allPackageIds,
        status: "arrived",
        pallet_id: { [db.Sequelize.Op.not]: null },
      };

      if (mawb) whereCondition.mawb = mawb;
      if (hawb) whereCondition.hawb = hawb;

      const packages = await Package.findAll({
        where: whereCondition,
        include: [
          {
            model: Forecast,
            as: "forecast",
            where: { status: "in_transit" },
          },
        ],
        transaction,
      });

      if (packages.length !== allPackageIds.length) {
        await transaction.rollback();
        return res.status(400).json({ error: "部分包裹不存在或状态不可用" });
      }

      const allocationResults = [];

      // 为每个DO分配包裹
      for (let allocation of allocations) {
        const { do_id, package_ids } = allocation;

        if (!package_ids || package_ids.length === 0) continue;

        const deliveryOrder = deliveryOrders.find(
          (deliveryOrderItem) => deliveryOrderItem.id == do_id
        );

        // 创建包裹关联记录
        const doPackageRecords = package_ids.map((packageId) => ({
          delivery_order_id: do_id,
          package_id: packageId,
        }));

        await DeliveryOrderPackage.bulkCreate(doPackageRecords, {
          transaction,
        });

        // 更新DO的包裹统计和状态
        await deliveryOrder.update(
          {
            total_package_count: package_ids.length,
            status: "pending", // 从allocated变为pending
            operator: req.user.username,
            operator_id: req.user.id,
          },
          { transaction }
        );

        // 记录分配日志
        await DeliveryOrderLog.create(
          {
            delivery_order_id: do_id,
            action: "allocated",
            old_status: "allocated",
            new_status: "pending",
            operator: req.user.username,
            operator_id: req.user.id,
            description: `现场包裹分配完成，分配${package_ids.length}个包裹`,
            metadata: {
              allocated_package_count: package_ids.length,
              package_ids,
              allocation_time: new Date(),
            },
          },
          { transaction }
        );

        allocationResults.push({
          do_number: deliveryOrder.do_number,
          driver_name: deliveryOrder.driver_name,
          vehicle_plate: deliveryOrder.vehicle_plate,
          allocated_packages: package_ids.length,
        });
      }

      await transaction.commit();

      res.json({
        message: "包裹分配成功",
        mawb,
        hawb,
        total_allocated_packages: allPackageIds.length,
        allocations: allocationResults,
        next_step: "各车辆现在可以独立进行提货操作",
      });
    } catch (error) {
      await transaction.rollback();
      console.error("包裹分配失败:", error);
      res.status(500).json({ error: "包裹分配失败" });
    }
  }
);

// 批量重新分配包裹（用于现场调整）
router.post(
  "/batch-reallocate",
  authenticate,
  checkPermission("warehouse.delivery_order.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { mawb, hawb, reallocations } = req.body;

      // reallocations 格式: [{ do_id: "DO250802-01", package_ids: [1,2,3] }, ...]
      if (!reallocations || !Array.isArray(reallocations)) {
        await transaction.rollback();
        return res.status(400).json({ error: "请提供重新分配信息" });
      }

      // 查找相关的所有DO
      const doIds = reallocations.map((r) => r.do_id);
      const deliveryOrders = await DeliveryOrder.findAll({
        where: {
          id: doIds,
          status: ["allocated", "pending"],
        },
        include: [
          {
            model: Package,
            as: "packages",
            through: { attributes: [] },
          },
        ],
        transaction,
      });

      if (deliveryOrders.length !== doIds.length) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "部分DO不存在或状态不允许重新分配" });
      }

      // 清除现有的包裹分配
      await DeliveryOrderPackage.destroy({
        where: {
          delivery_order_id: doIds,
        },
        transaction,
      });

      const reallocationResults = [];

      // 重新分配包裹
      for (let reallocation of reallocations) {
        const { do_id, package_ids = [] } = reallocation;
        const deliveryOrder = deliveryOrders.find(
          (deliveryOrderItem) => deliveryOrderItem.id == do_id
        );

        if (package_ids.length > 0) {
          // 验证包裹可用性
          let whereCondition = {
            id: package_ids,
            status: "arrived",
            pallet_id: { [db.Sequelize.Op.not]: null },
          };

          if (mawb) whereCondition.mawb = mawb;
          if (hawb) whereCondition.hawb = hawb;

          const packages = await Package.findAll({
            where: whereCondition,
            transaction,
          });

          if (packages.length !== package_ids.length) {
            await transaction.rollback();
            return res.status(400).json({
              error: `DO ${deliveryOrder.do_number} 中部分包裹不可用`,
            });
          }

          // 创建新的包裹关联
          const doPackageRecords = package_ids.map((packageId) => ({
            delivery_order_id: do_id,
            package_id: packageId,
          }));

          await DeliveryOrderPackage.bulkCreate(doPackageRecords, {
            transaction,
          });
        }

        // 更新DO的包裹统计
        await deliveryOrder.update(
          {
            total_package_count: package_ids.length,
            picked_package_count: 0, // 重置提取计数
            status: package_ids.length > 0 ? "pending" : "allocated",
            operator: req.user.username,
            operator_id: req.user.id,
          },
          { transaction }
        );

        // 记录重新分配日志
        await DeliveryOrderLog.create(
          {
            delivery_order_id: do_id,
            action: "reallocated",
            operator: req.user.username,
            operator_id: req.user.id,
            description: `重新分配包裹，新分配${package_ids.length}个包裹`,
            metadata: {
              previous_package_count: deliveryOrder.packages
                ? deliveryOrder.packages.length
                : 0,
              new_package_count: package_ids.length,
              new_package_ids: package_ids,
              reallocation_time: new Date(),
            },
          },
          { transaction }
        );

        reallocationResults.push({
          do_number: deliveryOrder.do_number,
          driver_name: deliveryOrder.driver_name,
          vehicle_plate: deliveryOrder.vehicle_plate,
          previous_packages: deliveryOrder.packages
            ? deliveryOrder.packages.length
            : 0,
          new_packages: package_ids.length,
        });
      }

      await transaction.commit();

      res.json({
        message: "包裹重新分配成功",
        mawb,
        hawb,
        reallocations: reallocationResults,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("批量重新分配失败:", error);
      res.status(500).json({ error: "批量重新分配失败" });
    }
  }
);

// 获取MAWB提货汇总报告
router.get(
  "/mawb-summary/:mawb",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    try {
      const { mawb } = req.params;
      const { hawb } = req.query;

      // 查找该MAWB下的所有包裹
      let packageWhereCondition = { mawb };
      if (hawb) packageWhereCondition.hawb = hawb;

      const allPackages = await Package.findAll({
        where: packageWhereCondition,
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code", "mawb", "flight_no"],
          },
          {
            model: User,
            as: "client",
            attributes: ["id", "username", "company_name"],
          },
        ],
        attributes: [
          "id",
          "package_code",
          "mawb",
          "hawb",
          "weight_kg",
          "status",
        ],
      });

      if (allPackages.length === 0) {
        return res.status(404).json({ error: "未找到该MAWB的包裹" });
      }

      // 查找涉及这些包裹的所有DO
      const packageIds = allPackages.map((p) => p.id);
      const doPackages = await DeliveryOrderPackage.findAll({
        where: {
          package_id: packageIds,
        },
        include: [
          {
            model: DeliveryOrder,
            as: "deliveryOrder",
            include: [
              {
                model: User,
                as: "creator",
                attributes: ["id", "username"],
              },
            ],
          },
        ],
      });

      // 按DO分组统计
      const doSummary = {};
      const assignedPackageIds = new Set();

      doPackages.forEach((dp) => {
        const doId = dp.delivery_order_id;
        const deliveryOrder = dp.deliveryOrder;

        if (!doSummary[doId]) {
          doSummary[doId] = {
            do_number: deliveryOrder.do_number,
            status: deliveryOrder.status,
            management_type: deliveryOrder.management_type,
            driver_name: deliveryOrder.driver_name,
            vehicle_plate: deliveryOrder.vehicle_plate,
            pickup_time: deliveryOrder.pickup_time,
            creator: deliveryOrder.creator,
            total_packages: deliveryOrder.total_package_count,
            picked_packages: deliveryOrder.picked_package_count,
            packages: [],
          };
        }

        // 添加包裹信息
        const pkg = allPackages.find((p) => p.id === dp.package_id);
        if (pkg) {
          doSummary[doId].packages.push({
            id: pkg.id,
            package_code: pkg.package_code,
            weight_kg: pkg.weight_kg,
            pickup_status: dp.pickup_status,
            pickup_time: dp.pickup_time,
          });
          assignedPackageIds.add(dp.package_id);
        }
      });

      // 找出未分配的包裹
      const unassignedPackages = allPackages.filter(
        (p) => !assignedPackageIds.has(p.id)
      );

      // 计算总体统计
      const totalPackages = allPackages.length;
      const assignedPackages = assignedPackageIds.size;
      const pickedUpPackages = doPackages.filter(
        (dp) => dp.pickup_status === "picked_up"
      ).length;
      const pendingPickup = assignedPackages - pickedUpPackages;

      // 按状态分组DO
      const dosByStatus = {
        allocated: [],
        pending: [],
        picked_up: [],
        cancelled: [],
      };

      Object.values(doSummary).forEach((doInfo) => {
        if (dosByStatus[doInfo.status]) {
          dosByStatus[doInfo.status].push(doInfo);
        }
      });

      // 计算总重量
      const totalWeight = allPackages.reduce(
        (sum, pkg) => sum + parseFloat(pkg.weight_kg || 0),
        0
      );
      const pickedWeight = doPackages
        .filter((dp) => dp.pickup_status === "picked_up")
        .reduce((sum, dp) => {
          const pkg = allPackages.find((p) => p.id === dp.package_id);
          return sum + parseFloat(pkg?.weight_kg || 0);
        }, 0);

      res.json({
        mawb,
        hawb,
        summary: {
          total_packages: totalPackages,
          assigned_packages: assignedPackages,
          picked_up_packages: pickedUpPackages,
          pending_pickup: pendingPickup,
          unassigned_packages: unassignedPackages.length,
          total_weight_kg: totalWeight,
          picked_weight_kg: pickedWeight,
          completion_rate:
            totalPackages > 0
              ? ((pickedUpPackages / totalPackages) * 100).toFixed(2) + "%"
              : "0%",
        },
        delivery_orders: {
          total_dos: Object.keys(doSummary).length,
          by_status: {
            allocated: dosByStatus.allocated.length,
            pending: dosByStatus.pending.length,
            picked_up: dosByStatus.picked_up.length,
            cancelled: dosByStatus.cancelled.length,
          },
          details: Object.values(doSummary),
        },
        unassigned_packages: unassignedPackages.map((pkg) => ({
          id: pkg.id,
          package_code: pkg.package_code,
          weight_kg: pkg.weight_kg,
          status: pkg.status,
          client: pkg.client,
        })),
        forecast_info: allPackages[0]?.forecast || null,
      });
    } catch (error) {
      console.error("获取MAWB汇总报告失败:", error);
      res.status(500).json({ error: "获取MAWB汇总报告失败" });
    }
  }
);

// 获取多MAWB批量汇总（比如某个航班的所有MAWB）
router.post(
  "/batch-mawb-summary",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    try {
      const { mawb_list, flight_no } = req.body;

      let whereCondition = {};

      if (mawb_list && Array.isArray(mawb_list) && mawb_list.length > 0) {
        whereCondition.mawb = { [db.Sequelize.Op.in]: mawb_list };
      } else if (flight_no) {
        // 通过航班号查找相关预报单
        const forecasts = await Forecast.findAll({
          where: { flight_no },
          attributes: ["mawb"],
        });
        const mawbs = [...new Set(forecasts.map((f) => f.mawb))];
        whereCondition.mawb = { [db.Sequelize.Op.in]: mawbs };
      } else {
        return res.status(400).json({ error: "请提供MAWB列表或航班号" });
      }

      // 查找所有相关包裹
      const allPackages = await Package.findAll({
        where: whereCondition,
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code", "mawb", "flight_no"],
          },
        ],
        attributes: [
          "id",
          "package_code",
          "mawb",
          "hawb",
          "weight_kg",
          "status",
        ],
      });

      // 按MAWB分组
      const mawbGroups = {};
      allPackages.forEach((pkg) => {
        const mawb = pkg.mawb;
        if (!mawbGroups[mawb]) {
          mawbGroups[mawb] = {
            mawb,
            flight_no: pkg.forecast?.flight_no,
            packages: [],
            total_packages: 0,
            total_weight: 0,
          };
        }
        mawbGroups[mawb].packages.push(pkg);
        mawbGroups[mawb].total_packages++;
        mawbGroups[mawb].total_weight += parseFloat(pkg.weight_kg || 0);
      });

      // 查找涉及这些包裹的所有DO
      const packageIds = allPackages.map((p) => p.id);
      const doPackages = await DeliveryOrderPackage.findAll({
        where: {
          package_id: packageIds,
        },
        include: [
          {
            model: DeliveryOrder,
            as: "deliveryOrder",
            attributes: [
              "id",
              "do_number",
              "status",
              "driver_name",
              "vehicle_plate",
              "pickup_time",
            ],
          },
        ],
      });

      // 为每个MAWB计算统计信息
      const mawbSummaries = Object.values(mawbGroups).map((group) => {
        const mawbPackageIds = group.packages.map((p) => p.id);
        const mawbDOPackages = doPackages.filter((dp) =>
          mawbPackageIds.includes(dp.package_id)
        );

        const assignedPackages = mawbDOPackages.length;
        const pickedUpPackages = mawbDOPackages.filter(
          (dp) => dp.pickup_status === "picked_up"
        ).length;
        const unassignedPackages = group.total_packages - assignedPackages;

        const pickedWeight = mawbDOPackages
          .filter((dp) => dp.pickup_status === "picked_up")
          .reduce((sum, dp) => {
            const pkg = group.packages.find((p) => p.id === dp.package_id);
            return sum + parseFloat(pkg?.weight_kg || 0);
          }, 0);

        // 涉及的DO统计
        const involvedDOs = [
          ...new Set(mawbDOPackages.map((dp) => dp.delivery_order_id)),
        ];
        const doStatuses = {};
        involvedDOs.forEach((doId) => {
          const doPackage = mawbDOPackages.find(
            (dp) => dp.delivery_order_id === doId
          );
          const status = doPackage?.deliveryOrder?.status;
          doStatuses[status] = (doStatuses[status] || 0) + 1;
        });

        return {
          mawb: group.mawb,
          flight_no: group.flight_no,
          total_packages: group.total_packages,
          assigned_packages: assignedPackages,
          picked_up_packages: pickedUpPackages,
          unassigned_packages: unassignedPackages,
          total_weight_kg: group.total_weight,
          picked_weight_kg: pickedWeight,
          completion_rate:
            group.total_packages > 0
              ? ((pickedUpPackages / group.total_packages) * 100).toFixed(2) +
                "%"
              : "0%",
          involved_dos: involvedDOs.length,
          do_statuses: doStatuses,
        };
      });

      // 总体统计
      const overallSummary = {
        total_mawbs: mawbSummaries.length,
        total_packages: mawbSummaries.reduce(
          (sum, m) => sum + m.total_packages,
          0
        ),
        total_assigned: mawbSummaries.reduce(
          (sum, m) => sum + m.assigned_packages,
          0
        ),
        total_picked_up: mawbSummaries.reduce(
          (sum, m) => sum + m.picked_up_packages,
          0
        ),
        total_unassigned: mawbSummaries.reduce(
          (sum, m) => sum + m.unassigned_packages,
          0
        ),
        total_weight_kg: mawbSummaries.reduce(
          (sum, m) => sum + m.total_weight_kg,
          0
        ),
        total_picked_weight_kg: mawbSummaries.reduce(
          (sum, m) => sum + m.picked_weight_kg,
          0
        ),
        total_dos: mawbSummaries.reduce((sum, m) => sum + m.involved_dos, 0),
      };

      overallSummary.overall_completion_rate =
        overallSummary.total_packages > 0
          ? (
              (overallSummary.total_picked_up / overallSummary.total_packages) *
              100
            ).toFixed(2) + "%"
          : "0%";

      res.json({
        query: { mawb_list, flight_no },
        overall_summary: overallSummary,
        mawb_summaries: mawbSummaries.sort((a, b) =>
          a.mawb.localeCompare(b.mawb)
        ),
      });
    } catch (error) {
      console.error("获取批量MAWB汇总报告失败:", error);
      res.status(500).json({ error: "获取批量MAWB汇总报告失败" });
    }
  }
);

// 开始运输（司机离开地仓）
router.post(
  "/:id/start-transport",
  authenticate,
  checkPermission("warehouse.delivery_order.transport"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        departure_time,
        departure_location,
        estimated_arrival,
        target_warehouse,
        driver_contact,
        vehicle_condition,
        cargo_condition,
        transport_distance,
        remark,
      } = req.body;

      const deliveryOrder = await DeliveryOrder.findByPk(id, { transaction });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (deliveryOrder.status !== "picked_up") {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "只有已提货状态的DO才能开始运输" });
      }

      // 构建更新数据，只更新提供的字段
      const updateData = {
        status: "in_transit",
        departure_time: departure_time || new Date(),
        operator: req.user.username,
        operator_id: req.user.id,
      };

      // 可选字段，只在提供时更新
      if (estimated_arrival) updateData.estimated_arrival = estimated_arrival;
      if (target_warehouse) updateData.target_warehouse = target_warehouse;
      if (transport_distance)
        updateData.transport_distance = transport_distance;
      if (remark) updateData.remark = remark;

      // 更新DO状态和运输信息
      await deliveryOrder.update(updateData, { transaction });

      // 记录运输开始日志
      const description =
        departure_location && target_warehouse
          ? `开始运输，从${departure_location}前往${target_warehouse}`
          : "开始运输";

      await DeliveryOrderLog.create(
        {
          delivery_order_id: id,
          action: "transport_started",
          old_status: "picked_up",
          new_status: "in_transit",
          operator: req.user.username,
          operator_id: req.user.id,
          description,
          metadata: {
            departure_time: departure_time || new Date(),
            departure_location: departure_location || null,
            estimated_arrival: estimated_arrival || null,
            target_warehouse: target_warehouse || null,
            driver_contact: driver_contact || null,
            vehicle_condition: vehicle_condition || null,
            cargo_condition: cargo_condition || null,
            transport_distance: transport_distance || null,
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "运输开始记录成功",
        do_number: deliveryOrder.do_number,
        status: "in_transit",
        departure_time: departure_time || new Date(),
        estimated_arrival: estimated_arrival || null,
        target_warehouse: target_warehouse || null,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("记录运输开始失败:", error);
      res.status(500).json({ error: "记录运输开始失败" });
    }
  }
);

// 到达仓库确认
router.post(
  "/:id/arrive-warehouse",
  authenticate,
  checkPermission("warehouse.delivery_order.transport"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        arrival_time,
        warehouse_location,
        arrival_condition,
        vehicle_mileage,
        driver_signature,
        warehouse_receiver,
        actual_distance,
        remark,
      } = req.body;

      const deliveryOrder = await DeliveryOrder.findByPk(id, { transaction });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (!["in_transit", "incident"].includes(deliveryOrder.status)) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "只有运输中或异常状态的DO才能确认到达" });
      }

      const oldStatus = deliveryOrder.status;

      // 更新DO状态
      await deliveryOrder.update(
        {
          status: "arrived",
          arrival_time: arrival_time || new Date(),
          current_location: warehouse_location,
          transport_distance:
            actual_distance || deliveryOrder.transport_distance,
          operator: req.user.username,
          operator_id: req.user.id,
          remark: remark || deliveryOrder.remark,
        },
        { transaction }
      );

      // 记录到达日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: id,
          action: "arrived_warehouse",
          old_status: oldStatus,
          new_status: "arrived",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `到达仓库：${warehouse_location}`,
          metadata: {
            arrival_time: arrival_time || new Date(),
            warehouse_location,
            arrival_condition,
            vehicle_mileage,
            driver_signature,
            warehouse_receiver,
            actual_distance,
            transport_duration: deliveryOrder.departure_time
              ? Math.round(
                  (new Date(arrival_time || new Date()) -
                    new Date(deliveryOrder.departure_time)) /
                    60000
                )
              : null,
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "到达仓库确认成功",
        do_number: deliveryOrder.do_number,
        status: "arrived",
        arrival_time: arrival_time || new Date(),
        warehouse_location,
        next_step: "等待卸货检查",
      });
    } catch (error) {
      await transaction.rollback();
      console.error("确认到达失败:", error);
      res.status(500).json({ error: "确认到达失败" });
    }
  }
);

// 仓库确认到货（验证板数和箱数）
router.post(
  "/:id/warehouse-confirm",
  authenticate,
  checkPermission("warehouse.delivery_order.transport"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        actual_pallet_count,
        actual_package_count,
        warehouse_receiver,
        confirm_time,
        discrepancy_notes,
        remark,
      } = req.body;

      // 验证必填字段
      if (
        actual_pallet_count === undefined &&
        actual_package_count === undefined
      ) {
        await transaction.rollback();
        return res.status(400).json({ error: "请提供实际到货的板数或箱数" });
      }

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Pallet,
            as: "pallets",
            attributes: ["id", "pallet_code", "box_count"],
            through: { attributes: [] },
          },
          {
            model: Package,
            as: "packages",
            attributes: ["id", "package_code"],
            through: { attributes: [] },
          },
        ],
        transaction,
      });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (
        !["picked_up", "in_transit", "arrived"].includes(deliveryOrder.status)
      ) {
        await transaction.rollback();
        return res
          .status(400)
          .json({
            error: "只有已提货、运输中或已到达状态的DO才能进行仓库确认",
          });
      }

      // 计算预期的板数和箱数
      const expectedPalletCount = deliveryOrder.pallets?.length || 0;
      const expectedPackageCount =
        deliveryOrder.management_type === "package"
          ? deliveryOrder.total_package_count
          : deliveryOrder.pallets?.reduce(
              (sum, pallet) => sum + (pallet.box_count || 0),
              0
            ) || 0;

      // 检查差异
      const discrepancies = [];
      let hasDiscrepancy = false;

      // 检查板数差异
      if (actual_pallet_count !== undefined) {
        if (actual_pallet_count !== expectedPalletCount) {
          hasDiscrepancy = true;
          discrepancies.push({
            type: "pallet_count",
            expected: expectedPalletCount,
            actual: actual_pallet_count,
            difference: actual_pallet_count - expectedPalletCount,
            description: `板数不符：预期${expectedPalletCount}板，实际${actual_pallet_count}板`,
          });
        }
      }

      // 检查箱数差异
      if (actual_package_count !== undefined) {
        if (actual_package_count !== expectedPackageCount) {
          hasDiscrepancy = true;
          discrepancies.push({
            type: "package_count",
            expected: expectedPackageCount,
            actual: actual_package_count,
            difference: actual_package_count - expectedPackageCount,
            description: `箱数不符：预期${expectedPackageCount}箱，实际${actual_package_count}箱`,
          });
        }
      }

      // 根据是否有差异设置状态
      const newStatus = hasDiscrepancy ? "incident" : "arrived";
      const oldStatus = deliveryOrder.status;

      // 更新DO状态和确认信息
      await deliveryOrder.update(
        {
          status: newStatus,
          warehouse_confirmed: true,
          warehouse_confirm_time: confirm_time || new Date(),
          confirmed_pallet_count: actual_pallet_count,
          confirmed_package_count: actual_package_count,
          operator: req.user.username,
          operator_id: req.user.id,
          remark: hasDiscrepancy
            ? `仓库确认异常：${discrepancies
                .map((d) => d.description)
                .join("；")}${remark ? "；" + remark : ""}`
            : `仓库确认正常${remark ? "：" + remark : ""}`,
        },
        { transaction }
      );

      // 记录仓库确认日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: id,
          action: hasDiscrepancy
            ? "warehouse_confirm_incident"
            : "warehouse_confirm_normal",
          old_status: oldStatus,
          new_status: newStatus,
          operator: req.user.username,
          operator_id: req.user.id,
          description: hasDiscrepancy
            ? `仓库确认发现异常：${discrepancies
                .map((d) => d.description)
                .join("；")}`
            : `仓库确认正常，板数箱数与DO单一致`,
          metadata: {
            confirm_time: confirm_time || new Date(),
            warehouse_receiver,
            expected_pallet_count: expectedPalletCount,
            actual_pallet_count,
            expected_package_count: expectedPackageCount,
            actual_package_count,
            discrepancies,
            discrepancy_notes,
            has_discrepancy: hasDiscrepancy,
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: hasDiscrepancy
          ? "仓库确认完成，发现货物差异，已标记为异常"
          : "仓库确认完成，货物数量正常",
        do_number: deliveryOrder.do_number,
        status: newStatus,
        confirmation_result: {
          has_discrepancy: hasDiscrepancy,
          expected_pallet_count: expectedPalletCount,
          actual_pallet_count,
          expected_package_count: expectedPackageCount,
          actual_package_count,
          discrepancies,
        },
        next_step: hasDiscrepancy
          ? "请联系相关部门处理货物差异问题"
          : "可以继续进行入库操作",
      });
    } catch (error) {
      await transaction.rollback();
      console.error("仓库确认失败:", error);
      res.status(500).json({ error: "仓库确认失败" });
    }
  }
);

// 完成入库（最终状态）
router.post(
  "/:id/complete-delivery",
  authenticate,
  checkPermission("warehouse.delivery_order.delivery"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        delivery_time,
        warehouse_receiver,
        quality_check_result,
        storage_locations,
        damaged_packages,
        missing_packages,
        remark,
      } = req.body;

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Package,
            as: "packages",
            through: { attributes: [] },
          },
        ],
        transaction,
      });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO不存在" });
      }

      if (!["arrived", "incident"].includes(deliveryOrder.status)) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "只有已到达或异常状态的DO才能完成入库" });
      }

      // 更新DO状态
      await deliveryOrder.update(
        {
          status: "delivered",
          delivery_time: delivery_time || new Date(),
          operator: req.user.username,
          operator_id: req.user.id,
          remark: remark || deliveryOrder.remark,
        },
        { transaction }
      );

      // 更新包裹状态为已入库
      if (
        deliveryOrder.management_type === "package" &&
        deliveryOrder.packages.length > 0
      ) {
        const packageIds = deliveryOrder.packages.map((p) => p.id);

        // 正常入库的包裹
        const normalPackageIds = packageIds.filter(
          (id) =>
            !damaged_packages?.includes(id) && !missing_packages?.includes(id)
        );

        if (normalPackageIds.length > 0) {
          await Package.update(
            { status: "stored" },
            { where: { id: normalPackageIds }, transaction }
          );
        }

        // 处理损坏包裹
        if (damaged_packages && damaged_packages.length > 0) {
          await Package.update(
            { status: "damaged" },
            { where: { id: damaged_packages }, transaction }
          );
        }

        // 处理丢失包裹
        if (missing_packages && missing_packages.length > 0) {
          await Package.update(
            { status: "missing" },
            { where: { id: missing_packages }, transaction }
          );
        }
      }

      // 记录入库完成日志
      await DeliveryOrderLog.create(
        {
          delivery_order_id: id,
          action: "delivery_completed",
          old_status: "arrived",
          new_status: "delivered",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `入库完成，接收人：${warehouse_receiver}`,
          metadata: {
            delivery_time: delivery_time || new Date(),
            warehouse_receiver,
            quality_check_result,
            storage_locations,
            damaged_packages: damaged_packages || [],
            missing_packages: missing_packages || [],
            total_packages: deliveryOrder.packages?.length || 0,
            normal_packages:
              deliveryOrder.packages?.length -
              (damaged_packages?.length || 0) -
              (missing_packages?.length || 0),
          },
        },
        { transaction }
      );

      // 同步相关实体状态
      await syncStatusOnDODelivery(
        id,
        {
          warehouse_receiver,
          damaged_packages,
          missing_packages,
        },
        transaction
      );

      await transaction.commit();

      res.json({
        message: "入库完成",
        do_number: deliveryOrder.do_number,
        status: "delivered",
        delivery_time: delivery_time || new Date(),
        summary: {
          total_packages: deliveryOrder.packages?.length || 0,
          normal_packages:
            deliveryOrder.packages?.length -
            (damaged_packages?.length || 0) -
            (missing_packages?.length || 0),
          damaged_packages: damaged_packages?.length || 0,
          missing_packages: missing_packages?.length || 0,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("完成入库失败:", error);
      res.status(500).json({ error: "完成入库失败" });
    }
  }
);

export default router;
