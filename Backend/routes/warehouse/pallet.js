import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";

const { Pallet, PalletLog, Package, Forecast, User } = db;
const router = express.Router();

// 获取所有板列表
router.get(
  "/",
  authenticate,
  checkPermission("warehouse.pallet.view"),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        location_code,
        forecast_id,
        is_unpacked,
        search,
      } = req.query;

      const offset = (page - 1) * limit;
      const where = {};

      if (status) where.status = status;
      if (location_code) where.location_code = location_code;
      if (forecast_id) where.forecast_id = forecast_id;
      if (is_unpacked !== undefined) where.is_unpacked = is_unpacked === "true";
      if (search) {
        where[db.Sequelize.Op.or] = [
          { pallet_code: { [db.Sequelize.Op.like]: `%${search}%` } },
          { custom_board_no: { [db.Sequelize.Op.like]: `%${search}%` } },
          { pallet_type: { [db.Sequelize.Op.like]: `%${search}%` } },
          { location_code: { [db.Sequelize.Op.like]: `%${search}%` } },
        ];
      }

      const pallets = await Pallet.findAndCountAll({
        where,
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code", "mawb", "flight_no"],
          },
          {
            model: User,
            as: "operatorUser",
            attributes: ["id", "username"],
          },
          {
            model: Package,
            as: "packages",
            attributes: ["id", "package_code", "status"],
          },
        ],
        limit: parseInt(limit),
        offset,
        order: [["created_at", "DESC"]],
      });

      res.json({
        pallets: pallets.rows,
        pagination: {
          total: pallets.count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(pallets.count / limit),
        },
      });
    } catch (error) {
      console.error("获取板列表失败:", error);
      res.status(500).json({ error: "获取板列表失败" });
    }
  }
);

// 创建新板
router.post(
  "/",
  authenticate,
  checkPermission("warehouse.pallet.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        pallet_code,
        custom_board_no,
        forecast_id,
        pallet_type,
        length_cm,
        width_cm,
        height_cm,
        weight_kg,
        location_code,
        remark,
      } = req.body;

      // 检查板号是否已存在
      const existingPallet = await Pallet.findOne({
        where: { pallet_code },
        transaction,
      });

      if (existingPallet) {
        await transaction.rollback();
        return res.status(400).json({ error: "板号已存在" });
      }

      // 检查预报单是否存在
      const forecast = await Forecast.findByPk(forecast_id, { transaction });
      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ error: "预报单不存在" });
      }

      // 创建板
      const pallet = await Pallet.create(
        {
          pallet_code,
          custom_board_no,
          forecast_id,
          pallet_type,
          length_cm,
          width_cm,
          height_cm,
          weight_kg,
          location_code,
          operator: req.user.username,
          operator_id: req.user.id,
          remark,
        },
        { transaction }
      );

      // 记录操作日志
      await PalletLog.create(
        {
          pallet_id: pallet.id,
          action: "created",
          new_status: "pending",
          new_location: location_code,
          operator: req.user.username,
          operator_id: req.user.id,
          description: `创建新板: ${pallet_code}`,
        },
        { transaction }
      );

      await transaction.commit();

      // 返回包含关联数据的板信息
      const newPallet = await Pallet.findByPk(pallet.id, {
        include: [
          { model: Forecast, as: "forecast" },
          { model: User, as: "operatorUser" },
        ],
      });

      res.status(201).json(newPallet);
    } catch (error) {
      await transaction.rollback();
      console.error("创建板失败:", error);
      res.status(500).json({ error: "创建板失败" });
    }
  }
);

