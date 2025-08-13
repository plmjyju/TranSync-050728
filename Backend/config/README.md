# 环境配置管理系统

## 概述

本项目采用统一的环境配置管理系统，通过 `config/environment.js` 模块集中管理所有环境变量，提供类型安全的配置访问方式。

## 优势

- **统一管理**: 所有环境变量在一个地方定义和访问
- **类型安全**: 提供字符串、数字、布尔值、数组等类型转换
- **默认值**: 为非必需配置提供合理的默认值
- **验证机制**: 启动时自动验证必需的环境变量
- **敏感信息保护**: 在日志和摘要中自动遮蔽敏感信息
- **健康检查**: 提供配置完整性检查功能

## 基本使用

### 1. 导入配置

```javascript
import config from "../config/environment.js";
```

### 2. 访问配置

```javascript
// 服务器配置
const port = config.server.port;
const nodeEnv = config.server.nodeEnv;

// 数据库配置
const dbHost = config.database.host;
const dbName = config.database.name;

// JWT配置
const jwtSecret = config.jwt.secret;
const jwtExpiresIn = config.jwt.expiresIn;
```

## 配置分类

### 服务器配置 (config.server)

- `port`: 服务器端口 (默认: 3000)
- `nodeEnv`: 运行环境 (默认: 'development')
- `testPort`: 测试端口 (默认: 3001)

### 数据库配置 (config.database)

- `host`: 数据库主机地址 (必需)
- `port`: 数据库端口 (默认: 3306)
- `name`: 数据库名称 (必需)
- `user`: 数据库用户名 (必需)
- `password`: 数据库密码 (必需)
- `dialect`: 数据库类型 (默认: 'mysql')
- `syncDb`: 是否同步数据库结构 (默认: false)

### JWT 配置 (config.jwt)

- `secret`: JWT 密钥 (必需)
- `expiresIn`: JWT 过期时间 (默认: '24h')

### 应用配置 (config.app)

- `name`: 应用名称 (默认: 'TranSync')
- `version`: 应用版本 (默认: '1.0.0')
- `environment`: 运行环境 (默认: 'development')

### 日志配置 (config.logging)

- `level`: 日志级别 (默认: 'info')
- `enableConsole`: 启用控制台日志 (默认: true)
- `enableFile`: 启用文件日志 (默认: false)
- `filePath`: 日志文件路径 (默认: './logs/app.log')

### 安全配置 (config.security)

- `corsOrigin`: CORS 允许的源 (默认: '\*')
- `rateLimitWindowMs`: 速率限制窗口期 (默认: 900000ms)
- `rateLimitMax`: 速率限制最大请求数 (默认: 100)
- `bcryptSaltRounds`: bcrypt 盐值轮数 (默认: 10)

## 实际使用示例

### 1. Express 应用配置

```javascript
import express from "express";
import config from "./config/environment.js";

const app = express();

app.listen(config.server.port, () => {
  console.log(`🚀 服务器运行在端口 ${config.server.port}`);
});
```

### 2. 数据库连接

```javascript
import Sequelize from "sequelize";
import config from "../config/environment.js";

const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
  }
);
```

### 3. JWT 中间件

```javascript
import jwt from "jsonwebtoken";
import config from "../config/environment.js";

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "令牌无效" });
  }
};
```

### 4. 条件逻辑

```javascript
import config from "../config/environment.js";

// 基于环境的条件判断
if (config.server.nodeEnv === "development") {
  // 开发环境特有的逻辑
  app.use(morgan("dev"));
}

// 基于配置的功能开关
if (config.database.syncDb) {
  await db.sequelize.sync({ alter: true });
}
```

## 环境变量文件 (.env)

确保 `.env` 文件包含所有必需的环境变量：

```bash
# 服务器配置
PORT=3000
NODE_ENV=production

# 数据库配置 (必需)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database
DB_USER=your_username
DB_PASS=your_password
DB_DIALECT=mysql

# 数据库同步控制
SYNC_DB=false

# JWT配置 (必需)
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=24h

# 应用配置
APP_NAME=TranSync
APP_VERSION=1.0.0

# 日志配置
LOG_LEVEL=info
LOG_CONSOLE=true
LOG_FILE=false

# 安全配置
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
BCRYPT_SALT_ROUNDS=10
```

## 配置验证和调试

### 1. 健康检查

```javascript
import config from "./config/environment.js";

const health = config.checkHealth();
console.log(`配置状态: ${health.status}`);
console.log(`状态信息: ${health.message}`);
```

### 2. 配置摘要

```javascript
// 获取配置摘要（敏感信息已遮蔽）
const summary = config.getSummary();
console.log(JSON.stringify(summary, null, 2));
```

### 3. 调试信息

```javascript
// 在开发环境下打印调试信息
config.printDebugInfo();
```

## 最佳实践

### 1. 统一导入

在项目中统一使用配置模块，避免直接访问 `process.env`：

```javascript
// ❌ 避免这样做
const port = process.env.PORT || 3000;

// ✅ 推荐这样做
import config from "../config/environment.js";
const port = config.server.port;
```

### 2. 类型安全

利用配置模块的类型转换功能：

```javascript
// 自动转换为数字类型
const maxConnections = config.database.maxConnections; // number

// 自动转换为布尔类型
const enableLogging = config.logging.enableConsole; // boolean

// 自动转换为数组类型
const allowedTypes = config.upload.allowedTypes; // string[]
```

### 3. 错误处理

在应用启动时进行配置验证：

```javascript
import config from "./config/environment.js";

// 应用启动前检查配置
const health = config.checkHealth();
if (health.status === "error") {
  console.error("配置错误:", health.message);
  process.exit(1);
}
```

### 4. 环境区分

基于环境配置实现不同的行为：

```javascript
// 根据环境启用不同的中间件
if (config.server.nodeEnv === "development") {
  app.use(morgan("dev"));
  app.use(cors());
} else {
  app.use(helmet());
  app.use(compression());
}
```

## 新增配置

如需添加新的配置项，在 `config/environment.js` 中扩展相应的配置对象：

```javascript
// 添加新的配置分类
get newFeature() {
  return {
    enabled: this.getBoolean('NEW_FEATURE_ENABLED', false),
    apiKey: this.getString('NEW_FEATURE_API_KEY', ''),
    timeout: this.getNumber('NEW_FEATURE_TIMEOUT', 5000),
  };
}
```

## 迁移指南

如果您正在从直接使用 `process.env` 迁移到配置系统：

1. 替换所有 `process.env.VARIABLE_NAME` 为 `config.category.variableName`
2. 确保 `.env` 文件包含所有必需的变量
3. 运行健康检查确保配置完整
4. 测试所有功能确保迁移成功

这个统一的配置管理系统将让您的应用更加健壮、可维护，并提供更好的开发体验。
