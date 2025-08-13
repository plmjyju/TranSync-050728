// 出库单种子数据初始化脚本
import db from "../models/index.js";
import config from "../config/environment.js";

const { OutboundOrder, OutboundOrderLog } = db;

export const seedOutboundOrders = async () => {
  try {
    console.log("开始初始化出库单种子数据...");

    // 清空现有数据（开发环境）
    if (config.server.nodeEnv === "development") {
      await OutboundOrderLog.destroy({ where: {} });
      await OutboundOrder.destroy({ where: {} });
      console.log("已清空现有出库单数据");
    }

    console.log("出库单种子数据初始化完成");
  } catch (error) {
    console.error("出库单种子数据初始化失败:", error);
    throw error;
  }
};

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  seedOutboundOrders()
    .then(() => {
      console.log("出库单种子数据初始化成功");
      process.exit(0);
    })
    .catch((error) => {
      console.error("出库单种子数据初始化失败:", error);
      process.exit(1);
    });
}
