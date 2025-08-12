import dotenv from "dotenv";

console.log("1. 加载前的环境变量:");
console.log("DB_HOST:", process.env.DB_HOST);

dotenv.config();

console.log("2. 加载后的环境变量:");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_PORT:", process.env.DB_PORT);
console.log("DB_NAME:", process.env.DB_NAME);

console.log("3. 加载 models/index.js:");
import db from "./models/index.js";

console.log("4. 尝试数据库连接:");
try {
  await db.sequelize.authenticate();
  console.log("✅ 数据库连接成功！");
} catch (error) {
  console.log("❌ 数据库连接失败:", error.message);
}

await db.sequelize.close();
