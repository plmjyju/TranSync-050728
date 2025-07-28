// POST /api/agent/forecasts – 创建预报表

// PATCH /api/agent/forecasts/:id/mawb – 填写/修改 MAWB 提单号

// POST /api/agent/forecasts/:id/packages – 添加包裹（附带自动生成 HAWB）

// GET /api/agent/forecasts – 获取当前用户创建的所有预报板

// GET /api/agent/forecasts/:id – 获取某个预报板 + 包裹详情列表

// routes/agent/forecasts.js
import express from "express";
import db from "../../models/index.js";
const router = express.Router();

// 创建预报表
router.post("/forecasts", async (req, res) => {
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
});

// 更新 MAWB
router.patch("/forecasts/:id/mawb", async (req, res) => {
  try {
    const { id } = req.params;
    const { mawb } = req.body;

    const forecast = await db.Forecast.findByPk(id);
    if (!forecast) {
      return res.status(404).json({ message: "预报表不存在" });
    }

    forecast.mawb = mawb;
    await forecast.save();

    res.json({ message: "✅ MAWB 更新成功", mawb });
  } catch (err) {
    console.error("更新 MAWB 出错:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 获取预报表列表
router.get("/forecasts", async (req, res) => {
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
});

// 获取预报表详情 + 包裹列表
router.get("/forecasts/:id", async (req, res) => {
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
});

// 添加单个包裹（可扩展为批量）
import { generateHAWB } from "../../utils/generateHAWB.js";

router.post("/forecasts/:id/packages", async (req, res) => {
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
});

export default router;
