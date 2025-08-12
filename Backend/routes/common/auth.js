import express from "express";
import db from "../../models/index.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const router = express.Router();

const validateRequiredFields = (fields, body) => {
  const missingFields = fields.filter((field) => !body[field]);
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }
};

const generateToken = (user, userType) => {
  return jwt.sign(
    {
      id: user.id,
      userType,
      username: user.username || user.customerName,
      email: user.email,
    },
    process.env.JWT_SECRET || "your-secret-key",
    { expiresIn: "24h" }
  );
};

// Client login (Customer table)
router.post("/login/client", async (req, res) => {
  try {
    validateRequiredFields(["adminAccount", "password"], req.body);

    const { adminAccount, password } = req.body;

    const customer = await db.Customer.findOne({
      where: { adminAccount, isActive: true },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found or inactive" });
    }

    // For now using plain text comparison, should use bcrypt in production
    const isPasswordValid = password === customer.passwordHash;

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: customer.id,
        userType: "client",
        customerName: customer.customerName,
        email: customer.email,
        salesRepId: customer.salesRepId,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: customer.id,
        customerName: customer.customerName,
        companyName: customer.companyName,
        email: customer.email,
        salesRepId: customer.salesRepId,
        userType: "client",
      },
    });
  } catch (err) {
    console.error("Error during client login:", err);
    return res.status(500).json({ error: "Failed to login client" });
  }
});

// Agent login (User table with client_type = 'agent')
router.post("/login/agent", async (req, res) => {
  try {
    validateRequiredFields(["username", "password"], req.body);

    const { username, password } = req.body;

    const agent = await db.User.findOne({
      where: { username, client_type: "agent" },
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, agent.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(agent, "agent");

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: agent.id,
        username: agent.username,
        email: agent.email,
        userType: "agent",
      },
    });
  } catch (err) {
    console.error("Error during agent login:", err);
    return res.status(500).json({ error: "Failed to login agent" });
  }
});

// Warehouse login (User table with client_type = 'warehouse')
router.post("/login/warehouse", async (req, res) => {
  try {
    validateRequiredFields(["username", "password"], req.body);

    const { username, password } = req.body;

    const warehouse = await db.User.findOne({
      where: { username, client_type: "warehouse" },
    });

    if (!warehouse) {
      return res.status(404).json({ error: "Warehouse user not found" });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      warehouse.password_hash
    );

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(warehouse, "warehouse");

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: warehouse.id,
        username: warehouse.username,
        email: warehouse.email,
        userType: "warehouse",
      },
    });
  } catch (err) {
    console.error("Error during warehouse login:", err);
    return res.status(500).json({ error: "Failed to login warehouse" });
  }
});

// OMP login (User table with client_type = 'omp')
router.post("/login/omp", async (req, res) => {
  try {
    validateRequiredFields(["username", "password"], req.body);

    const { username, password } = req.body;

    const omp = await db.User.findOne({
      where: { username, client_type: "omp" },
    });

    if (!omp) {
      return res.status(404).json({ error: "OMP user not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, omp.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(omp, "omp");

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: omp.id,
        username: omp.username,
        email: omp.email,
        userType: "omp",
      },
    });
  } catch (err) {
    console.error("Error during OMP login:", err);
    return res.status(500).json({ error: "Failed to login OMP" });
  }
});

export default router;
