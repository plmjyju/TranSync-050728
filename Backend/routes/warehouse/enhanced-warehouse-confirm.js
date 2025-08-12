import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

const router = express.Router();
const { DeliveryOrder, Package, Pallet, Forecast, PackageLog, PackageItem } =
  db;

// 增强版仓库确认 - 基于包裹扫描 (FTZ合规)
router.post(
  "/:id/enhanced-warehouse-confirm",
  authenticate,
  checkPermission("warehouse.delivery_order.confirm"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const {
        scanned_packages = [], // 扫描到的包裹箱唛号列表
        warehouse_location,
        operator_notes,
        confirm_all = false, // 是否确认所有包裹
        // FTZ出入口信息
        ftz_entry_info = {
          entry_port: "", // 入境口岸
          entry_date: "", // 入境日期
          entry_permit_no: "", // 入境许可证号
          customs_declaration_no: "", // 海关申报单号
          ftz_zone_code: "", // 自贸区代码
          bonded_warehouse_code: "", // 保税仓库代码
          entry_vehicle_info: "", // 入境车辆信息
          entry_operator: "", // 入境操作员
          regulatory_status: "pending", // 监管状态: pending/cleared/bonded
        },
      } = req.body;

      // 查找DO单
      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Package,
            as: "packages",
            attributes: [
              "id",
              "package_code",
              "tracking_no",
              "status",
              "forecast_id",
            ],
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb"],
              },
            ],
          },
          {
            model: Pallet,
            as: "pallets",
            attributes: ["id", "pallet_code", "box_count"],
            include: [
              {
                model: Package,
                as: "packages",
                attributes: [
                  "id",
                  "package_code",
                  "tracking_no",
                  "status",
                  "forecast_id",
                ],
                include: [
                  {
                    model: Forecast,
                    as: "forecast",
                    attributes: ["id", "forecast_code", "mawb"],
                  },
                ],
              },
            ],
          },
        ],
        transaction,
      });

      if (!deliveryOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "DO单不存在" });
      }

      if (!["arrived"].includes(deliveryOrder.status)) {
        await transaction.rollback();
        return res.status(400).json({
          error: "只有已到达状态的DO才能进行仓库确认",
          current_status: deliveryOrder.status,
        });
      }

      // 获取DO中的所有包裹（包括板中的包裹）
      let allDOPackages = [];

      // 直接关联的包裹
      if (deliveryOrder.packages) {
        allDOPackages = [...deliveryOrder.packages];
      }

      // 板中的包裹
      if (deliveryOrder.pallets) {
        deliveryOrder.pallets.forEach((pallet) => {
          if (pallet.packages) {
            allDOPackages = [...allDOPackages, ...pallet.packages];
          }
        });
      }

      // 去重（可能有重复）
      const uniquePackages = allDOPackages.filter(
        (pkg, index, self) => index === self.findIndex((p) => p.id === pkg.id)
      );

      const totalExpectedPackages = uniquePackages.length;

      let packagesToConfirm = [];
      let scanResults = [];

      if (confirm_all) {
        // 确认所有包裹
        packagesToConfirm = uniquePackages;
        scanResults = uniquePackages.map((pkg) => ({
          package_code: pkg.package_code,
          status: "success",
          message: "批量确认",
          forecast_code: pkg.forecast?.forecast_code,
        }));
      } else {
        // 根据扫描的箱唛号确认包裹
        for (const package_code of scanned_packages) {
          const pkg = uniquePackages.find(
            (p) => p.package_code === package_code
          );

          if (!pkg) {
            scanResults.push({
              package_code,
              status: "error",
              message: "包裹不在该DO单中",
            });
            continue;
          }

          if (pkg.status === "stored") {
            scanResults.push({
              package_code,
              status: "warning",
              message: "包裹已经入库",
              forecast_code: pkg.forecast?.forecast_code,
            });
            continue;
          }

          packagesToConfirm.push(pkg);
          scanResults.push({
            package_code,
            status: "success",
            message: "扫描成功",
            forecast_code: pkg.forecast?.forecast_code,
          });
        }
      }

      // 更新确认的包裹状态为已入库
      const confirmedPackageIds = [];
      for (const pkg of packagesToConfirm) {
        await Package.update(
          {
            status: "stored",
            warehouse_location,
            storage_time: new Date(),
            storage_operator: req.user.username,
          },
          {
            where: { id: pkg.id },
            transaction,
          }
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

        // 记录操作日志 (包含FTZ信息)
        await PackageLog.create(
          {
            package_id: pkg.id,
            action: "storage_scanned",
            operator: req.user.username,
            operator_id: req.user.id,
            details: {
              do_number: deliveryOrder.do_number,
              warehouse_location,
              scan_time: new Date(),
              notes: operator_notes,
              enhanced_confirm: true,
              // FTZ合规信息
              ftz_compliance: {
                entry_port: ftz_entry_info.entry_port,
                entry_date: ftz_entry_info.entry_date,
                entry_permit_no: ftz_entry_info.entry_permit_no,
                customs_declaration_no: ftz_entry_info.customs_declaration_no,
                ftz_zone_code: ftz_entry_info.ftz_zone_code,
                bonded_warehouse_code: ftz_entry_info.bonded_warehouse_code,
                entry_vehicle_info: ftz_entry_info.entry_vehicle_info,
                entry_operator:
                  ftz_entry_info.entry_operator || req.user.username,
                regulatory_status: ftz_entry_info.regulatory_status,
                compliance_timestamp: new Date(),
              },
            },
          },
          { transaction }
        );

        confirmedPackageIds.push(pkg.id);
      }

      // 计算确认情况
      const confirmedCount = packagesToConfirm.length;
      const pendingCount = totalExpectedPackages - confirmedCount;
      const hasDiscrepancy = pendingCount > 0;

      // 更新DO状态
      let newDOStatus = "delivered"; // 默认为已完成
      if (hasDiscrepancy) {
        newDOStatus = "incident"; // 有异常
      }

      await deliveryOrder.update(
        {
          status: newDOStatus,
          warehouse_confirmed: true,
          warehouse_confirm_time: new Date(),
          confirmed_package_count: confirmedCount,
          actual_package_count: confirmedCount,
          warehouse_receiver: req.user.username,
          has_discrepancy: hasDiscrepancy,
          discrepancy_notes: hasDiscrepancy
            ? `包裹数量不符：期望${totalExpectedPackages}个，实际确认${confirmedCount}个`
            : null,
        },
        { transaction }
      );

      // 按Forecast分组统计确认情况
      const forecastStats = {};
      uniquePackages.forEach((pkg) => {
        const forecastCode = pkg.forecast?.forecast_code || "UNKNOWN";
        if (!forecastStats[forecastCode]) {
          forecastStats[forecastCode] = {
            forecast_code: forecastCode,
            mawb: pkg.forecast?.mawb || "UNKNOWN",
            total: 0,
            confirmed: 0,
            pending: 0,
          };
        }
        forecastStats[forecastCode].total++;

        if (confirmedPackageIds.includes(pkg.id)) {
          forecastStats[forecastCode].confirmed++;
        } else {
          forecastStats[forecastCode].pending++;
        }
      });

      await transaction.commit();

      res.json({
        message: hasDiscrepancy ? "仓库确认完成，但存在异常" : "仓库确认完成",
        do_info: {
          do_number: deliveryOrder.do_number,
          status: newDOStatus,
          has_discrepancy: hasDiscrepancy,
        },
        confirmation_summary: {
          total_expected: totalExpectedPackages,
          confirmed: confirmedCount,
          pending: pendingCount,
          confirmation_rate:
            totalExpectedPackages > 0
              ? `${((confirmedCount / totalExpectedPackages) * 100).toFixed(
                  1
                )}%`
              : "0%",
        },
        scan_results: scanResults,
        forecast_breakdown: Object.values(forecastStats),
        next_actions: hasDiscrepancy
          ? ["请报告异常情况", "核实缺失包裹原因", "联系相关部门处理"]
          : ["确认完成，包裹已入库", "更新系统状态", "通知相关人员"],
      });
    } catch (error) {
      await transaction.rollback();
      console.error("增强版仓库确认失败:", error);
      res.status(500).json({ error: "增强版仓库确认失败" });
    }
  }
);

