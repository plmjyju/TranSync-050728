import express from "express";
import db from "../../models/index.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import config from "../../config/environment.js";
import { writeAudit } from "../../utils/auditHelper.js";

const router = express.Router();

// 新增：与 routes/client/index.js 对齐的客户端权限清单
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
  "client.packages.edit", // 兼容旧权限
  "client.package.track",
  "client.statistics.view",
  "client.invoice.view",
  "client.inbond.view",
  "client.inbond.create",
  "client.inbond.update",
]);

// ===== 通用工具 =====
function buildFail(res, code, message, status = 400, extra = {}) {
  return res.status(status).json({ success: false, code, message, ...extra });
}
function validateRequiredFields(fields, body) {
  const miss = fields.filter((f) => !body[f]);
  if (miss.length)
    throw new Error(`Missing required fields: ${miss.join(",")}`);
}
function generateToken(user, userType, extra = {}) {
  const payload = {
    id: user.id,
    userType,
    username: user.username || user.customerName,
    email: user.email,
    ...extra,
  };
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

// ===== Client 登录（仅 Customer 表，严格，不再回退 User）=====
router.post("/login/client", async (req, res) => {
  const start = Date.now();
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return buildFail(res, "CLIENT_LOGIN_PARAM_MISSING", "缺少用户名或密码");

    const customer = await db.Customer.findOne({
      where: { adminAccount: username, isActive: true },
    });
    if (!customer)
      return buildFail(res, "CLIENT_LOGIN_INVALID", "用户名或密码错误", 401);

    const ok = await bcrypt.compare(password, customer.passwordHash || "");
    if (!ok)
      return buildFail(res, "CLIENT_LOGIN_INVALID", "用户名或密码错误", 401);

    // 修改：在 token 中注入 role 与 permissions
    const token = generateToken(customer, "client", {
      customerName: customer.customerName,
      companyName: customer.companyName,
      salesRepId: customer.salesRepId,
      role: "client_standard",
      permissions: CLIENT_PERMISSIONS,
    });

    // 审计
    writeAudit({
      module: "client",
      entityType: "Customer",
      entityId: customer.id,
      action: "client-login",
      user: { id: customer.id, username: customer.adminAccount },
      before: null,
      after: null,
      extra: { ip: req.ip },
    });

    return res.json({
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
        permissions: CLIENT_PERMISSIONS,
      },
      took_ms: Date.now() - start,
    });
  } catch (e) {
    console.error("Client login error", e);
    return buildFail(res, "CLIENT_LOGIN_ERROR", "登录失败", 500);
  }
});

// ===== Agent 登录 =====
router.post("/login/agent", async (req, res) => {
  try {
    validateRequiredFields(["username", "password"], req.body || {});
    const { username, password } = req.body;
    // 加载角色与权限
    const user = await db.User.findOne({
      where: { username },
      include: [
        {
          model: db.Role,
          as: "role",
          include: [
            {
              model: db.Permission,
              as: "permissions",
              through: { attributes: [] },
            },
          ],
        },
      ],
    });
    if (!user)
      return buildFail(res, "AGENT_LOGIN_INVALID", "用户名或密码错误", 401);
    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok)
      return buildFail(res, "AGENT_LOGIN_INVALID", "用户名或密码错误", 401);

    if (!user.role)
      return buildFail(
        res,
        "AGENT_NO_ROLE",
        "用户未分配角色，请联系管理员",
        403
      );

    const perms = (user.role.permissions || []).map((p) => p.name);
    const token = generateToken(user, "agent", {
      roleId: user.role.id,
      roleName: user.role.name,
      roleDisplayName: user.role.display_name,
      permissions: perms,
    });

    return res.json({
      success: true,
      message: "登录成功",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        userType: "agent",
        role: {
          id: user.role.id,
          name: user.role.name,
          displayName: user.role.display_name,
        },
        permissions: perms,
        permissionCount: perms.length,
      },
    });
  } catch (e) {
    if (e.message.startsWith("Missing"))
      return buildFail(res, "AGENT_LOGIN_PARAM_MISSING", e.message);
    console.error(e);
    return buildFail(res, "AGENT_LOGIN_ERROR", "登录失败", 500);
  }
});

// ===== Warehouse 登录 =====
router.post("/login/warehouse", async (req, res) => {
  try {
    validateRequiredFields(["username", "password"], req.body || {});
    const { username, password } = req.body;
    const user = await db.User.findOne({
      where: { username },
      include: [
        {
          model: db.Role,
          as: "role",
          include: [
            {
              model: db.Permission,
              as: "permissions",
              through: { attributes: [] },
            },
          ],
        },
      ],
    });
    if (!user)
      return buildFail(res, "WAREHOUSE_LOGIN_INVALID", "用户名或密码错误", 401);
    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok)
      return buildFail(res, "WAREHOUSE_LOGIN_INVALID", "用户名或密码错误", 401);

    if (!user.role)
      return buildFail(
        res,
        "WAREHOUSE_NO_ROLE",
        "用户未分配角色，请联系管理员",
        403
      );

    const perms = (user.role.permissions || []).map((p) => p.name);
    const token = generateToken(user, "warehouse", {
      roleId: user.role.id,
      roleName: user.role.name,
      roleDisplayName: user.role.display_name,
      permissions: perms,
    });

    return res.json({
      success: true,
      message: "登录成功",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        userType: "warehouse",
        role: {
          id: user.role.id,
          name: user.role.name,
          displayName: user.role.display_name,
        },
        permissions: perms,
        permissionCount: perms.length,
      },
    });
  } catch (e) {
    if (e.message.startsWith("Missing"))
      return buildFail(res, "WAREHOUSE_LOGIN_PARAM_MISSING", e.message);
    console.error(e);
    return buildFail(res, "WAREHOUSE_LOGIN_ERROR", "登录失败", 500);
  }
});

// ===== OMP 登录 =====
router.post("/login/omp", async (req, res) => {
  try {
    validateRequiredFields(["username", "password"], req.body || {});
    const { username, password } = req.body;
    const user = await db.User.findOne({
      where: { username },
      include: [
        {
          model: db.Role,
          as: "role",
          include: [
            {
              model: db.Permission,
              as: "permissions",
              through: { attributes: [] },
            },
          ],
        },
      ],
    });
    if (!user)
      return buildFail(res, "OMP_LOGIN_INVALID", "用户名或密码错误", 401);
    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok)
      return buildFail(res, "OMP_LOGIN_INVALID", "用户名或密码错误", 401);

    if (!user.role)
      return buildFail(res, "OMP_NO_ROLE", "用户未分配角色，请联系管理员", 403);

    const perms = (user.role.permissions || []).map((p) => p.name);
    const token = generateToken(user, "omp", {
      roleId: user.role.id,
      roleName: user.role.name,
      roleDisplayName: user.role.display_name,
      permissions: perms,
    });

    return res.json({
      success: true,
      message: "登录成功",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        userType: "omp",
        role: {
          id: user.role.id,
          name: user.role.name,
          displayName: user.role.display_name,
        },
        permissions: perms,
        permissionCount: perms.length,
      },
    });
  } catch (e) {
    if (e.message.startsWith("Missing"))
      return buildFail(res, "OMP_LOGIN_PARAM_MISSING", e.message);
    console.error(e);
    return buildFail(res, "OMP_LOGIN_ERROR", "登录失败", 500);
  }
});

export default router;
