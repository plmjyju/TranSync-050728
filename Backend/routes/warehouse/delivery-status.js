import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import {
  syncStatusOnDOCreation,
  syncStatusOnDODelivery,
} from "../../utils/syncDeliveryStatus.js";

const router = express.Router();
const { Forecast, Package, DeliveryOrder, DeliveryOrderPackage } = db;

// 更新交付状态
router.post(
  "/:id/update-delivery",
  authenticate,
  checkPermission("warehouse.delivery_order.delivery"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        delivery_status,
        delivered_package_ids = [],
        incident_package_ids = [],
        delivery_notes,
        operator_notes,
      } = req.body;

      const forecast = await Forecast.findByPk(id, {
        include: [
          {
            model: Package,
            as: "packages",
            attributes: ["id", "package_code", "status"],
          },
        ],
        transaction,
      });

      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ error: "预报单不存在" });
      }

      // 更新已交付包裹的状态
      if (delivered_package_ids.length > 0) {
        await Package.update(
          { status: "delivered" },
          {
            where: { id: delivered_package_ids },
            transaction,
          }
        );
      }

      // 更新异常包裹的状态
      if (incident_package_ids.length > 0) {
        await Package.update(
          { status: "incident" },
          {
            where: { id: incident_package_ids },
            transaction,
          }
        );
      }

      // 计算交付进度
      const totalPackages = forecast.packages.length;
      const deliveredCount = delivered_package_ids.length;
      const incidentCount = incident_package_ids.length;

      let finalDeliveryStatus;
      let hasIncident = incidentCount > 0;

      if (deliveredCount === 0 && incidentCount === 0) {
        finalDeliveryStatus = "pending";
      } else if (deliveredCount + incidentCount < totalPackages) {
        finalDeliveryStatus = "partial_delivered";
      } else if (incidentCount > 0) {
        finalDeliveryStatus = "incident";
      } else {
        finalDeliveryStatus = "completed";
      }

      // 更新预报单的交付状态
      await forecast.update(
        {
          delivery_status: finalDeliveryStatus,
          delivered_packages: deliveredCount,
          incident_packages: incidentCount,
          has_incident: hasIncident,
          operator: req.user.username,
          operator_id: req.user.id,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "交付状态更新成功",
        forecast_code: forecast.forecast_code,
        delivery_status: finalDeliveryStatus,
        delivered_packages: deliveredCount,
        incident_packages: incidentCount,
        total_packages: totalPackages,
        delivery_progress: `${deliveredCount}/${totalPackages}`,
        has_incident: hasIncident,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新交付状态失败:", error);
      res.status(500).json({ error: "更新交付状态失败" });
    }
  }
);

// 批量交付操作
router.post(
  "/batch-delivery",
  authenticate,
  checkPermission("warehouse.delivery_order.delivery"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { forecast_ids, delivery_status, operator_notes } = req.body;

      if (!forecast_ids || !Array.isArray(forecast_ids)) {
        await transaction.rollback();
        return res.status(400).json({ error: "请提供有效的预报单ID列表" });
      }

      const results = [];

      for (const forecastId of forecast_ids) {
        const forecast = await Forecast.findByPk(forecastId, {
          include: [
            {
              model: Package,
              as: "packages",
              attributes: ["id", "package_code", "status"],
            },
          ],
          transaction,
        });

        if (forecast) {
          // 更新预报单交付状态
          await forecast.update(
            {
              delivery_status,
              operator: req.user.username,
              operator_id: req.user.id,
            },
            { transaction }
          );

          // 如果是完成交付，更新所有包裹状态
          if (delivery_status === "completed") {
            const packageIds = forecast.packages.map((pkg) => pkg.id);
            await Package.update(
              { status: "delivered" },
              {
                where: { id: packageIds },
                transaction,
              }
            );

            await forecast.update(
              { delivered_packages: packageIds.length },
              { transaction }
            );
          }

          results.push({
            forecast_id: forecastId,
            forecast_code: forecast.forecast_code,
            delivery_status,
            total_packages: forecast.packages.length,
            status: "success",
          });
        } else {
          results.push({
            forecast_id: forecastId,
            status: "error",
            message: "预报单不存在",
          });
        }
      }

      await transaction.commit();

      res.json({
        message: "批量交付状态更新完成",
        results,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("批量更新交付状态失败:", error);
      res.status(500).json({ error: "批量更新交付状态失败" });
    }
  }
);

// 创建交付DO时同步状态
router.post(
  "/:id/sync-on-do-creation",
  authenticate,
  checkPermission("warehouse.delivery_order.create"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { do_id } = req.body;

      // 调用状态同步功能
      await syncStatusOnDOCreation(id, do_id);

      res.json({
        message: "DO创建时状态同步成功",
        forecast_id: id,
        do_id,
      });
    } catch (error) {
      console.error("DO创建时状态同步失败:", error);
      res.status(500).json({ error: "DO创建时状态同步失败" });
    }
  }
);

