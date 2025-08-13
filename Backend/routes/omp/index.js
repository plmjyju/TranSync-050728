import express from "express";
import forecastsRoutes from "./forecasts.js";
import forecastsNewRoutes from "./forecasts_new.js";
import operationRequirementsRoutes from "./operation-requirements.js";
import clientRoutes from "./client.js";
import roleRoutes from "./role.js";
import userRoutes from "./user.js";
import permissionsRoutes from "./permissions.js";

const router = express.Router();

// OMP 运营管理路由
router.use("/", forecastsRoutes);
router.use("/", forecastsNewRoutes);
router.use("/", operationRequirementsRoutes);
router.use("/", clientRoutes);
router.use("/", roleRoutes);
router.use("/", userRoutes);
router.use("/permissions", permissionsRoutes);

export default router;
