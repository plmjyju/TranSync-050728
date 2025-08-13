import dotenv from "dotenv";
dotenv.config();

import db from "./models/index.js";

async function checkCustomers() {
  try {
    const customers = await db.Customer.findAll();
    console.log("找到的客户:", customers.length);
    customers.forEach((c) => {
      console.log(
        "ID:",
        c.id,
        "Name:",
        c.customerName,
        "Password Hash:",
        c.passwordHash ? "有密码" : "无密码"
      );
    });
  } catch (error) {
    console.error("查询失败:", error.message);
  }
  process.exit();
}

checkCustomers();
