import express from "express";
import authRoutes from "./auth.js";
import taxTypesRoutes from "./taxTypes.js";
import operationRequirementsRoutes from "./operation-requirements.js";
import authenticate from "../../middlewares/authenticate.js";
import crypto from "crypto";

const router = express.Router();

// 健康检查接口
router.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// 当前登录用户信息（权限拉取/版本检测）
router.get("/me", authenticate, (req, res) => {
  const perms = Array.from(new Set(req.user?.permissions || []));
  const permsVersion = crypto
    .createHash("sha256")
    .update(JSON.stringify(perms.sort()))
    .digest("hex");

  return res.json({
    success: true,
    message: "ok",
    id: req.user?.id,
    userType: req.user?.userType,
    username: req.user?.username || req.user?.customerName,
    role: req.user?.roleName || req.user?.role || null,
    tenant_id: req.user?.tenant_id || null,
    warehouse_id: req.user?.warehouse_id || null,
    permissions: perms,
    permsVersion,
  });
});

// 公共路由 - 不需要特定角色权限
router.use("/auth", authRoutes);
// 兼容旧路径：/api/common/login/*
router.use("/login", authRoutes);
router.use("/", taxTypesRoutes);
router.use("/", operationRequirementsRoutes);

export default router;
