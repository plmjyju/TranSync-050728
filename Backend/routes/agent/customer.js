// routes/customer.js
import express from "express";
import bcrypt from "bcrypt";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

const router = express.Router();

router.post(
  "/",
  authenticate,
  checkPermission("customer.create"), // 自定义权限点
  async (req, res) => {
    const agent = req.user;
    if (agent.client_type !== "agent") {
      return res.status(403).json({ message: "仅货代账号可创建客户" });
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
    } = req.body;

    const t = await db.sequelize.transaction();

    try {
      // 创建客户账号
      const hashed = await bcrypt.hash(password, 10);
      const newUser = await db.User.create(
        {
          username: adminAccount,
          password_hash: hashed,
          full_name: customerName,
          email,
          client_type: "customer",
          status: "active",
        },
        { transaction: t }
      );

      // 创建客户详情
      await db.Customer.create(
        {
          customerName,
          companyName,
          contactName,
          telephone,
          email,
          address,
          remark,
          adminAccount,
          passwordHash: hashed,
        },
        { transaction: t }
      );

      // 建立绑定关系
      await db.AgentCustomer.create(
        {
          agent_id: agent.id,
          customer_id: newUser.id,
        },
        { transaction: t }
      );

      await t.commit();
      res.json({ message: "客户创建成功", customerId: newUser.id });
    } catch (err) {
      await t.rollback();
      console.error(err);
      res.status(500).json({ message: "创建客户失败" });
    }
  }
);

export default router;
