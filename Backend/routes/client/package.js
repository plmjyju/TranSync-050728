import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middleware/auth.js";

const router = express.Router();

// Helper function to generate package code
const generatePackageCode = async (inbondCode, inbondId) => {
  try {
    // Count existing packages for this inbond
    const packageCount = await db.Package.count({
      where: { inbond_id: inbondId },
    });

    // Generate package sequence (001, 002, etc.)
    const sequence = (packageCount + 1).toString().padStart(3, "0");

    return `${inbondCode}-${sequence}`;
  } catch (error) {
    console.error("Error generating package code:", error);
    throw error;
  }
};

// Helper function to create package with specific ID and proper sequence
const createPackageWithId = async (
  packageId,
  inbondCode,
  inbondId,
  customerId,
  taxTypeId,
  currentSequence,
  transaction
) => {
  try {
    // Generate package code with given sequence
    const sequence = currentSequence.toString().padStart(3, "0");
    const packageCode = `${inbondCode}-${sequence}`;

    // Try to create package with specific ID
    const packageRecord = await db.Package.create(
      {
        id: parseInt(packageId),
        package_code: packageCode,
        inbond_id: inbondId,
        client_id: customerId,
        length_cm: 0,
        width_cm: 0,
        height_cm: 0,
        weight_kg: 0,
        split_action: "direct",
        status: "prepared",
        tax_type_id: taxTypeId,
      },
      { transaction }
    );

    return packageRecord;
  } catch (error) {
    // If ID already exists, try to create with auto-generated ID
    if (
      error.name === "SequelizeUniqueConstraintError" ||
      error.message.includes("PRIMARY")
    ) {
      // Generate a new unique ID
      const maxId = (await db.Package.max("id", { transaction })) || 0;
      const newId = maxId + 1;

      const sequence = currentSequence.toString().padStart(3, "0");
      const packageCode = `${inbondCode}-${sequence}`;

      const packageRecord = await db.Package.create(
        {
          id: newId,
          package_code: packageCode,
          inbond_id: inbondId,
          client_id: customerId,
          length_cm: 0,
          width_cm: 0,
          height_cm: 0,
          weight_kg: 0,
          split_action: "direct",
          status: "prepared",
          tax_type_id: taxTypeId,
        },
        { transaction }
      );

      return { ...packageRecord, actualId: newId, requestedId: packageId };
    }
    throw error;
  }
};

