import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { recordSystemActivity } from "../../utils/recordSystemActivity.js";

const router = express.Router();

const handleTransaction = async (transactionCallback) => {
  const t = await db.sequelize.transaction();
  try {
    const result = await transactionCallback(t);
    await t.commit();
    return result;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

const validateRequiredFields = (fields, body) => {
  const missingFields = fields.filter((field) => !body[field]);
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }
};

// Create a new customer
router.post("/create-customer", authenticate, async (req, res) => {
  try {
    validateRequiredFields(
      ["customerName", "companyName", "salesRepId"],
      req.body
    );

    const {
      customerName,
      companyName,
      contactName,
      telephone,
      email,
      address,
      remark,
      adminAccount,
      salesRepId,
    } = req.body;

    const customer = await handleTransaction(async (t) => {
      return await db.Customer.create(
        {
          customerName,
          companyName,
          contactName,
          telephone,
          email,
          address,
          remark,
          adminAccount,
          salesRepId,
        },
        { transaction: t }
      );
    });

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "create-customer",
        remark: `货代 ${req.user.username} 创建客户 ${customerName}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    return res.status(201).json({ customer });
  } catch (err) {
    console.error("Error creating customer:", err);
    return res.status(400).json({ error: err.message });
  }
});

// Get all customers for the authenticated agent
router.get("/customers", authenticate, async (req, res) => {
  try {
    const customers = await db.Customer.findAll({
      where: { salesRepId: req.user.id },
    });
    return res.status(200).json({ customers });
  } catch (err) {
    console.error("Error fetching customers:", err);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// Update customer information
router.put("/update-customer/:customerId", authenticate, async (req, res) => {
  try {
    const { customerId } = req.params;
    const updateFields = [
      "customerName",
      "companyName",
      "contactName",
      "telephone",
      "email",
      "address",
      "remark",
      "adminAccount",
    ];

    const customer = await db.Customer.findOne({
      where: { id: customerId, salesRepId: req.user.id },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    await handleTransaction(async (t) => {
      updateFields.forEach((field) => {
        if (req.body[field]) {
          customer[field] = req.body[field];
        }
      });
      await customer.save({ transaction: t });
    });

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "update-customer",
        remark: `货代 ${req.user.username} 更新客户 ${customer.customerName}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    return res.status(200).json({ message: "Customer updated successfully" });
  } catch (err) {
    console.error("Error updating customer:", err);
    return res.status(500).json({ error: "Failed to update customer" });
  }
});

// Delete a customer
router.delete(
  "/delete-customer/:customerId",
  authenticate,
  async (req, res) => {
    try {
      const { customerId } = req.params;

      const customer = await db.Customer.findOne({
        where: { id: customerId, salesRepId: req.user.id },
      });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      await handleTransaction(async (t) => {
        await customer.destroy({ transaction: t });
      });

      await recordSystemActivity(
        {
          userId: req.user.id,
          clientType: req.user.client_type,
          event: "delete-customer",
          remark: `货代 ${req.user.username} 删除客户 ${customer.customerName}`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
        db
      );

      return res.status(200).json({ message: "Customer deleted successfully" });
    } catch (err) {
      console.error("Error deleting customer:", err);
      return res.status(500).json({ error: "Failed to delete customer" });
    }
  }
);

// Get details of a single customer
router.get("/customer/:customerId", authenticate, async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await db.Customer.findOne({
      where: { id: customerId, salesRepId: req.user.id },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.status(200).json({ customer });
  } catch (err) {
    console.error("Error fetching customer details:", err);
    return res.status(500).json({ error: "Failed to fetch customer details" });
  }
});

export default router;