// 获取DO的包裹清单（用于扫描确认）
router.get(
  "/:id/package-manifest",
  authenticate,
  checkPermission("warehouse.delivery_order.view"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const deliveryOrder = await DeliveryOrder.findByPk(id, {
        include: [
          {
            model: Package,
            as: "packages",
            attributes: [
              "id",
              "package_code",
              "tracking_no",
              "status",
              "weight_kg",
              "warehouse_location",
              "storage_time",
              "storage_operator",
            ],
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "forecast_code", "mawb"],
              },
            ],
          },
          {
            model: Pallet,
            as: "pallets",
            attributes: ["id", "pallet_code", "custom_board_no", "box_count"],
            include: [
              {
                model: Package,
                as: "packages",
                attributes: [
                  "id",
                  "package_code",
                  "tracking_no",
                  "status",
                  "weight_kg",
                  "warehouse_location",
                  "storage_time",
                  "storage_operator",
                ],
                include: [
                  {
                    model: Forecast,
                    as: "forecast",
                    attributes: ["id", "forecast_code", "mawb"],
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!deliveryOrder) {
        return res.status(404).json({ error: "DO单不存在" });
      }

      // 获取所有包裹
      let allPackages = [];

      // 直接关联的包裹
      if (deliveryOrder.packages) {
        allPackages = [...deliveryOrder.packages];
      }

      // 板中的包裹
      if (deliveryOrder.pallets) {
        deliveryOrder.pallets.forEach((pallet) => {
          if (pallet.packages) {
            pallet.packages.forEach((pkg) => {
              allPackages.push({
                ...pkg.toJSON(),
                pallet_info: {
                  pallet_code: pallet.pallet_code,
                  custom_board_no: pallet.custom_board_no,
                },
              });
            });
          }
        });
      }

      // 去重并统计状态
      const uniquePackages = allPackages.filter(
        (pkg, index, self) => index === self.findIndex((p) => p.id === pkg.id)
      );

      const statusStats = {
        total: uniquePackages.length,
        stored: 0,
        pending: 0,
        other: 0,
      };

      const forecastGroups = {};

      uniquePackages.forEach((pkg) => {
        // 状态统计
        if (pkg.status === "stored") {
          statusStats.stored++;
        } else if (["arrived", "sorted", "cleared"].includes(pkg.status)) {
          statusStats.pending++;
        } else {
          statusStats.other++;
        }

        // 按Forecast分组
        const forecastCode = pkg.forecast?.forecast_code || "UNKNOWN";
        if (!forecastGroups[forecastCode]) {
          forecastGroups[forecastCode] = {
            forecast_code: forecastCode,
            mawb: pkg.forecast?.mawb || "UNKNOWN",
            packages: [],
            stats: {
              total: 0,
              stored: 0,
              pending: 0,
            },
          };
        }

        forecastGroups[forecastCode].packages.push(pkg);
        forecastGroups[forecastCode].stats.total++;

        if (pkg.status === "stored") {
          forecastGroups[forecastCode].stats.stored++;
        } else {
          forecastGroups[forecastCode].stats.pending++;
        }
      });

      res.json({
        do_info: {
          do_number: deliveryOrder.do_number,
          status: deliveryOrder.status,
          management_type: deliveryOrder.management_type,
          warehouse_confirmed: deliveryOrder.warehouse_confirmed,
          warehouse_confirm_time: deliveryOrder.warehouse_confirm_time,
        },
        package_manifest: {
          total_packages: statusStats.total,
          status_breakdown: statusStats,
          confirmation_rate:
            statusStats.total > 0
              ? `${((statusStats.stored / statusStats.total) * 100).toFixed(
                  1
                )}%`
              : "0%",
        },
        forecast_groups: Object.values(forecastGroups),
        scan_ready_packages: uniquePackages
          .filter((pkg) => !["stored"].includes(pkg.status))
          .map((pkg) => ({
            package_code: pkg.package_code,
            tracking_no: pkg.tracking_no,
            forecast_code: pkg.forecast?.forecast_code,
            weight_kg: pkg.weight_kg,
            pallet_info: pkg.pallet_info,
          })),
      });
    } catch (error) {
      console.error("获取包裹清单失败:", error);
      res.status(500).json({ error: "获取包裹清单失败" });
    }
  }
);

export default router;