// 完成DO交付时同步状态
router.post(
  "/:id/sync-on-do-delivery",
  authenticate,
  checkPermission("warehouse.delivery_order.delivery"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { do_id } = req.body;

      // 调用状态同步功能
      await syncStatusOnDODelivery(id, do_id);

      res.json({
        message: "DO交付时状态同步成功",
        forecast_id: id,
        do_id,
      });
    } catch (error) {
      console.error("DO交付时状态同步失败:", error);
      res.status(500).json({ error: "DO交付时状态同步失败" });
    }
  }
);

// 获取交付状态概览
router.get(
  "/delivery-overview",
  authenticate,
  checkPermission("warehouse.forecast.view"),
  async (req, res) => {
    try {
      const { agent_id, mawb, delivery_status } = req.query;

      let whereCondition = {};
      if (agent_id) whereCondition.agent_id = agent_id;
      if (mawb) whereCondition.mawb = mawb;
      if (delivery_status) whereCondition.delivery_status = delivery_status;

      const forecasts = await Forecast.findAll({
        where: whereCondition,
        include: [
          {
            model: Package,
            as: "packages",
            attributes: ["id", "status"],
          },
        ],
        attributes: [
          "id",
          "forecast_code",
          "mawb",
          "status",
          "clearance_status",
          "delivery_status",
          "total_packages",
          "cleared_packages",
          "dispatched_packages",
          "delivered_packages",
          "incident_packages",
          "has_incident",
        ],
      });

      // 统计概览数据
      const overview = {
        total_forecasts: forecasts.length,
        by_delivery_status: {
          pending: 0,
          partial_dispatched: 0,
          partial_delivered: 0,
          completed: 0,
          incident: 0,
        },
        total_packages: 0,
        dispatched_packages: 0,
        delivered_packages: 0,
        incident_packages: 0,
        incident_forecasts: 0,
      };

      forecasts.forEach((forecast) => {
        // 交付状态统计
        if (forecast.delivery_status) {
          overview.by_delivery_status[forecast.delivery_status]++;
        } else {
          overview.by_delivery_status.pending++;
        }

        // 包裹统计
        overview.total_packages += forecast.total_packages || 0;
        overview.dispatched_packages += forecast.dispatched_packages || 0;
        overview.delivered_packages += forecast.delivered_packages || 0;
        overview.incident_packages += forecast.incident_packages || 0;

        // 异常预报单统计
        if (forecast.has_incident) {
          overview.incident_forecasts++;
        }
      });

      res.json({
        overview,
        forecasts: forecasts.map((forecast) => ({
          id: forecast.id,
          forecast_code: forecast.forecast_code,
          mawb: forecast.mawb,
          status: forecast.status,
          clearance_status: forecast.clearance_status || "pending",
          delivery_status: forecast.delivery_status || "pending",
          has_incident: forecast.has_incident,
          progress: {
            total_packages: forecast.total_packages || 0,
            cleared_packages: forecast.cleared_packages || 0,
            dispatched_packages: forecast.dispatched_packages || 0,
            delivered_packages: forecast.delivered_packages || 0,
            incident_packages: forecast.incident_packages || 0,
          },
        })),
      });
    } catch (error) {
      console.error("获取交付概览失败:", error);
      res.status(500).json({ error: "获取交付概览失败" });
    }
  }
);

// 获取异常包裹列表
router.get(
  "/incident-packages",
  authenticate,
  checkPermission("warehouse.forecast.view"),
  async (req, res) => {
    try {
      const { agent_id, mawb, status } = req.query;

      let whereCondition = { status: "incident" };

      const packages = await Package.findAll({
        where: whereCondition,
        include: [
          {
            model: Forecast,
            as: "forecast",
            where: {
              ...(agent_id && { agent_id }),
              ...(mawb && { mawb }),
            },
            attributes: ["id", "forecast_code", "mawb", "agent_id"],
          },
        ],
        attributes: [
          "id",
          "package_code",
          "tracking_no",
          "status",
          "weight",
          "description",
          "location_zone",
          "location_shelf",
          "created_at",
          "updated_at",
        ],
      });

      // 按预报单分组
      const groupedPackages = {};
      packages.forEach((pkg) => {
        const forecastCode = pkg.forecast.forecast_code;
        if (!groupedPackages[forecastCode]) {
          groupedPackages[forecastCode] = {
            forecast: pkg.forecast,
            packages: [],
          };
        }
        groupedPackages[forecastCode].packages.push({
          id: pkg.id,
          package_code: pkg.package_code,
          tracking_no: pkg.tracking_no,
          status: pkg.status,
          weight: pkg.weight,
          description: pkg.description,
          location: `${pkg.location_zone}-${pkg.location_shelf}`,
          created_at: pkg.created_at,
          updated_at: pkg.updated_at,
        });
      });

      res.json({
        total_incident_packages: packages.length,
        total_affected_forecasts: Object.keys(groupedPackages).length,
        incidents_by_forecast: groupedPackages,
      });
    } catch (error) {
      console.error("获取异常包裹列表失败:", error);
      res.status(500).json({ error: "获取异常包裹列表失败" });
    }
  }
);

export default router;
