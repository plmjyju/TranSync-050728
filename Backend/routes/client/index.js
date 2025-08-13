import express from "express";
import forecastsRouter from "./forecasts.js";
import packagesRouter from "./packages.js";
import inbondRouter from "./inbond.js";
import packageRouter from "./package.js";
import opReqRouter from "./operation-requirements.js";
import db from "../../models/index.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import config from "../../config/environment.js";

const router = express.Router();

// 客户端登录
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "请提供用户名和密码",
      });
    }

    const customer = await db.Customer.findOne({
      where: { adminAccount: username, isActive: true },
    });

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: "用户名或密码错误",
      });
    }

    // Use bcrypt to compare password
    const isPasswordValid = await bcrypt.compare(
      password,
      customer.passwordHash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "用户名或密码错误",
      });
    }

    // 客户端用户的默认权限
    const clientPermissions = [
      "client.access",
      "client.dashboard.view",
      "client.forecast.view",
      "client.package.view",
      "client.packages.edit",
      "client.package.track",
      "client.statistics.view",
      "client.invoice.view",
      "client.inbond.view",
      "client.inbond.create",
      "client.inbond.update",
    ];

    const token = jwt.sign(
      {
        id: customer.id,
        userType: "client",
        customerName: customer.customerName,
        email: customer.email,
        salesRepId: customer.salesRepId,
        role: "client_standard", // 客户端默认角色
        permissions: clientPermissions, // 客户端权限列表
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

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
        role: "client_standard",
        permissions: clientPermissions,
      },
    });
  } catch (err) {
    console.error("客户端登录错误:", err.message);
    return res.status(500).json({
      success: false,
      message: "登录失败，请稍后重试",
    });
  }
});

// 客户端主页
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "客户端仪表板",
    user: req.user,
    timestamp: new Date().toISOString(),
  });
});

// 客户端测试路由
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "客户端测试接口正常",
    user: req.user,
  });
});

// 客户端个人信息
router.get("/profile", (req, res) => {
  res.json({
    success: true,
    message: "用户信息",
    user: {
      id: req.user.id,
      customerName: req.user.customerName,
      userType: req.user.userType,
      companyName: req.user.companyName,
      email: req.user.email,
    },
  });
});

// 子路由
router.use("/forecasts", forecastsRouter);
router.use("/packages", packagesRouter);
router.use("/", inbondRouter); // inbond routes are mounted directly
router.use("/", packageRouter); // package routes are mounted directly
router.use("/", opReqRouter); // operation requirements

export default router;
