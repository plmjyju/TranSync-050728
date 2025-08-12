// routes/client/packages.js
import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
const router = express.Router();

// 获取当前客户的所有包裹列表
router.get(
  "/packages",
  authenticate,
  checkPermission("client.package.view"),
  async (req, res) => {
    try {
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

      res.json(packages);
    } catch (err) {
      console.error("获取客户包裹列表失败:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

// 获取包裹详情（含清关、物流等信息）
router.get(
  "/packages/:id",
  authenticate,
  checkPermission("client.package.view"),
  async (req, res) => {
    try {
      const pkg = await db.Package.findByPk(req.params.id, {
        where: { customer_id: req.user.id },
        attributes: { exclude: ["customer_id"] },
      });

      if (!pkg || pkg.customer_id !== req.user.id) {
        return res.status(404).json({ message: "包裹不存在或无权限" });
      }

      res.json(pkg);
    } catch (err) {
      console.error("获取包裹详情失败:", err);
      res.status(500).json({ message: "服务器错误" });
    }
  }
);

export default router;
