import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();
const { OperationRequirement } = db;

// GET /api/client/operation-requirements
// 简化：列出当前可用的处理方式（不做白名单/可见性复杂逻辑）
router.get("/operation-requirements", authenticate, async (req, res) => {
  try {
    if (!req.user || req.user.userType !== "client") {
      return res
        .status(403)
        .json({ success: false, message: "仅限客户端用户" });
    }

    const list = await OperationRequirement.findAll({
      where: { is_active: true },
      order: [
        ["sort_order", "ASC"],
        ["requirement_code", "ASC"],
      ],
    });

    const data = list.map((r) => ({
      id: r.id,
      requirement_code: r.requirement_code,
      requirement_name: r.requirement_name,
      description: r.description,
      handling_mode: r.handling_mode,
      carrier: r.carrier,
      label_abbr: r.label_abbr,
      sort_order: r.sort_order,
      is_active: r.is_active,
    }));

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error("获取客户端 OperationRequirements 失败:", error);
    res.status(500).json({ success: false, message: "获取失败" });
  }
});

export default router;
