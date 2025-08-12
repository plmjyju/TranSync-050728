import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";

const router = express.Router();
const { Package, PalletAllocation, PalletAllocationLog, Forecast } = db;

// 简化分板接口 - 只需要箱唛号和板号
router.post(
  "/simple-pallet-allocation",
  authenticate,
  checkPermission("warehouse.pallet.allocate"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { allocations } = req.body;
      // allocations 格式: [{ package_code: "PKG001", pallet_number: "PLT001" }, ...]

      if (!Array.isArray(allocations) || allocations.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: "请提供分板数据，格式: [{ package_code, pallet_number }]",
        });
      }

      const results = {
        success: [],
        failed: [],
        summary: {
          total: allocations.length,
          success_count: 0,
          failed_count: 0,
        },
      };

      for (const allocation of allocations) {
        const { package_code, pallet_number } = allocation;

        try {
          // 1. 查找包裹
          const pkg = await Package.findOne({
            where: { package_code },
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "mawb"],
              },
            ],
            transaction,
          });

          if (!pkg) {
            results.failed.push({
              package_code,
              pallet_number,
              error: "包裹不存在",
            });
            continue;
          }

          // 2. 检查包裹是否已分配
          if (pkg.assigned_pallet_number) {
            results.failed.push({
              package_code,
              pallet_number,
              error: `包裹已分配到板子: ${pkg.assigned_pallet_number}`,
            });
            continue;
          }

          // 3. 查找或创建板子分配记录
          let palletAllocation = await PalletAllocation.findOne({
            where: { pallet_number },
            transaction,
          });

          if (!palletAllocation) {
            // 自动创建板子分配记录
            palletAllocation = await PalletAllocation.create(
              {
                pallet_number,
                awb_number: pkg.forecast?.mawb || "UNKNOWN",
                total_package_count: 1, // 初始为1，后面会更新
                allocated_package_count: 0,
                status: "allocating",
                created_by: req.user.id,
              },
              { transaction }
            );

            // 记录创建日志
            await PalletAllocationLog.create(
              {
                pallet_allocation_id: palletAllocation.id,
                action: "created",
                operator_id: req.user.id,
                details: {
                  auto_created: true,
                  pallet_number,
                  awb_number: pkg.forecast?.mawb || "UNKNOWN",
                },
                notes: `自动创建板子分配: ${pallet_number}`,
              },
              { transaction }
            );
          }

          // 4. 验证AWB匹配
          if (
            pkg.forecast?.mawb &&
            palletAllocation.awb_number !== "UNKNOWN" &&
            palletAllocation.awb_number !== pkg.forecast.mawb
          ) {
            results.failed.push({
              package_code,
              pallet_number,
              error: `AWB不匹配: 包裹AWB(${pkg.forecast.mawb}) != 板子AWB(${palletAllocation.awb_number})`,
            });
            continue;
          }

          // 5. 分配包裹到板子
          await pkg.update(
            { assigned_pallet_number: pallet_number },
            { transaction }
          );

          // 6. 更新板子分配计数
          const newAllocatedCount =
            palletAllocation.allocated_package_count + 1;
          await palletAllocation.update(
            {
              allocated_package_count: newAllocatedCount,
              // 如果AWB之前是UNKNOWN，更新为实际AWB
              awb_number: pkg.forecast?.mawb || palletAllocation.awb_number,
            },
            { transaction }
          );

          // 7. 记录分配日志
          await PalletAllocationLog.create(
            {
              pallet_allocation_id: palletAllocation.id,
              action: "package_allocated",
              operator_id: req.user.id,
              details: {
                package_code,
                package_id: pkg.id,
                tracking_no: pkg.tracking_no,
                allocated_count: newAllocatedCount,
              },
              notes: `分配包裹 ${package_code} 到板子 ${pallet_number}`,
            },
            { transaction }
          );

          results.success.push({
            package_code,
            pallet_number,
            package_id: pkg.id,
            allocated_count: newAllocatedCount,
          });
          results.summary.success_count++;
        } catch (error) {
          console.error(`分配包裹 ${package_code} 失败:`, error);
          results.failed.push({
            package_code,
            pallet_number,
            error: error.message || "分配失败",
          });
          results.summary.failed_count++;
        }
      }

      await transaction.commit();

      // 返回结果
      const statusCode = results.summary.failed_count > 0 ? 207 : 200; // 207 = Multi-Status
      res.status(statusCode).json({
        message: `分板处理完成: 成功 ${results.summary.success_count}, 失败 ${results.summary.failed_count}`,
        results,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("分板处理失败:", error);
      res.status(500).json({ error: "分板处理失败" });
    }
  }
);

