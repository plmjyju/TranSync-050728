// config/example.js - 环境配置使用示例

import config from "./environment.js";

// 基本使用示例
console.log("=== 环境配置使用示例 ===");

// 1. 服务器配置
console.log("服务器端口:", config.server.port);
console.log("运行环境:", config.server.nodeEnv);

// 2. 数据库配置
console.log("数据库主机:", config.database.host);
console.log("数据库名称:", config.database.name);

// 3. JWT配置
console.log("JWT密钥已设置:", !!config.jwt.secret);
console.log("JWT过期时间:", config.jwt.expiresIn);

// 4. 应用配置
console.log("应用名称:", config.app.name);
console.log("应用版本:", config.app.version);

// 5. 获取配置摘要（敏感信息已遮蔽）
console.log("\n=== 配置摘要 ===");
console.log(JSON.stringify(config.getSummary(), null, 2));

// 6. 健康检查
console.log("\n=== 健康检查 ===");
const health = config.checkHealth();
console.log(`状态: ${health.status}`);
console.log(`消息: ${health.message}`);

// 7. 条件判断示例
if (config.server.nodeEnv === "development") {
  console.log("\n🔧 开发环境特有功能已启用");
  config.printDebugInfo();
}

// 8. 在中间件中使用示例
export const jwtMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "缺少令牌" });
  }

  try {
    // 使用统一配置
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "令牌无效" });
  }
};

// 9. 在数据库连接中使用示例
export const createDatabaseConnection = () => {
  const dbConfig = config.database;

  return new Sequelize(dbConfig.name, dbConfig.user, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    // 其他配置...
  });
};

// 10. 在express应用中使用示例
export const createExpressApp = () => {
  const app = express();

  // 基于环境配置启用功能
  if (config.logging.enableConsole) {
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  // 启动服务器
  app.listen(config.server.port, () => {
    console.log(`🚀 服务器运行在端口 ${config.server.port}`);
  });

  return app;
};

export default config;
