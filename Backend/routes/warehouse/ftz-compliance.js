import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

const router = express.Router();
const { Package, Forecast, DeliveryOrder, PackageLog, PackageItem } = db;

// FTZ出入口合规性报告
router.get(
  "/ftz-compliance-report",
  authenticate,
  checkPermission("warehouse.forecast.view"),
  async (req, res) => {
    try {
      const {
        start_date,
        end_date,
        ftz_zone_code,
        regulatory_status,
        entry_port,
        export_format = "json", // json, csv, excel
      } = req.query;

      let whereCondition = {};

      // 通过PackageItem的FTZ字段进行筛选
      let packageItemWhere = {};

      // 按日期范围筛选
      if (start_date && end_date) {
        packageItemWhere.ftz_entry_date = {
          [db.Sequelize.Op.between]: [new Date(start_date), new Date(end_date)],
        };
      }

      // 按自贸区代码筛选
      if (ftz_zone_code) {
        packageItemWhere.ftz_zone_code = ftz_zone_code;
      }

      // 按监管状态筛选
      if (regulatory_status) {
        packageItemWhere.ftz_regulatory_status = regulatory_status;
      }

      // 按入境口岸筛选
      if (entry_port) {
        packageItemWhere.ftz_entry_port = entry_port;
      }

      const packages = await Package.findAll({
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code", "mawb", "agent_id"],
          },
          {
            model: PackageItem,
            as: "items",
            where: packageItemWhere,
            attributes: [
              "id",
              "tracking_no",
              "hs_code",
              "product_name_en",
              "unit_price",
              "total_price",
              // FTZ字段
              "ftz_entry_port",
              "ftz_entry_date",
              "ftz_entry_permit",
              "ftz_customs_declaration",
              "ftz_zone_code",
              "ftz_bonded_warehouse",
              "ftz_regulatory_status",
              "ftz_exit_port",
              "ftz_exit_date",
              "ftz_exit_permit",
              "ftz_duty_paid",
              "ftz_tax_paid",
            ],
            required: true, // 内连接，只返回有PackageItem的Package
          },
        ],
        attributes: [
          "id",
          "package_code",
          "tracking_no",
          "status",
          "warehouse_location",
          "storage_time",
          "storage_operator",
          "created_at",
          "updated_at",
        ],
        order: [["created_at", "DESC"]],
      });

      // 统计分析
      const statistics = {
        total_packages: packages.length,
        by_regulatory_status: {},
        by_ftz_zone: {},
        by_entry_port: {},
        by_bonded_warehouse: {},
        compliance_rate: 0,
        pending_clearance: 0,
        completed_clearance: 0,
      };

      packages.forEach((pkg) => {
        pkg.items.forEach((item) => {
          // 按监管状态统计 (使用PackageItem的FTZ信息)
          const status = item.ftz_regulatory_status || "unknown";
          statistics.by_regulatory_status[status] =
            (statistics.by_regulatory_status[status] || 0) + 1;

          // 按自贸区统计
          const zone = item.ftz_zone_code || "unknown";
          statistics.by_ftz_zone[zone] =
            (statistics.by_ftz_zone[zone] || 0) + 1;

          // 按入境口岸统计
          const port = item.ftz_entry_port || "unknown";
          statistics.by_entry_port[port] =
            (statistics.by_entry_port[port] || 0) + 1;

          // 按保税仓库统计
          const warehouse = item.ftz_bonded_warehouse || "unknown";
          statistics.by_bonded_warehouse[warehouse] =
            (statistics.by_bonded_warehouse[warehouse] || 0) + 1;

          // 合规性统计
          if (["cleared", "bonded"].includes(item.ftz_regulatory_status)) {
            statistics.completed_clearance++;
          } else {
            statistics.pending_clearance++;
          }
        });
      });

      // 计算合规率 (基于物品数量而非包裹数量)
      const totalItems = packages.reduce(
        (sum, pkg) => sum + pkg.items.length,
        0
      );
      statistics.total_packages = packages.length;
      statistics.total_items = totalItems;
      statistics.compliance_rate =
        totalItems > 0
          ? ((statistics.completed_clearance / totalItems) * 100).toFixed(2) +
            "%"
          : "0%";

      // 按不同格式返回数据
      if (export_format === "csv") {
        // 生成CSV格式
        const csvHeader = [
          "包裹编号",
          "包裹追踪号",
          "预报单号",
          "MAWB",
          "包裹状态",
          "仓库位置",
          "物品追踪号",
          "HS代码",
          "产品名称(英文)",
          "单价",
          "总价",
          "入境口岸",
          "入境日期",
          "入境许可证",
          "海关申报单",
          "自贸区代码",
          "保税仓库",
          "监管状态",
          "出境口岸",
          "出境日期",
          "出境许可证",
          "关税缴纳",
          "税费缴纳",
          "入库时间",
          "操作员",
        ].join(",");

        const csvRows = packages.flatMap((pkg) =>
          pkg.items.map((item) =>
            [
              pkg.package_code,
              pkg.tracking_no || "",
              pkg.forecast?.forecast_code || "",
              pkg.forecast?.mawb || "",
              pkg.status,
              pkg.warehouse_location || "",
              item.tracking_no || "",
              item.hs_code || "",
              item.product_name_en || "",
              item.unit_price || "",
              item.total_price || "",
              item.ftz_entry_port || "",
              item.ftz_entry_date
                ? item.ftz_entry_date.toISOString().split("T")[0]
                : "",
              item.ftz_entry_permit || "",
              item.ftz_customs_declaration || "",
              item.ftz_zone_code || "",
              item.ftz_bonded_warehouse || "",
              item.ftz_regulatory_status || "",
              item.ftz_exit_port || "",
              item.ftz_exit_date
                ? item.ftz_exit_date.toISOString().split("T")[0]
                : "",
              item.ftz_exit_permit || "",
              item.ftz_duty_paid || "",
              item.ftz_tax_paid || "",
              pkg.storage_time
                ? pkg.storage_time
                    .toISOString()
                    .replace("T", " ")
                    .substring(0, 19)
                : "",
              pkg.storage_operator || "",
            ].join(",")
          )
        );

        const csvContent = [csvHeader, ...csvRows].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="ftz-compliance-report-${
            new Date().toISOString().split("T")[0]
          }.csv"`
        );
        return res.send(csvContent);
      }

      // JSON格式返回
      res.json({
        report_info: {
          generated_at: new Date(),
          generated_by: req.user.username,
          filter_criteria: {
            start_date,
            end_date,
            ftz_zone_code,
            regulatory_status,
            entry_port,
          },
        },
        statistics,
        packages: packages.map((pkg) => ({
          package_info: {
            id: pkg.id,
            package_code: pkg.package_code,
            tracking_no: pkg.tracking_no,
            forecast_code: pkg.forecast?.forecast_code,
            mawb: pkg.forecast?.mawb,
            status: pkg.status,
            warehouse_location: pkg.warehouse_location,
            storage_time: pkg.storage_time,
            storage_operator: pkg.storage_operator,
          },
          ftz_compliance: {
            entry_info: {
              entry_port: pkg.ftz_entry_port,
              entry_date: pkg.ftz_entry_date,
              entry_permit: pkg.ftz_entry_permit,
              customs_declaration: pkg.ftz_customs_declaration,
            },
            zone_info: {
              ftz_zone_code: pkg.ftz_zone_code,
              bonded_warehouse: pkg.ftz_bonded_warehouse,
              regulatory_status: pkg.ftz_regulatory_status,
            },
            exit_info: {
              exit_port: pkg.ftz_exit_port,
              exit_date: pkg.ftz_exit_date,
              exit_permit: pkg.ftz_exit_permit,
            },
          },
        })),
      });
    } catch (error) {
      console.error("生成FTZ合规性报告失败:", error);
      res.status(500).json({ error: "生成FTZ合规性报告失败" });
    }
  }
);

