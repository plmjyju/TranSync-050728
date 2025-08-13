import express from "express";
import authRoutes from "./auth.js";
import taxTypesRoutes from "./taxTypes.js";
import operationRequirementsRoutes from "./operation-requirements.js";

const router = express.Router();

// 健康检查接口
router.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// 公共路由 - 不需要特定角色权限
router.use("/auth", authRoutes);
router.use("/", taxTypesRoutes);
router.use("/", operationRequirementsRoutes);

export default router;
