import express from "express";
import { checkPermission } from "../../middlewares/checkPermission.js";
const router = express.Router();

router.post("/create", checkPermission("inbound.create"), async (req, res) => {
  // 创建入库逻辑
  res.json({ message: "入库单创建成功" });
});

export default router;
