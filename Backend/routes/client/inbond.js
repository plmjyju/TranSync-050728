import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
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
        clearance_type = "T01",
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
        // 兼容旧值
        "general_trade",
        "bonded_warehouse",
        "cross_border_ecom",
        "personal_items",
        "samples",
        "temporary_import",
        "duty_free",
        "re_import",
        // 新增代码
        "T01",
        "T11",
        "T06-T01",
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

// 创建/更新 inbond 时可同时提交清关 items（可选）
router.post(
  "/inbonds",
  authenticate,
  checkPermission("client.inbond.create"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const clientId = req.user.id;
      const { inbond, items } = req.body || {};
      if (!inbond?.inbond_code) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          code: "INBOND_CODE_MISSING",
          message: "入库单号不能为空",
        });
      }
      const created = await db.Inbond.create(
        { ...inbond, client_id: clientId },
        { transaction: t }
      );
      if (Array.isArray(items) && items.length) {
        const list = items.map((it) => ({
          ...it,
          inbond_id: created.id,
          client_id: clientId,
        }));
        await db.InbondDeclarationItem.bulkCreate(list, { transaction: t });
        await created.update(
          { clearance_summary_json: JSON.stringify(list.slice(0, 200)) },
          { transaction: t }
        );
      }
      await t.commit();
      return res.json({ success: true, message: "创建成功", inbond: created });
    } catch (e) {
      await t.rollback();
      return res.status(500).json({
        success: false,
        code: "INBOND_CREATE_ERROR",
        message: "创建失败",
      });
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
      // 兼容旧/新参数命名
      const page = parseInt(req.query.page || 1);
      const limit = parseInt(req.query.limit || 20);
      const status = req.query.status;
      const q = req.query.q;
      const dateField = (
        req.query.date_field ||
        req.query.dateField ||
        "created_at"
      ).trim();
      const startDate = req.query.start_date || req.query.startDate;
      const endDate = req.query.end_date || req.query.endDate;
      const timezone = req.query.timezone || "UTC";
      const hasClearanceDocs = req.query.has_clearance_docs; // 1 / 0
      const sortBy = req.query.sort_by; // created_at | updated_at | last_arrival_at | last_scan_at
      const sortOrderRaw = (req.query.sort_order || "").toLowerCase();
      const sortOrder =
        sortOrderRaw === "desc"
          ? "DESC"
          : sortOrderRaw === "asc"
          ? "ASC"
          : null;

      const whereClause = { client_id: customerId };

      // 状态筛选
      if (status) whereClause.status = status;

      // 模糊搜索
      if (q) {
        whereClause[db.Sequelize.Op.or] = [
          { inbond_code: { [db.Sequelize.Op.like]: `%${q}%` } },
          { remark: { [db.Sequelize.Op.like]: `%${q}%` } },
        ];
      }

      // 清关资料筛选
      if (hasClearanceDocs === "1") {
        whereClause.clearance_summary_json = { [db.Sequelize.Op.ne]: null };
      } else if (hasClearanceDocs === "0") {
        whereClause.clearance_summary_json = null;
      }

      // 验证时区
      const validTimezone = moment.tz.zone(timezone) ? timezone : "UTC";

      // 日期范围筛选（按新参数）
      if (startDate || endDate) {
        const dateFilter = {};
        if (startDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return res
              .status(400)
              .json({ error: "Invalid start_date format. Use YYYY-MM-DD" });
          }
          const startMoment = moment.tz(
            startDate + " 00:00:00",
            "YYYY-MM-DD HH:mm:ss",
            validTimezone
          );
          dateFilter[db.Sequelize.Op.gte] = startMoment.utc().toDate();
        }
        if (endDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res
              .status(400)
              .json({ error: "Invalid end_date format. Use YYYY-MM-DD" });
          }
          const endMoment = moment.tz(
            endDate + " 23:59:59",
            "YYYY-MM-DD HH:mm:ss",
            validTimezone
          );
          dateFilter[db.Sequelize.Op.lte] = endMoment.utc().toDate();
        }
        // 允许 created_at / updated_at
        if (!["created_at", "updated_at"].includes(dateField)) {
          return res
            .status(400)
            .json({
              error: "Invalid date_field. Must be 'created_at' or 'updated_at'",
            });
        }
        whereClause[dateField] = dateFilter;
      }

      // 判断是否为需要汇总字段排序（需要先计算聚合再排序）
      const aggregateSort = ["last_arrival_at", "last_scan_at"].includes(
        sortBy
      );

      let rows = [];
      let count = 0;

      if (!aggregateSort) {
        // 直接数据库分页 + 排序
        const order = [];
        if (
          sortBy &&
          ["created_at", "updated_at"].includes(sortBy) &&
          sortOrder
        ) {
          order.push([sortBy, sortOrder]);
        } else {
          // 默认按创建时间倒序
          order.push(["created_at", "DESC"]);
        }
        const result = await db.Inbond.findAndCountAll({
          where: whereClause,
          order,
          limit,
          offset: (page - 1) * limit,
          attributes: [
            "id",
            "inbond_code",
            "shipping_type",
            "arrival_method",
            "status",
            "clearance_type",
            "remark",
            "created_at",
            "updated_at",
            "clearance_summary_json",
          ],
        });
        rows = result.rows;
        count = result.count;
      } else {
        // 聚合字段排序：先取全部（可根据需要加入安全上限/后续再优化）
        rows = await db.Inbond.findAll({
          where: whereClause,
          attributes: [
            "id",
            "inbond_code",
            "shipping_type",
            "arrival_method",
            "status",
            "clearance_type",
            "remark",
            "created_at",
            "updated_at",
            "clearance_summary_json",
          ],
        });
        count = rows.length;
      }

      // === 统计聚合 ===
      const ids = rows.map((r) => r.id);
      const { fn, col, literal, Op } = db.Sequelize;
      const statsMap = new Map();
      if (ids.length > 0) {
        let stats = [];
        try {
          stats = await db.Package.findAll({
            attributes: [
              "inbond_id",
              [fn("COUNT", col("id")), "total_packages"],
              [
                fn(
                  "SUM",
                  literal(
                    "CASE WHEN `inbound_status` IN ('arrived','received') THEN 1 ELSE 0 END"
                  )
                ),
                "arrived_packages",
              ],
              [fn("MAX", col("arrival_confirmed_at")), "last_arrival_at"],
              [fn("MAX", col("last_scanned_at")), "last_scan_at"],
            ],
            where: { inbond_id: { [Op.in]: ids } },
            group: ["inbond_id"],
            raw: true,
          });
        } catch (err) {
          const msg = err?.original?.sqlMessage || err?.message || "";
          if (
            err?.name === "SequelizeDatabaseError" &&
            (err?.original?.code === "ER_BAD_FIELD_ERROR" ||
              /last_scanned_at/i.test(msg))
          ) {
            stats = await db.Package.findAll({
              attributes: [
                "inbond_id",
                [fn("COUNT", col("id")), "total_packages"],
                [
                  fn(
                    "SUM",
                    literal(
                      "CASE WHEN `inbound_status` IN ('arrived','received') THEN 1 ELSE 0 END"
                    )
                  ),
                  "arrived_packages",
                ],
                [fn("MAX", col("arrival_confirmed_at")), "last_arrival_at"],
              ],
              where: { inbond_id: { [Op.in]: ids } },
              group: ["inbond_id"],
              raw: true,
            });
          } else {
            throw err;
          }
        }
        for (const s of stats) statsMap.set(s.inbond_id, s);
      }

      let merged = rows.map((r) => {
        const s = statsMap.get(r.id) || {};
        return {
          ...r.toJSON(),
          total_packages: Number(s.total_packages || 0),
          arrived_packages: Number(s.arrived_packages || 0),
          last_arrival_at: s.last_arrival_at || null,
          last_scan_at: s.last_scan_at || null,
        };
      });

      // 聚合字段排序处理（全量排序后分页）
      if (aggregateSort && sortOrder) {
        merged.sort((a, b) => {
          const av = a[sortBy];
          const bv = b[sortBy];
          const at = av ? new Date(av).getTime() : 0;
          const bt = bv ? new Date(bv).getTime() : 0;
          if (at === bt) return 0;
          return sortOrder === "ASC" ? at - bt : bt - at;
        });
        const startIdx = (page - 1) * limit;
        merged = merged.slice(startIdx, startIdx + limit);
      }

      const response = {
        message: "Inbonds retrieved successfully",
        inbonds: merged,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
        filters: {
          status: status || null,
          startDate: startDate || null,
          endDate: endDate || null,
          dateField,
          timezone: validTimezone,
          has_clearance_docs: hasClearanceDocs ?? null,
          sort_by: sortBy || null,
          sort_order: sortOrder || null,
        },
      };
      res.status(200).json(response);
      logRead(req, {
        entityType: "Inbond",
        page,
        pageSize: limit,
        resultCount: merged.length,
        startAt,
      });
    } catch (err) {
      console.error("Error fetching inbonds (enhanced):", err);
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
          "T01",
          "T11",
          "T06-T01",
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
  checkPermission("client.inbond.submit"),
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
              { model: db.PackageItem, as: "items", attributes: ["id"] },
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
          // 新增：校验每个包裹必须至少有一个明细
          const pkgsNoItems = packages.filter(
            (p) => !p.items || p.items.length === 0
          );
          if (pkgsNoItems.length > 0) {
            throw buildError(
              ERROR_CODES.INBOND_PACKAGE_MISSING_ITEMS,
              "存在未填写明细的包裹",
              { invalid_package_ids: pkgsNoItems.map((p) => p.id) }
            );
          }

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
    } catch (err) {
      console.error("Submit inbond failed:", err);
      return res
        .status(500)
        .json(buildError(ERROR_CODES.INBOND_SUBMIT_FAILED, "提交失败"));
    }
  }
);