// Add package to inbond
router.post("/inbond/:inbondId/add-package", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const customerId = req.user.id;
    const { inbondId } = req.params;
    const {
      length_cm = 0,
      width_cm = 0,
      height_cm = 0,
      weight_kg = 0,
      split_action = "direct",
      remark,
    } = req.body;

    // Verify inbond exists and belongs to customer
    const inbond = await db.Inbond.findOne({
      where: {
        id: inbondId,
        client_id: customerId,
        status: "draft", // Only allow adding packages to draft inbonds
      },
      transaction: t,
    });

    if (!inbond) {
      await t.rollback();
      return res.status(404).json({
        error: "Inbond not found or cannot be modified",
      });
    }

    // Generate package code
    const packageCode = await generatePackageCode(inbond.inbond_code, inbondId);

    // Create package
    const packageRecord = await db.Package.create(
      {
        package_code: packageCode,
        inbond_id: inbondId,
        client_id: customerId,
        length_cm: parseFloat(length_cm) || 0,
        width_cm: parseFloat(width_cm) || 0,
        height_cm: parseFloat(height_cm) || 0,
        weight_kg: parseFloat(weight_kg) || 0,
        split_action,
        status: "prepared",
        tax_type_id: inbond.tax_type_id, // Inherit from inbond
        remark,
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      message: "Package added successfully",
      package: {
        id: packageRecord.id,
        package_code: packageRecord.package_code,
        length_cm: packageRecord.length_cm,
        width_cm: packageRecord.width_cm,
        height_cm: packageRecord.height_cm,
        weight_kg: packageRecord.weight_kg,
        split_action: packageRecord.split_action,
        status: packageRecord.status,
        tax_type_id: packageRecord.tax_type_id,
        remark: packageRecord.remark,
        created_at: packageRecord.created_at,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("Error adding package:", err);
    return res.status(500).json({ error: "Failed to add package" });
  }
});

// Batch add packages to inbond
router.post(
  "/inbond/:inbondId/add-packages-batch",
  authenticate,
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const customerId = req.user.id;
      const { inbondId } = req.params;
      const { packages } = req.body;

      // Validate input
      if (!packages || !Array.isArray(packages)) {
        return res.status(400).json({ error: "Packages array is required" });
      }

      if (packages.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one package is required" });
      }

      if (packages.length > 200) {
        return res
          .status(400)
          .json({ error: "Maximum 200 packages allowed per batch" });
      }

      // Verify inbond exists and belongs to customer
      const inbond = await db.Inbond.findOne({
        where: {
          id: inbondId,
          client_id: customerId,
          status: "draft", // Only allow adding packages to draft inbonds
        },
        transaction: t,
      });

      if (!inbond) {
        await t.rollback();
        return res.status(404).json({
          error: "Inbond not found or cannot be modified",
        });
      }

      // Get current package count for sequence generation
      const currentPackageCount = await db.Package.count({
        where: { inbond_id: inbondId },
        transaction: t,
      });

      const createdPackages = [];
      const errors = [];

      // Process each package
      for (let i = 0; i < packages.length; i++) {
        try {
          const packageData = packages[i];
          const {
            length_cm = 0,
            width_cm = 0,
            height_cm = 0,
            weight_kg = 0,
            split_action = "direct",
            remark,
          } = packageData;

          // Generate package code with sequential numbering
          const sequence = (currentPackageCount + i + 1)
            .toString()
            .padStart(3, "0");
          const packageCode = `${inbond.inbond_code}-${sequence}`;

          // Create package
          const packageRecord = await db.Package.create(
            {
              package_code: packageCode,
              inbond_id: inbondId,
              client_id: customerId,
              length_cm: parseFloat(length_cm) || 0,
              width_cm: parseFloat(width_cm) || 0,
              height_cm: parseFloat(height_cm) || 0,
              weight_kg: parseFloat(weight_kg) || 0,
              split_action,
              status: "prepared",
              tax_type_id: inbond.tax_type_id, // Inherit from inbond
              remark,
            },
            { transaction: t }
          );

          createdPackages.push({
            id: packageRecord.id,
            package_code: packageRecord.package_code,
            length_cm: packageRecord.length_cm,
            width_cm: packageRecord.width_cm,
            height_cm: packageRecord.height_cm,
            weight_kg: packageRecord.weight_kg,
            split_action: packageRecord.split_action,
            status: packageRecord.status,
            tax_type_id: packageRecord.tax_type_id,
            remark: packageRecord.remark,
            created_at: packageRecord.created_at,
          });
        } catch (error) {
          errors.push({
            index: i,
            error: error.message,
          });
        }
      }

      if (errors.length > 0) {
        await t.rollback();
        return res.status(400).json({
          error: "Some packages failed to create",
          errors,
        });
      }

      await t.commit();

      return res.status(201).json({
        message: `${createdPackages.length} packages added successfully`,
        packages: createdPackages,
        summary: {
          total_requested: packages.length,
          total_created: createdPackages.length,
          total_failed: errors.length,
        },
      });
    } catch (err) {
      await t.rollback();
      console.error("Error batch adding packages:", err);
      return res.status(500).json({ error: "Failed to batch add packages" });
    }
  }
);

// Get packages for a specific inbond
router.get("/inbond/:inbondId/packages", authenticate, async (req, res) => {
  try {
    const customerId = req.user.id;
    const { inbondId } = req.params;

    // Verify inbond belongs to customer
    const inbond = await db.Inbond.findOne({
      where: { id: inbondId, client_id: customerId },
    });

    if (!inbond) {
      return res.status(404).json({ error: "Inbond not found" });
    }

    const packages = await db.Package.findAll({
      where: { inbond_id: inbondId },
      include: [
        {
          model: db.TaxType,
          as: "taxType",
          attributes: ["id", "name", "taxRate"],
        },
      ],
      order: [["package_code", "ASC"]],
    });

    return res.status(200).json({
      message: "Packages retrieved successfully",
      packages,
    });
  } catch (err) {
    console.error("Error fetching packages:", err);
    return res.status(500).json({ error: "Failed to fetch packages" });
  }
});