// 更新包裹FTZ出境信息
router.post(
  "/update-ftz-exit/:package_id",
  authenticate,
  checkPermission("warehouse.packages.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { package_id } = req.params;
      const {
        ftz_exit_port,
        ftz_exit_date,
        ftz_exit_permit,
        final_regulatory_status = "cleared",
        operator_notes,
      } = req.body;

      const pkg = await Package.findByPk(package_id, {
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["forecast_code", "mawb"],
          },
          {
            model: PackageItem,
            as: "items",
            attributes: ["id", "tracking_no", "ftz_regulatory_status"],
          },
        ],
        transaction,
      });

      if (!pkg) {
        await transaction.rollback();
        return res.status(404).json({ error: "包裹不存在" });
      }

      // 更新PackageItem的FTZ出境信息
      const updateData = {
        ftz_exit_port,
        ftz_exit_date: ftz_exit_date ? new Date(ftz_exit_date) : new Date(),
        ftz_exit_permit,
        ftz_regulatory_status: final_regulatory_status,
      };

      // 确定要更新的PackageItem
      let itemsToUpdate = pkg.items;
      if (req.body.item_id) {
        itemsToUpdate = pkg.items.filter(
          (item) => item.id === req.body.item_id
        );
        if (itemsToUpdate.length === 0) {
          await transaction.rollback();
          return res.status(404).json({ error: "指定的物品不存在" });
        }
      }

      // 批量更新PackageItem
      const updatePromises = itemsToUpdate.map((item) =>
        PackageItem.update(updateData, {
          where: { id: item.id },
          transaction,
        })
      );

      await Promise.all(updatePromises);

      // 记录操作日志
      await PackageLog.create(
        {
          package_id: pkg.id,
          action: "status_updated",
          operator: req.user.username,
          operator_id: req.user.id,
          details: {
            action_type: "ftz_exit_update",
            ftz_exit_info: {
              exit_port: ftz_exit_port,
              exit_date: ftz_exit_date,
              exit_permit: ftz_exit_permit,
              final_status: final_regulatory_status,
            },
            notes: operator_notes,
            timestamp: new Date(),
          },
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "FTZ出境信息更新成功",
        package_info: {
          package_code: pkg.package_code,
          forecast_code: pkg.forecast?.forecast_code,
          mawb: pkg.forecast?.mawb,
        },
        ftz_exit_info: {
          exit_port: ftz_exit_port,
          exit_date: ftz_exit_date,
          exit_permit: ftz_exit_permit,
          regulatory_status: final_regulatory_status,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("更新FTZ出境信息失败:", error);
      res.status(500).json({ error: "更新FTZ出境信息失败" });
    }
  }
);

