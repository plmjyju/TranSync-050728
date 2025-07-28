// utils/createClientAppRouter.js
import express from "express";
import { authenticate } from "../middlewares/authenticate.js";
import { checkClientType } from "../middlewares/checkClientType.js";

export const createClientAppRouter = async (app, clientType) => {
  try {
    // 动态加载对应端的路由入口文件
    const routeModule = await import(`../routes/${clientType}/index.js`);
    const router = routeModule.default;

    // 构造路径前缀
    const prefix = `/api/${clientType}`;

    // 安全封装：自动加入鉴权 & 类型限制
    app.use(prefix, authenticate, checkClientType(clientType), router);

    console.log(`✅ ${clientType.toUpperCase()} 路由挂载完成 → ${prefix}`);
  } catch (err) {
    console.error(`❌ 路由加载失败: ${clientType}`, err.message);
  }
};
