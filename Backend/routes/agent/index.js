import express from "express";
import customerRoutes from "./customer.js";
import forecastRoutes from "./forecasts.js";
import packageRoutes from "./package.js";
import opReqRoutes from "./operation-requirements.js";
import inbondRoutes from "./inbond.js";

const router = express.Router();

// Agent端路由
router.use("/customers", customerRoutes);
router.use("/forecasts", forecastRoutes);
router.use("/packages", packageRoutes);
router.use("/inbonds", inbondRoutes);
router.use("/", opReqRoutes);

export default router;
