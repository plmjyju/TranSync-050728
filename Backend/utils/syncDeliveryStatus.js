import db from "../models/index.js";

const {
  DeliveryOrder,
  Forecast,
  Pallet,
  Package,
  DeliveryOrderPallet,
  DeliveryOrderPackage,
} = db;

/**
 * 同步DO创建时的Forecast状态更新
 * @param {number} deliveryOrderId - DO ID
 * @param {Object} transaction - 数据库事务
 */
export async function syncStatusOnDOCreation(deliveryOrderId, transaction) {
  try {
    const deliveryOrder = await DeliveryOrder.findByPk(deliveryOrderId, {
      include: [
        {
          model: Pallet,
          as: "pallets",
          through: { attributes: [] },
        },
        {
          model: Package,
          as: "packages",
          through: { attributes: [] },
        },
      ],
      transaction,
    });

    if (!deliveryOrder) {
      throw new Error("DO不存在");
    }

    // 获取相关的预报单ID
    const forecastIds = new Set();

    if (deliveryOrder.management_type === "pallet") {
      // 板管理模式
      deliveryOrder.pallets.forEach((pallet) => {
        forecastIds.add(pallet.forecast_id);
      });
    } else {
      // 包裹管理模式
      deliveryOrder.packages.forEach((pkg) => {
        forecastIds.add(pkg.forecast_id);
      });
    }

    // 只更新预报单的交付状态
    for (const forecastId of forecastIds) {
      await updateForecastDeliveryStatus(forecastId, transaction);
    }

    console.log(`DO ${deliveryOrder.do_number} 创建时Forecast状态同步完成`);
  } catch (error) {
    console.error("DO创建时Forecast状态同步失败:", error);
    throw error;
  }
}

/**
 * 同步DO入库时的Forecast状态更新
 * @param {number} deliveryOrderId - DO ID
 * @param {Object} deliveryData - 入库数据
 * @param {Object} transaction - 数据库事务
 */
export async function syncStatusOnDODelivery(
  deliveryOrderId,
  deliveryData,
  transaction
) {
  try {
    const deliveryOrder = await DeliveryOrder.findByPk(deliveryOrderId, {
      include: [
        {
          model: Pallet,
          as: "pallets",
          through: { attributes: [] },
        },
        {
          model: Package,
          as: "packages",
          through: { attributes: [] },
        },
      ],
      transaction,
    });

    if (!deliveryOrder) {
      throw new Error("DO不存在");
    }

    // 获取相关的预报单ID
    const forecastIds = new Set();

    if (deliveryOrder.management_type === "pallet") {
      deliveryOrder.pallets.forEach((pallet) => {
        forecastIds.add(pallet.forecast_id);
      });
    } else {
      deliveryOrder.packages.forEach((pkg) => {
        forecastIds.add(pkg.forecast_id);
      });
    }

    // 更新预报单的交付状态
    for (const forecastId of forecastIds) {
      await updateForecastDeliveryStatus(forecastId, transaction);
    }

    console.log(`DO ${deliveryOrder.do_number} 入库时Forecast状态同步完成`);
  } catch (error) {
    console.error("DO入库时Forecast状态同步失败:", error);
    throw error;
  }
}

/**
 * 更新预报单的交付状态
 * @param {number} forecastId - 预报单ID
 * @param {Object} transaction - 数据库事务
 */
async function updateForecastDeliveryStatus(forecastId, transaction) {
  try {
    // 获取该预报单的所有包裹
    const allPackages = await Package.findAll({
      where: { forecast_id: forecastId },
      transaction,
    });

    if (allPackages.length === 0) {
      return;
    }

    // 统计包裹在DO中的状态
    const packageStats = await getPackageDeliveryStats(forecastId, transaction);

    const {
      total_packages,
      dispatched_packages,
      delivered_packages,
      incident_packages,
    } = packageStats;

    // 确定交付状态
    let deliveryStatus;
    let hasIncident = incident_packages > 0;

    if (delivered_packages + incident_packages === total_packages) {
      // 全部完成
      deliveryStatus = "completed";
    } else if (delivered_packages + incident_packages > 0) {
      // 部分完成
      deliveryStatus = "partial_delivered";
    } else if (dispatched_packages > 0) {
      // 部分派送
      deliveryStatus = "partial_dispatched";
    } else {
      // 待交付
      deliveryStatus = "pending";
    }

    // 更新预报单状态
    await Forecast.update(
      {
        delivery_status: deliveryStatus,
        has_incident: hasIncident,
        total_packages: total_packages,
        dispatched_packages: dispatched_packages,
        delivered_packages: delivered_packages,
        incident_packages: incident_packages,
      },
      { where: { id: forecastId }, transaction }
    );

    console.log(`预报单 ${forecastId} 交付状态更新为: ${deliveryStatus}`);
  } catch (error) {
    console.error(`更新预报单 ${forecastId} 交付状态失败:`, error);
    throw error;
  }
}

