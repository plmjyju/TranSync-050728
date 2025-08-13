// routes/client/packages.js
import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import { asyncHandler } from "../../middlewares/errorHandler.js";

const router = express.Router();

// 获取当前客户的所有包裹列表
router.get(
  "/",
  authenticate,
  checkPermission("client.package.view"),
  asyncHandler(async (req, res) => {
    const packages = await db.Package.findAll({
      where: { customer_id: req.user.id },
      order: [["created_at", "DESC"]],
      attributes: [
        "id",
        "hawb",
        "length_cm",
        "width_cm",
        "height_cm",
        "weight_kg",
        "status",
        "split_type",
        "created_at",
      ],
    });

    res.json({
      success: true,
      message: "获取包裹列表成功",
      data: packages,
      count: packages.length,
    });
  })
);

// 获取包裹详情（含清关、物流等信息）
router.get(
  "/:id",
  authenticate,
  checkPermission("client.package.view"),
  asyncHandler(async (req, res) => {
    const pkg = await db.Package.findByPk(req.params.id, {
      where: { customer_id: req.user.id },
      attributes: { exclude: ["customer_id"] },
    });

    if (!pkg || pkg.customer_id !== req.user.id) {
      return res.status(404).json({
        success: false,
        message: "包裹不存在或无权限访问",
      });
    }

    res.json({
      success: true,
      message: "获取包裹详情成功",
      data: pkg,
    });
  })
);

export default router;
