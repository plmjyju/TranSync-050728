// routes/omp/forecasts.js - 运营管理平台的预报单管理
import express from "express";
import db from "../../models/index.js";
import { syncMAWBToPackages } from "../../utils/syncMAWBToPackages.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
const router = express.Router();

// 获取所有预报单（运营管理）
router.get(
  "/forecasts",
  authenticate,
  checkPermission("omp.forecast.view"),
  async (req, res) => {
    try {
      const {
        status,
        mawb,
        flight_no,
        date_from,
        date_to,
        page = 1,
        limit = 20,
      } = req.query;

      const whereClause = {};
      if (status) whereClause.status = status;
      if (mawb) whereClause.mawb = { [db.Sequelize.Op.like]: `%${mawb}%` };
      if (flight_no)
        whereClause.flight_no = { [db.Sequelize.Op.like]: `%${flight_no}%` };
      if (date_from || date_to) {
        whereClause.created_at = {};
        if (date_from)
          whereClause.created_at[db.Sequelize.Op.gte] = new Date(date_from);
        if (date_to)
          whereClause.created_at[db.Sequelize.Op.lte] = new Date(date_to);
      }

      const offset = (page - 1) * limit;

      const { count, rows: forecasts } = await db.Forecast.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: db.User,
            as: "creator",
            attributes: ["username", "company_name"],
          },
          {
            model: db.Package,
            as: "packages",
            attributes: ["id", "package_code", "weight_kg", "status"],
          },
        ],
        order: [["created_at", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset),
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

// 运营平台更新预报单MAWB
router.patch(
  "/forecasts/:id/mawb",
  authenticate,
  checkPermission("omp.forecast.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { mawb } = req.body;

      const forecast = await db.Forecast.findByPk(id, { transaction });
      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ message: "预报单不存在" });
      }

      // 记录旧MAWB用于日志
      const oldMAWB = forecast.mawb;

      // 更新预报单的MAWB
      forecast.mawb = mawb;
      await forecast.save({ transaction });

      // 使用工具函数同步更新包裹的MAWB字段
      const updatedPackages = await syncMAWBToPackages(id, mawb, transaction);

      // 记录操作日志
      await db.SystemLog.create(
        {
          user_id: req.user.id,
          action: "update_forecast_mawb",
          target_type: "forecast",
          target_id: id,
          description: `运营管理：更新预报单${forecast.forecast_code}的MAWB从${oldMAWB}到${mawb}，同步更新${updatedPackages}个包裹`,
          ip_address: req.ip,
          user_agent: req.headers["user-agent"],
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "✅ 运营管理：MAWB 更新成功，已同步到包裹",
        mawb,
        old_mawb: oldMAWB,
        updated_packages: updatedPackages,
        forecast_code: forecast.forecast_code,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("运营管理更新 MAWB 出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 运营平台批量更新预报单状态
router.patch(
  "/forecasts/batch-status",
  authenticate,
  checkPermission("omp.forecast.batch"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { forecast_ids, status } = req.body;

      if (
        !forecast_ids ||
        !Array.isArray(forecast_ids) ||
        forecast_ids.length === 0
      ) {
        await transaction.rollback();
        return res.status(400).json({ message: "请提供预报单ID列表" });
      }

      const updateResult = await db.Forecast.update(
        { status },
        {
          where: {
            id: {
              [db.Sequelize.Op.in]: forecast_ids,
            },
          },
          transaction,
        }
      );

      // 记录批量操作日志
      await db.SystemLog.create(
        {
          user_id: req.user.id,
          action: "batch_update_forecast_status",
          target_type: "forecast",
          description: `运营管理：批量更新${updateResult[0]}个预报单状态为${status}`,
          metadata: JSON.stringify({ forecast_ids, status }),
          ip_address: req.ip,
          user_agent: req.headers["user-agent"],
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: `✅ 批量更新成功`,
        updated_count: updateResult[0],
        status,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("批量更新预报单状态出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 获取预报单统计数据
router.get(
  "/forecasts/stats",
  authenticate,
  checkPermission("omp.statistics.view"),
  async (req, res) => {
    try {
      const stats = await db.Forecast.findAll({
        attributes: [
          "status",
          [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"],
          [db.Sequelize.fn("SUM", db.Sequelize.col("weight")), "total_weight"],
          [
            db.Sequelize.fn("SUM", db.Sequelize.col("box_count")),
            "total_boxes",
          ],
        ],
        group: ["status"],
        raw: true,
      });

      const totalStats = await db.Forecast.findOne({
        attributes: [
          [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "total_forecasts"],
          [db.Sequelize.fn("SUM", db.Sequelize.col("weight")), "total_weight"],
          [
            db.Sequelize.fn("SUM", db.Sequelize.col("box_count")),
            "total_boxes",
          ],
        ],
        raw: true,
      });

      res.json({
        by_status: stats,
        total: totalStats,
      });
    } catch (err) {
      console.error("获取预报单统计出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 运营管理：为预报单中的客户分配/更新HAWB
router.patch(
  "/forecasts/:id/hawb",
  authenticate,
  checkPermission("omp.forecast.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id: forecast_id } = req.params;
      const { client_id, hawb } = req.body;

      const forecast = await db.Forecast.findByPk(forecast_id, { transaction });
      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ message: "预报单不存在" });
      }

      // 验证客户是否存在
      const client = await db.User.findOne({
        where: {
          id: client_id,
          client_type: "client",
        },
        transaction,
      });

      if (!client) {
        await transaction.rollback();
        return res.status(404).json({ message: "客户不存在" });
      }

      // 记录旧HAWB（用于日志）
      const oldPackage = await db.Package.findOne({
        where: {
          forecast_id: forecast_id,
          client_id: client_id,
        },
        attributes: ["hawb"],
        transaction,
      });

      // 更新该客户在此预报单中的所有包裹的HAWB
      const updateResult = await db.Package.update(
        { hawb: hawb },
        {
          where: {
            forecast_id: forecast_id,
            client_id: client_id,
          },
          transaction,
        }
      );

      if (updateResult[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: "该客户在此预报单中没有包裹" });
      }

      // 记录运营管理操作日志
      await db.SystemLog.create(
        {
          user_id: req.user.id,
          action: "update_hawb",
          target_type: "forecast",
          target_id: forecast_id,
          description: `运营管理：更新预报单${forecast.forecast_code}中客户${
            client.username
          }的HAWB从${oldPackage?.hawb || "无"}到${hawb}，影响${
            updateResult[0]
          }个包裹`,
          metadata: JSON.stringify({
            client_id,
            old_hawb: oldPackage?.hawb,
            new_hawb: hawb,
            updated_packages: updateResult[0],
          }),
          ip_address: req.ip,
          user_agent: req.headers["user-agent"],
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "✅ 运营管理：HAWB 分配成功",
        hawb,
        old_hawb: oldPackage?.hawb,
        client_name: client.username,
        updated_packages: updateResult[0],
        forecast_code: forecast.forecast_code,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("运营管理分配 HAWB 出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 运营管理：获取预报单中各客户的HAWB分配情况
router.get(
  "/forecasts/:id/hawb-assignments",
  authenticate,
  checkPermission("omp.forecast.view"),
  async (req, res) => {
    try {
      const { id: forecast_id } = req.params;

      const forecast = await db.Forecast.findByPk(forecast_id);
      if (!forecast) {
        return res.status(404).json({ message: "预报单不存在" });
      }

      // 按客户分组查询HAWB分配情况
      const hawbAssignments = await db.Package.findAll({
        where: { forecast_id: forecast_id },
        attributes: [
          "client_id",
          "hawb",
          [
            db.Sequelize.fn("COUNT", db.Sequelize.col("Package.id")),
            "package_count",
          ],
          [
            db.Sequelize.fn("SUM", db.Sequelize.col("Package.weight_kg")),
            "total_weight",
          ],
        ],
        include: [
          {
            model: db.User,
            as: "client",
            attributes: ["id", "username", "company_name", "email"],
          },
        ],
        group: ["client_id", "hawb", "client.id"],
        order: [["client_id", "ASC"]],
      });

      // 获取预报单创建者信息
      const creator = await db.User.findByPk(forecast.created_by, {
        attributes: ["username", "company_name"],
      });

      res.json({
        forecast: {
          id: forecast.id,
          forecast_code: forecast.forecast_code,
          mawb: forecast.mawb,
          status: forecast.status,
          creator: creator,
        },
        hawb_assignments: hawbAssignments,
      });
    } catch (err) {
      console.error("运营管理获取HAWB分配情况出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 运营管理：批量分配HAWB给多个客户
router.post(
  "/forecasts/:id/batch-hawb",
  authenticate,
  checkPermission("omp.forecast.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id: forecast_id } = req.params;
      const { assignments } = req.body; // [{ client_id, hawb }, ...]

      const forecast = await db.Forecast.findByPk(forecast_id, { transaction });
      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ message: "预报单不存在" });
      }

      if (
        !assignments ||
        !Array.isArray(assignments) ||
        assignments.length === 0
      ) {
        await transaction.rollback();
        return res.status(400).json({ message: "请提供HAWB分配信息" });
      }

      const results = [];
      let totalUpdatedPackages = 0;

      for (const assignment of assignments) {
        const { client_id, hawb } = assignment;

        // 验证客户是否存在
        const client = await db.User.findByPk(client_id, { transaction });
        if (!client || client.client_type !== "client") {
          continue; // 跳过无效客户
        }

        // 获取旧HAWB用于日志
        const oldPackage = await db.Package.findOne({
          where: {
            forecast_id: forecast_id,
            client_id: client_id,
          },
          attributes: ["hawb"],
          transaction,
        });

        // 更新该客户的包裹HAWB
        const updateResult = await db.Package.update(
          { hawb: hawb },
          {
            where: {
              forecast_id: forecast_id,
              client_id: client_id,
            },
            transaction,
          }
        );

        if (updateResult[0] > 0) {
          results.push({
            client_id,
            client_name: client.username,
            old_hawb: oldPackage?.hawb,
            new_hawb: hawb,
            updated_packages: updateResult[0],
          });
          totalUpdatedPackages += updateResult[0];
        }
      }

      // 记录批量操作日志
      await db.SystemLog.create(
        {
          user_id: req.user.id,
          action: "batch_update_hawb",
          target_type: "forecast",
          target_id: forecast_id,
          description: `运营管理：批量更新预报单${forecast.forecast_code}的HAWB分配，涉及${results.length}个客户，总共${totalUpdatedPackages}个包裹`,
          metadata: JSON.stringify({ results }),
          ip_address: req.ip,
          user_agent: req.headers["user-agent"],
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "✅ 运营管理：批量HAWB分配完成",
        forecast_code: forecast.forecast_code,
        total_clients: results.length,
        total_packages: totalUpdatedPackages,
        results,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("运营管理批量分配 HAWB 出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 运营管理：获取全局HAWB统计信息
router.get(
  "/hawb/global-stats",
  authenticate,
  checkPermission("omp.statistics.view"),
  async (req, res) => {
    try {
      // 按HAWB分组统计
      const hawbStats = await db.Package.findAll({
        attributes: [
          "hawb",
          [
            db.Sequelize.fn("COUNT", db.Sequelize.col("Package.id")),
            "package_count",
          ],
          [
            db.Sequelize.fn("SUM", db.Sequelize.col("Package.weight_kg")),
            "total_weight",
          ],
          [
            db.Sequelize.fn(
              "COUNT",
              db.Sequelize.fn(
                "DISTINCT",
                db.Sequelize.col("Package.forecast_id")
              )
            ),
            "forecast_count",
          ],
          [
            db.Sequelize.fn(
              "COUNT",
              db.Sequelize.fn("DISTINCT", db.Sequelize.col("Package.client_id"))
            ),
            "client_count",
          ],
        ],
        where: {
          hawb: {
            [db.Sequelize.Op.not]: null,
          },
        },
        group: ["hawb"],
        order: [
          [db.Sequelize.fn("COUNT", db.Sequelize.col("Package.id")), "DESC"],
        ],
        limit: 50, // 限制返回数量
      });

      // 总体统计
      const totalStats = await db.Package.findOne({
        attributes: [
          [
            db.Sequelize.fn(
              "COUNT",
              db.Sequelize.fn("DISTINCT", db.Sequelize.col("hawb"))
            ),
            "total_hawbs",
          ],
          [
            db.Sequelize.fn("COUNT", db.Sequelize.col("id")),
            "total_packages_with_hawb",
          ],
        ],
        where: {
          hawb: {
            [db.Sequelize.Op.not]: null,
          },
        },
        raw: true,
      });

      res.json({
        hawb_stats: hawbStats,
        total: totalStats,
      });
    } catch (err) {
      console.error("获取全局HAWB统计出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

export default router;
