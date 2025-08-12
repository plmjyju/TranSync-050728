import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middleware/auth.js";

const router = express.Router();

// Agent confirms package arrival by scanning barcode (package_code)
router.post("/confirm-arrival", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const agentId = req.user.id;
    const { package_code, arrival_note } = req.body;

    // Validate input
    if (!package_code) {
      return res.status(400).json({ error: "Package code is required" });
    }

    // Find package by package_code
    const packageRecord = await db.Package.findOne({
      where: {
        package_code: package_code.trim().toUpperCase(),
      },
      include: [
        {
          model: db.Inbond,
          as: "inbond",
          include: [
            {
              model: db.User,
              as: "client",
              attributes: ["id", "companyName", "salesRepId"],
            },
          ],
        },
        {
          model: db.User,
          as: "client",
          attributes: ["id", "companyName", "salesRepId"],
        },
      ],
      transaction: t,
    });

    if (!packageRecord) {
      await t.rollback();
      return res.status(404).json({
        error: "Package not found",
        package_code: package_code,
      });
    }

    // Verify agent has permission to handle this package
    // Check if this agent is the sales representative for the client
    const clientSalesRepId =
      packageRecord.client?.salesRepId ||
      packageRecord.inbond?.client?.salesRepId;
    if (clientSalesRepId !== agentId) {
      await t.rollback();
      return res.status(403).json({
        error:
          "Unauthorized: You are not the sales representative for this client",
      });
    }

    // Check if package can be confirmed (should be in 'prepared' status)
    if (packageRecord.status !== "prepared") {
      await t.rollback();
      return res.status(400).json({
        error: `Package cannot be confirmed. Current status: ${packageRecord.status}`,
        allowed_status: "prepared",
      });
    }

    // Update package status to 'arrived'
    packageRecord.status = "arrived";
    packageRecord.arrival_confirmed_at = new Date();
    packageRecord.arrival_confirmed_by = agentId;
    if (arrival_note) {
      packageRecord.remark = packageRecord.remark
        ? `${packageRecord.remark}\n[Arrival Note] ${arrival_note}`
        : `[Arrival Note] ${arrival_note}`;
    }

    await packageRecord.save({ transaction: t });

    // Create arrival log entry
    await db.PackageLog.create(
      {
        package_id: packageRecord.id,
        action: "arrival_confirmed",
        performed_by: agentId,
        notes: arrival_note || "Package arrival confirmed via barcode scan",
        status_from: "prepared",
        status_to: "arrived",
      },
      { transaction: t }
    );

    // Check if all packages in the inbond are now arrived
    const inbondId = packageRecord.inbond_id;
    const allPackages = await db.Package.findAll({
      where: { inbond_id: inbondId },
      transaction: t,
    });

    const allArrived = allPackages.every(
      (pkg) => pkg.status === "arrived" || pkg.id === packageRecord.id
    );

    let inbondUpdated = false;
    if (allArrived && allPackages.length > 0) {
      // Update inbond status to completed
      const inbond = await db.Inbond.findByPk(inbondId, { transaction: t });
      if (inbond && inbond.status !== "completed") {
        inbond.status = "completed";
        await inbond.save({ transaction: t });
        inbondUpdated = true;

        // Create inbond log entry
        await db.InbondLog.create(
          {
            inbond_id: inbondId,
            action: "completed",
            performed_by: agentId,
            status_from: inbond.status,
            status_to: "completed",
            notes: "Inbond completed - all packages have arrived",
          },
          { transaction: t }
        );
      }
    }

    await t.commit();

    return res.status(200).json({
      message: "Package arrival confirmed successfully",
      package: {
        id: packageRecord.id,
        package_code: packageRecord.package_code,
        status: packageRecord.status,
        arrival_confirmed_at: packageRecord.arrival_confirmed_at,
        client_company:
          packageRecord.client?.companyName ||
          packageRecord.inbond?.client?.companyName,
        inbond_code: packageRecord.inbond?.inbond_code,
      },
      inbond_completed: inbondUpdated,
      message_details: inbondUpdated
        ? "Package confirmed and inbond completed - all packages have arrived"
        : "Package arrival confirmed successfully",
    });
  } catch (err) {
    await t.rollback();
    console.error("Error confirming package arrival:", err);
    return res.status(500).json({ error: "Failed to confirm package arrival" });
  }
});

