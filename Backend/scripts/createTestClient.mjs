// scripts/createTestClient.mjs - 创建测试客户
import dotenv from "dotenv";
dotenv.config();

import db from "../models/index.js";
import bcrypt from "bcrypt";

async function createTestClient() {
  try {
    console.log("🏗️ 创建测试客户...");

    // 创建密码hash
    const password = "123456";
    const hashedPassword = await bcrypt.hash(password, 10);

    const [customer, created] = await db.Customer.findOrCreate({
      where: { adminAccount: "testclient" },
      defaults: {
        customerName: "测试客户Token",
        adminAccount: "testclient",
        passwordHash: hashedPassword,
        email: "testclient@transync.com",
        companyName: "测试公司Token",
        isActive: true,
      },
    });

    if (created) {
      console.log("✅ 测试客户创建成功:");
    } else {
      console.log("⏭️ 测试客户已存在，更新密码:");
      await customer.update({ passwordHash: hashedPassword });
    }

    console.log(`  ID: ${customer.id}`);
    console.log(`  客户名: ${customer.customerName}`);
    console.log(`  登录账号: ${customer.adminAccount}`);
    console.log(`  密码: ${password}`);
    console.log(`  邮箱: ${customer.email}`);
  } catch (error) {
    console.error("❌ 创建失败:", error);
  } finally {
    process.exit(0);
  }
}

createTestClient();
