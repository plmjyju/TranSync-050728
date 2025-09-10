// routes/customer.js
import express from "express";
import bcrypt from "bcrypt";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import { buildError, ERROR_CODES } from "../../utils/errors.js";
import {
  writeAudit,
  pickSnapshot,
  withAuditTransaction,
} from "../../utils/auditHelper.js";
import { logRead, logViewDetail } from "../../utils/logRead.js";
import { createRateLimiter } from "../../utils/redisRateLimit.js";
import { applyScopeToWhere } from "../../utils/scope.js";

const router = express.Router();

// 使用 Redis 构建创建客户速率限制器 (key 前缀, 窗口秒, 次数)
const createCustomerLimiter = createRateLimiter("agent:createCustomer", 60, 10);

function requireFields(body, fields) {
  const missing = fields.filter((f) => !body[f]);
  return missing;
}

function maskEmail(email) {
  if (!email) return email;
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return name.slice(0, 2) + "***@" + domain;
}

function roleCtx(req) {
  const roleName = req.user.roleName || req.user.role?.name || "";
  const perms = req.user.permissions || [];
  const isSuper = perms.includes("*") || roleName === "super_admin";
  const isAgentManager = roleName === "agent_manager";
  const isAgent = req.user.userType === "agent";
  return { roleName, perms, isSuper, isAgentManager, isAgent };
}

// 创建客户
router.post(
  "/",
  authenticate,
  checkPermission("customer.create"),
  async (req, res) => {
    const agent = req.user;
    if (agent.userType !== "system" && agent.userType !== "agent") {
      return res
        .status(403)
        .json(
          buildError(ERROR_CODES.PERMISSION_DENIED, "仅货代账号可创建客户")
        );
    }
    const allowed = await createCustomerLimiter(agent.id);
    if (!allowed.ok) {
      return res.status(429).json(
        buildError(ERROR_CODES.CUSTOMER_RATE_LIMIT, "创建过于频繁", {
          retry_after_sec: allowed.retryAfter,
        })
      );
    }

    const {
      customerName,
      companyName,
      contactName,
      telephone,
      email,
      address,
      remark,
      adminAccount,
      password,
      salesRepId,
    } = req.body || {};
    const missing = requireFields(req.body || {}, [
      "customerName",
      "companyName",
      "adminAccount",
      "password",
    ]);
    if (missing.length) {
      return res
        .status(400)
        .json(
          buildError(
            ERROR_CODES.CUSTOMER_CREATE_INVALID_INPUT,
            "缺少必要字段",
            { missing }
          )
        );
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json(
          buildError(ERROR_CODES.CUSTOMER_CREATE_INVALID_INPUT, "密码至少8位")
        );
    }

    try {
      const result = await withAuditTransaction(
        db.sequelize,
        async (t, audits) => {
          const existsUser = await db.User.findOne({
            where: { username: adminAccount },
            transaction: t,
          });
          if (existsUser)
            throw buildError(
              ERROR_CODES.CUSTOMER_ACCOUNT_EXISTS,
              "管理员账号已存在"
            );
          if (email) {
            const existsEmail = await db.User.findOne({
              where: { email },
              transaction: t,
            });
            if (existsEmail)
              throw buildError(
                ERROR_CODES.CUSTOMER_EMAIL_EXISTS,
                "邮箱已被占用"
              );
          }
          const hashed = await bcrypt.hash(password, 10);
          const newUser = await db.User.create(
            {
              username: adminAccount,
              password_hash: hashed,
              full_name: customerName,
              email,
              status: true,
            },
            { transaction: t }
          );

          // 强制：Agent 创建客户时，salesRepId 固定为当前 Agent
          const salesRepFinal =
            agent.userType === "agent" ? agent.id : salesRepId || agent.id;

          const newCustomer = await db.Customer.create(
            {
              customerName,
              companyName,
              contactName: contactName || null,
              telephone: telephone || null,
              email: email || null,
              address: address || null,
              remark: remark || null,
              adminAccount,
              passwordHash: hashed,
              salesRepId: salesRepFinal,
              // 多租户/仓库作用域字段（若模型包含）
              ...(db.Customer.rawAttributes?.tenant_id && req.user.tenant_id
                ? { tenant_id: req.user.tenant_id }
                : {}),
              ...(db.Customer.rawAttributes?.warehouse_id &&
              req.user.warehouse_id
                ? { warehouse_id: req.user.warehouse_id }
                : {}),
            },
            { transaction: t }
          );
          if (db.AgentCustomer) {
            await db.AgentCustomer.create(
              { agent_id: agent.id, customer_id: newCustomer.id },
              { transaction: t }
            );
          }
          audits.push({
            module: "agent",
            entityType: "Customer",
            entityId: newCustomer.id,
            action: "create",
            user: req.user,
            before: null,
            after: pickSnapshot(newCustomer, [
              "id",
              "customerName",
              "companyName",
              "salesRepId",
              "isActive",
              "created_at",
            ]),
            extra: { user_id: newUser.id, email: maskEmail(email) },
            ip: req.ip,
            ua: req.headers["user-agent"],
          });
          return { newCustomer };
        }
      );
      return res.status(201).json({
        success: true,
        message: "客户创建成功",
        customer: {
          id: result.newCustomer.id,
          customerName: result.newCustomer.customerName,
          companyName: result.newCustomer.companyName,
          salesRepId: result.newCustomer.salesRepId,
        },
      });
    } catch (e) {
      if (e.code) return res.status(400).json(e);
      console.error(e);
      return res
        .status(500)
        .json(buildError(ERROR_CODES.CUSTOMER_CREATE_FAILED, "创建客户失败"));
    }
  }
);