// Batch confirm multiple packages arrival
router.post("/confirm-arrival-batch", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const agentId = req.user.id;
    const { package_codes, arrival_note } = req.body;

    // Validate input
    if (!package_codes || !Array.isArray(package_codes)) {
      return res.status(400).json({ error: "Package codes array is required" });
    }

    if (package_codes.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one package code is required" });
    }

    if (package_codes.length > 100) {
      return res
        .status(400)
        .json({ error: "Maximum 100 packages allowed per batch" });
    }

    const confirmedPackages = [];
    const errors = [];

    // Process each package code
    for (let i = 0; i < package_codes.length; i++) {
      try {
        const package_code = package_codes[i];

        if (!package_code) {
          errors.push({
            index: i,
            package_code: package_code,
            error: "Package code is required",
          });
          continue;
        }

        // Find package
        const packageRecord = await db.Package.findOne({
          where: {
            package_code: package_code.trim().toUpperCase(),
          },
          include: [
            {
              model: db.Inbond,
              as: "inbond",
              include: [
                {
                  model: db.User,
                  as: "client",
                  attributes: ["id", "companyName", "salesRepId"],
                },
              ],
            },
            {
              model: db.User,
              as: "client",
              attributes: ["id", "companyName", "salesRepId"],
            },
          ],
          transaction: t,
        });

        if (!packageRecord) {
          errors.push({
            index: i,
            package_code: package_code,
            error: "Package not found",
          });
          continue;
        }

        // Verify agent permission
        const clientSalesRepId =
          packageRecord.client?.salesRepId ||
          packageRecord.inbond?.client?.salesRepId;
        if (clientSalesRepId !== agentId) {
          errors.push({
            index: i,
            package_code: package_code,
            error:
              "Unauthorized: You are not the sales representative for this client",
          });
          continue;
        }

        // Check status
        if (packageRecord.status !== "prepared") {
          errors.push({
            index: i,
            package_code: package_code,
            error: `Package cannot be confirmed. Current status: ${packageRecord.status}`,
          });
          continue;
        }

        // Update package
        packageRecord.status = "arrived";
        packageRecord.arrival_confirmed_at = new Date();
        packageRecord.arrival_confirmed_by = agentId;
        if (arrival_note) {
          packageRecord.remark = packageRecord.remark
            ? `${packageRecord.remark}\n[Batch Arrival Note] ${arrival_note}`
            : `[Batch Arrival Note] ${arrival_note}`;
        }

        await packageRecord.save({ transaction: t });

        // Create log entry
        await db.PackageLog.create(
          {
            package_id: packageRecord.id,
            action: "arrival_confirmed",
            performed_by: agentId,
            notes:
              arrival_note ||
              "Package arrival confirmed via batch barcode scan",
            status_from: "prepared",
            status_to: "arrived",
          },
          { transaction: t }
        );

        confirmedPackages.push({
          id: packageRecord.id,
          package_code: packageRecord.package_code,
          status: packageRecord.status,
          arrival_confirmed_at: packageRecord.arrival_confirmed_at,
          client_company:
            packageRecord.client?.companyName ||
            packageRecord.inbond?.client?.companyName,
          inbond_code: packageRecord.inbond?.inbond_code,
        });
      } catch (error) {
        errors.push({
          index: i,
          package_code: package_codes[i],
          error: error.message,
        });
      }
    }

    if (errors.length > 0 && confirmedPackages.length === 0) {
      await t.rollback();
      return res.status(400).json({
        error: "All packages failed to confirm",
        errors,
      });
    }

    // Check for completed inbonds after batch confirmation
    const completedInbonds = [];
    const processedInbonds = new Set();

    for (const confirmedPackage of confirmedPackages) {
      const inbondCode = confirmedPackage.inbond_code;
      if (!inbondCode || processedInbonds.has(inbondCode)) continue;

      processedInbonds.add(inbondCode);

      // Find the inbond and check if all packages are arrived
      const inbond = await db.Inbond.findOne({
        where: { inbond_code: inbondCode },
        include: [
          {
            model: db.Package,
            as: "packages",
          },
        ],
        transaction: t,
      });

      if (inbond && inbond.packages) {
        const allArrived = inbond.packages.every(
          (pkg) => pkg.status === "arrived"
        );

        if (allArrived && inbond.status !== "completed") {
          inbond.status = "completed";
          await inbond.save({ transaction: t });

          // Create inbond log entry
          await db.InbondLog.create(
            {
              inbond_id: inbond.id,
              action: "completed",
              performed_by: agentId,
              status_from: "arrived",
              status_to: "completed",
              notes:
                "Inbond completed via batch confirmation - all packages have arrived",
            },
            { transaction: t }
          );

          completedInbonds.push({
            id: inbond.id,
            inbond_code: inbond.inbond_code,
            total_packages: inbond.packages.length,
          });
        }
      }
    }

    await t.commit();

    return res.status(200).json({
      message: `${confirmedPackages.length} packages confirmed successfully${
        completedInbonds.length > 0
          ? `, ${completedInbonds.length} inbond(s) completed`
          : ""
      }`,
      confirmed_packages: confirmedPackages,
      completed_inbonds:
        completedInbonds.length > 0 ? completedInbonds : undefined,
      summary: {
        total_requested: package_codes.length,
        total_confirmed: confirmedPackages.length,
        total_failed: errors.length,
        inbonds_completed: completedInbonds.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await t.rollback();
    console.error("Error batch confirming packages:", err);
    return res.status(500).json({ error: "Failed to batch confirm packages" });
  }
});

// Get packages pending arrival confirmation for this agent
router.get("/pending-arrival", authenticate, async (req, res) => {
  try {
    const agentId = req.user.id;
    const { page = 1, limit = 20, search } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {
      status: "prepared", // Only packages that are prepared and waiting for arrival confirmation
    };

    // Add search filter if provided
    if (search) {
      whereClause[db.Sequelize.Op.or] = [
        { package_code: { [db.Sequelize.Op.like]: `%${search}%` } },
      ];
    }

    // Find packages where this agent is the sales rep for the client
    const packages = await db.Package.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.Inbond,
          as: "inbond",
          include: [
            {
              model: db.User,
              as: "client",
              where: { salesRepId: agentId },
              attributes: ["id", "companyName", "salesRepId"],
            },
          ],
          required: false,
        },
        {
          model: db.User,
          as: "client",
          where: { salesRepId: agentId },
          attributes: ["id", "companyName", "salesRepId"],
          required: false,
        },
      ],
      order: [["created_at", "ASC"]],
      limit: parseInt(limit),
      offset: offset,
    });

    // Filter packages where agent is actually the sales rep
    const filteredPackages = packages.rows.filter((pkg) => {
      const clientSalesRepId =
        pkg.client?.salesRepId || pkg.inbond?.client?.salesRepId;
      return clientSalesRepId === agentId;
    });

    return res.status(200).json({
      message: "Pending arrival packages retrieved successfully",
      packages: filteredPackages.map((pkg) => ({
        id: pkg.id,
        package_code: pkg.package_code,
        status: pkg.status,
        created_at: pkg.created_at,
        client_company:
          pkg.client?.companyName || pkg.inbond?.client?.companyName,
        inbond_code: pkg.inbond?.inbond_code,
        weight_kg: pkg.weight_kg,
        dimensions: {
          length_cm: pkg.length_cm,
          width_cm: pkg.width_cm,
          height_cm: pkg.height_cm,
        },
      })),
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(filteredPackages.length / limit),
        total_count: filteredPackages.length,
        limit: parseInt(limit),
      },
    });
  } catch (err) {
    console.error("Error fetching pending packages:", err);
    return res.status(500).json({ error: "Failed to fetch pending packages" });
  }
});