// 更新板信息
router.put(
  "/:id",
  authenticate,
  checkPermission("warehouse.pallet.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        custom_board_no,
        pallet_type,
        length_cm,
        width_cm,
        height_cm,
        weight_kg,
        location_code,
        remark,
      } = req.body;

      const pallet = await Pallet.findByPk(id, { transaction });
      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ error: "板不存在" });
      }

      const oldLocation = pallet.location_code;
      const oldStatus = pallet.status;

      // 更新板信息
      await pallet.update(
        {
          custom_board_no,
          pallet_type,
          length_cm,
          width_cm,
          height_cm,
          weight_kg,
          location_code,
          operator: req.user.username,
          operator_id: req.user.id,
          position_updated_at: new Date(),
          remark,
        },
        { transaction }
      );

      // 如果位置发生变化，记录日志
      if (oldLocation !== location_code) {
        await PalletLog.create(
          {
            pallet_id: pallet.id,
            action: "location_updated",
            old_location: oldLocation,
            new_location: location_code,
            operator: req.user.username,
            operator_id: req.user.id,
            description: `位置变更: ${oldLocation} → ${location_code}`,
          },
          { transaction }
        );
      }

      await transaction.commit();

      const updatedPallet = await Pallet.findByPk(id, {
        include: [
          { model: Forecast, as: "forecast" },
          { model: User, as: "operatorUser" },
        ],
      });

      res.json(updatedPallet);
    } catch (error) {
      await transaction.rollback();
      console.error("更新板信息失败:", error);
      res.status(500).json({ error: "更新板信息失败" });
    }
  }
);

// 板入仓
router.post(
  "/:id/inbound",
  authenticate,
  checkPermission("warehouse.pallet.inbound"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { location_code } = req.body;

      const pallet = await Pallet.findByPk(id, { transaction });
      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ error: "板不存在" });
      }

      if (pallet.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({ error: "板状态不允许入仓操作" });
      }

      // 更新板状态
      await pallet.update(
        {
          status: "stored",
          location_code,
          inbound_time: new Date(),
          operator: req.user.username,
          operator_id: req.user.id,
          position_updated_at: new Date(),
        },
        { transaction }
      );

      // 记录操作日志
      await PalletLog.create(
        {
          pallet_id: pallet.id,
          action: "inbound",
          old_status: "pending",
          new_status: "stored",
          new_location: location_code,
          operator: req.user.username,
          operator_id: req.user.id,
          description: `板入仓，位置: ${location_code}`,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({ message: "板入仓成功", pallet });
    } catch (error) {
      await transaction.rollback();
      console.error("板入仓失败:", error);
      res.status(500).json({ error: "板入仓失败" });
    }
  }
);

// 拆板操作
router.post(
  "/:id/unpack",
  authenticate,
  checkPermission("warehouse.pallet.unpack"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { remark } = req.body;

      const pallet = await Pallet.findByPk(id, {
        include: [{ model: Package, as: "packages" }],
        transaction,
      });

      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ error: "板不存在" });
      }

      if (pallet.is_unpacked) {
        await transaction.rollback();
        return res.status(400).json({ error: "板已经拆过了" });
      }

      // 更新板状态
      await pallet.update(
        {
          is_unpacked: true,
          status: "unpacked",
          operator: req.user.username,
          operator_id: req.user.id,
          position_updated_at: new Date(),
          remark: remark || pallet.remark,
        },
        { transaction }
      );

      // 记录操作日志
      await PalletLog.create(
        {
          pallet_id: pallet.id,
          action: "unpacked",
          old_status: pallet.status,
          new_status: "unpacked",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `拆板操作，包裹数量: ${pallet.packages.length}`,
          metadata: { package_count: pallet.packages.length },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({ message: "拆板成功", pallet });
    } catch (error) {
      await transaction.rollback();
      console.error("拆板操作失败:", error);
      res.status(500).json({ error: "拆板操作失败" });
    }
  }
);

// 板出库
router.post(
  "/:id/dispatch",
  authenticate,
  checkPermission("warehouse.pallet.dispatch"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { is_full_board, remark } = req.body;

      const pallet = await Pallet.findByPk(id, { transaction });
      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ error: "板不存在" });
      }

      // 更新板状态
      await pallet.update(
        {
          status: "dispatched",
          is_full_board: is_full_board || false,
          operator: req.user.username,
          operator_id: req.user.id,
          position_updated_at: new Date(),
          remark: remark || pallet.remark,
        },
        { transaction }
      );

      // 记录操作日志
      await PalletLog.create(
        {
          pallet_id: pallet.id,
          action: "dispatched",
          old_status: pallet.status,
          new_status: "dispatched",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `板出库，${is_full_board ? "整板出库" : "拆包出库"}`,
          metadata: { is_full_board },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({ message: "板出库成功", pallet });
    } catch (error) {
      await transaction.rollback();
      console.error("板出库失败:", error);
      res.status(500).json({ error: "板出库失败" });
    }
  }
);

