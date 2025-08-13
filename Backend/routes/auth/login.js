// routes/auth/login.js - 通用系统用户登录
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../../models/index.js";
import config from "../../config/environment.js";

const router = express.Router();
const { User, Role, Permission } = db;

// 系统用户登录（OMP, Warehouse, Agent, WMS用户）
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "请提供用户名和密码",
      });
    }

    // 查找用户并包含角色和权限信息
    const user = await User.findOne({
      where: { username, status: true }, // 使用status字段而不是isActive
      include: [
        {
          model: Role,
          as: "role",
          include: [
            {
              model: Permission,
              as: "permissions",
              through: { attributes: [] }, // 排除中间表字段
            },
          ],
        },
      ],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "用户名或密码错误",
      });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "用户名或密码错误",
      });
    }

    // 检查用户是否有角色
    if (!user.role) {
      return res.status(403).json({
        success: false,
        message: "用户未分配角色，请联系管理员",
      });
    }

    // 提取权限列表
    const permissions = user.role.permissions.map((p) => p.name);

    // 生成包含角色和权限的token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        userType: user.userType || "system",
        roleId: user.role.id,
        roleName: user.role.name,
        roleDisplayName: user.role.display_name,
        permissions: permissions,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      success: true,
      message: "登录成功",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        role: {
          id: user.role.id,
          name: user.role.name,
          displayName: user.role.display_name,
          description: user.role.description,
        },
        permissions: permissions,
        permissionCount: permissions.length,
      },
    });
  } catch (error) {
    console.error("系统用户登录错误:", error);
    res.status(500).json({
      success: false,
      message: "登录失败，请稍后重试",
      error: error.message,
    });
  }
});

export default router;
