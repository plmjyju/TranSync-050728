import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js"; // 统一默认导出
import { checkPermission } from "../../middlewares/checkPermission.js";
import moment from "moment-timezone";
import {
  writeAudit,
  pickSnapshot,
  INBOND_AUDIT_FIELDS,
  withAuditTransaction,
} from "../../utils/auditHelper.js";
import { logRead, logViewDetail } from "../../utils/logRead.js";
import { buildError, ERROR_CODES } from "../../utils/errors.js";
import { generateInbondCodeAtomic } from "../../utils/sequence.js";

const router = express.Router();

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
      if (!agentId)
        return res
          .status(400)
          .json(
            buildError(
              ERROR_CODES.INBOND_AGENT_ID_MISSING,
              "Agent ID not found in token"
            )
          );
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
      if (!validClearanceTypes.includes(clearance_type))
        return res
          .status(400)
          .json(
            buildError(
              ERROR_CODES.INBOND_CLEARANCE_TYPE_INVALID,
              "Invalid clearance type",
              { valid_types: validClearanceTypes }
            )
          );
      if (!["air", "sea"].includes(shipping_type))
        return res
          .status(400)
          .json(
            buildError(
              ERROR_CODES.INBOND_SHIPPING_TYPE_INVALID,
              "Invalid shipping type. Must be 'air' or 'sea'"
            )
          );

      let validatedTaxTypeId = null;
      if (tax_type_id) {
        const taxType = await db.TaxType.findByPk(tax_type_id);
        if (!taxType)
          return res
            .status(400)
            .json(
              buildError(
                ERROR_CODES.INBOND_TAX_TYPE_INVALID,
                `Invalid tax_type_id: ${tax_type_id}.`
              )
            );
        validatedTaxTypeId = tax_type_id;
      }
      const inbondCode = await generateInbondCodeAtomic(agentId, customerId);
      const auditList = [];
      const inbond = await withAuditTransaction(
        db.sequelize,
        async (t, audits) => {
          const created = await db.Inbond.create(
            {
              inbond_code: inbondCode,
              client_id: customerId,
              shipping_type,
              clearance_type,
              tax_type_id: validatedTaxTypeId,
              arrival_method: arrival_method || null,
              status: "draft",
              remark: remark || null,
            },
            { transaction: t }
          );
          audits.push({
            module: "client",
            entityType: "Inbond",
            entityId: created.id,
            action: "create",
            user: req.user,
            before: null,
            after: pickSnapshot(created, INBOND_AUDIT_FIELDS),
            ip: req.ip,
            ua: req.headers["user-agent"],
          });
          return created;
        },
        auditList
      );
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
      return res
        .status(500)
        .json(
          buildError(
            ERROR_CODES.INBOND_CREATE_FAILED,
            "Failed to create inbond"
          )
        );
    }
  }
);