// 更新 inbond 时可同时提交清关 items
router.put(
  "/inbonds/:id",
  authenticate,
  checkPermission("client.inbond.update"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const clientId = req.user.id;
      const { id } = req.params;
      const { inbond, items } = req.body || {};
      const model = await db.Inbond.findOne({
        where: { id, client_id: clientId },
        transaction: t,
      });
      if (!model) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          code: "INBOND_NOT_FOUND",
          message: "入库单不存在",
        });
      }
      await model.update(inbond || {}, { transaction: t });
      if (Array.isArray(items)) {
        // 简化：先删后插
        await db.InbondDeclarationItem.destroy({
          where: { inbond_id: id, client_id: clientId },
          transaction: t,
        });
        if (items.length) {
          const list = items.map((it) => ({
            ...it,
            inbond_id: id,
            client_id: clientId,
          }));
          await db.InbondDeclarationItem.bulkCreate(list, { transaction: t });
          await model.update(
            { clearance_summary_json: JSON.stringify(list.slice(0, 200)) },
            { transaction: t }
          );
        } else {
          await model.update(
            { clearance_summary_json: null },
            { transaction: t }
          );
        }
      }
      await t.commit();
      return res.json({ success: true, message: "更新成功", inbond: model });
    } catch (e) {
      await t.rollback();
      return res.status(500).json({
        success: false,
        code: "INBOND_UPDATE_ERROR",
        message: "更新失败",
      });
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
