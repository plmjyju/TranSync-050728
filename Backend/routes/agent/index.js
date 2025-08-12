import express from "express";
import customerRoutes from "./customer.js";
import forecastRoutes from "./forecasts.js";
import packageRoutes from "./package.js";

const router = express.Router();

// Agent端路由
router.use("/customers", customerRoutes);
router.use("/forecasts", forecastRoutes);
router.use("/packages", packageRoutes);

export default router;
