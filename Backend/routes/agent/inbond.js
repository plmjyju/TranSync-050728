import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import {
  writeAudit,
  pickSnapshot,
  INBOND_AUDIT_FIELDS,
} from "../../utils/auditHelper.js";
import { ERROR_CODES, buildError } from "../../utils/errors.js";
import moment from "moment-timezone";
import { applyScopeToWhere } from "../../utils/scope.js";

const router = express.Router();

// 工具: 取得当前代理下可管理的客户ID集合 (可缓存优化)
async function getAgentClientIds(agentId, user) {
  const customers = await db.Customer.findAll({
    where: applyScopeToWhere(
      { salesRepId: agentId, isActive: true },
      db.Customer,
      user
    ),
    attributes: ["id"],
  });
  return customers.map((c) => c.id);
}

// 列表: GET /agent/inbonds
router.get(
  "/",
  authenticate,
  checkPermission("agent.inbond.view"),
  async (req, res) => {
    try {
      const agentId = req.user.id;
      const {
        page = 1,
        pageSize = 20,
        status,
        client_id, // 可选指定某客户
        startDate,
        endDate,
        dateField = "created_at",
        timezone = "UTC",
      } = req.query;

      if (!["created_at", "updated_at", "completed_at"].includes(dateField)) {
        return res
          .status(400)
          .json(buildError(ERROR_CODES.VALIDATION_FAILED, "非法 dateField"));
      }

      const validTz = moment.tz.zone(timezone) ? timezone : "UTC";
      const agentClientIds = await getAgentClientIds(agentId, req.user);
      if (agentClientIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            page: +page,
            pageSize: +pageSize,
            total: 0,
            totalPages: 0,
          },
          filters: { status: status || null, client_id: null },
        });
      }

      let where = { client_id: agentClientIds }; // Sequelize 会将数组解析为 IN
      if (status) where.status = status;
      if (client_id) {
        const cId = parseInt(client_id, 10);
        if (!agentClientIds.includes(cId)) {
          return res
            .status(403)
            .json(
              buildError(ERROR_CODES.PERMISSION_DENIED, "无权查看该客户 Inbond")
            );
        }
        where.client_id = cId;
      }
      if (startDate || endDate) {
        const dateFilter = {};
        if (startDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return res
              .status(400)
              .json(
                buildError(
                  ERROR_CODES.VALIDATION_FAILED,
                  "startDate 格式应为 YYYY-MM-DD"
                )
              );
          }
          dateFilter[db.Sequelize.Op.gte] = moment
            .tz(`${startDate} 00:00:00`, "YYYY-MM-DD HH:mm:ss", validTz)
            .utc()
            .toDate();
        }
        if (endDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res
              .status(400)
              .json(
                buildError(
                  ERROR_CODES.VALIDATION_FAILED,
                  "endDate 格式应为 YYYY-MM-DD"
                )
              );
          }
          dateFilter[db.Sequelize.Op.lte] = moment
            .tz(`${endDate} 23:59:59`, "YYYY-MM-DD HH:mm:ss", validTz) // 修复引号
            .utc()
            .toDate();
        }
        where[dateField] = dateFilter;
      }

      where = applyScopeToWhere(where, db.Inbond, req.user);

      const limit = Math.min(parseInt(pageSize, 10) || 20, 200);
      const offset = (parseInt(page, 10) - 1) * limit;
      const { count, rows } = await db.Inbond.findAndCountAll({
        where,
        limit,
        offset,
        order: [["created_at", "DESC"]],
        attributes: [
          "id",
          "inbond_code",
          "client_id",
          "shipping_type",
          "clearance_type",
          "status",
          "completed_at",
          "created_at",
          "updated_at",
        ],
        include: [
          {
            model: db.Customer,
            as: "client",
            attributes: ["id", "companyName"],
          },
        ],
      });

      return res.json({
        success: true,
        data: rows,
        pagination: {
          page: parseInt(page, 10),
          pageSize: limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
        filters: {
          status: status || null,
          client_id: client_id || null,
          timezone: validTz,
        },
      });
    } catch (e) {
      console.error("Agent list inbonds error", e);
      return res
        .status(500)
        .json(buildError(ERROR_CODES.UNKNOWN_ERROR, "获取 Inbond 列表失败"));
    }
  }
);

