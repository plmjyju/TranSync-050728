// config/environment.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * 环境变量配置类
 * 统一管理所有环境变量的获取和验证
 */
class EnvironmentConfig {
  constructor() {
    this.validateRequiredEnvVars();
  }

  // 服务器配置
  get server() {
    return {
      port: this.getNumber("PORT", 3000),
      nodeEnv: this.getString("NODE_ENV", "development"),
      testPort: this.getNumber("TEST_PORT", 3001),
    };
  }

  // 数据库配置
  get database() {
    return {
      host: this.getString("DB_HOST"),
      port: this.getNumber("DB_PORT", 3306),
      name: this.getString("DB_NAME"),
      user: this.getString("DB_USER"),
      password: this.getString("DB_PASS"),
      dialect: this.getString("DB_DIALECT", "mysql"),
      syncDb: this.getBoolean("SYNC_DB", false),
    };
  }

  // JWT配置
  get jwt() {
    return {
      secret: this.getString("JWT_SECRET", "your-secret-key"),
      expiresIn: this.getString("JWT_EXPIRES_IN", "24h"),
    };
  }

  // 应用配置
  get app() {
    return {
      name: this.getString("APP_NAME", "TranSync"),
      version: this.getString("APP_VERSION", "1.0.0"),
      environment: this.getString("NODE_ENV", "development"),
    };
  }

  // 日志配置
  get logging() {
    return {
      level: this.getString("LOG_LEVEL", "info"),
      enableConsole: this.getBoolean("LOG_CONSOLE", true),
      enableFile: this.getBoolean("LOG_FILE", false),
      filePath: this.getString("LOG_FILE_PATH", "./logs/app.log"),
    };
  }

  // 安全配置
  get security() {
    return {
      corsOrigin: this.getString("CORS_ORIGIN", "*"),
      rateLimitWindowMs: this.getNumber("RATE_LIMIT_WINDOW_MS", 900000), // 15分钟
      rateLimitMax: this.getNumber("RATE_LIMIT_MAX", 100), // 每窗口期最大请求数
      bcryptSaltRounds: this.getNumber("BCRYPT_SALT_ROUNDS", 10),
    };
  }

  // 邮件配置（如果需要）
  get email() {
    return {
      smtpHost: this.getString("SMTP_HOST", ""),
      smtpPort: this.getNumber("SMTP_PORT", 587),
      smtpUser: this.getString("SMTP_USER", ""),
      smtpPass: this.getString("SMTP_PASS", ""),
      fromEmail: this.getString("FROM_EMAIL", ""),
    };
  }

  // 文件上传配置
  get upload() {
    return {
      maxFileSize: this.getNumber("MAX_FILE_SIZE", 10485760), // 10MB
      allowedTypes: this.getArray("ALLOWED_FILE_TYPES", [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "pdf",
      ]),
      uploadPath: this.getString("UPLOAD_PATH", "./uploads"),
    };
  }

  // Redis配置（如果使用）
  get redis() {
    return {
      host: this.getString("REDIS_HOST", "localhost"),
      port: this.getNumber("REDIS_PORT", 6379),
      password: this.getString("REDIS_PASSWORD", ""),
      db: this.getNumber("REDIS_DB", 0),
    };
  }

  // 获取字符串类型环境变量
  getString(key, defaultValue = "") {
    const value = process.env[key];
    if (value === undefined || value === null) {
      if (defaultValue === "" && this.isRequired(key)) {
        throw new Error(`必需的环境变量 ${key} 未设置`);
      }
      return defaultValue;
    }
    return value;
  }

  // 获取数字类型环境变量
  getNumber(key, defaultValue = 0) {
    const value = process.env[key];
    if (value === undefined || value === null) {
      return defaultValue;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`环境变量 ${key} 必须是有效的数字，当前值: ${value}`);
    }
    return parsed;
  }

  // 获取布尔类型环境变量
  getBoolean(key, defaultValue = false) {
    const value = process.env[key];
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return value.toLowerCase() === "true";
  }

  // 获取数组类型环境变量（逗号分隔）
  getArray(key, defaultValue = []) {
    const value = process.env[key];
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }
    return value.split(",").map((item) => item.trim());
  }

  // 检查是否为必需的环境变量
  isRequired(key) {
    const requiredVars = [
      "DB_HOST",
      "DB_NAME",
      "DB_USER",
      "DB_PASS",
      "JWT_SECRET",
    ];
    return requiredVars.includes(key);
  }

  // 验证必需的环境变量
  validateRequiredEnvVars() {
    const requiredVars = [
      "DB_HOST",
      "DB_NAME",
      "DB_USER",
      "DB_PASS",
      "JWT_SECRET",
    ];

    const missingVars = requiredVars.filter((key) => {
      const value = process.env[key];
      return value === undefined || value === null || value === "";
    });

    if (missingVars.length > 0) {
      throw new Error(`缺少必需的环境变量: ${missingVars.join(", ")}`);
    }
  }

  // 获取所有配置的摘要（敏感信息会被遮蔽）
  getSummary() {
    return {
      server: {
        port: this.server.port,
        nodeEnv: this.server.nodeEnv,
      },
      database: {
        host: this.database.host,
        port: this.database.port,
        name: this.database.name,
        user: this.database.user,
        password: "***已设置***",
        dialect: this.database.dialect,
        syncDb: this.database.syncDb,
      },
      jwt: {
        secret: this.jwt.secret ? "***已设置***" : "未设置",
        expiresIn: this.jwt.expiresIn,
      },
      app: this.app,
      logging: this.logging,
      security: {
        ...this.security,
        bcryptSaltRounds: this.security.bcryptSaltRounds,
      },
    };
  }

  // 检查环境变量是否完整
  checkHealth() {
    try {
      this.validateRequiredEnvVars();

      // 检查数据库连接参数
      if (!this.database.host || !this.database.name || !this.database.user) {
        return {
          status: "error",
          message: "数据库配置不完整",
        };
      }

      // 检查JWT密钥
      if (!this.jwt.secret || this.jwt.secret === "your-secret-key") {
        return {
          status: "warning",
          message: "JWT密钥使用默认值，建议在生产环境中更换",
        };
      }

      return {
        status: "ok",
        message: "环境变量配置正常",
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  }

  // 开发环境下打印配置信息
  printDebugInfo() {
    if (this.server.nodeEnv === "development") {
      console.log("🔧 环境变量配置信息:");
      console.log("================================");
      console.log(`服务器端口: ${this.server.port}`);
      console.log(`运行环境: ${this.server.nodeEnv}`);
      console.log(`数据库主机: ${this.database.host}`);
      console.log(`数据库端口: ${this.database.port}`);
      console.log(`数据库名称: ${this.database.name}`);
      console.log(`数据库用户: ${this.database.user}`);
      console.log(
        `数据库密码: ${this.database.password ? "***已设置***" : "未设置"}`
      );
      console.log(`JWT密钥: ${this.jwt.secret ? "***已设置***" : "未设置"}`);
      console.log(`同步数据库: ${this.database.syncDb}`);
      console.log("================================");
    }
  }
}

// 创建单例实例
const config = new EnvironmentConfig();

// 导出配置实例和类
export default config;
export { EnvironmentConfig };

// 兼容 CommonJS 导出
export const environment = config;