// 客户列表（仅能查看自己名下客户）
router.get(
  "/",
  authenticate,
  checkPermission("customer.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      let { page = 1, pageSize = 20, keyword } = req.query;
      page = parseInt(page) || 1;
      pageSize = Math.min(100, parseInt(pageSize) || 20);
      const where = {};
      if (keyword) {
        where[db.Sequelize.Op.or] = [
          { customerName: { [db.Sequelize.Op.like]: `%${keyword}%` } },
          { companyName: { [db.Sequelize.Op.like]: `%${keyword}%` } },
        ];
      }
      const { isAgent } = roleCtx(req);
      if (isAgent) {
        where.salesRepId = req.user.id;
      }
      const scopedWhere = applyScopeToWhere(where, db.Customer, req.user);

      const { rows, count } = await db.Customer.findAndCountAll({
        where: scopedWhere,
        order: [["created_at", "DESC"]],
        offset: (page - 1) * pageSize,
        limit: pageSize,
        attributes: [
          "id",
          "customerName",
          "companyName",
          "salesRepId",
          "isActive",
          "created_at",
        ],
      });
      res.json({
        success: true,
        page,
        pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
        customers: rows,
      });
      logRead(req, {
        entityType: "Customer",
        page,
        pageSize,
        resultCount: rows.length,
        startAt,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json(buildError(ERROR_CODES.UNKNOWN_ERROR, "查询失败"));
    }
  }
);

// 客户详情（仅能查看自己名下客户）
router.get(
  "/:id",
  authenticate,
  checkPermission("customer.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      const { id } = req.params;
      const idNum = Number(id);
      if (!Number.isInteger(idNum) || idNum <= 0)
        return res
          .status(400)
          .json(buildError(ERROR_CODES.VALIDATION_FAILED, "非法客户ID"));
      const where = applyScopeToWhere({ id: idNum }, db.Customer, req.user);
      const { isAgent } = roleCtx(req);
      if (isAgent) {
        where.salesRepId = req.user.id;
      }
      const customer = await db.Customer.findOne({
        where,
        attributes: [
          "id",
          "customerName",
          "companyName",
          "contactName",
          "telephone",
          "email",
          "address",
          "salesRepId",
          "isActive",
          "created_at",
          "updated_at",
        ],
      });
      if (!customer)
        return res
          .status(404)
          .json(buildError(ERROR_CODES.CUSTOMER_NOT_FOUND, "客户不存在"));
      res.json({ success: true, customer });
      logViewDetail(req, {
        entityType: "Customer",
        entityId: customer.id,
        startAt,
        resultExists: true,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json(buildError(ERROR_CODES.UNKNOWN_ERROR, "获取失败"));
    }
  }
);

// 更新客户（仅能操作自己名下客户）
router.put(
  "/:id",
  authenticate,
  checkPermission("customer.edit"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const idNum = Number(id);
      if (!Number.isInteger(idNum) || idNum <= 0)
        return res
          .status(400)
          .json(buildError(ERROR_CODES.VALIDATION_FAILED, "非法客户ID"));
      const {
        customerName,
        companyName,
        contactName,
        telephone,
        email,
        address,
        remark,
        salesRepId,
      } = req.body || {};
      const where = applyScopeToWhere({ id: idNum }, db.Customer, req.user);
      const { isAgent } = roleCtx(req);
      if (isAgent) {
        where.salesRepId = req.user.id;
      }
      const customer = await db.Customer.findOne({ where });
      if (!customer)
        return res
          .status(404)
          .json(buildError(ERROR_CODES.CUSTOMER_NOT_FOUND, "客户不存在"));
      const before = pickSnapshot(customer, [
        "id",
        "customerName",
        "companyName",
        "salesRepId",
        "isActive",
      ]);
      if (customerName) customer.customerName = customerName;
      if (companyName) customer.companyName = companyName;
      if (contactName !== undefined) customer.contactName = contactName;
      if (telephone !== undefined) customer.telephone = telephone;
      if (email !== undefined) customer.email = email;
      if (address !== undefined) customer.address = address;
      if (remark !== undefined) customer.remark = remark;
      if (salesRepId !== undefined) customer.salesRepId = salesRepId;
      await customer.save();
      const after = pickSnapshot(customer, [
        "id",
        "customerName",
        "companyName",
        "salesRepId",
        "isActive",
      ]);
      writeAudit({
        module: "agent",
        entityType: "Customer",
        entityId: customer.id,
        action: "update",
        user: req.user,
        before,
        after,
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      res.json({ success: true, message: "更新成功" });
    } catch (e) {
      console.error(e);
      res
        .status(500)
        .json(buildError(ERROR_CODES.CUSTOMER_UPDATE_FAILED, "更新失败"));
    }
  }
);

// 启用 / 停用（仅能操作自己名下客户）
router.post(
  "/:id/toggle",
  authenticate,
  checkPermission("customer.edit"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const idNum = Number(id);
      if (!Number.isInteger(idNum) || idNum <= 0)
        return res
          .status(400)
          .json(buildError(ERROR_CODES.VALIDATION_FAILED, "非法客户ID"));
      const { enable } = req.body;
      const where = applyScopeToWhere({ id: idNum }, db.Customer, req.user);
      const { isAgent } = roleCtx(req);
      if (isAgent) {
        where.salesRepId = req.user.id;
      }
      const customer = await db.Customer.findOne({ where });
      if (!customer)
        return res
          .status(404)
          .json(buildError(ERROR_CODES.CUSTOMER_NOT_FOUND, "客户不存在"));
      const before = pickSnapshot(customer, ["id", "isActive"]);
      customer.isActive = !!enable;
      await customer.save();
      const after = pickSnapshot(customer, ["id", "isActive"]);
      writeAudit({
        module: "agent",
        entityType: "Customer",
        entityId: customer.id,
        action: enable ? "enable" : "disable",
        user: req.user,
        before,
        after,
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      res.json({ success: true, message: enable ? "已启用" : "已停用" });
    } catch (e) {
      console.error(e);
      const code =
        req.body && req.body.enable
          ? ERROR_CODES.CUSTOMER_ENABLE_FAILED
          : ERROR_CODES.CUSTOMER_DISABLE_FAILED;
      res.status(500).json(buildError(code, "操作失败"));
    }
  }
);

// 重置密码（仅能操作自己名下客户）
router.post(
  "/:id/reset-password",
  authenticate,
  checkPermission("customer.edit"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { id } = req.params;
      const idNum = Number(id);
      if (!Number.isInteger(idNum) || idNum <= 0) {
        await t.rollback();
        return res
          .status(400)
          .json(buildError(ERROR_CODES.VALIDATION_FAILED, "非法客户ID"));
      }
      const { newPassword } = req.body || {};
      if (!newPassword || newPassword.length < 8) {
        await t.rollback();
        return res
          .status(400)
          .json(
            buildError(
              ERROR_CODES.CUSTOMER_PASSWORD_RESET_FAILED,
              "密码至少8位"
            )
          );
      }
      const where = applyScopeToWhere({ id: idNum }, db.Customer, req.user);
      const { isAgent } = roleCtx(req);
      if (isAgent) {
        where.salesRepId = req.user.id;
      }
      const customer = await db.Customer.findOne({ where, transaction: t });
      if (!customer) {
        await t.rollback();
        return res
          .status(404)
          .json(buildError(ERROR_CODES.CUSTOMER_NOT_FOUND, "客户不存在"));
      }
      const user = await db.User.findOne({
        where: { username: customer.adminAccount },
        transaction: t,
      });
      if (!user) {
        await t.rollback();
        return res
          .status(404)
          .json(buildError(ERROR_CODES.CUSTOMER_NOT_FOUND, "绑定用户不存在"));
      }
      const hash = await bcrypt.hash(newPassword, 10);
      user.password_hash = hash;
      await user.save({ transaction: t });
      customer.passwordHash = hash;
      await customer.save({ transaction: t });
      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Customer",
        entityId: customer.id,
        action: "reset-password",
        user: req.user,
        before: null,
        after: null,
        extra: { masked_admin: customer.adminAccount.slice(0, 3) + "***" },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      res.json({ success: true, message: "密码已重置" });
    } catch (e) {
      await t.rollback();
      console.error(e);
      res
        .status(500)
        .json(
          buildError(ERROR_CODES.CUSTOMER_PASSWORD_RESET_FAILED, "重置失败")
        );
    }
  }
);

export default router;