// 支持时区列表 (与 client 端一致) GET /agent/inbonds/timezones
router.get("/timezones", authenticate, async (req, res) => {
  try {
    const tz = [
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
    return res.json({ success: true, timezones: tz });
  } catch (e) {
    console.error("Agent timezones error", e);
    return res
      .status(500)
      .json(buildError(ERROR_CODES.UNKNOWN_ERROR, "获取时区失败"));
  }
});

// 详情: GET /agent/inbonds/:id
router.get(
  "/:id",
  authenticate,
  checkPermission("agent.inbond.view"),
  async (req, res) => {
    try {
      const agentId = req.user.id;
      const rawId = req.params.id;
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) {
        return res
          .status(400)
          .json(buildError(ERROR_CODES.VALIDATION_FAILED, "非法入仓单ID"));
      }
      const agentClientIds = await getAgentClientIds(agentId, req.user);
      if (agentClientIds.length === 0)
        return res
          .status(404)
          .json(buildError(ERROR_CODES.INBOND_NOT_FOUND, "Inbond 不存在"));

      const where = applyScopeToWhere(
        { id, client_id: agentClientIds },
        db.Inbond,
        req.user
      );

      const inbond = await db.Inbond.findOne({
        where,
        include: [
          {
            model: db.Package,
            as: "packages",
            attributes: [
              "id",
              "package_code",
              "status",
              "operation_requirement_id",
              "remark",
            ],
            include: [
              {
                model: db.OperationRequirement,
                as: "operationRequirement",
                attributes: ["id", "requirement_code", "requirement_name"],
              },
            ],
          },
          {
            model: db.Customer,
            as: "client",
            attributes: ["id", "companyName"],
          },
        ],
      });
      if (!inbond)
        return res
          .status(404)
          .json(buildError(ERROR_CODES.INBOND_NOT_FOUND, "Inbond 不存在"));
      return res.json({ success: true, inbond });
    } catch (e) {
      console.error("Agent get inbond error", e);
      return res
        .status(500)
        .json(buildError(ERROR_CODES.UNKNOWN_ERROR, "获取 Inbond 详情失败"));
    }
  }
);

// 标记到港: POST /agent/inbonds/:id/arrive ( submitted -> arrived )
router.post(
  "/:id/arrive",
  authenticate,
  checkPermission("agent.inbond.arrive"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const agentId = req.user.id;
      const rawId = req.params.id;
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) {
        await t.rollback();
        return res
          .status(400)
          .json(buildError(ERROR_CODES.VALIDATION_FAILED, "非法入仓单ID"));
      }
      const agentClientIds = await getAgentClientIds(agentId, req.user);
      if (agentClientIds.length === 0) {
        await t.rollback();
        return res
          .status(404)
          .json(buildError(ERROR_CODES.INBOND_NOT_FOUND, "Inbond 不存在"));
      }
      const where = applyScopeToWhere(
        { id, client_id: agentClientIds },
        db.Inbond,
        req.user
      );
      const inbond = await db.Inbond.findOne({
        where,
        transaction: t,
      });
      if (!inbond) {
        await t.rollback();
        return res
          .status(404)
          .json(buildError(ERROR_CODES.INBOND_NOT_FOUND, "Inbond 不存在"));
      }
      if (inbond.status === "arrived") {
        await t.commit();
        return res.json({
          success: true,
          message: "已到港(幂等)",
          id: inbond.id,
        });
      }
      if (inbond.status !== "submitted") {
        await t.rollback();
        return res
          .status(400)
          .json(
            buildError(
              ERROR_CODES.INBOND_ARRIVE_INVALID_STATUS,
              `当前状态(${inbond.status})不可标记到港`
            )
          );
      }
      const beforeSnap = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
      inbond.status = "arrived";
      await inbond.save({ transaction: t });
      const afterSnap = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
      if (db.InbondLog) {
        await db.InbondLog.create(
          {
            inbond_id: inbond.id,
            action: "arrived",
            performed_by: agentId,
            status_from: beforeSnap.status,
            status_to: "arrived",
            notes: "Agent mark arrived",
          },
          { transaction: t }
        );
      }
      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Inbond",
        entityId: inbond.id,
        action: "arrive",
        user: req.user,
        before: beforeSnap,
        after: afterSnap,
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json({
        success: true,
        message: "标记到港成功",
        id: inbond.id,
      });
    } catch (e) {
      await t.rollback();
      console.error("Agent arrive inbond error", e);
      return res
        .status(500)
        .json(buildError(ERROR_CODES.INBOND_ARRIVE_FAILED, "标记到港失败"));
    }
  }
);

export default router;
