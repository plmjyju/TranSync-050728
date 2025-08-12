import dotenv from "dotenv";
import express from "express";

// 首先加载环境变量
dotenv.config();

console.log("=== 环境变量检查 ===");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_PORT:", process.env.DB_PORT);
console.log("DB_NAME:", process.env.DB_NAME);
console.log("DB_USER:", process.env.DB_USER);

// 使用动态导入确保环境变量已加载
const { default: authenticate } = await import("./middlewares/authenticate.js");
const { default: commonRoutes } = await import("./routes/common/index.js");
const { default: db } = await import("./models/index.js");
const { createClientAppRouter } = await import(
  "./utils/createClientAppRouter.js"
);
await db.sequelize.sync({ alter: true });
const app = express();
app.use(express.json());

// 公共路由（不需要特定角色权限检查）
app.use("/api/common", commonRoutes);

// 加载各端模块
await createClientAppRouter(app, "omp");
await createClientAppRouter(app, "wms");
await createClientAppRouter(app, "warehouse");
await createClientAppRouter(app, "agent");
await createClientAppRouter(app, "client");

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
