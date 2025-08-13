// middlewares/errorHandler.js
import process from "process";
import config from "../config/environment.js";

// 客户端错误处理中间件
export const clientErrorHandler = (err, req, res, next) => {
  // 不在生产环境打印详细错误信息
  if (config.server.nodeEnv !== "production") {
    console.error("Client API Error:", {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: err.stack,
    });
  } else {
    // 生产环境只记录基本信息
    console.error("Client API Error:", {
      path: req.path,
      method: req.method,
      error: err.message,
    });
  }

  // 根据错误类型返回友好的错误信息
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      success: false,
      message: "请求数据格式不正确",
      errors: err.errors.map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      success: false,
      message: "数据已存在，请检查重复项",
    });
  }

  if (err.name === "SequelizeForeignKeyConstraintError") {
    return res.status(400).json({
      success: false,
      message: "关联数据不存在，请检查相关信息",
    });
  }

  if (err.name === "SequelizeConnectionError") {
    return res.status(503).json({
      success: false,
      message: "服务暂时不可用，请稍后重试",
    });
  }

  // JWT 错误
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Token 无效，请重新登录",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token 已过期，请重新登录",
    });
  }

  // 通用错误处理
  const statusCode = err.status || err.statusCode || 500;
  const message = statusCode === 500 ? "服务器内部错误" : err.message;

  res.status(statusCode).json({
    success: false,
    message: message,
  });
};

// 通用异步错误包装器
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 错误处理
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `接口 ${req.method} ${req.originalUrl} 不存在`,
  });
};