// Get packages that have arrived for this agent
router.get("/arrived", authenticate, async (req, res) => {
  try {
    const agentId = req.user.id;
    const { page = 1, limit = 20, search, from_date, to_date } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {
      status: "arrived",
      arrival_confirmed_by: agentId,
    };

    // Add search filter
    if (search) {
      whereClause[db.Sequelize.Op.or] = [
        { package_code: { [db.Sequelize.Op.like]: `%${search}%` } },
      ];
    }

    // Add date range filter
    if (from_date && to_date) {
      whereClause.arrival_confirmed_at = {
        [db.Sequelize.Op.between]: [new Date(from_date), new Date(to_date)],
      };
    }

    const packages = await db.Package.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.Inbond,
          as: "inbond",
          include: [
            {
              model: db.User,
              as: "client",
              attributes: ["id", "companyName"],
            },
          ],
        },
        {
          model: db.User,
          as: "client",
          attributes: ["id", "companyName"],
        },
      ],
      order: [["arrival_confirmed_at", "DESC"]],
      limit: parseInt(limit),
      offset: offset,
    });

    return res.status(200).json({
      message: "Arrived packages retrieved successfully",
      packages: packages.rows.map((pkg) => ({
        id: pkg.id,
        package_code: pkg.package_code,
        status: pkg.status,
        arrival_confirmed_at: pkg.arrival_confirmed_at,
        client_company:
          pkg.client?.companyName || pkg.inbond?.client?.companyName,
        inbond_code: pkg.inbond?.inbond_code,
        weight_kg: pkg.weight_kg,
        dimensions: {
          length_cm: pkg.length_cm,
          width_cm: pkg.width_cm,
          height_cm: pkg.height_cm,
        },
      })),
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(packages.count / limit),
        total_count: packages.count,
        limit: parseInt(limit),
      },
    });
  } catch (err) {
    console.error("Error fetching arrived packages:", err);
    return res.status(500).json({ error: "Failed to fetch arrived packages" });
  }
});

