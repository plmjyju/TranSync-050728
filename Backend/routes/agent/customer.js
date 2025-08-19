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
      return res
        .status(429)
        .json(
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
              salesRepId: salesRepId || agent.id,
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

// 客户列表（分页 + 只读审计）
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
      const { rows, count } = await db.Customer.findAndCountAll({
        where,
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

// 客户详情
router.get(
  "/:id",
  authenticate,
  checkPermission("customer.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      const { id } = req.params;
      const customer = await db.Customer.findByPk(id, {
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

// 更新客户（基础资料 & 分配销售）
router.put(
  "/:id",
  authenticate,
  checkPermission("customer.update"),
  async (req, res) => {
    try {
      const { id } = req.params;
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
      const customer = await db.Customer.findByPk(id);
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

// 启用 / 停用
router.post(
  "/:id/toggle",
  authenticate,
  checkPermission("customer.update"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { enable } = req.body;
      const customer = await db.Customer.findByPk(id);
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
      res
        .status(500)
        .json(
          buildError(
            enable
              ? ERROR_CODES.CUSTOMER_ENABLE_FAILED
              : ERROR_CODES.CUSTOMER_DISABLE_FAILED,
            "操作失败"
          )
        );
    }
  }
);

// 重置密码
router.post(
  "/:id/reset-password",
  authenticate,
  checkPermission("customer.update"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body || {};
      if (!newPassword || newPassword.length < 8)
        return res
          .status(400)
          .json(
            buildError(
              ERROR_CODES.CUSTOMER_PASSWORD_RESET_FAILED,
              "密码至少8位"
            )
          );
      const customer = await db.Customer.findByPk(id);
      if (!customer)
        return res
          .status(404)
          .json(buildError(ERROR_CODES.CUSTOMER_NOT_FOUND, "客户不存在"));
      const user = await db.User.findOne({
        where: { username: customer.adminAccount },
      });
      if (!user)
        return res
          .status(404)
          .json(buildError(ERROR_CODES.CUSTOMER_NOT_FOUND, "绑定用户不存在"));
      const hash = await bcrypt.hash(newPassword, 10);
      user.password_hash = hash;
      await user.save();
      customer.passwordHash = hash;
      await customer.save();
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
