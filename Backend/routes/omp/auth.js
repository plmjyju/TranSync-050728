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

const router = express.Router();

router.post("/register", async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    let { username, password, name, email } = req.body;
    if (!username || !name)
      return res.status(400).json({ error: "Missing required fields" });

    password = password || "transync1234";

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
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password, client_type = "omp" } = req.body;
    if (!["omp", "agent", "client", "wms"].includes(client_type)) {
      return res.status(400).json({ error: "Unsupported client type" });
    }

    const user = await db.User.findOne({ where: { username, client_type } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, client_type },
      process.env.JWT_SECRET,
      {
        expiresIn: "12h",
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

    res.json({
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
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