// Update package information
router.put("/package/:packageId", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const customerId = req.user.id;
    const { packageId } = req.params;
    const { length_cm, width_cm, height_cm, weight_kg, split_action, remark } =
      req.body;

    const packageRecord = await db.Package.findOne({
      where: {
        id: packageId,
        client_id: customerId,
        status: "prepared", // Only allow updating prepared packages
      },
      include: [
        {
          model: db.Inbond,
          as: "inbond",
          where: { status: "draft" }, // Only if inbond is still draft
        },
      ],
      transaction: t,
    });

    if (!packageRecord) {
      await t.rollback();
      return res.status(404).json({
        error: "Package not found or cannot be modified",
      });
    }

    // Update fields
    if (length_cm !== undefined)
      packageRecord.length_cm = parseFloat(length_cm) || 0;
    if (width_cm !== undefined)
      packageRecord.width_cm = parseFloat(width_cm) || 0;
    if (height_cm !== undefined)
      packageRecord.height_cm = parseFloat(height_cm) || 0;
    if (weight_kg !== undefined)
      packageRecord.weight_kg = parseFloat(weight_kg) || 0;
    if (split_action) packageRecord.split_action = split_action;
    if (remark !== undefined) packageRecord.remark = remark;

    await packageRecord.save({ transaction: t });
    await t.commit();

    return res.status(200).json({
      message: "Package updated successfully",
      package: {
        id: packageRecord.id,
        package_code: packageRecord.package_code,
        length_cm: packageRecord.length_cm,
        width_cm: packageRecord.width_cm,
        height_cm: packageRecord.height_cm,
        weight_kg: packageRecord.weight_kg,
        split_action: packageRecord.split_action,
        status: packageRecord.status,
        remark: packageRecord.remark,
        updated_at: packageRecord.updated_at,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("Error updating package:", err);
    return res.status(500).json({ error: "Failed to update package" });
  }
});

// Batch update packages
router.put("/packages-batch", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const customerId = req.user.id;
    const { packages } = req.body;

    // Validate input
    if (!packages || !Array.isArray(packages)) {
      return res.status(400).json({ error: "Packages array is required" });
    }

    if (packages.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one package is required" });
    }

    if (packages.length > 200) {
      return res
        .status(400)
        .json({ error: "Maximum 200 packages allowed per batch" });
    }

    // Validate each package has required id field
    for (let i = 0; i < packages.length; i++) {
      if (!packages[i].id) {
        return res.status(400).json({
          error: `Package at index ${i} is missing required 'id' field`,
        });
      }
    }

    const updatedPackages = [];
    const errors = [];

    // Process each package update
    for (let i = 0; i < packages.length; i++) {
      try {
        const packageData = packages[i];
        const {
          id,
          length_cm,
          width_cm,
          height_cm,
          weight_kg,
          split_action,
          remark,
        } = packageData;

        // Find and verify package
        const packageRecord = await db.Package.findOne({
          where: {
            id: id,
            client_id: customerId,
            status: "prepared", // Only allow updating prepared packages
          },
          include: [
            {
              model: db.Inbond,
              as: "inbond",
              where: { status: "draft" }, // Only if inbond is still draft
            },
          ],
          transaction: t,
        });

        if (!packageRecord) {
          errors.push({
            index: i,
            id: id,
            error: "Package not found or cannot be modified",
          });
          continue;
        }

        // Update fields
        if (length_cm !== undefined)
          packageRecord.length_cm = parseFloat(length_cm) || 0;
        if (width_cm !== undefined)
          packageRecord.width_cm = parseFloat(width_cm) || 0;
        if (height_cm !== undefined)
          packageRecord.height_cm = parseFloat(height_cm) || 0;
        if (weight_kg !== undefined)
          packageRecord.weight_kg = parseFloat(weight_kg) || 0;
        if (split_action) packageRecord.split_action = split_action;
        if (remark !== undefined) packageRecord.remark = remark;

        await packageRecord.save({ transaction: t });

        updatedPackages.push({
          id: packageRecord.id,
          package_code: packageRecord.package_code,
          length_cm: packageRecord.length_cm,
          width_cm: packageRecord.width_cm,
          height_cm: packageRecord.height_cm,
          weight_kg: packageRecord.weight_kg,
          split_action: packageRecord.split_action,
          status: packageRecord.status,
          remark: packageRecord.remark,
          updated_at: packageRecord.updated_at,
        });
      } catch (error) {
        errors.push({
          index: i,
          id: packages[i].id,
          error: error.message,
        });
      }
    }

    if (errors.length > 0) {
      await t.rollback();
      return res.status(400).json({
        error: "Some packages failed to update",
        errors,
      });
    }

    await t.commit();

    return res.status(200).json({
      message: `${updatedPackages.length} packages updated successfully`,
      packages: updatedPackages,
      summary: {
        total_requested: packages.length,
        total_updated: updatedPackages.length,
        total_failed: errors.length,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("Error batch updating packages:", err);
    return res.status(500).json({ error: "Failed to batch update packages" });
  }
});

// Batch delete packages
router.delete("/packages-batch", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const customerId = req.user.id;
    const { packageIds } = req.body;

    // Validate input
    if (!packageIds || !Array.isArray(packageIds)) {
      return res.status(400).json({ error: "Package IDs array is required" });
    }

    if (packageIds.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one package ID is required" });
    }

    if (packageIds.length > 200) {
      return res
        .status(400)
        .json({ error: "Maximum 200 packages allowed per batch" });
    }

    const deletedPackageIds = [];
    const errors = [];

    // Process each package deletion
    for (let i = 0; i < packageIds.length; i++) {
      try {
        const packageId = packageIds[i];

        const packageRecord = await db.Package.findOne({
          where: {
            id: packageId,
            client_id: customerId,
            status: "prepared", // Only allow deleting prepared packages
          },
          include: [
            {
              model: db.Inbond,
              as: "inbond",
              where: { status: "draft" }, // Only if inbond is still draft
            },
          ],
          transaction: t,
        });

        if (!packageRecord) {
          errors.push({
            index: i,
            id: packageId,
            error: "Package not found or cannot be deleted",
          });
          continue;
        }

        await packageRecord.destroy({ transaction: t });
        deletedPackageIds.push(packageId);
      } catch (error) {
        errors.push({
          index: i,
          id: packageIds[i],
          error: error.message,
        });
      }
    }

    if (errors.length > 0) {
      await t.rollback();
      return res.status(400).json({
        error: "Some packages failed to delete",
        errors,
      });
    }

    await t.commit();

    return res.status(200).json({
      message: `${deletedPackageIds.length} packages deleted successfully`,
      deletedPackageIds,
      summary: {
        total_requested: packageIds.length,
        total_deleted: deletedPackageIds.length,
        total_failed: errors.length,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("Error batch deleting packages:", err);
    return res.status(500).json({ error: "Failed to batch delete packages" });
  }
});

// Delete package
router.delete("/package/:packageId", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const customerId = req.user.id;
    const { packageId } = req.params;

    const packageRecord = await db.Package.findOne({
      where: {
        id: packageId,
        client_id: customerId,
        status: "prepared", // Only allow deleting prepared packages
      },
      include: [
        {
          model: db.Inbond,
          as: "inbond",
          where: { status: "draft" }, // Only if inbond is still draft
        },
      ],
      transaction: t,
    });

    if (!packageRecord) {
      await t.rollback();
      return res.status(404).json({
        error: "Package not found or cannot be deleted",
      });
    }

    await packageRecord.destroy({ transaction: t });
    await t.commit();

    return res.status(200).json({
      message: "Package deleted successfully",
    });
  } catch (err) {
    await t.rollback();
    console.error("Error deleting package:", err);
    return res.status(500).json({ error: "Failed to delete package" });
  }
});

// Add package item to a package by package code
router.post(
  "/package/:packageCode/add-item",
  authenticate,
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const customerId = req.user.id;
      const { packageCode } = req.params;
      const itemData = req.body;

      // Find package by package code and verify ownership
      const packageRecord = await db.Package.findOne({
        where: {
          package_code: packageCode,
          client_id: customerId,
          status: "prepared", // Only allow adding items to prepared packages
        },
        include: [
          {
            model: db.Inbond,
            as: "inbond",
            where: { status: "draft" }, // Only if inbond is still draft
          },
        ],
        transaction: t,
      });

      if (!packageRecord) {
        await t.rollback();
        return res.status(404).json({
          error: "Package not found or cannot be modified",
        });
      }

      // Create package item
      const packageItem = await db.PackageItem.create(
        {
          package_id: packageRecord.id,
          tracking_no: itemData.tracking_no,
          client_code: itemData.client_code,
          file_number: itemData.file_number,

          // Receiver information
          receiver_name: itemData.receiver_name,
          receiver_country: itemData.receiver_country,
          receiver_state: itemData.receiver_state,
          receiver_city: itemData.receiver_city,
          receiver_postcode: itemData.receiver_postcode,
          receiver_email: itemData.receiver_email,
          receiver_phone: itemData.receiver_phone,
          receiver_address1: itemData.receiver_address1,
          receiver_address2: itemData.receiver_address2,

          // Sender information
          sender_name: itemData.sender_name,
          sender_country: itemData.sender_country,
          sender_province: itemData.sender_province,
          sender_city: itemData.sender_city,
          sender_postcode: itemData.sender_postcode,
          sender_address1: itemData.sender_address1,
          sender_address2: itemData.sender_address2,
          sender_license: itemData.sender_license,
          sender_email: itemData.sender_email,
          sender_phone: itemData.sender_phone,

          // Physical properties
          weight_kg: itemData.weight_kg,
          quantity: itemData.quantity,
          length_cm: itemData.length_cm,
          width_cm: itemData.width_cm,
          height_cm: itemData.height_cm,

          // Product information
          hs_code: itemData.hs_code,
          product_name_en: itemData.product_name_en,
          product_description: itemData.product_description,
          origin_country: itemData.origin_country,
          url: itemData.url,

          // Pricing
          unit_price: itemData.unit_price,
          total_price: itemData.total_price,
          item_count: itemData.item_count,

          // Additional properties
          is_fda: itemData.is_fda || false,
          manufacturer_mid: itemData.manufacturer_mid,
          custom_note: itemData.custom_note,
        },
        { transaction: t }
      );

      await t.commit();

      return res.status(201).json({
        message: "Package item added successfully",
        packageItem: {
          id: packageItem.id,
          package_id: packageItem.package_id,
          tracking_no: packageItem.tracking_no,
          client_code: packageItem.client_code,
          product_name_en: packageItem.product_name_en,
          total_price: packageItem.total_price,
          created_at: packageItem.created_at,
        },
      });
    } catch (err) {
      await t.rollback();
      console.error("Error adding package item:", err);
      return res.status(500).json({ error: "Failed to add package item" });
    }
  }
);

