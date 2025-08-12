import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

const router = express.Router();
const {
  Package,
  Forecast,
  DeliveryOrder,
  DeliveryOrderPackage,
  DeliveryOrderPallet,
  Pallet,
  PackageItem,
} = db;

// 扫描包裹入库
router.post(
  "/scan-package-storage",
  authenticate,
  checkPermission("warehouse.packages.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        package_code, // 箱唛号
        do_number, // DO单号
        warehouse_location, // 仓库位置
        operator_notes,
        // FTZ出入口信息
        ftz_entry_info = {
          entry_port: "",
          entry_date: "",
          entry_permit_no: "",
          customs_declaration_no: "",
          ftz_zone_code: "",
          bonded_warehouse_code: "",
          regulatory_status: "pending",
        },
      } = req.body;

      if (!package_code || !do_number) {
        await transaction.rollback();
        return res.status(400).json({ error: "请提供箱唛号和DO单号" });
      }

      // 1. 查找包裹
      const pkg = await Package.findOne({
        where: { package_code },
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code", "mawb"],
          },
        ],
        transaction,
      });

      if (!pkg) {
        await transaction.rollback();
        return res.status(404).json({ error: `包裹 ${package_code} 不存在` });
      }

      // 2. 查找DO单
      const deliveryOrder = await DeliveryOrder.findOne({
        where: { do_number },
        transaction,
      });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: `DO单 ${do_number} 不存在` });
      }

      // 3. 验证包裹是否在该DO单中
      const isPackageInDO = await validatePackageInDO(
        pkg.id,
        deliveryOrder.id,
        transaction
      );

      if (!isPackageInDO) {
        await transaction.rollback();
        return res.status(400).json({
          error: `包裹 ${package_code} 不在DO单 ${do_number} 中`,
          package_info: {
            package_code: pkg.package_code,
            forecast_code: pkg.forecast?.forecast_code,
            mawb: pkg.forecast?.mawb,
          },
          do_info: {
            do_number: deliveryOrder.do_number,
            management_type: deliveryOrder.management_type,
          },
        });
      }

      // 4. 检查包裹是否已经入库
      if (pkg.status === "stored") {
        await transaction.rollback();
        return res.status(400).json({
          error: `包裹 ${package_code} 已经入库`,
          storage_info: {
            storage_time: pkg.storage_time,
            storage_operator: pkg.storage_operator,
            warehouse_location: pkg.warehouse_location,
          },
        });
      }

      // 5. 更新包裹状态为已入库
      await pkg.update(
        {
          status: "stored",
          warehouse_location,
          storage_time: new Date(),
          storage_operator: req.user.username,
        },
        { transaction }
      );

      // 更新PackageItem的FTZ信息
      await PackageItem.update(
        {
          ftz_entry_port: ftz_entry_info.entry_port,
          ftz_entry_date: ftz_entry_info.entry_date
            ? new Date(ftz_entry_info.entry_date)
            : new Date(),
          ftz_entry_permit: ftz_entry_info.entry_permit_no,
          ftz_customs_declaration: ftz_entry_info.customs_declaration_no,
          ftz_zone_code: ftz_entry_info.ftz_zone_code,
          ftz_bonded_warehouse: ftz_entry_info.bonded_warehouse_code,
          ftz_regulatory_status: ftz_entry_info.regulatory_status,
        },
        {
          where: { package_id: pkg.id },
          transaction,
        }
      );

      // 6. 记录操作日志 (包含FTZ信息)
      await db.PackageLog.create(
        {
          package_id: pkg.id,
          action: "storage_scanned",
          operator: req.user.username,
          operator_id: req.user.id,
          details: {
            do_number,
            warehouse_location,
            scan_time: new Date(),
            notes: operator_notes,
            // FTZ合规信息
            ftz_compliance: {
              entry_port: ftz_entry_info.entry_port,
              entry_date: ftz_entry_info.entry_date,
              entry_permit_no: ftz_entry_info.entry_permit_no,
              customs_declaration_no: ftz_entry_info.customs_declaration_no,
              ftz_zone_code: ftz_entry_info.ftz_zone_code,
              bonded_warehouse_code: ftz_entry_info.bonded_warehouse_code,
              regulatory_status: ftz_entry_info.regulatory_status,
              compliance_timestamp: new Date(),
            },
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "包裹入库扫描成功",
        package_info: {
          package_code: pkg.package_code,
          tracking_no: pkg.tracking_no,
          forecast_code: pkg.forecast?.forecast_code,
          mawb: pkg.forecast?.mawb,
          status: "stored",
          warehouse_location,
          storage_time: pkg.storage_time,
          storage_operator: pkg.storage_operator,
        },
        do_info: {
          do_number: deliveryOrder.do_number,
          management_type: deliveryOrder.management_type,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("包裹入库扫描失败:", error);
      res.status(500).json({ error: "包裹入库扫描失败" });
    }
  }
);

// 批量扫描包裹入库
router.post(
  "/batch-scan-storage",
  authenticate,
  checkPermission("warehouse.packages.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        package_codes, // 箱唛号列表
        do_number, // DO单号
        warehouse_location, // 仓库位置
        operator_notes,
      } = req.body;

      if (!package_codes || !Array.isArray(package_codes) || !do_number) {
        await transaction.rollback();
        return res.status(400).json({ error: "请提供箱唛号列表和DO单号" });
      }

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const package_code of package_codes) {
        try {
          // 查找包裹
          const pkg = await Package.findOne({
            where: { package_code },
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb"],
              },
            ],
            transaction,
          });

          if (!pkg) {
            results.push({
              package_code,
              status: "error",
              message: "包裹不存在",
            });
            errorCount++;
            continue;
          }

          // 查找DO单
          const deliveryOrder = await DeliveryOrder.findOne({
            where: { do_number },
            transaction,
          });

          if (!deliveryOrder) {
            results.push({
              package_code,
              status: "error",
              message: "DO单不存在",
            });
            errorCount++;
            continue;
          }

          // 验证包裹是否在该DO单中
          const isPackageInDO = await validatePackageInDO(
            pkg.id,
            deliveryOrder.id,
            transaction
          );

          if (!isPackageInDO) {
            results.push({
              package_code,
              status: "error",
              message: "包裹不在该DO单中",
              forecast_code: pkg.forecast?.forecast_code,
            });
            errorCount++;
            continue;
          }

          // 检查包裹是否已经入库
          if (pkg.status === "stored") {
            results.push({
              package_code,
              status: "warning",
              message: "包裹已经入库",
              storage_time: pkg.storage_time,
            });
            continue;
          }

          // 更新包裹状态
          await pkg.update(
            {
              status: "stored",
              warehouse_location,
              storage_time: new Date(),
              storage_operator: req.user.username,
            },
            { transaction }
          );

          // 记录操作日志
          await db.PackageLog.create(
            {
              package_id: pkg.id,
              action: "storage_scanned",
              operator: req.user.username,
              operator_id: req.user.id,
              details: {
                do_number,
                warehouse_location,
                scan_time: new Date(),
                notes: operator_notes,
                batch_operation: true,
              },
            },
            { transaction }
          );

          results.push({
            package_code,
            status: "success",
            message: "入库成功",
            forecast_code: pkg.forecast?.forecast_code,
            warehouse_location,
          });
          successCount++;
        } catch (error) {
          results.push({
            package_code,
            status: "error",
            message: error.message,
          });
          errorCount++;
        }
      }

      await transaction.commit();

      res.json({
        message: "批量扫描入库完成",
        summary: {
          total: package_codes.length,
          success: successCount,
          error: errorCount,
        },
        do_number,
        warehouse_location,
        results,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("批量扫描入库失败:", error);
      res.status(500).json({ error: "批量扫描入库失败" });
    }
  }
);