/**
 * 获取包裹的交付统计信息
 * @param {number} forecastId - 预报单ID
 * @param {Object} transaction - 数据库事务
 */
async function getPackageDeliveryStats(forecastId, transaction) {
  try {
    // 获取该预报单的所有包裹
    const allPackages = await Package.findAll({
      where: { forecast_id: forecastId },
      transaction,
    });

    // 获取这些包裹关联的DO信息
    const packageIds = allPackages.map((pkg) => pkg.id);

    const doPackages = await DeliveryOrderPackage.findAll({
      where: { package_id: packageIds },
      include: [
        {
          model: DeliveryOrder,
          as: "deliveryOrder",
          attributes: ["id", "status", "warehouse_confirmed"],
        },
      ],
      transaction,
    });

    // 统计各状态包裹数量
    const stats = {
      total_packages: allPackages.length,
      dispatched_packages: 0, // 已派送（在DO中）
      delivered_packages: 0, // 已交付
      incident_packages: 0, // 异常
    };

    // 已分配到DO的包裹
    const assignedPackageIds = new Set();

    doPackages.forEach((doPackage) => {
      const deliveryOrder = doPackage.deliveryOrder;
      assignedPackageIds.add(doPackage.package_id);

      if (deliveryOrder.status === "delivered") {
        if (
          deliveryOrder.warehouse_confirmed &&
          deliveryOrder.status === "incident"
        ) {
          stats.incident_packages++;
        } else {
          stats.delivered_packages++;
        }
      } else if (
        ["picked_up", "in_transit", "arrived", "incident"].includes(
          deliveryOrder.status
        )
      ) {
        stats.dispatched_packages++;
      }
    });

    // 更新dispatched_packages计数（包括所有已分配到DO的包裹）
    stats.dispatched_packages = assignedPackageIds.size;

    return stats;
  } catch (error) {
    console.error(`获取预报单 ${forecastId} 包裹交付统计失败:`, error);
    throw error;
  }
}

/**
 * 获取预报单的DO统计信息
 * @param {number} forecastId - 预报单ID
 * @param {Object} transaction - 数据库事务
 */
export async function getForecastDOStats(forecastId, transaction) {
  try {
    // 获取该预报单相关的所有DO
    const deliveryOrders = await DeliveryOrder.findAll({
      include: [
        {
          model: Pallet,
          as: "pallets",
          where: { forecast_id: forecastId },
          through: { attributes: [] },
          required: false,
        },
        {
          model: Package,
          as: "packages",
          where: { forecast_id: forecastId },
          through: { attributes: [] },
          required: false,
        },
      ],
      transaction,
    });

    const stats = {
      total_dos: deliveryOrders.length,
      completed_dos: 0,
      in_progress_dos: 0,
      incident_dos: 0,
      pending_dos: 0,
    };

    deliveryOrders.forEach((deliveryOrderItem) => {
      switch (deliveryOrderItem.status) {
        case "delivered":
          stats.completed_dos++;
          break;
        case "incident":
          stats.incident_dos++;
          break;
        case "picked_up":
        case "in_transit":
        case "arrived":
          stats.in_progress_dos++;
          break;
        case "pending":
        case "allocated":
          stats.pending_dos++;
          break;
      }
    });

    return stats;
  } catch (error) {
    console.error(`获取预报单 ${forecastId} DO统计失败:`, error);
    throw error;
  }
}
