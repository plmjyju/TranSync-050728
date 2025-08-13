// POST /api/agent/forecasts – 创建预报表

// PATCH /api/agent/forecasts/:id/mawb – 填写/修改 MAWB 提单号

// POST /api/agent/forecasts/:id/packages – 添加包裹（附带自动生成 HAWB）

// GET /api/agent/forecasts – 获取当前用户创建的所有预报板

// GET /api/agent/forecasts/:id – 获取某个预报板 + 包裹详情列表

// routes/agent/forecasts.js
import express from "express";
import db from "../../models/index.js";
import { syncMAWBToPackages } from "../../utils/syncMAWBToPackages.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

const { Pallet } = db;
const router = express.Router();

// 创建预报表
router.post(
  "/forecasts",
  authenticate,
  checkPermission("agent.forecast.create"),
  async (req, res) => {
    try {
      const { warehouse_id, delivery_mode, remark } = req.body;
      const created_by = req.user.id;

      const forecast = await db.Forecast.create({
        warehouse_id,
        delivery_mode,
        remark,
        created_by,
        status: "draft",
      });

      res.status(201).json({ message: "✅ 预报表创建成功", forecast });
    } catch (err) {
      console.error("创建预报表出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 更新 MAWB
router.patch(
  "/forecasts/:id/mawb",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { mawb } = req.body;

      const forecast = await db.Forecast.findByPk(id, { transaction });
      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ message: "预报表不存在" });
      }

      // 更新预报单的MAWB
      forecast.mawb = mawb;
      await forecast.save({ transaction });

      // 使用工具函数同步更新包裹的MAWB字段
      const updatedPackages = await syncMAWBToPackages(id, mawb, transaction);

      await transaction.commit();

      res.json({
        message: "✅ MAWB 更新成功，已同步到包裹",
        mawb,
        updated_packages: updatedPackages,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("更新 MAWB 出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 获取预报表列表
router.get(
  "/forecasts",
  authenticate,
  checkPermission("agent.forecast.view"),
  async (req, res) => {
    try {
      const forecasts = await db.Forecast.findAll({
        where: { created_by: req.user.id },
        order: [["created_at", "DESC"]],
      });

      res.json(forecasts);
    } catch (err) {
      console.error("获取预报表列表出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 获取预报表详情 + 包裹列表
router.get(
  "/forecasts/:id",
  authenticate,
  checkPermission("agent.forecast.view"),
  async (req, res) => {
    try {
      const forecast = await db.Forecast.findByPk(req.params.id, {
        include: [{ model: db.Package, as: "packages" }],
      });

      if (!forecast || forecast.created_by !== req.user.id) {
        return res.status(404).json({ message: "预报表不存在或无权限查看" });
      }

      res.json(forecast);
    } catch (err) {
      console.error("获取预报表详情出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 添加单个包裹（可扩展为批量）
import { generateHAWB } from "../../utils/generateHAWB.js";

router.post(
  "/forecasts/:id/packages",
  authenticate,
  checkPermission("agent.package.create"),
  async (req, res) => {
    try {
      const { id: forecast_id } = req.params;
      const {
        customer_id,
        length_cm,
        width_cm,
        height_cm,
        weight_kg,
        clearance_info,
        split_type,
        remark,
      } = req.body;

      const forecast = await db.Forecast.findByPk(forecast_id);
      if (!forecast) {
        return res.status(404).json({ message: "预报表不存在" });
      }

      const customer = await db.User.findByPk(customer_id);
      if (!customer || customer.client_type !== "customer") {
        return res.status(400).json({ message: "无效客户" });
      }

      const hawb = await generateHAWB(customer.username);

      const pkg = await db.Package.create({
        forecast_id,
        customer_id,
        hawb,
        length_cm,
        width_cm,
        height_cm,
        weight_kg,
        clearance_info,
        split_type,
        remark,
        status: "pending",
      });

      res.json({ message: "✅ 包裹添加成功", hawb: pkg.hawb, id: pkg.id });
    } catch (err) {
      console.error("添加包裹出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 为预报单中的客户分配/更新HAWB
router.patch(
  "/forecasts/:id/hawb",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id: forecast_id } = req.params;
      const { client_id, hawb } = req.body;

      // 验证预报单是否属于当前货代
      const forecast = await db.Forecast.findOne({
        where: {
          id: forecast_id,
          created_by: req.user.id,
        },
        transaction,
      });

      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ message: "预报单不存在或无权限修改" });
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

      await transaction.commit();

      res.json({
        message: "✅ HAWB 分配成功",
        hawb,
        client_name: client.username,
        updated_packages: updateResult[0],
        forecast_code: forecast.forecast_code,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("分配 HAWB 出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 获取预报单中各客户的HAWB分配情况
router.get(
  "/forecasts/:id/hawb-assignments",
  authenticate,
  checkPermission("agent.forecast.view"),
  async (req, res) => {
    try {
      const { id: forecast_id } = req.params;

      // 验证预报单是否属于当前货代
      const forecast = await db.Forecast.findOne({
        where: {
          id: forecast_id,
          created_by: req.user.id,
        },
      });

      if (!forecast) {
        return res.status(404).json({ message: "预报单不存在或无权限查看" });
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
            attributes: ["id", "username", "company_name"],
          },
        ],
        group: ["client_id", "hawb", "client.id"],
        order: [["client_id", "ASC"]],
      });

      res.json({
        forecast: {
          id: forecast.id,
          forecast_code: forecast.forecast_code,
          mawb: forecast.mawb,
        },
        hawb_assignments: hawbAssignments,
      });
    } catch (err) {
      console.error("获取HAWB分配情况出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 批量分配HAWB给多个客户
router.post(
  "/forecasts/:id/batch-hawb",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id: forecast_id } = req.params;
      const { assignments } = req.body; // [{ client_id, hawb }, ...]

      // 验证预报单是否属于当前货代
      const forecast = await db.Forecast.findOne({
        where: {
          id: forecast_id,
          created_by: req.user.id,
        },
        transaction,
      });

      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ message: "预报单不存在或无权限修改" });
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

      for (const assignment of assignments) {
        const { client_id, hawb } = assignment;

        // 验证客户是否存在
        const client = await db.User.findByPk(client_id, { transaction });
        if (!client || client.client_type !== "client") {
          continue; // 跳过无效客户
        }

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
            hawb,
            updated_packages: updateResult[0],
          });
        }
      }

      await transaction.commit();

      res.json({
        message: "✅ 批量HAWB分配完成",
        forecast_code: forecast.forecast_code,
        results,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("批量分配 HAWB 出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 获取预报单的板列表
router.get(
  "/forecasts/:id/pallets",
  authenticate,
  checkPermission("agent.forecast.view"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const created_by = req.user.id;

      // 检查预报单权限
      const forecast = await db.Forecast.findOne({
        where: { id, created_by },
      });

      if (!forecast) {
        return res.status(404).json({ message: "预报单不存在或无权访问" });
      }

      const pallets = await Pallet.findAll({
        where: { forecast_id: id },
        attributes: [
          "id",
          "pallet_code",
          "custom_board_no",
          "pallet_type",
          "status",
          "box_count",
          "weight_kg",
          "location_code",
          "created_at",
        ],
        order: [["created_at", "DESC"]],
      });

      res.json({ pallets });
    } catch (err) {
      console.error("获取板列表出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 更新板的自定义板号
router.patch(
  "/forecasts/:forecastId/pallets/:palletId/custom-board-no",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { forecastId, palletId } = req.params;
      const { custom_board_no } = req.body;
      const created_by = req.user.id;

      // 检查预报单权限
      const forecast = await db.Forecast.findOne({
        where: { id: forecastId, created_by },
        transaction,
      });

      if (!forecast) {
        await transaction.rollback();
        return res.status(404).json({ message: "预报单不存在或无权访问" });
      }

      // 检查板是否属于该预报单
      const pallet = await Pallet.findOne({
        where: { id: palletId, forecast_id: forecastId },
        transaction,
      });

      if (!pallet) {
        await transaction.rollback();
        return res.status(404).json({ message: "板不存在或不属于该预报单" });
      }

      // 更新自定义板号
      await pallet.update(
        {
          custom_board_no: custom_board_no || null,
          operator: req.user.username,
          operator_id: req.user.id,
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "自定义板号更新成功",
        pallet: {
          id: pallet.id,
          pallet_code: pallet.pallet_code,
          custom_board_no: custom_board_no || null,
        },
      });
    } catch (err) {
      await transaction.rollback();
      console.error("更新自定义板号出错:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 提交 Forecast：校验每个包裹至少一个操作需求并统计需求分布
router.post(
  "/forecasts/:id/submit",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const forecast = await db.Forecast.findOne({
        where: { id, agent_id: req.user.id },
        transaction: t,
      });
      if (!forecast) {
        await t.rollback();
        return res
          .status(404)
          .json({ success: false, message: "预报表不存在或无权限" });
      }
      if (forecast.status !== "draft") {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "仅草稿状态可提交" });
      }

      const packages = await db.Package.findAll({
        where: { forecast_id: id },
        include: [
          {
            model: db.OperationRequirement,
            as: "operationRequirements",
            through: { attributes: [] },
            attributes: ["id", "requirement_code", "requirement_name"],
          },
        ],
        transaction: t,
      });

      if (packages.length === 0) {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "无包裹，不能提交" });
      }

      const invalid = packages.filter(
        (p) => !p.operationRequirements || p.operationRequirements.length === 0
      );
      if (invalid.length > 0) {
        await t.rollback();
        return res
          .status(400)
          .json({
            success: false,
            message: "存在未配置操作需求的包裹",
            invalid_package_ids: invalid.map((p) => p.id),
          });
      }

      const agg = new Map();
      for (const pkg of packages) {
        for (const reqObj of pkg.operationRequirements) {
          const key = reqObj.requirement_code;
          if (!agg.has(key)) {
            agg.set(key, {
              requirement_code: key,
              requirement_name: reqObj.requirement_name,
              count: 0,
            });
          }
          agg.get(key).count += 1;
        }
      }
      const summary = Array.from(agg.values()).sort((a, b) =>
        a.requirement_code.localeCompare(b.requirement_code)
      );

      await forecast.update(
        {
          status: "booked",
          requirement_summary_json: JSON.stringify(summary),
          requirement_validation_passed: true,
        },
        { transaction: t }
      );

      await t.commit();
      return res.json({
        success: true,
        message: "提交成功",
        forecast_id: forecast.id,
        requirement_summary: summary,
      });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ success: false, message: "提交失败" });
    }
  }
);

export default router;