// 板归还
router.post(
  "/:id/return",
  authenticate,
  checkPermission("warehouse.pallet.return"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { remark } = req.body;

      const pallet = await Pallet.findByPk(id, { transaction });
      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ error: "板不存在" });
      }

      // 更新板状态
      await pallet.update(
        {
          status: "returned",
          returned_time: new Date(),
          operator: req.user.username,
          operator_id: req.user.id,
          remark: remark || pallet.remark,
        },
        { transaction }
      );

      // 记录操作日志
      await PalletLog.create(
        {
          pallet_id: pallet.id,
          action: "returned",
          old_status: pallet.status,
          new_status: "returned",
          operator: req.user.username,
          operator_id: req.user.id,
          description: "板归还操作",
        },
        { transaction }
      );

      await transaction.commit();

      res.json({ message: "板归还成功", pallet });
    } catch (error) {
      await transaction.rollback();
      console.error("板归还失败:", error);
      res.status(500).json({ error: "板归还失败" });
    }
  }
);

// 获取板的操作日志
router.get(
  "/:id/logs",
  authenticate,
  checkPermission("warehouse.pallet.logs"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const logs = await PalletLog.findAndCountAll({
        where: { pallet_id: id },
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
      console.error("获取板日志失败:", error);
      res.status(500).json({ error: "获取板日志失败" });
    }
  }
);

// 获取板状态统计
router.get(
  "/statistics",
  authenticate,
  checkPermission("warehouse.pallet.view"),
  async (req, res) => {
    try {
      const stats = await Pallet.findAll({
        attributes: [
          "status",
          [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"],
        ],
        group: ["status"],
      });

      const unpackedStats = await Pallet.findAll({
        attributes: [
          "is_unpacked",
          [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"],
        ],
        group: ["is_unpacked"],
      });

      res.json({
        statusStats: stats,
        unpackedStats,
      });
    } catch (error) {
      console.error("获取板统计失败:", error);
      res.status(500).json({ error: "获取板统计失败" });
    }
  }
);

// 扫描箱唛绑定包裹到板
router.post(
  "/:id/scan-package",
  authenticate,
  checkPermission("warehouse.pallet.scan"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id: palletId } = req.params;
      const { package_code, tracking_no, mawb, hawb } = req.body;

      // 查找板信息
      const pallet = await Pallet.findByPk(palletId, {
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code"],
          },
        ],
        transaction,
      });

      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ error: "板不存在" });
      }

      // 构建查询条件，支持多种扫描方式
      const packageWhere = {};
      if (package_code) {
        packageWhere.package_code = package_code;
      } else if (tracking_no) {
        packageWhere.tracking_no = tracking_no;
      } else if (mawb) {
        packageWhere.mawb = mawb;
      } else if (hawb) {
        packageWhere.hawb = hawb;
      } else {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "请提供包裹编号、追踪号、MAWB或HAWB" });
      }

      // 查找包裹
      const packageToScan = await Package.findOne({
        where: packageWhere,
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code"],
          },
          {
            model: Pallet,
            as: "pallet",
            attributes: ["id", "pallet_code"],
            required: false,
          },
        ],
        transaction,
      });

      if (!packageToScan) {
        await transaction.rollback();
        return res.status(404).json({ error: "包裹不存在" });
      }

      // 验证：包裹是否属于该预报单
      if (packageToScan.forecast_id !== pallet.forecast_id) {
        await transaction.rollback();
        return res.status(400).json({
          error: "包裹不属于该预报单",
          details: {
            package_forecast: packageToScan.forecast?.forecast_code,
            pallet_forecast: pallet.forecast?.forecast_code,
          },
        });
      }

      // 验证：包裹是否已被绑定到其他板
      if (
        packageToScan.pallet_id &&
        packageToScan.pallet_id !== parseInt(palletId)
      ) {
        await transaction.rollback();
        return res.status(400).json({
          error: "包裹已绑定到其他板",
          details: {
            current_pallet: packageToScan.pallet?.pallet_code,
          },
        });
      }

      // 如果包裹已经绑定到当前板，返回提示
      if (packageToScan.pallet_id === parseInt(palletId)) {
        await transaction.rollback();
        return res.status(400).json({ error: "包裹已绑定到当前板" });
      }

      // 绑定包裹到板
      await packageToScan.update(
        {
          pallet_id: palletId,
          last_scanned_at: new Date(),
        },
        { transaction }
      );

      // 若包裹属于某入库单，联动更新 inbond.last_package_scan_at
      if (packageToScan.inbond_id) {
        db.Inbond.update(
          { last_package_scan_at: new Date() },
          { where: { id: packageToScan.inbond_id } }
        ).catch(() => {});
      }

      // 更新板的包裹数量和重量
      const palletPackages = await Package.findAll({
        where: { pallet_id: palletId },
        transaction,
      });

      const totalWeight = palletPackages.reduce((sum, pkg) => {
        return sum + (parseFloat(pkg.weight_kg) || 0);
      }, 0);

      await pallet.update(
        {
          box_count: palletPackages.length,
          weight_kg: totalWeight,
          operator: req.user.username,
          operator_id: req.user.id,
          position_updated_at: new Date(),
        },
        { transaction }
      );

      // 记录操作日志
      await PalletLog.create(
        {
          pallet_id: palletId,
          action: "packed",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `扫描绑定包裹: ${packageToScan.package_code}`,
          metadata: {
            package_id: packageToScan.id,
            package_code: packageToScan.package_code,
            package_weight: packageToScan.weight_kg,
            total_packages: palletPackages.length,
            total_weight: totalWeight,
          },
        },
        { transaction }
      );

      await transaction.commit();

      // 返回更新后的板信息
      const updatedPallet = await Pallet.findByPk(palletId, {
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code", "mawb"],
          },
          {
            model: Package,
            as: "packages",
            attributes: ["id", "package_code", "weight_kg", "status"],
          },
        ],
      });

      res.json({
        message: "包裹绑定成功",
        pallet: updatedPallet,
        scanned_package: {
          id: packageToScan.id,
          package_code: packageToScan.package_code,
          weight_kg: packageToScan.weight_kg,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("扫描绑定包裹失败:", error);
      res.status(500).json({ error: "扫描绑定包裹失败" });
    }
  }
);

