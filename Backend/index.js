import express from "express";
import config from "./config/environment.js";
import { startAuditRedisConsumer } from "./utils/auditQueue.js";
import { getRedis } from "./utils/redisClient.js";

// 打印环境配置信息
config.printDebugInfo();

// 检查环境变量健康状态
const healthCheck = config.checkHealth();
if (healthCheck.status === "error") {
  console.error("❌ 环境配置错误:", healthCheck.message);
  process.exit(1);
} else if (healthCheck.status === "warning") {
  console.warn("⚠️ 环境配置警告:", healthCheck.message);
}

// 使用动态导入确保环境变量已加载
const { default: authenticate } = await import("./middlewares/authenticate.js");
const { default: commonRoutes } = await import("./routes/common/index.js");
const { default: authRoutes } = await import("./routes/auth/login.js");
const { default: db } = await import("./models/index.js");
const { createClientAppRouter } = await import(
  "./utils/createClientAppRouter.js"
);
const { metricsMiddleware } = await import("./metrics/prometheus.js");

// 根据环境变量决定是否同步数据库
if (config.database.syncDb) {
  console.log("🔄 同步数据库结构...");
  await db.sequelize.sync({ alter: true });
  console.log("✅ 数据库同步完成");
} else {
  console.log("⏭️ 跳过数据库同步");
}

const app = express();
app.use(express.json());

// CORS 中间件（基于配置）
const allowedOrigins = (config.security.corsOrigin || "*")
  .split(",")
  .map((s) => s.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  let allowOrigin = "*";
  if (!allowedOrigins.includes("*")) {
    if (origin && allowedOrigins.includes(origin)) {
      allowOrigin = origin;
    } else {
      allowOrigin = allowedOrigins[0] || "";
    }
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Origin", allowOrigin);
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  // 如使用 cookie 跨域再开启 credentials，此处默认关闭避免与 '*' 冲突
  // res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// 公共路由（不需要特定角色权限检查）
app.use("/api/common", commonRoutes);

// 认证路由（系统用户登录）
app.use("/api/auth", authRoutes);

// 加载各端模块
await createClientAppRouter(app, "omp");
await createClientAppRouter(app, "wms");
await createClientAppRouter(app, "warehouse");
await createClientAppRouter(app, "agent");
await createClientAppRouter(app, "client");

app.get("/metrics", metricsMiddleware);

(async () => {
  try {
    await getRedis();
    console.log("Redis connected");
    startAuditRedisConsumer();
  } catch (e) {
    console.warn("Redis not available, using fallback queue", e.message);
  }
})();

app.listen(config.server.port, () => {
  console.log(`🚀 服务器运行在 http://localhost:${config.server.port}`);
  console.log(`📦 应用名称: ${config.app.name} v${config.app.version}`);
  console.log(`🌍 运行环境: ${config.app.environment}`);
});