// Get all inbonds for the authenticated customer
router.get(
  "/inbonds",
  authenticate,
  checkPermission("client.inbond.view"),
  async (req, res) => {
    const startAt = Date.now();
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

      const response = {
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
      };
      res.status(200).json(response);
      logRead(req, {
        entityType: "Inbond",
        page: parseInt(page),
        pageSize: parseInt(limit),
        resultCount: rows.length,
        startAt,
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
    const startAt = Date.now();
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
              "operation_requirement_id",
            ],
            include: [
              {
                model: db.OperationRequirement,
                as: "operationRequirement",
                attributes: ["id", "requirement_code", "requirement_name"],
              },
            ],
          },
        ],
      });

      if (!inbond) {
        return res.status(404).json({ error: "Inbond not found" });
      }

      res
        .status(200)
        .json({ message: "Inbond retrieved successfully", inbond });
      logViewDetail(req, {
        entityType: "Inbond",
        entityId: inbond.id,
        startAt,
        resultExists: true,
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
      if (!inbond)
        return res
          .status(404)
          .json(
            buildError(
              ERROR_CODES.INBOND_NOT_MODIFIABLE,
              "Inbond not found or cannot be modified"
            )
          );
      const beforeSnap = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
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
        if (!validClearanceTypes.includes(clearance_type))
          return res
            .status(400)
            .json(
              buildError(
                ERROR_CODES.INBOND_CLEARANCE_TYPE_INVALID,
                "Invalid clearance type",
                { valid_types: validClearanceTypes }
              )
            );
      }
      if (shipping_type && !["air", "sea"].includes(shipping_type))
        return res
          .status(400)
          .json(
            buildError(
              ERROR_CODES.INBOND_SHIPPING_TYPE_INVALID,
              "Invalid shipping type. Must be 'air' or 'sea'"
            )
          );
      if (shipping_type) inbond.shipping_type = shipping_type;
      if (arrival_method) inbond.arrival_method = arrival_method;
      if (clearance_type) inbond.clearance_type = clearance_type;
      if (tax_type_id !== undefined) inbond.tax_type_id = tax_type_id;
      if (remark !== undefined) inbond.remark = remark;
      await inbond.save();
      const afterSnap = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
      writeAudit({
        module: "client",
        entityType: "Inbond",
        entityId: inbond.id,
        action: "update",
        user: req.user,
        before: beforeSnap,
        after: afterSnap,
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
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
      return res
        .status(500)
        .json(
          buildError(
            ERROR_CODES.INBOND_UPDATE_FAILED,
            "Failed to update inbond"
          )
        );
    }
  }
);

// 提交 inbond
router.post(
  "/inbond/:id/submit",
  authenticate,
  checkPermission("client.inbond.update"),
  async (req, res) => {
    const auditRecords = [];
    try {
      const customerId = req.user.id;
      const { id } = req.params;
      const result = await withAuditTransaction(
        db.sequelize,
        async (t, audits) => {
          const inbond = await db.Inbond.findOne({
            where: { id, client_id: customerId },
            transaction: t,
          });
          if (!inbond)
            throw buildError(ERROR_CODES.INBOND_NOT_FOUND, "Inbond不存在");
          if (inbond.status !== "draft")
            throw buildError(ERROR_CODES.INBOND_NOT_DRAFT, "仅草稿状态可提交");
          const packages = await db.Package.findAll({
            where: { inbond_id: id, client_id: customerId },
            include: [
              {
                model: db.OperationRequirement,
                as: "operationRequirement",
                attributes: ["id", "requirement_code", "requirement_name"],
              },
            ],
            transaction: t,
          });
          if (packages.length === 0)
            throw buildError(
              ERROR_CODES.INBOND_NO_PACKAGES,
              "无关联包裹，不能提交"
            );
          const invalidPkgs = packages.filter(
            (p) => !p.operation_requirement_id
          );
          if (invalidPkgs.length > 0)
            throw buildError(
              ERROR_CODES.INBOND_PACKAGE_MISSING_REQUIREMENT,
              "存在未分配操作需求的包裹",
              { invalid_package_ids: invalidPkgs.map((p) => p.id) }
            );
          const beforeSnap = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
          const aggMap = new Map();
          for (const pkg of packages) {
            const reqObj = pkg.operationRequirement;
            if (!reqObj) continue;
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
          const afterSnap = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
          audits.push({
            module: "client",
            entityType: "Inbond",
            entityId: inbond.id,
            action: "submit",
            user: req.user,
            before: beforeSnap,
            after: afterSnap,
            extra: { requirement_summary: summaryArray },
            ip: req.ip,
            ua: req.headers["user-agent"],
          });
          return { inbond, summaryArray };
        },
        auditRecords
      );
      return res.json({
        success: true,
        message: "提交成功",
        inbond_id: result.inbond.id,
        requirement_summary: result.summaryArray,
      });
    } catch (e) {
      if (e && e.code) return res.status(400).json(e);
      console.error(e);
      return res
        .status(500)
        .json(buildError(ERROR_CODES.INBOND_SUBMIT_FAILED, "提交失败"));
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
