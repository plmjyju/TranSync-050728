import express from "express";
import db from "../../models/index.js";

const router = express.Router();

// Get all active tax types
router.get("/tax-types", async (req, res) => {
  try {
    const taxTypes = await db.TaxType.findAll({
      where: { isActive: true },
      order: [
        ["sortOrder", "ASC"],
        ["name", "ASC"],
      ],
      attributes: ["id", "name", "description", "taxRate", "sortOrder"],
    });

    return res.status(200).json({
      message: "Tax types retrieved successfully",
      taxTypes,
    });
  } catch (err) {
    console.error("Error fetching tax types:", err);
    return res.status(500).json({ error: "Failed to fetch tax types" });
  }
});

// Get a specific tax type by ID
router.get("/tax-types/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const taxType = await db.TaxType.findByPk(id, {
      attributes: ["id", "name", "description", "taxRate", "sortOrder"],
    });

    if (!taxType) {
      return res.status(404).json({ error: "Tax type not found" });
    }

    return res.status(200).json({
      message: "Tax type retrieved successfully",
      taxType,
    });
  } catch (err) {
    console.error("Error fetching tax type:", err);
    return res.status(500).json({ error: "Failed to fetch tax type" });
  }
});

export default router;
