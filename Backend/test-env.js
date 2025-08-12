import dotenv from "dotenv";

dotenv.config();

console.log("=== .env 配置检查 ===");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_PORT:", process.env.DB_PORT);
console.log("DB_NAME:", process.env.DB_NAME);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASS:", process.env.DB_PASS ? "***已设置***" : "未设置");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "***已设置***" : "未设置");
console.log("PORT:", process.env.PORT);

// 测试数据库连接配置
import Sequelize from "sequelize";

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: true, // 开启日志以查看连接详情
  }
);

console.log("\n=== 尝试数据库连接 ===");
try {
  await sequelize.authenticate();
  console.log("✅ 数据库连接成功！");
} catch (error) {
  console.log("❌ 数据库连接失败:");
  console.log("错误详情:", error.message);
  console.log("连接配置:", {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
  });
}

await sequelize.close();