// Search package by barcode/package_code for quick lookup
router.get("/search/:package_code", authenticate, async (req, res) => {
  try {
    const agentId = req.user.id;
    const { package_code } = req.params;

    if (!package_code) {
      return res.status(400).json({ error: "Package code is required" });
    }

    const packageRecord = await db.Package.findOne({
      where: {
        package_code: package_code.trim().toUpperCase(),
      },
      include: [
        {
          model: db.Inbond,
          as: "inbond",
          include: [
            {
              model: db.User,
              as: "client",
              attributes: ["id", "companyName", "salesRepId"],
            },
          ],
        },
        {
          model: db.User,
          as: "client",
          attributes: ["id", "companyName", "salesRepId"],
        },
        {
          model: db.PackageItem,
          as: "items",
          attributes: ["id", "tracking_no", "product_name_en", "total_price"],
        },
      ],
    });

    if (!packageRecord) {
      return res.status(404).json({
        error: "Package not found",
        package_code: package_code,
      });
    }

    // Check if agent has permission
    const clientSalesRepId =
      packageRecord.client?.salesRepId ||
      packageRecord.inbond?.client?.salesRepId;
    if (clientSalesRepId !== agentId) {
      return res.status(403).json({
        error:
          "Unauthorized: You are not the sales representative for this client",
      });
    }

    return res.status(200).json({
      message: "Package found",
      package: {
        id: packageRecord.id,
        package_code: packageRecord.package_code,
        status: packageRecord.status,
        created_at: packageRecord.created_at,
        arrival_confirmed_at: packageRecord.arrival_confirmed_at,
        client_company:
          packageRecord.client?.companyName ||
          packageRecord.inbond?.client?.companyName,
        inbond_code: packageRecord.inbond?.inbond_code,
        weight_kg: packageRecord.weight_kg,
        dimensions: {
          length_cm: packageRecord.length_cm,
          width_cm: packageRecord.width_cm,
          height_cm: packageRecord.height_cm,
        },
        items_count: packageRecord.items?.length || 0,
        can_confirm_arrival: packageRecord.status === "prepared",
      },
    });
  } catch (err) {
    console.error("Error searching package:", err);
    return res.status(500).json({ error: "Failed to search package" });
  }
});

// Get completed inbonds for this agent
router.get("/completed-inbonds", authenticate, async (req, res) => {
  try {
    const agentId = req.user.id;
    const { page = 1, limit = 20, from_date, to_date } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = { status: "completed" };

    // Add date range filter
    if (from_date && to_date) {
      whereClause.updated_at = {
        [db.Sequelize.Op.between]: [new Date(from_date), new Date(to_date)],
      };
    }

    const inbonds = await db.Inbond.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.User,
          as: "client",
          where: { salesRepId: agentId },
          attributes: ["id", "companyName"],
        },
        {
          model: db.Package,
          as: "packages",
          attributes: ["id", "package_code", "status", "arrival_confirmed_at"],
        },
      ],
      order: [["updated_at", "DESC"]],
      limit: parseInt(limit),
      offset: offset,
    });

    return res.status(200).json({
      message: "Completed inbonds retrieved successfully",
      inbonds: inbonds.rows.map((inbond) => ({
        id: inbond.id,
        inbond_code: inbond.inbond_code,
        clearance_type: inbond.clearance_type,
        shipping_type: inbond.shipping_type,
        status: inbond.status,
        client_company: inbond.client.companyName,
        total_packages: inbond.packages.length,
        completed_at: inbond.updated_at,
        created_at: inbond.created_at,
      })),
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(inbonds.count / limit),
        total_count: inbonds.count,
        limit: parseInt(limit),
      },
    });
  } catch (err) {
    console.error("Error fetching completed inbonds:", err);
    return res.status(500).json({ error: "Failed to fetch completed inbonds" });
  }
});

export default router;
