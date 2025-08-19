import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import { getDeadLetterStats } from "../../utils/auditQueue.js";

const router = express.Router();

// 简单死信监控接口 (需要 OMP 管理权限)
router.get(
  "/audit/dead-letter",
  authenticate,
  checkPermission("omp.audit.view"),
  async (req, res) => {
    try {
      const { limit = 20 } = req.query;
      const stats = await getDeadLetterStats(
        Math.min(200, parseInt(limit) || 20)
      );
      res.json({ success: true, ...stats });
    } catch (e) {
      res.status(500).json({ success: false, message: "获取死信失败" });
    }
  }
);

export default router;