// 移除板上的包裹
router.post(
  "/:id/remove-package",
  authenticate,
  checkPermission("warehouse.pallet.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id: palletId } = req.params;
      const { package_id } = req.body;

      const pallet = await Pallet.findByPk(palletId, { transaction });
      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ error: "板不存在" });
      }

      const packageToRemove = await Package.findByPk(package_id, {
        transaction,
      });
      if (!packageToRemove) {
        await transaction.rollback();
        return res.status(404).json({ error: "包裹不存在" });
      }

      if (packageToRemove.pallet_id !== parseInt(palletId)) {
        await transaction.rollback();
        return res.status(400).json({ error: "包裹不在此板上" });
      }

      // 移除包裹绑定
      await packageToRemove.update(
        {
          pallet_id: null,
          last_scanned_at: new Date(),
        },
        { transaction }
      );

      if (packageToRemove.inbond_id) {
        db.Inbond.update(
          { last_package_scan_at: new Date() },
          { where: { id: packageToRemove.inbond_id } }
        ).catch(() => {});
      }

      // 更新板的包裹数量和重量
      const palletPackages = await Package.findAll({
        where: { pallet_id: palletId },
        transaction,
      });

      const totalWeight = palletPackages.reduce((sum, pkg) => {
        return sum + (parseFloat(pkg.weight_kg) || 0);
      }, 0);

      await pallet.update(
        {
          box_count: palletPackages.length,
          weight_kg: totalWeight,
          operator: req.user.username,
          operator_id: req.user.id,
          position_updated_at: new Date(),
        },
        { transaction }
      );

      // 记录操作日志
      await PalletLog.create(
        {
          pallet_id: palletId,
          action: "unpacked",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `移除包裹: ${packageToRemove.package_code}`,
          metadata: {
            package_id: packageToRemove.id,
            package_code: packageToRemove.package_code,
            package_weight: packageToRemove.weight_kg,
            total_packages: palletPackages.length,
            total_weight: totalWeight,
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "包裹移除成功",
        removed_package: {
          id: packageToRemove.id,
          package_code: packageToRemove.package_code,
        },
        pallet_stats: {
          box_count: palletPackages.length,
          total_weight: totalWeight,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("移除包裹失败:", error);
      res.status(500).json({ error: "移除包裹失败" });
    }
  }
);

// 通过扫描取消绑定包裹
router.post(
  "/:id/unscan-package",
  authenticate,
  checkPermission("warehouse.pallet.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id: palletId } = req.params;
      const { package_code, tracking_no, mawb, hawb } = req.body;

      // 构建查询条件，支持多种扫描方式
      const packageWhere = { pallet_id: palletId };
      if (package_code) {
        packageWhere.package_code = package_code;
      } else if (tracking_no) {
        packageWhere.tracking_no = tracking_no;
      } else if (mawb) {
        packageWhere.mawb = mawb;
      } else if (hawb) {
        packageWhere.hawb = hawb;
      } else {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "请提供包裹编号、追踪号、MAWB或HAWB" });
      }

      // 查找要移除的包裹
      const packageToRemove = await Package.findOne({
        where: packageWhere,
        transaction,
      });

      if (!packageToRemove) {
        await transaction.rollback();
        return res.status(404).json({ error: "在此板上未找到该包裹" });
      }

      const pallet = await Pallet.findByPk(palletId, { transaction });
      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ error: "板不存在" });
      }

      // 移除包裹绑定
      await packageToRemove.update(
        {
          pallet_id: null,
          last_scanned_at: new Date(),
        },
        { transaction }
      );

      // 更新板的包裹数量和重量
      const palletPackages = await Package.findAll({
        where: { pallet_id: palletId },
        transaction,
      });

      const totalWeight = palletPackages.reduce((sum, pkg) => {
        return sum + (parseFloat(pkg.weight_kg) || 0);
      }, 0);

      await pallet.update(
        {
          box_count: palletPackages.length,
          weight_kg: totalWeight,
          operator: req.user.username,
          operator_id: req.user.id,
          position_updated_at: new Date(),
        },
        { transaction }
      );

      // 记录操作日志
      await PalletLog.create(
        {
          pallet_id: palletId,
          action: "unpacked",
          operator: req.user.username,
          operator_id: req.user.id,
          description: `扫描移除包裹: ${packageToRemove.package_code}`,
          metadata: {
            scan_type: package_code
              ? "package_code"
              : tracking_no
              ? "tracking_no"
              : mawb
              ? "mawb"
              : "hawb",
            scan_value: package_code || tracking_no || mawb || hawb,
            package_id: packageToRemove.id,
            package_code: packageToRemove.package_code,
            package_weight: packageToRemove.weight_kg,
            total_packages: palletPackages.length,
            total_weight: totalWeight,
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "包裹移除成功",
        removed_package: {
          id: packageToRemove.id,
          package_code: packageToRemove.package_code,
          weight_kg: packageToRemove.weight_kg,
        },
        pallet_stats: {
          box_count: palletPackages.length,
          total_weight: totalWeight,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("扫描移除包裹失败:", error);
      res.status(500).json({ error: "扫描移除包裹失败" });
    }
  }
);

// 获取板详情及包裹列表
router.get(
  "/:id/packages",
  authenticate,
  checkPermission("warehouse.pallet.view"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const pallet = await Pallet.findByPk(id, {
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code", "mawb", "flight_no"],
          },
          {
            model: User,
            as: "operatorUser",
            attributes: ["id", "username"],
          },
        ],
      });

      if (!pallet) {
        return res.status(404).json({ error: "板不存在" });
      }

      const packages = await Package.findAndCountAll({
        where: { pallet_id: id },
        include: [
          {
            model: User,
            as: "client",
            attributes: ["id", "username"],
          },
        ],
        attributes: [
          "id",
          "package_code",
          "weight_kg",
          "status",
          "remark",
          "created_at",
        ],
        limit: parseInt(limit),
        offset,
        order: [["created_at", "DESC"]],
      });

      res.json({
        pallet: {
          id: pallet.id,
          pallet_code: pallet.pallet_code,
          custom_board_no: pallet.custom_board_no,
          pallet_type: pallet.pallet_type,
          status: pallet.status,
          location_code: pallet.location_code,
          box_count: pallet.box_count,
          weight_kg: pallet.weight_kg,
          is_unpacked: pallet.is_unpacked,
          forecast: pallet.forecast,
          operator: pallet.operatorUser,
        },
        packages: packages.rows,
        pagination: {
          total: packages.count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(packages.count / limit),
        },
      });
    } catch (error) {
      console.error("获取板包裹列表失败:", error);
      res.status(500).json({ error: "获取板包裹列表失败" });
    }
  }
);

export default router;
