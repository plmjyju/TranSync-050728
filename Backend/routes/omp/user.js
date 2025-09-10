/*
 * ✅ 用户接口 - 注册与登录
 * 文件路径: routes/omp/auth.js（后续可抽为 routes/common/auth.js）
 * 功能:
 *   - 注册 OMP 用户（默认密码：transync1234，写入 SystemActivity）
 *   - 通用登录接口（支持 OMP / AGENT / CLIENT / WMS，根据 client_type 匹配）
 * 所依赖模块:
 *   - Sequelize
 *   - bcrypt, jsonwebtoken
 *   - utils/recordSystemActivity.js
 */

// ✅ Sequelize 雙模型結構：Inbond + Forecast + ForecastRecord + Pallet（航空板）+ PalletUnload（拆板）+ OperationLog（操作记录）+ InventoryRecord（库存记录）+ SystemActivity（系统行为记录）

// ✅ OMP 注册与登录用户接口
// routes/omp/auth.js
import express from "express";
import db from "../../models/index.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { recordSystemActivity } from "../../utils/recordSystemActivity.js";
import { authenticate } from "../../middlewares/authenticate.js";
import config from "../../config/environment.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { username, password = "transync1234", name, email } = req.body;
    if (!username || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existing = await db.User.findOne({
      where: { username },
      transaction: t,
    });
    if (existing) {
      await t.rollback();
      return res.status(400).json({ error: "Username already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await db.User.create(
      {
        username,
        password: hash,
        name,
        email,
        client_type: "omp",
      },
      { transaction: t }
    );

    await recordSystemActivity(
      {
        userId: user.id,
        clientType: "omp",
        event: "register",
        remark: `OMP用户 ${
          req.user?.username || "系统"
        } 注册新账号 ${username}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    await t.commit();
    return res.status(201).json({ id: user.id, username: user.username });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password, client_type = "omp" } = req.body;
    if (!["omp", "agent", "client", "wms"].includes(client_type)) {
      return res.status(400).json({ error: "Unsupported client type" });
    }

    const user = await db.User.findOne({ where: { username, client_type } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        name: user.name,
        client_type,
        email: user.email,
        role_id: user.role_id,
      },
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
        audience: client_type,
      }
    );

    await recordSystemActivity(
      {
        userId: user.id,
        clientType: client_type,
        event: "login",
        remark: `${client_type.toUpperCase()}用户 ${username} 登录成功`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        client_type,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/change-password", authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await db.User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid old password" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    await user.save();

    await recordSystemActivity(
      {
        userId: user.id,
        clientType: req.user.client_type,
        event: "change-password",
        remark: `用户 ${user.username} 修改密码成功`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to change password" });
  }
});

router.post("/create-user", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      username,
      password = "transync1234",
      name,
      email,
      role_id,
    } = req.body;
    if (!username || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existing = await db.User.findOne({
      where: { username },
      transaction: t,
    });
    if (existing) {
      await t.rollback();
      return res.status(400).json({ error: "Username already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await db.User.create(
      { username, password: hash, name, email, role_id },
      { transaction: t }
    );

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "create-user",
        remark: `管理员 ${req.user.username} 创建用户 ${username}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    await t.commit();
    return res.status(201).json({ id: user.id, username: user.username });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

router.get("/users", authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      role,
      sortBy = "created_at",
      order = "ASC",
      fields,
    } = req.query;

    const where = {};
    if (status !== undefined) where.status = status === "true";
    if (role) where.role_id = role;

    const options = {
      where,
      include: [{ model: db.Role, as: "role" }],
      order: [[sortBy, order.toUpperCase()]],
      limit: parseInt(limit, 10),
      offset: (parseInt(page, 10) - 1) * parseInt(limit, 10),
    };

    if (fields) {
      options.attributes = fields.split(",");
    }

    const { count, rows: users } = await db.User.findAndCountAll(options);

    return res.status(200).json({
      users,
      pagination: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.put("/update-user/:userId", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { userId } = req.params;
    const { name, email, role_id } = req.body;

    const user = await db.User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: "User not found" });
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.role_id = role_id || user.role_id;
    await user.save({ transaction: t });

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "update-user",
        remark: `管理员 ${req.user.username} 更新用户 ${user.username}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    await t.commit();
    return res.status(200).json({ message: "User updated successfully" });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/delete-user/:userId", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { userId } = req.params;

    const user = await db.User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: "User not found" });
    }

    await user.destroy({ transaction: t });

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "delete-user",
        remark: `管理员 ${req.user.username} 删除用户 ${user.username}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    await t.commit();
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/user/:userId", authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await db.User.findByPk(userId, {
      include: [{ model: db.Role, as: "role" }],
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch user details" });
  }
});

router.post("/toggle-user-status", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { userId, status } = req.body;
    if (typeof status !== "boolean" || !userId) {
      return res
        .status(400)
        .json({ error: "Missing required fields or invalid status format" });
    }

    const user = await db.User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: "User not found" });
    }

    user.status = status;
    await user.save({ transaction: t });

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "toggle-user-status",
        remark: `管理员 ${req.user.username} ${status ? "启用" : "停用"}用户 ${
          user.username
        }`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    await t.commit();
    return res.status(200).json({
      message: `User ${status ? "enabled" : "disabled"} successfully`,
    });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: "Failed to toggle user status" });
  }
});

export default router;
