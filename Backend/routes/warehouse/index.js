import express from "express";
import palletRouter from "./pallet.js";
import deliveryOrderRouter from "./delivery-order.js";
import forecastStatusRouter from "./forecast-status.js";
import deliveryStatusRouter from "./delivery-status.js";
import packageStorageRouter from "./package-storage.js";
import enhancedWarehouseConfirmRouter from "./enhanced-warehouse-confirm.js";
import ftzComplianceRouter from "./ftz-compliance.js";
import palletAllocationRouter from "./pallet-allocation.js";
import warehouseLocationRouter from "./warehouse-location.js";
import simplePalletAllocationRouter from "./simple-pallet-allocation.js";
import outboundOrderRouter from "./outbound-orders.js";

const router = express.Router();

// 挂载各个子路由
router.use("/pallets", palletRouter);
router.use("/delivery-orders", deliveryOrderRouter);
router.use("/forecast-status", forecastStatusRouter);
router.use("/delivery-status", deliveryStatusRouter);
router.use("/package-storage", packageStorageRouter);
router.use("/enhanced-confirm", enhancedWarehouseConfirmRouter);
router.use("/ftz-compliance", ftzComplianceRouter);
router.use("/pallet-allocations", palletAllocationRouter);
router.use("/warehouse-locations", warehouseLocationRouter);
router.use("/simple-allocation", simplePalletAllocationRouter);
router.use("/outbound-orders", outboundOrderRouter);

export default router;
