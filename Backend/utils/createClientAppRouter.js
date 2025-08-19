// utils/createClientAppRouter.js
import express from "express";
import { authenticate } from "../middlewares/authenticate.js";
import { checkPermission } from "../middlewares/checkPermission.js";
import {
  clientErrorHandler,
  notFoundHandler,
} from "../middlewares/errorHandler.js";

export const createClientAppRouter = async (app, clientType) => {
  try {
    // 动态加载对应端的路由入口文件
    const routeModule = await import(`../routes/${clientType}/index.js`);
    const router = routeModule.default;

    // 构造路径前缀
    const prefix = `/api/${clientType}`;

    // 根据不同端口应用相应的权限系统
    if (clientType === "client") {
      // 客户端需要特殊处理登录路由
      app.use(
        prefix,
        (req, res, next) => {
          // 跳过登录路由的认证 - 使用originalUrl或path检查
          const requestPath = req.originalUrl || req.url;
          if (
            (requestPath === `${prefix}/login` || req.path === "/login") &&
            req.method === "POST"
          ) {
            return next();
          }
          return authenticate(req, res, next);
        },
        router
      );

      // 为客户端路由添加专门的错误处理
      app.use(prefix, clientErrorHandler);
    } else {
      // 其他端需要认证和相应的系统访问权限
      const accessPermission = `${clientType}.access`;

      app.use(
        prefix,
        authenticate,
        checkPermission(accessPermission), // 启用端口访问权限检查
        router
      );

      // 附加 OMP 专属监控路由
      if (clientType === "omp") {
        const { default: auditDeadLetterRoutes } = await import(
          "../routes/omp/auditDeadLetter.js"
        );
        app.use(prefix, auditDeadLetterRoutes);
      }
    }

    console.log(`✅ ${clientType.toUpperCase()} 路由挂载完成 → ${prefix}`);
  } catch (err) {
    console.error(`❌ 路由加载失败: ${clientType}`, err.message);
  }
};
