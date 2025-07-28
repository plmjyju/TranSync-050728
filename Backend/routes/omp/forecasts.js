// routes/wms/forecasts.js
import express from "express";
import db from "../../models/index.js";
const router = express.Router();

// 获取已到仓的预报板列表（按时间）
router.get("/forecasts/arrived", async (req, res) => {
  try {
    const forecasts = await db.Forecast.findAll({
      where: { status: "arrived" },
      order: [["created_at", "DESC"]],
    });
    res.json(forecasts);
  } catch (err) {
    console.error("获取到仓预报板失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 获取某个预报板下的所有包裹
router.get("/forecasts/:id", async (req, res) => {
  try {
    const forecast = await db.Forecast.findByPk(req.params.id, {
      include: [{ model: db.Package, as: "packages" }],
    });
    if (!forecast) {
      return res.status(404).json({ message: "预报表不存在" });
    }
    res.json(forecast);
  } catch (err) {
    console.error("获取板下包裹失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 更新包裹状态（如到仓、已分拣）
router.patch("/packages/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const pkg = await db.Package.findByPk(req.params.id);
    if (!pkg) {
      return res.status(404).json({ message: "包裹不存在" });
    }
    pkg.status = status;
    await pkg.save();

    await db.PackageLog.create({
      package_id: pkg.id,
      action: "status_update",
      description: `状态更新为 ${status}`,
      operated_by: req.user.id,
    });

    res.json({ message: "✅ 包裹状态更新成功", status });
  } catch (err) {
    console.error("更新包裹状态失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 设置分货方式（如整箱交邮/拆箱交邮）
router.patch("/packages/:id/split", async (req, res) => {
  try {
    const { split_type } = req.body;
    const pkg = await db.Package.findByPk(req.params.id);
    if (!pkg) {
      return res.status(404).json({ message: "包裹不存在" });
    }
    pkg.split_type = split_type;
    await pkg.save();

    await db.PackageLog.create({
      package_id: pkg.id,
      action: "split_update",
      description: `分货方式设置为 ${split_type}`,
      operated_by: req.user.id,
    });

    res.json({ message: "✅ 分货方式已更新", split_type });
  } catch (err) {
    console.error("更新分货方式失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

// 获取包裹操作日志
router.get("/packages/:id/logs", async (req, res) => {
  try {
    const logs = await db.PackageLog.findAll({
      where: { package_id: req.params.id },
      order: [["created_at", "DESC"]],
    });
    res.json(logs);
  } catch (err) {
    console.error("获取日志失败:", err);
    res.status(500).json({ message: "服务器错误" });
  }
});

export default router;
