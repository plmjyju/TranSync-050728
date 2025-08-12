import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middleware/auth.js";

const router = express.Router();

// Helper function to convert number to base36 format
const toBase36 = (num) => {
  if (num < 1) return "0A";
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  num = num - 1; // Convert to 0-based indexing

  do {
    result = chars[num % 36] + result;
    num = Math.floor(num / 36);
  } while (num > 0);

  return result.padStart(2, "0");
};

// Helper function to generate inbond code
const generateInbondCode = async (agentId, customerId) => {
  try {
    // Get agent info
    const agent = await db.User.findByPk(agentId);
    if (!agent) throw new Error("Agent not found");

    // Get customer info
    const customer = await db.Customer.findByPk(customerId);
    if (!customer) throw new Error("Customer not found");

    // Generate agent code (base36)
    const agentCode = toBase36(agentId);

    // Generate customer code (3 digits)
    const customerCode = customerId.toString().padStart(3, "0");

    // Generate date code (YYMMDD)
    const today = new Date();
    const dateCode = today.toISOString().slice(2, 10).replace(/-/g, "");

    // Count today's inbonds for this customer
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const todayCount = await db.Inbond.count({
      where: {
        client_id: customerId,
        created_at: {
          [db.Sequelize.Op.between]: [startOfDay, endOfDay],
        },
      },
    });

    // Generate sequence letter (A=1, B=2, etc.)
    const sequenceChar = String.fromCharCode(65 + todayCount); // A=65 in ASCII

    return `IB${agentCode}${customerCode}-${dateCode}${sequenceChar}`;
  } catch (error) {
    console.error("Error generating inbond code:", error);
    throw error;
  }
};

// Create a new inbond (draft)
router.post("/create-inbond", authenticate, async (req, res) => {
  try {
    const customerId = req.user.id; // From JWT token
    const agentId = req.user.salesRepId; // From JWT token
    const {
      shipping_type = "air",
      clearance_type = "general_trade",
      tax_type_id,
      arrival_method,
      remark,
    } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: "Agent ID not found in token" });
    }

    // Validate clearance_type
    const validClearanceTypes = [
      "general_trade",
      "bonded_warehouse",
      "cross_border_ecom",
      "personal_items",
      "samples",
      "temporary_import",
      "duty_free",
      "re_import",
    ];

    if (!validClearanceTypes.includes(clearance_type)) {
      return res.status(400).json({
        error: "Invalid clearance type",
        valid_types: validClearanceTypes,
      });
    }

    // Validate shipping_type
    if (!["air", "sea"].includes(shipping_type)) {
      return res.status(400).json({
        error: "Invalid shipping type. Must be 'air' or 'sea'",
      });
    }

    // Generate inbond code
    const inbondCode = await generateInbondCode(agentId, customerId);

    // Create draft inbond
    const inbond = await db.Inbond.create({
      inbond_code: inbondCode,
      client_id: customerId,
      shipping_type,
      clearance_type,
      tax_type_id: tax_type_id || null,
      arrival_method: arrival_method || null,
      status: "draft",
      remark: remark || null,
    });

    return res.status(201).json({
      message: "Inbond created successfully",
      inbond: {
        id: inbond.id,
        inbond_code: inbond.inbond_code,
        shipping_type: inbond.shipping_type,
        clearance_type: inbond.clearance_type,
        tax_type_id: inbond.tax_type_id,
        status: inbond.status,
        created_at: inbond.created_at,
      },
    });
  } catch (err) {
    console.error("Error creating inbond:", err);
    return res.status(500).json({ error: "Failed to create inbond" });
  }
});

// Get all inbonds for the authenticated customer
router.get("/inbonds", authenticate, async (req, res) => {
  try {
    const customerId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;

    const whereClause = { client_id: customerId };
    if (status) {
      whereClause.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await db.Inbond.findAndCountAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: [
        "id",
        "inbond_code",
        "shipping_type",
        "arrival_method",
        "status",
        "remark",
        "created_at",
        "updated_at",
      ],
    });

    return res.status(200).json({
      message: "Inbonds retrieved successfully",
      inbonds: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching inbonds:", err);
    return res.status(500).json({ error: "Failed to fetch inbonds" });
  }
});

// Get a specific inbond by ID
router.get("/inbond/:id", authenticate, async (req, res) => {
  try {
    const customerId = req.user.id;
    const { id } = req.params;

    const inbond = await db.Inbond.findOne({
      where: { id, client_id: customerId },
      include: [
        {
          model: db.Package,
          as: "packages",
          attributes: [
            "id",
            "package_code",
            "length_cm",
            "width_cm",
            "height_cm",
            "weight_kg",
            "status",
            "split_action",
            "remark",
          ],
        },
      ],
    });

    if (!inbond) {
      return res.status(404).json({ error: "Inbond not found" });
    }

    return res.status(200).json({
      message: "Inbond retrieved successfully",
      inbond,
    });
  } catch (err) {
    console.error("Error fetching inbond:", err);
    return res.status(500).json({ error: "Failed to fetch inbond" });
  }
});

// Update inbond information
router.put("/inbond/:id", authenticate, async (req, res) => {
  try {
    const customerId = req.user.id;
    const { id } = req.params;
    const {
      shipping_type,
      arrival_method,
      clearance_type,
      tax_type_id,
      remark,
    } = req.body;

    const inbond = await db.Inbond.findOne({
      where: { id, client_id: customerId, status: "draft" },
    });

    if (!inbond) {
      return res.status(404).json({
        error: "Inbond not found or cannot be modified",
      });
    }

    // Validate clearance_type if provided
    if (clearance_type) {
      const validClearanceTypes = [
        "general_trade",
        "bonded_warehouse",
        "cross_border_ecom",
        "personal_items",
        "samples",
        "temporary_import",
        "duty_free",
        "re_import",
      ];

      if (!validClearanceTypes.includes(clearance_type)) {
        return res.status(400).json({
          error: "Invalid clearance type",
          valid_types: validClearanceTypes,
        });
      }
    }

    // Validate shipping_type if provided
    if (shipping_type && !["air", "sea"].includes(shipping_type)) {
      return res.status(400).json({
        error: "Invalid shipping type. Must be 'air' or 'sea'",
      });
    }

    // Update fields
    if (shipping_type) inbond.shipping_type = shipping_type;
    if (arrival_method) inbond.arrival_method = arrival_method;
    if (clearance_type) inbond.clearance_type = clearance_type;
    if (tax_type_id !== undefined) inbond.tax_type_id = tax_type_id;
    if (remark !== undefined) inbond.remark = remark;

    await inbond.save();

    return res.status(200).json({
      message: "Inbond updated successfully",
      inbond: {
        id: inbond.id,
        inbond_code: inbond.inbond_code,
        shipping_type: inbond.shipping_type,
        arrival_method: inbond.arrival_method,
        clearance_type: inbond.clearance_type,
        tax_type_id: inbond.tax_type_id,
        status: inbond.status,
        remark: inbond.remark,
        updated_at: inbond.updated_at,
      },
    });
  } catch (err) {
    console.error("Error updating inbond:", err);
    return res.status(500).json({ error: "Failed to update inbond" });
  }
});

export default router;
