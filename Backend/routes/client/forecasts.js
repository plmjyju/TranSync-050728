// routes/client/forecasts.js
import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
const router = express.Router();

// 获取包含客户自己包裹的预报单列表
router.get(
  "/",
  authenticate,
  checkPermission("client.forecast.view"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, status, mawb, flight_no } = req.query;
      const offset = (page - 1) * limit;

      // 构建查询条件 - 只查找包含该客户包裹的预报单
      const whereClause = {};
      if (status) whereClause.status = status;
      if (mawb) whereClause.mawb = { [db.Sequelize.Op.like]: `%${mawb}%` };
      if (flight_no)
        whereClause.flight_no = { [db.Sequelize.Op.like]: `%${flight_no}%` };

      const { count, rows: forecasts } = await db.Forecast.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: db.Package,
            as: "packages",
            where: { client_id: req.user.id }, // 只包含属于该客户的包裹
            required: true, // 内连接，只返回有该客户包裹的预报单
            attributes: [
              "id",
              "package_code",
              "weight_kg",
              "status",
              "tracking_no",
              "mawb",
              "hawb",
            ],
          },
          {
            model: db.User,
            as: "agent",
            attributes: ["username", "full_name"],
          },
        ],
        order: [["created_at", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        distinct: true, // 避免重复计数
      });

      res.json({
        forecasts,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (err) {
      console.error("获取预报单列表出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 获取客户的包裹统计信息（放在明细路由前，避免被/:id 截获）
router.get(
  "/stats",
  authenticate,
  checkPermission("client.forecast.view"),
  async (req, res) => {
    try {
      // 按预报单状态统计客户的包裹
      const packageStats = await db.Package.findAll({
        where: { client_id: req.user.id },
        include: [
          {
            model: db.Forecast,
            as: "forecast",
            attributes: ["status"],
          },
        ],
        attributes: [
          [db.Sequelize.col("forecast.status"), "forecast_status"],
          [
            db.Sequelize.fn("COUNT", db.Sequelize.col("Package.id")),
            "package_count",
          ],
          [
            db.Sequelize.fn("SUM", db.Sequelize.col("Package.weight_kg")),
            "total_weight",
          ],
        ],
        group: ["forecast.status"],
        raw: true,
      });

      // 按包裹状态统计
      const statusStats = await db.Package.findAll({
        where: { client_id: req.user.id },
        attributes: [
          "status",
          [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"],
          [
            db.Sequelize.fn("SUM", db.Sequelize.col("weight_kg")),
            "total_weight",
          ],
        ],
        group: ["status"],
        raw: true,
      });

      // 总体统计
      const totalStats = await db.Package.findOne({
        where: { client_id: req.user.id },
        attributes: [
          [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "total_packages"],
          [
            db.Sequelize.fn("SUM", db.Sequelize.col("weight_kg")),
            "total_weight",
          ],
          [
            db.Sequelize.fn(
              "COUNT",
              db.Sequelize.fn("DISTINCT", db.Sequelize.col("forecast_id"))
            ),
            "forecast_count",
          ],
        ],
        raw: true,
      });

      res.json({
        by_forecast_status: packageStats,
        by_package_status: statusStats,
        total: totalStats,
      });
    } catch (err) {
      console.error("获取包裹统计出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 获取预报单详情（只显示属于该客户的包裹）
router.get(
  "/:id",
  authenticate,
  checkPermission("client.forecast.view"),
  async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      // 首先检查预报单是否存在
      const forecast = await db.Forecast.findByPk(req.params.id, {
        attributes: [
          "id",
          "forecast_code",
          "mawb",
          "flight_no",
          "departure_port",
          "destination_port",
          "etd",
          "eta",
          "status",
          "created_at",
        ],
        include: [
          {
            model: db.User,
            as: "agent",
            attributes: ["username", "full_name"],
          },
        ],
      });

      if (!forecast) {
        return res.status(404).json({ message: "预报单不存在" });
      }

      // 获取该预报单中属于当前客户的包裹
      const { count, rows: packages } = await db.Package.findAndCountAll({
        where: {
          forecast_id: req.params.id,
          client_id: req.user.id, // 只显示属于该客户的包裹
        },
        attributes: [
          "id",
          "package_code",
          "weight_kg",
          "status",
          "tracking_no",
          "mawb",
          "hawb",
          "created_at",
        ],
        include: [
          {
            model: db.Pallet,
            as: "pallet",
            attributes: ["id", "pallet_code", "pallet_type", "location_code"],
            required: false,
          },
        ],
        order: [["created_at", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      // 如果该客户在这个预报单中没有包裹，返回403
      if (count === 0) {
        return res.status(403).json({ message: "您在此预报单中没有包裹" });
      }

      res.json({
        forecast: {
          ...forecast.toJSON(),
          client_package_count: count, // 客户在此预报单中的包裹数量
          total_package_count: await db.Package.count({
            where: { forecast_id: req.params.id },
          }), // 预报单总包裹数
        },
        packages,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (err) {
      console.error("获取预报单详情出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

export default router;