// Get package items for a specific package by package code
router.get("/package/:packageCode/items", authenticate, async (req, res) => {
  try {
    const customerId = req.user.id;
    const { packageCode } = req.params;

    // Find package by package code and verify ownership
    const packageRecord = await db.Package.findOne({
      where: {
        package_code: packageCode,
        client_id: customerId,
      },
    });

    if (!packageRecord) {
      return res.status(404).json({ error: "Package not found" });
    }

    const packageItems = await db.PackageItem.findAll({
      where: { package_id: packageRecord.id },
      order: [["created_at", "ASC"]],
    });

    return res.status(200).json({
      message: "Package items retrieved successfully",
      packageItems,
      package: {
        id: packageRecord.id,
        package_code: packageRecord.package_code,
        status: packageRecord.status,
      },
    });
  } catch (err) {
    console.error("Error fetching package items:", err);
    return res.status(500).json({ error: "Failed to fetch package items" });
  }
});

// Batch add package items from Excel upload (by inbond)
router.post(
  "/inbond/:inbondId/add-items-from-excel",
  authenticate,
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const customerId = req.user.id;
      const { inbondId } = req.params;
      const { items } = req.body; // Array of items from parsed Excel

      // Validate input
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Items array is required" });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: "At least one item is required" });
      }

      if (items.length > 1000) {
        return res
          .status(400)
          .json({ error: "Maximum 1000 items allowed per batch" });
      }

      // Verify inbond exists and belongs to customer
      const inbond = await db.Inbond.findOne({
        where: {
          id: inbondId,
          client_id: customerId,
          status: "draft", // Only allow adding items to draft inbonds
        },
        transaction: t,
      });

      if (!inbond) {
        await t.rollback();
        return res.status(404).json({
          error: "Inbond not found or cannot be modified",
        });
      }

      // Get all existing packages for this inbond
      const existingPackages = await db.Package.findAll({
        where: {
          inbond_id: inbondId,
          client_id: customerId,
          status: "prepared",
        },
        transaction: t,
      });

      const existingPackageIds = new Set(
        existingPackages.map((pkg) => pkg.id.toString())
      );

      // Get current package count for sequence generation
      let currentPackageCount = existingPackages.length;

      const createdItems = [];
      const createdPackages = [];
      const errors = [];

      // Group items by package_id and track which packages need creation
      const itemsByPackage = {};
      const packagesToCreate = new Set();

      items.forEach((item, index) => {
        const packageId = item.package_id?.toString();
        if (!packageId) {
          errors.push({
            index,
            error: "package_id is required",
            item: item,
          });
          return;
        }

        // If package doesn't exist, mark it for creation
        if (!existingPackageIds.has(packageId)) {
          packagesToCreate.add(packageId);
        }

        if (!itemsByPackage[packageId]) {
          itemsByPackage[packageId] = [];
        }
        itemsByPackage[packageId].push({ ...item, originalIndex: index });
      });

      // Create missing packages first
      if (packagesToCreate.size > 0) {
        for (const packageId of packagesToCreate) {
          try {
            const packageRecord = await createPackageWithId(
              packageId,
              inbond.inbond_code,
              inbondId,
              customerId,
              inbond.tax_type_id,
              currentPackageCount + 1,
              t
            );

            createdPackages.push({
              id: packageRecord.id,
              package_code: packageRecord.package_code,
              requested_id: packageId,
              actual_id: packageRecord.actualId || packageRecord.id,
              created: true,
            });

            // Add to existing packages set with actual ID
            existingPackageIds.add(packageRecord.id.toString());

            // If the actual ID is different from requested, update itemsByPackage
            if (
              packageRecord.actualId &&
              packageRecord.actualId !== parseInt(packageId)
            ) {
              const items = itemsByPackage[packageId];
              delete itemsByPackage[packageId];
              itemsByPackage[packageRecord.actualId.toString()] = items.map(
                (item) => ({
                  ...item,
                  package_id: packageRecord.actualId,
                })
              );
            }

            currentPackageCount++;
          } catch (error) {
            // If package creation fails, add error for all items of this package
            const packageItems = itemsByPackage[packageId] || [];
            packageItems.forEach((item) => {
              errors.push({
                index: item.originalIndex,
                package_id: packageId,
                error: `Failed to create package with ID ${packageId}: ${error.message}`,
                item: item,
              });
            });

            // Remove this package from processing
            delete itemsByPackage[packageId];
          }
        }
      }

      // If there are creation errors, return early
      if (errors.length > 0) {
        await t.rollback();
        return res.status(400).json({
          error: "Failed to create required packages",
          errors,
        });
      }

      // Final validation: ensure all packages exist now
      const finalValidation = {};
      for (const packageId of Object.keys(itemsByPackage)) {
        if (!existingPackageIds.has(packageId)) {
          // This shouldn't happen, but let's be safe
          const packageItems = itemsByPackage[packageId] || [];
          packageItems.forEach((item) => {
            errors.push({
              index: item.originalIndex,
              package_id: packageId,
              error: `Package ${packageId} still not available after creation attempt`,
              item: item,
            });
          });
        }
      }

      if (errors.length > 0) {
        await t.rollback();
        return res.status(400).json({
          error: "Package validation failed",
          errors,
        });
      }

      // Process items by package
      for (const [packageId, packageItems] of Object.entries(itemsByPackage)) {
        for (const itemData of packageItems) {
          try {
            const packageItem = await db.PackageItem.create(
              {
                package_id: parseInt(packageId),
                tracking_no: itemData.tracking_no,
                client_code: itemData.client_code,
                file_number: itemData.file_number,

                // Receiver information
                receiver_name: itemData.receiver_name,
                receiver_country: itemData.receiver_country,
                receiver_state: itemData.receiver_state,
                receiver_city: itemData.receiver_city,
                receiver_postcode: itemData.receiver_postcode,
                receiver_email: itemData.receiver_email,
                receiver_phone: itemData.receiver_phone,
                receiver_address1: itemData.receiver_address1,
                receiver_address2: itemData.receiver_address2,

                // Sender information
                sender_name: itemData.sender_name,
                sender_country: itemData.sender_country,
                sender_province: itemData.sender_province,
                sender_city: itemData.sender_city,
                sender_postcode: itemData.sender_postcode,
                sender_address1: itemData.sender_address1,
                sender_address2: itemData.sender_address2,
                sender_license: itemData.sender_license,
                sender_email: itemData.sender_email,
                sender_phone: itemData.sender_phone,

                // Physical properties
                weight_kg: itemData.weight_kg
                  ? parseFloat(itemData.weight_kg)
                  : null,
                quantity: itemData.quantity
                  ? parseInt(itemData.quantity)
                  : null,
                length_cm: itemData.length_cm
                  ? parseInt(itemData.length_cm)
                  : null,
                width_cm: itemData.width_cm
                  ? parseInt(itemData.width_cm)
                  : null,
                height_cm: itemData.height_cm
                  ? parseInt(itemData.height_cm)
                  : null,

                // Product information
                hs_code: itemData.hs_code,
                product_name_en: itemData.product_name_en,
                product_description: itemData.product_description,
                origin_country: itemData.origin_country,
                url: itemData.url,

                // Pricing
                unit_price: itemData.unit_price
                  ? parseFloat(itemData.unit_price)
                  : null,
                total_price: itemData.total_price
                  ? parseFloat(itemData.total_price)
                  : null,
                item_count: itemData.item_count
                  ? parseInt(itemData.item_count)
                  : null,

                // Additional properties
                is_fda:
                  itemData.is_fda === true ||
                  itemData.is_fda === "true" ||
                  itemData.is_fda === 1,
                manufacturer_mid: itemData.manufacturer_mid,
                custom_note: itemData.custom_note,
              },
              { transaction: t }
            );

            createdItems.push({
              id: packageItem.id,
              package_id: packageItem.package_id,
              tracking_no: packageItem.tracking_no,
              client_code: packageItem.client_code,
              product_name_en: packageItem.product_name_en,
              total_price: packageItem.total_price,
              originalIndex: itemData.originalIndex,
            });
          } catch (error) {
            errors.push({
              index: itemData.originalIndex,
              package_id: packageId,
              error: error.message,
              item: itemData,
            });
          }
        }
      }

      if (errors.length > 0) {
        await t.rollback();
        return res.status(400).json({
          error: "Some items failed to create",
          errors,
        });
      }

      await t.commit();

      return res.status(201).json({
        message: `${createdItems.length} package items added successfully${
          createdPackages.length > 0
            ? `, ${createdPackages.length} packages created`
            : ""
        }`,
        items: createdItems,
        createdPackages:
          createdPackages.length > 0 ? createdPackages : undefined,
        summary: {
          total_requested: items.length,
          total_created: createdItems.length,
          total_failed: errors.length,
          packages_affected: Object.keys(itemsByPackage).length,
          packages_created: createdPackages.length,
        },
      });
    } catch (err) {
      await t.rollback();
      console.error("Error batch adding package items from Excel:", err);
      return res
        .status(500)
        .json({ error: "Failed to batch add package items" });
    }
  }
);