// 获取FTZ监管状态总览
router.get(
  "/ftz-regulatory-overview",
  authenticate,
  checkPermission("warehouse.forecast.view"),
  async (req, res) => {
    try {
      const { ftz_zone_code } = req.query;

      // PackageItem的筛选条件
      let packageItemWhere = {};
      if (ftz_zone_code) {
        packageItemWhere.ftz_zone_code = ftz_zone_code;
      }
      // 只查询有FTZ监管状态的物品
      packageItemWhere.ftz_regulatory_status = { [db.Sequelize.Op.not]: null };

      // 获取所有相关包裹及其物品
      const packages = await Package.findAll({
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "forecast_code", "mawb", "agent_id"],
          },
          {
            model: PackageItem,
            as: "items",
            where: packageItemWhere,
            attributes: [
              "id",
              "tracking_no",
              "ftz_zone_code",
              "ftz_regulatory_status",
              "ftz_entry_date",
              "ftz_exit_date",
              "ftz_bonded_warehouse",
              "ftz_duty_paid",
              "ftz_tax_paid",
            ],
            required: true, // 内连接
          },
        ],
        attributes: [
          "id",
          "package_code",
          "tracking_no",
          "status",
          "warehouse_location",
          "created_at",
        ],
        order: [["created_at", "DESC"]],
      });

      // 统计各种状态 (基于PackageItem)
      const statusOverview = {
        total_packages: packages.length,
        total_items: packages.reduce((sum, pkg) => sum + pkg.items.length, 0),
        pending: 0,
        cleared: 0,
        bonded: 0,
        exempted: 0,
        in_transit: 0,
        completed_exit: 0,
      };

      const zoneBreakdown = {};
      const warehouseBreakdown = {};

      packages.forEach((pkg) => {
        pkg.items.forEach((item) => {
          // 状态统计 (基于PackageItem)
          const status = item.ftz_regulatory_status;
          if (statusOverview.hasOwnProperty(status)) {
            statusOverview[status]++;
          }

          // 出境完成统计
          if (item.ftz_exit_date) {
            statusOverview.completed_exit++;
          }

          // 按自贸区统计
          const zone = item.ftz_zone_code || "unknown";
          if (!zoneBreakdown[zone]) {
            zoneBreakdown[zone] = {
              total: 0,
              pending: 0,
              cleared: 0,
              bonded: 0,
              exempted: 0,
            };
          }
          zoneBreakdown[zone].total++;
          zoneBreakdown[zone][status] = (zoneBreakdown[zone][status] || 0) + 1;

          // 按保税仓库统计
          const warehouse = item.ftz_bonded_warehouse || "unknown";
          if (!warehouseBreakdown[warehouse]) {
            warehouseBreakdown[warehouse] = {
              total: 0,
              pending: 0,
              cleared: 0,
              bonded: 0,
              exempted: 0,
              items: [],
            };
          }
          warehouseBreakdown[warehouse].total++;
          warehouseBreakdown[warehouse][status] =
            (warehouseBreakdown[warehouse][status] || 0) + 1;
          warehouseBreakdown[warehouse].items.push({
            package_code: pkg.package_code,
            item_tracking_no: item.tracking_no,
            status: item.ftz_regulatory_status,
            forecast_code: pkg.forecast?.forecast_code,
          });
        });
      });

      res.json({
        overview: statusOverview,
        zone_breakdown: zoneBreakdown,
        warehouse_breakdown: warehouseBreakdown,
        compliance_metrics: {
          clearance_rate:
            statusOverview.total_items > 0
              ? `${(
                  ((statusOverview.cleared + statusOverview.exempted) /
                    statusOverview.total_items) *
                  100
                ).toFixed(1)}%`
              : "0%",
          exit_completion_rate:
            statusOverview.total_items > 0
              ? `${(
                  (statusOverview.completed_exit / statusOverview.total_items) *
                  100
                ).toFixed(1)}%`
              : "0%",
          pending_rate:
            statusOverview.total_items > 0
              ? `${(
                  (statusOverview.pending / statusOverview.total_items) *
                  100
                ).toFixed(1)}%`
              : "0%",
        },
      });
    } catch (error) {
      console.error("获取FTZ监管状态总览失败:", error);
      res.status(500).json({ error: "获取FTZ监管状态总览失败" });
    }
  }
);

export default router;