// 批量查询包裹分板状态
router.post(
  "/check-pallet-status",
  authenticate,
  checkPermission("warehouse.pallet.view"),
  async (req, res) => {
    try {
      const { package_codes } = req.body;

      if (!Array.isArray(package_codes) || package_codes.length === 0) {
        return res.status(400).json({
          error: "请提供包裹箱唛号列表",
        });
      }

      const packages = await Package.findAll({
        where: {
          package_code: { [db.Sequelize.Op.in]: package_codes },
        },
        attributes: [
          "id",
          "package_code",
          "tracking_no",
          "assigned_pallet_number",
          "status",
        ],
        include: [
          {
            model: PalletAllocation,
            as: "palletAllocation",
            attributes: [
              "id",
              "pallet_number",
              "awb_number",
              "status",
              "total_package_count",
              "allocated_package_count",
            ],
            required: false,
          },
        ],
      });

      const packageMap = {};
      packages.forEach((pkg) => {
        packageMap[pkg.package_code] = {
          package_id: pkg.id,
          package_code: pkg.package_code,
          tracking_no: pkg.tracking_no,
          assigned_pallet_number: pkg.assigned_pallet_number,
          package_status: pkg.status,
          pallet_info: pkg.palletAllocation
            ? {
                pallet_id: pkg.palletAllocation.id,
                pallet_number: pkg.palletAllocation.pallet_number,
                awb_number: pkg.palletAllocation.awb_number,
                pallet_status: pkg.palletAllocation.status,
                total_packages: pkg.palletAllocation.total_package_count,
                allocated_packages:
                  pkg.palletAllocation.allocated_package_count,
              }
            : null,
          is_allocated: !!pkg.assigned_pallet_number,
        };
      });

      // 标记未找到的包裹
      const results = package_codes.map((code) => {
        return (
          packageMap[code] || {
            package_code: code,
            found: false,
            error: "包裹不存在",
          }
        );
      });

      res.json({
        message: "包裹分板状态查询完成",
        results,
        summary: {
          total: package_codes.length,
          found: packages.length,
          allocated: packages.filter((pkg) => pkg.assigned_pallet_number)
            .length,
        },
      });
    } catch (error) {
      console.error("查询分板状态失败:", error);
      res.status(500).json({ error: "查询分板状态失败" });
    }
  }
);

// 移除包裹分板
router.post(
  "/remove-pallet-allocation",
  authenticate,
  checkPermission("warehouse.pallet.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { package_codes } = req.body;

      if (!Array.isArray(package_codes) || package_codes.length === 0) {
        return res.status(400).json({
          error: "请提供要移除分板的包裹箱唛号列表",
        });
      }

      const results = {
        success: [],
        failed: [],
        summary: {
          total: package_codes.length,
          success_count: 0,
          failed_count: 0,
        },
      };

      for (const package_code of package_codes) {
        try {
          const pkg = await Package.findOne({
            where: { package_code },
            transaction,
          });

          if (!pkg) {
            results.failed.push({
              package_code,
              error: "包裹不存在",
            });
            continue;
          }

          if (!pkg.assigned_pallet_number) {
            results.failed.push({
              package_code,
              error: "包裹未分配到板子",
            });
            continue;
          }

          const pallet_number = pkg.assigned_pallet_number;

          // 移除分配
          await pkg.update({ assigned_pallet_number: null }, { transaction });

          // 更新板子计数
          const palletAllocation = await PalletAllocation.findOne({
            where: { pallet_number },
            transaction,
          });

          if (palletAllocation) {
            await palletAllocation.update(
              {
                allocated_package_count: Math.max(
                  0,
                  palletAllocation.allocated_package_count - 1
                ),
                status:
                  palletAllocation.allocated_package_count <= 1
                    ? "created"
                    : palletAllocation.status,
              },
              { transaction }
            );

            // 记录日志
            await PalletAllocationLog.create(
              {
                pallet_allocation_id: palletAllocation.id,
                action: "package_removed",
                operator_id: req.user.id,
                details: {
                  package_code,
                  package_id: pkg.id,
                  remaining_count: palletAllocation.allocated_package_count - 1,
                },
                notes: `移除包裹 ${package_code} 从板子 ${pallet_number}`,
              },
              { transaction }
            );
          }

          results.success.push({
            package_code,
            removed_from_pallet: pallet_number,
          });
          results.summary.success_count++;
        } catch (error) {
          results.failed.push({
            package_code,
            error: error.message || "移除失败",
          });
          results.summary.failed_count++;
        }
      }

      await transaction.commit();

      const statusCode = results.summary.failed_count > 0 ? 207 : 200;
      res.status(statusCode).json({
        message: `移除分板完成: 成功 ${results.summary.success_count}, 失败 ${results.summary.failed_count}`,
        results,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("移除分板失败:", error);
      res.status(500).json({ error: "移除分板失败" });
    }
  }
);

export default router;
