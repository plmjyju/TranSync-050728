import db from "../models/index.js";
import { Op } from "sequelize";

// 可视为到仓(inbound)的板状态集合，与路由内保持一致
const STORED_STATES = [
  "stored",
  "waiting_clear",
  "delivered",
  "dispatched",
  "unpacked",
];

// 已迁移到独立 FTZ 库存台账系统, 此文件占位防止旧引用报错
export async function recalcDeliveryOrderStats() {
  return null;
}