// DO单包裹入库统计和验证
router.post(
  "/verify-do-storage",
  authenticate,
  checkPermission("warehouse.delivery_orders.view"),
  async (req, res) => {
    try {
      const { do_number } = req.body;

      if (!do_number) {
        return res.status(400).json({ error: "请提供DO单号" });
      }

      // 查找DO单
      const deliveryOrder = await DeliveryOrder.findOne({
        where: { do_number },
        include: [
          {
            model: Package,
            as: "packages",
            attributes: [
              "id",
              "package_code",
              "tracking_no",
              "status",
              "warehouse_location",
              "storage_time",
              "storage_operator",
            ],
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["forecast_code", "mawb"],
              },
            ],
          },
        ],
      });

      if (!deliveryOrder) {
        return res.status(404).json({ error: `DO单 ${do_number} 不存在` });
      }

      // 统计入库情况
      const totalPackages = deliveryOrder.packages.length;
      const storedPackages = deliveryOrder.packages.filter(
        (pkg) => pkg.status === "stored"
      );
      const pendingPackages = deliveryOrder.packages.filter(
        (pkg) => pkg.status !== "stored"
      );

      // 按Forecast分组统计
      const forecastStats = {};
      deliveryOrder.packages.forEach((pkg) => {
        const forecastCode = pkg.forecast?.forecast_code || "UNKNOWN";
        if (!forecastStats[forecastCode]) {
          forecastStats[forecastCode] = {
            forecast_code: forecastCode,
            mawb: pkg.forecast?.mawb || "UNKNOWN",
            total: 0,
            stored: 0,
            pending: 0,
            packages: [],
          };
        }
        forecastStats[forecastCode].total++;
        forecastStats[forecastCode].packages.push({
          package_code: pkg.package_code,
          status: pkg.status,
          warehouse_location: pkg.warehouse_location,
          storage_time: pkg.storage_time,
        });

        if (pkg.status === "stored") {
          forecastStats[forecastCode].stored++;
        } else {
          forecastStats[forecastCode].pending++;
        }
      });

      // 判断DO单状态
      let doStatus;
      let hasDiscrepancy = false;

      if (storedPackages.length === 0) {
        doStatus = "pending_storage";
      } else if (storedPackages.length === totalPackages) {
        doStatus = "fully_stored";
      } else {
        doStatus = "partially_stored";
        hasDiscrepancy = true;
      }

      // 检查是否需要报异常
      const needsException = hasDiscrepancy || pendingPackages.length > 0;

      res.json({
        do_info: {
          do_number: deliveryOrder.do_number,
          management_type: deliveryOrder.management_type,
          status: doStatus,
          needs_exception: needsException,
        },
        storage_summary: {
          total_packages: totalPackages,
          stored_packages: storedPackages.length,
          pending_packages: pendingPackages.length,
          storage_rate:
            totalPackages > 0
              ? `${((storedPackages.length / totalPackages) * 100).toFixed(1)}%`
              : "0%",
        },
        forecast_breakdown: Object.values(forecastStats),
        pending_packages: pendingPackages.map((pkg) => ({
          package_code: pkg.package_code,
          tracking_no: pkg.tracking_no,
          forecast_code: pkg.forecast?.forecast_code,
          status: pkg.status,
        })),
      });
    } catch (error) {
      console.error("DO单入库验证失败:", error);
      res.status(500).json({ error: "DO单入库验证失败" });
    }
  }
);

// 辅助函数：验证包裹是否在DO单中
async function validatePackageInDO(packageId, deliveryOrderId, transaction) {
  try {
    // 检查包裹级DO关联
    const packageDORelation = await DeliveryOrderPackage.findOne({
      where: {
        package_id: packageId,
        delivery_order_id: deliveryOrderId,
      },
      transaction,
    });

    if (packageDORelation) {
      return true;
    }

    // 检查板级DO关联（通过板间接关联）
    const pkg = await Package.findByPk(packageId, {
      include: [
        {
          model: Pallet,
          as: "pallet",
          include: [
            {
              model: DeliveryOrderPallet,
              as: "deliveryOrderPallets",
              where: { delivery_order_id: deliveryOrderId },
              required: false,
            },
          ],
          required: false,
        },
      ],
      transaction,
    });

    return pkg?.pallet?.deliveryOrderPallets?.length > 0;
  } catch (error) {
    console.error("验证包裹DO关联失败:", error);
    return false;
  }
}

export default router;
