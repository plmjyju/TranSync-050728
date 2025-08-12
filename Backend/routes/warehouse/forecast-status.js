import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

const router = express.Router();
const { Forecast, Package } = db;

// 更新清关状态
router.post(
  "/:id/update-clearance",
  authenticate,
  checkPermission("warehouse.forecast.clearance"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        clearance_status,
        cleared_package_ids = [],
        clearance_notes,
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

      // 更新预报单的清关状态
      await forecast.update(
        {
          clearance_status,
          cleared_packages: cleared_package_ids.length,
          operator: req.user.username,
          operator_id: req.user.id,
        },
        { transaction }
      );

      // 更新已清关包裹的状态
      if (cleared_package_ids.length > 0) {
        await Package.update(
          { status: "cleared" },
          {
            where: { id: cleared_package_ids },
            transaction,
          }
        );
      }

      // 根据清关进度设置清关状态
      const totalPackages = forecast.packages.length;
      const clearedCount = cleared_package_ids.length;

      let finalClearanceStatus;
      if (clearedCount === 0) {
        finalClearanceStatus = "pending";
      } else if (clearedCount < totalPackages) {
        finalClearanceStatus = "partial";
      } else {
        finalClearanceStatus = "completed";
      }

      if (finalClearanceStatus !== clearance_status) {
        await forecast.update(
          { clearance_status: finalClearanceStatus },
          { transaction }
        );
      }

      await transaction.commit();

      res.json({
        message: "清关状态更新成功",
        forecast_code: forecast.forecast_code,
        clearance_status: finalClearanceStatus,
        cleared_packages: clearedCount,
        total_packages: totalPackages,
        clearance_progress: `${clearedCount}/${totalPackages}`,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新清关状态失败:", error);
      res.status(500).json({ error: "更新清关状态失败" });
    }
  }
);

// 批量清关操作
router.post(
  "/batch-clearance",
  authenticate,
  checkPermission("warehouse.forecast.clearance"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { forecast_ids, clearance_status, operator_notes } = req.body;

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
          // 更新预报单清关状态
          await forecast.update(
            {
              clearance_status,
              operator: req.user.username,
              operator_id: req.user.id,
            },
            { transaction }
          );

          // 如果是完成清关，更新所有包裹状态
          if (clearance_status === "completed") {
            const packageIds = forecast.packages.map((pkg) => pkg.id);
            await Package.update(
              { status: "cleared" },
              {
                where: { id: packageIds },
                transaction,
              }
            );

            await forecast.update(
              { cleared_packages: packageIds.length },
              { transaction }
            );
          }

          results.push({
            forecast_id: forecastId,
            forecast_code: forecast.forecast_code,
            clearance_status,
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
        message: "批量清关状态更新完成",
        results,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("批量更新清关状态失败:", error);
      res.status(500).json({ error: "批量更新清关状态失败" });
    }
  }
);

// 获取清关状态概览
router.get(
  "/clearance-overview",
  authenticate,
  checkPermission("warehouse.forecast.view"),
  async (req, res) => {
    try {
      const { agent_id, mawb, status } = req.query;

      let whereCondition = {};
      if (agent_id) whereCondition.agent_id = agent_id;
      if (mawb) whereCondition.mawb = mawb;
      if (status) whereCondition.status = status;

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
        by_clearance_status: {
          pending: 0,
          in_progress: 0,
          partial: 0,
          completed: 0,
          exempted: 0,
        },
        by_delivery_status: {
          pending: 0,
          partial_dispatched: 0,
          partial_delivered: 0,
          completed: 0,
          incident: 0,
        },
        total_packages: 0,
        cleared_packages: 0,
        delivered_packages: 0,
        incident_packages: 0,
      };

      forecasts.forEach((forecast) => {
        // 清关状态统计
        if (forecast.clearance_status) {
          overview.by_clearance_status[forecast.clearance_status]++;
        } else {
          overview.by_clearance_status.pending++;
        }

        // 交付状态统计
        if (forecast.delivery_status) {
          overview.by_delivery_status[forecast.delivery_status]++;
        } else {
          overview.by_delivery_status.pending++;
        }

        // 包裹统计
        overview.total_packages += forecast.total_packages || 0;
        overview.cleared_packages += forecast.cleared_packages || 0;
        overview.delivered_packages += forecast.delivered_packages || 0;
        overview.incident_packages += forecast.incident_packages || 0;
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
      console.error("获取清关概览失败:", error);
      res.status(500).json({ error: "获取清关概览失败" });
    }
  }
);

// 获取特定预报单的详细状态
router.get(
  "/:id/status-detail",
  authenticate,
  checkPermission("warehouse.forecast.view"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const forecast = await Forecast.findByPk(id, {
        include: [
          {
            model: Package,
            as: "packages",
            attributes: ["id", "package_code", "status", "pallet_id"],
          },
        ],
      });

      if (!forecast) {
        return res.status(404).json({ error: "预报单不存在" });
      }

      // 获取相关的DO信息
      const doStats = await getForecastDOStats(id);

      // 按状态分组包裹
      const packagesByStatus = {
        prepared: [],
        arrived: [],
        cleared: [],
        stored: [],
        delivered: [],
        damaged: [],
        missing: [],
        incident: [],
      };

      forecast.packages.forEach((pkg) => {
        if (packagesByStatus[pkg.status]) {
          packagesByStatus[pkg.status].push({
            id: pkg.id,
            package_code: pkg.package_code,
            pallet_id: pkg.pallet_id,
          });
        }
      });

      res.json({
        forecast: {
          id: forecast.id,
          forecast_code: forecast.forecast_code,
          mawb: forecast.mawb,
          status: forecast.status,
          clearance_status: forecast.clearance_status || "pending",
          delivery_status: forecast.delivery_status || "pending",
          has_incident: forecast.has_incident,
        },
        statistics: {
          total_packages: forecast.total_packages || 0,
          cleared_packages: forecast.cleared_packages || 0,
          dispatched_packages: forecast.dispatched_packages || 0,
          delivered_packages: forecast.delivered_packages || 0,
          incident_packages: forecast.incident_packages || 0,
        },
        do_statistics: doStats,
        packages_by_status: packagesByStatus,
      });
    } catch (error) {
      console.error("获取预报单详细状态失败:", error);
      res.status(500).json({ error: "获取预报单详细状态失败" });
    }
  }
);

// 获取预报单的DO统计信息
async function getForecastDOStats(forecastId) {
  try {
    const { DeliveryOrder, DeliveryOrderPallet, DeliveryOrderPackage, Pallet } =
      db;

    // 获取相关的板箱DO
    const palletDOs = await DeliveryOrder.findAll({
      where: { management_type: "pallet" },
      include: [
        {
          model: DeliveryOrderPallet,
          as: "deliveryOrderPallets",
          include: [
            {
              model: Pallet,
              as: "pallet",
              where: { forecast_id: forecastId },
              required: true,
            },
          ],
          required: true,
        },
      ],
    });

    // 获取相关的包裹DO
    const packageDOs = await DeliveryOrder.findAll({
      where: { management_type: "package" },
      include: [
        {
          model: DeliveryOrderPackage,
          as: "deliveryOrderPackages",
          include: [
            {
              model: Package,
              as: "package",
              where: { forecast_id: forecastId },
              required: true,
            },
          ],
          required: true,
        },
      ],
    });

    const allDOs = [...palletDOs, ...packageDOs];

    const doStats = {
      total_dos: allDOs.length,
      by_status: {
        pending: 0,
        picking: 0,
        in_transit: 0,
        arrived: 0,
        delivered: 0,
        incident: 0,
      },
      warehouse_confirmed: 0,
      pending_confirmation: 0,
    };

    allDOs.forEach((doOrder) => {
      doStats.by_status[doOrder.status]++;

      if (doOrder.warehouse_confirmed) {
        doStats.warehouse_confirmed++;
      } else if (doOrder.status === "arrived") {
        doStats.pending_confirmation++;
      }
    });

    return doStats;
  } catch (error) {
    console.error("获取DO统计信息失败:", error);
    return {
      total_dos: 0,
      by_status: {},
      warehouse_confirmed: 0,
      pending_confirmation: 0,
    };
  }
}

export default router;
