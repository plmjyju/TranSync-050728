import express from "express";
import forecastsRouter from "./forecasts.js";
import inbondRouter from "./inbond.js";
import packageRouter from "./package.js";
import opReqRouter from "./operation-requirements.js";
import itemTemplateRouter from "./item-templates.js";
import db from "../../models/index.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import config from "../../config/environment.js";
import authenticate from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

const router = express.Router();

// ================= 工具 & 常量 =================
const CLIENT_PERMISSIONS = Object.freeze([
  "client.access",
  "client.dashboard.view",
  "client.forecast.view",
  "client.package.view",
  "client.package.create",
  "client.package.update",
  "client.package.delete",
  "client.package.item.add",
  "client.package.item.view",
  "client.package.item.update", // 新增：允许编辑包裹明细
  "client.packages.edit", // 兼容旧权限（后续可移除）
  "client.package.track",
  "client.statistics.view",
  "client.invoice.view",
  "client.inbond.view",
  "client.inbond.create",
  "client.inbond.update",
]);

const buildError = (code, message, extra = {}) => ({
  success: false,
  code,
  message,
  ...extra,
});

const buildTokenPayload = (customer) => ({
  id: customer.id,
  userType: "client",
  customerName: customer.customerName,
  email: customer.email,
  salesRepId: customer.salesRepId,
  role: "client_standard",
  permissions: CLIENT_PERMISSIONS,
});

// ================= 登录 =================
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res
        .status(400)
        .json(buildError("CLIENT_LOGIN_PARAM_MISSING", "请提供用户名和密码"));
    }

    const customer = await db.Customer.findOne({
      where: { adminAccount: username, isActive: true },
    });
    if (!customer) {
      return res
        .status(401)
        .json(buildError("CLIENT_LOGIN_INVALID", "用户名或密码错误"));
    }

    const ok = await bcrypt.compare(password, customer.passwordHash || "");
    if (!ok) {
      return res
        .status(401)
        .json(buildError("CLIENT_LOGIN_INVALID", "用户名或密码错误"));
    }

    const payload = buildTokenPayload(customer);
    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    return res.status(200).json({
      success: true,
      message: "登录成功",
      token,
      user: {
        id: customer.id,
        customerName: customer.customerName,
        companyName: customer.companyName,
        email: customer.email,
        salesRepId: customer.salesRepId,
        userType: "client",
        role: payload.role,
        permissions: payload.permissions,
      },
    });
  } catch (err) {
    console.error("客户端登录错误:", err);
    return res
      .status(500)
      .json(buildError("CLIENT_LOGIN_ERROR", "登录失败，请稍后重试"));
  }
});

// ================= 基础信息路由（需认证） =================
router.get(
  "/",
  authenticate,
  checkPermission("client.dashboard.view"),
  (req, res) => {
    res.json({
      success: true,
      message: "客户端仪表板",
      user: req.user,
      timestamp: new Date().toISOString(),
    });
  }
);

router.get(
  "/test",
  authenticate,
  checkPermission("client.access"),
  (req, res) => {
    res.json({ success: true, message: "客户端测试接口正常", user: req.user });
  }
);

router.get(
  "/profile",
  authenticate,
  checkPermission("client.access"),
  (req, res) => {
    const u = req.user;
    res.json({
      success: true,
      message: "用户信息",
      user: {
        id: u.id,
        customerName: u.customerName,
        userType: u.userType,
        companyName: u.companyName,
        email: u.email,
      },
    });
  }
);

// ================= 子路由 =================
router.use("/forecasts", forecastsRouter);
router.use("/", inbondRouter);
router.use("/", packageRouter);
router.use("/", opReqRouter);
router.use("/", itemTemplateRouter);

export default router;
