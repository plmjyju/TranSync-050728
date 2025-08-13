// scripts/checkCustomers.mjs - 检查客户数据
import dotenv from "dotenv";
dotenv.config();

import db from "../models/index.js";

async function checkCustomers() {
  try {
    console.log("🔍 查询客户数据...");

    const customers = await db.Customer.findAll({
      attributes: ["id", "customerName", "adminAccount", "email", "isActive"],
      limit: 10,
    });

    console.log(`📋 找到 ${customers.length} 个客户:`);
    customers.forEach((customer) => {
      console.log(`  ID: ${customer.id}`);
      console.log(`  客户名: ${customer.customerName}`);
      console.log(`  登录账号: ${customer.adminAccount}`);
      console.log(`  邮箱: ${customer.email}`);
      console.log(`  状态: ${customer.isActive ? "激活" : "未激活"}`);
      console.log(`  ---`);
    });
  } catch (error) {
    console.error("❌ 查询失败:", error);
  } finally {
    process.exit(0);
  }
}

checkCustomers();
