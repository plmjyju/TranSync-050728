import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import moment from "moment-timezone";

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
router.post(
  "/create-inbond",
  authenticate,
  checkPermission("client.inbond.create"),
  async (req, res) => {
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

      // Validate tax_type_id if provided
      let validatedTaxTypeId = null;
      if (tax_type_id) {
        const taxType = await db.TaxType.findByPk(tax_type_id);
        if (!taxType) {
          return res.status(400).json({
            error: `Invalid tax_type_id: ${tax_type_id}. Tax type not found.`,
          });
        }
        validatedTaxTypeId = tax_type_id;
      }

      // Generate inbond code
      const inbondCode = await generateInbondCode(agentId, customerId);

      // Create draft inbond
      const inbond = await db.Inbond.create({
        inbond_code: inbondCode,
        client_id: customerId,
        shipping_type,
        clearance_type,
        tax_type_id: validatedTaxTypeId,
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
  }
);

// Get all inbonds for the authenticated customer
router.get(
  "/inbonds",
  authenticate,
  checkPermission("client.inbond.view"),
  async (req, res) => {
    try {
      const customerId = req.user.id;
      const {
        page = 1,
        limit = 20,
        status,
        startDate,
        endDate,
        dateField = "created_at", // 可以选择按 created_at 或 updated_at 筛选
        timezone = "UTC", // 客户端时区，默认UTC
      } = req.query;

      const whereClause = { client_id: customerId };

      // 验证时区格式
      const validTimezone = moment.tz.zone(timezone) ? timezone : "UTC";

      // 状态筛选
      if (status) {
        whereClause.status = status;
      }

      // 日期范围筛选（支持时区）
      if (startDate || endDate) {
        const dateFilter = {};

        if (startDate) {
          // 解析开始日期，考虑客户端时区
          if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return res.status(400).json({
              error: "Invalid startDate format. Use YYYY-MM-DD",
            });
          }

          // 在客户端时区创建当天开始时间，然后转换为UTC
          const startMoment = moment.tz(
            startDate + " 00:00:00",
            "YYYY-MM-DD HH:mm:ss",
            validTimezone
          );
          dateFilter[db.Sequelize.Op.gte] = startMoment.utc().toDate();
        }

        if (endDate) {
          // 解析结束日期，考虑客户端时区
          if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({
              error: "Invalid endDate format. Use YYYY-MM-DD",
            });
          }

          // 在客户端时区创建当天结束时间，然后转换为UTC
          const endMoment = moment.tz(
            endDate + " 23:59:59",
            "YYYY-MM-DD HH:mm:ss",
            validTimezone
          );
          dateFilter[db.Sequelize.Op.lte] = endMoment.utc().toDate();
        }

        // 验证日期字段
        if (!["created_at", "updated_at"].includes(dateField)) {
          return res.status(400).json({
            error: "Invalid dateField. Must be 'created_at' or 'updated_at'",
          });
        }

        whereClause[dateField] = dateFilter;
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
        filters: {
          status: status || null,
          startDate: startDate || null,
          endDate: endDate || null,
          dateField: dateField,
          timezone: validTimezone,
        },
      });
    } catch (err) {
      console.error("Error fetching inbonds:", err);
      return res.status(500).json({ error: "Failed to fetch inbonds" });
    }
  }
);

// Get a specific inbond by ID
router.get(
  "/inbond/:id",
  authenticate,
  checkPermission("client.inbond.view"),
  async (req, res) => {
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
  }
);

// Update inbond information
router.put(
  "/inbond/:id",
  authenticate,
  checkPermission("client.inbond.update"),
  async (req, res) => {
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
  }
);

// 提交 inbond (校验所有关联包裹都至少有一个 OperationRequirement, 汇总统计并写入 summary)
router.post(
  "/inbond/:id/submit",
  authenticate,
  checkPermission("client.inbond.update"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const customerId = req.user.id;
      const { id } = req.params;

      const inbond = await db.Inbond.findOne({
        where: { id, client_id: customerId },
        transaction: t,
      });
      if (!inbond) {
        await t.rollback();
        return res
          .status(404)
          .json({ success: false, message: "Inbond不存在" });
      }
      if (inbond.status !== "draft") {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "仅草稿状态可提交" });
      }

      // 取关联包裹及其需求
      const packages = await db.Package.findAll({
        where: { inbond_id: id, client_id: customerId },
        include: [
          {
            model: db.OperationRequirement,
            as: "operationRequirements",
            through: { attributes: [] },
            attributes: ["id", "requirement_code", "requirement_name"],
          },
        ],
        transaction: t,
      });

      if (packages.length === 0) {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "无关联包裹，不能提交" });
      }

      // 校验每个包裹至少一个需求
      const invalidPkgs = packages.filter(
        (p) => !p.operationRequirements || p.operationRequirements.length === 0
      );
      if (invalidPkgs.length > 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "存在未分配操作需求的包裹",
          invalid_package_ids: invalidPkgs.map((p) => p.id),
        });
      }

      // 汇总统计
      const aggMap = new Map();
      for (const pkg of packages) {
        for (const reqObj of pkg.operationRequirements) {
          const key = reqObj.requirement_code;
          if (!aggMap.has(key)) {
            aggMap.set(key, {
              requirement_code: key,
              requirement_name: reqObj.requirement_name,
              count: 0,
            });
          }
          aggMap.get(key).count += 1;
        }
      }
      const summaryArray = Array.from(aggMap.values()).sort((a, b) =>
        a.requirement_code.localeCompare(b.requirement_code)
      );

      await inbond.update(
        {
          status: "submitted",
          requirement_summary_json: JSON.stringify(summaryArray),
          requirement_validation_passed: true,
        },
        { transaction: t }
      );

      await t.commit();
      return res.json({
        success: true,
        message: "提交成功",
        inbond_id: inbond.id,
        requirement_summary: summaryArray,
      });
    } catch (e) {
      await t.rollback();
      console.error(e);
      return res.status(500).json({ success: false, message: "提交失败" });
    }
  }
);

// 获取支持的时区列表（只需要认证，不需要特殊权限）
router.get("/timezones", authenticate, async (req, res) => {
  try {
    // 返回常用时区列表
    const commonTimezones = [
      { name: "UTC", displayName: "协调世界时 (UTC)" },
      { name: "America/New_York", displayName: "美国东部时间 (EST/EDT)" },
      { name: "America/Chicago", displayName: "美国中部时间 (CST/CDT)" },
      { name: "America/Denver", displayName: "美国山地时间 (MST/MDT)" },
      { name: "America/Los_Angeles", displayName: "美国太平洋时间 (PST/PDT)" },
      { name: "Europe/London", displayName: "英国时间 (GMT/BST)" },
      { name: "Europe/Paris", displayName: "中欧时间 (CET/CEST)" },
      { name: "Asia/Shanghai", displayName: "中国标准时间 (CST)" },
      { name: "Asia/Tokyo", displayName: "日本标准时间 (JST)" },
      { name: "Asia/Seoul", displayName: "韩国标准时间 (KST)" },
      { name: "Asia/Hong_Kong", displayName: "香港时间 (HKT)" },
      { name: "Asia/Singapore", displayName: "新加坡时间 (SGT)" },
      { name: "Australia/Sydney", displayName: "澳大利亚东部时间 (AEST/AEDT)" },
    ];

    return res.status(200).json({
      message: "Supported timezones retrieved successfully",
      timezones: commonTimezones,
    });
  } catch (err) {
    console.error("Error fetching timezones:", err);
    return res.status(500).json({ error: "Failed to fetch timezones" });
  }
});

export default router;