// Get all package items for an inbond (grouped by package)
router.get("/inbond/:inbondId/items", authenticate, async (req, res) => {
  try {
    const customerId = req.user.id;
    const { inbondId } = req.params;

    // Verify inbond belongs to customer
    const inbond = await db.Inbond.findOne({
      where: { id: inbondId, client_id: customerId },
    });

    if (!inbond) {
      return res.status(404).json({ error: "Inbond not found" });
    }

    // Get packages with their items
    const packages = await db.Package.findAll({
      where: { inbond_id: inbondId },
      include: [
        {
          model: db.PackageItem,
          as: "items",
          required: false, // Include packages even if they have no items
        },
      ],
      order: [
        ["package_code", "ASC"],
        [{ model: db.PackageItem, as: "items" }, "created_at", "ASC"],
      ],
    });

    const result = packages.map((pkg) => ({
      package_id: pkg.id,
      package_code: pkg.package_code,
      package_status: pkg.status,
      items_count: pkg.items.length,
      items: pkg.items,
    }));

    return res.status(200).json({
      message: "Package items retrieved successfully",
      inbond: {
        id: inbond.id,
        inbond_code: inbond.inbond_code,
        status: inbond.status,
      },
      packages: result,
      summary: {
        total_packages: packages.length,
        total_items: packages.reduce((sum, pkg) => sum + pkg.items.length, 0),
      },
    });
  } catch (err) {
    console.error("Error fetching inbond package items:", err);
    return res.status(500).json({ error: "Failed to fetch package items" });
  }
});

export default router;
