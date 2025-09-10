// POST /api/agent/forecasts – 创建预报表

// PATCH /api/agent/forecasts/:id/mawb – 填写/修改 MAWB 提单号

// POST /api/agent/forecasts/:id/packages – 添加包裹（附带自动生成 HAWB）

// GET /api/agent/forecasts – 获取当前用户创建的所有预报板

// GET /api/agent/forecasts/:id – 获取某个预报板 + 包裹详情列表

// routes/agent/forecasts.js
import express from "express";
import db from "../../models/index.js";
import { syncMAWBToPackages } from "../../utils/syncMAWBToPackages.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import {
  writeAudit,
  pickSnapshot,
  FORECAST_AUDIT_FIELDS,
  withAuditTransaction,
} from "../../utils/auditHelper.js";
import { buildError } from "../../utils/errors.js";
import { getRedis } from "../../utils/redisClient.js";
import { logRead, logViewDetail } from "../../utils/logRead.js";
import { applyScopeToWhere } from "../../utils/scope.js";

const router = express.Router();

// ===== 辅助 =====
const buildResp = (message, extra = {}) => ({
  success: true,
  message,
  ...extra,
});
const buildFail = (code, message, extra = {}) => ({
  success: false,
  code,
  message,
  ...extra,
});

// 生成 Forecast 编码 (Redis 自增: seq:forecast:<agentId>:<YYYYMMDD>)
async function generateForecastCode(agentId) {
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const key = `seq:forecast:${agentId}:${todayStr}`;
  try {
    const r = await getRedis();
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 3 * 24 * 3600);
    return `FC${agentId.toString().padStart(4, "0")}-${todayStr}-${n
      .toString()
      .padStart(3, "0")}`;
  } catch {
    // fallback (非严格唯一, 并发有风险)
    const count = await db.Forecast.count({ where: { agent_id: agentId } });
    return `FC${agentId.toString().padStart(4, "0")}-${todayStr}-F${count + 1}`;
  }
}

// ===== 清除预报列表缓存 =====
async function clearForecastListCache(agentId) {
  try {
    const r = await getRedis();
    const pattern = `cache:forecast:list:${agentId}:*`;
    // 简易扫描删除
    let cursor = 0;
    do {
      const res = await r.scan(cursor, { MATCH: pattern, COUNT: 50 });
      cursor = res.cursor;
      const keys = res.keys || res[1] || [];
      if (keys.length) await r.del(keys);
    } while (cursor !== 0);
  } catch {}
}

// ===== 创建预报单 =====
router.post(
  "/forecasts",
  authenticate,
  checkPermission("agent.forecast.create"),
  async (req, res) => {
    const agentId = req.user.id;
    const {
      mawb,
      flight_no,
      departure_port,
      destination_port,
      transit_port,
      remark,
      tax_type_id,
    } = req.body || {};
    try {
      const forecast_code = await generateForecastCode(agentId);
      const auditRecords = [];
      const forecast = await withAuditTransaction(
        db.sequelize,
        async (t, audits) => {
          const created = await db.Forecast.create(
            {
              forecast_code,
              agent_id: agentId,
              mawb: mawb || null,
              flight_no: flight_no || null,
              departure_port: departure_port || null,
              destination_port: destination_port || null,
              transit_port: transit_port || null,
              tax_type_id: tax_type_id || null,
              status: "draft",
              remark: remark || null,
            },
            { transaction: t }
          );
          audits.push({
            module: "agent",
            entityType: "Forecast",
            entityId: created.id,
            action: "create",
            user: req.user,
            before: null,
            after: pickSnapshot(created, FORECAST_AUDIT_FIELDS),
            ip: req.ip,
            ua: req.headers["user-agent"],
          });
          return created;
        },
        auditRecords
      );
      return res.status(201).json(buildResp("预报单创建成功", { forecast }));
    } catch (e) {
      console.error("create forecast error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_CREATE_FAILED", "创建预报单失败"));
    } finally {
      clearForecastListCache(agentId);
    }
  }
);

// ===== 更新 MAWB (自动同步包裹) =====
router.patch(
  "/forecasts/:id/mawb",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const { id } = req.params;
    const { mawb } = req.body || {};
    const agentId = req.user.id;
    const t = await db.sequelize.transaction();
    try {
      const forecast = await db.Forecast.findOne({
        where: { id, agent_id: agentId },
        transaction: t,
      });
      if (!forecast) {
        await t.rollback();
        return res
          .status(404)
          .json(buildFail("FORECAST_NOT_FOUND", "预报单不存在"));
      }
      const before = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      forecast.mawb = mawb;
      await forecast.save({ transaction: t });
      const updatedPackages = await syncMAWBToPackages(id, mawb, t);
      const after = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Forecast",
        entityId: forecast.id,
        action: "update-mawb",
        user: req.user,
        before,
        after,
        extra: { updated_packages: updatedPackages },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json(
        buildResp("MAWB 更新成功", { mawb, updated_packages: updatedPackages })
      );
    } catch (e) {
      await t.rollback();
      console.error("update mawb error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_MAWB_UPDATE_FAILED", "MAWB更新失败"));
    } finally {
      clearForecastListCache(agentId);
    }
  }
);

// ===== 列表（分页 + 过滤 + 只读审计 + 缓存） =====
router.get(
  "/forecasts",
  authenticate,
  checkPermission("agent.forecast.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      let {
        page = 1,
        pageSize = 20,
        status,
        code,
        mawb,
        flight_no,
        noCache,
      } = req.query;
      page = parseInt(page) || 1;
      pageSize = Math.min(100, parseInt(pageSize) || 20);
      const cacheKey = `cache:forecast:list:${
        req.user.id
      }:${page}:${pageSize}:${status || ""}:${code || ""}:${mawb || ""}:${
        flight_no || ""
      }`;
      let cached = null;
      if (!noCache) {
        try {
          const r = await getRedis();
          const v = await r.get(cacheKey);
          if (v) cached = JSON.parse(v);
        } catch {}
      }
      if (cached) {
        res.json(cached);
        logRead(req, {
          entityType: "Forecast",
          page,
          pageSize,
          resultCount: cached.forecasts.length,
          startAt,
        });
        return;
      }
      const where = { agent_id: req.user.id };
      if (status) where.status = status;
      if (code) where.forecast_code = { [db.Sequelize.Op.like]: `${code}%` };
      if (mawb) where.mawb = mawb;
      if (flight_no) where.flight_no = flight_no;
      where = applyScopeToWhere(where, db.Forecast, req.user);
      const { rows, count } = await db.Forecast.findAndCountAll({
        where,
        order: [["created_at", "DESC"]],
        offset: (page - 1) * pageSize,
        limit: pageSize,
        attributes: [
          "id",
          "forecast_code",
          "mawb",
          "flight_no",
          "status",
          "clearance_status",
          "total_packages",
          "cleared_packages",
          "delivered_packages",
          "created_at",
        ],
      });
      const payload = buildResp("预报单列表", {
        page,
        pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
        forecasts: rows,
      });
      res.json(payload);
      logRead(req, {
        entityType: "Forecast",
        page,
        pageSize,
        resultCount: rows.length,
        startAt,
      });
      try {
        if (!noCache) {
          const r = await getRedis();
          await r.set(cacheKey, JSON.stringify(payload), { EX: 60 });
        }
      } catch {}
    } catch (e) {
      console.error("list forecasts error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_LIST_FAILED", "获取预报单列表失败"));
    }
  }
);

// ===== 详情 (只读审计) =====
router.get(
  "/forecasts/:id",
  authenticate,
  checkPermission("agent.forecast.view"),
  async (req, res) => {
    const startAt = Date.now();
    try {
      const { id } = req.params;
      const forecast = await db.Forecast.findOne({
        where: applyScopeToWhere(
          { id, agent_id: req.user.id },
          db.Forecast,
          req.user
        ),
        include: [
          {
            model: db.Package,
            as: "packages",
            attributes: ["id", "package_code", "status", "weight_kg"],
          },
        ],
      });
      if (!forecast)
        return res
          .status(404)
          .json(buildFail("FORECAST_NOT_FOUND", "预报单不存在"));
      res.json(buildResp("预报单详情", { forecast }));
      logViewDetail(req, {
        entityType: "Forecast",
        entityId: forecast.id,
        startAt,
        resultExists: true,
      });
    } catch (e) {
      console.error("get forecast detail error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_DETAIL_FAILED", "获取详情失败"));
    }
  }
);

// 移除旧 advance 接口，新增统一状态流转

const ALLOWED_STATUS_FLOW = {
  draft: ["palletizing", "cancelled"],
  palletizing: ["booked", "cancelled"],
  booked: ["in_transit", "cancelled"],
  in_transit: ["arrived", "cancelled"],
  arrived: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function validateTransition(from, to) {
  return ALLOWED_STATUS_FLOW[from] && ALLOWED_STATUS_FLOW[from].includes(to);
}

// 统一状态流转接口
router.post(
  "/forecasts/:id/transition",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const { id } = req.params;
    const { target_status } = req.body || {};
    const agentId = req.user.id;
    if (!target_status)
      return res
        .status(400)
        .json(
          buildFail("FORECAST_TRANSITION_TARGET_REQUIRED", "缺少 target_status")
        );
    const lockKey = `lock:forecast:transition:${id}`;
    const r = await getRedis().catch(() => null);
    if (r) {
      const ok = await r.set(lockKey, agentId, { NX: true, EX: 5 });
      if (!ok)
        return res
          .status(429)
          .json(buildFail("FORECAST_TRANSITION_BUSY", "状态转换处理中"));
    }
    const t = await db.sequelize.transaction();
    try {
      const forecast = await db.Forecast.findOne({
        where: { id, agent_id: agentId },
        transaction: t,
      });
      if (!forecast) {
        await t.rollback();
        return res
          .status(404)
          .json(buildFail("FORECAST_NOT_FOUND", "预报单不存在"));
      }
      const from = forecast.status;
      if (!validateTransition(from, target_status)) {
        await t.rollback();
        return res
          .status(400)
          .json(
            buildFail(
              "FORECAST_TRANSITION_INVALID",
              `不允许从 ${from} 到 ${target_status}`
            )
          );
      }
      // 业务前置校验
      if (target_status === "booked") {
        // 校验所有包裹已打板 (示例：包裹需有 pallet_id)
        const unPalletized = await db.Package.count({
          where: { forecast_id: id, pallet_id: null },
          transaction: t,
        });
        if (unPalletized > 0) {
          await t.rollback();
          return res
            .status(400)
            .json(buildFail("FORECAST_NOT_FULLY_PALLETIZED", "仍有未上板包裹"));
        }
        forecast.booked_at = new Date();
      }
      if (target_status === "palletizing") {
        forecast.palletizing_started_at = new Date();
      }
      if (target_status === "completed") {
        forecast.completed_at = new Date();
      }
      const before = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      forecast.status = target_status;
      await forecast.save({ transaction: t });
      const after = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Forecast",
        entityId: forecast.id,
        action: "status-transition",
        user: req.user,
        before,
        after,
        extra: { from, to: target_status },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      clearForecastListCache(agentId);
      return res.json(
        buildResp("状态更新成功", { id: forecast.id, from, to: target_status })
      );
    } catch (e) {
      await t.rollback();
      console.error("forecast transition error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_TRANSITION_FAILED", "状态更新失败"));
    } finally {
      try {
        if (r) await r.del(lockKey);
      } catch {}
    }
  }
);

// 修改 submit -> 转换到 palletizing
router.post(
  "/forecasts/:id/submit",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const { id } = req.params;
    const agentId = req.user.id;
    const t = await db.sequelize.transaction();
    try {
      const forecast = await db.Forecast.findOne({
        where: { id, agent_id: agentId },
        transaction: t,
      });
      if (!forecast) {
        await t.rollback();
        return res
          .status(404)
          .json(buildFail("FORECAST_NOT_FOUND", "预报单不存在"));
      }
      if (forecast.status !== "draft") {
        await t.rollback();
        return res
          .status(400)
          .json(
            buildFail("FORECAST_NOT_DRAFT", "仅 draft 可提交进入 palletizing")
          );
      }
      const pkgCount = await db.Package.count({
        where: { forecast_id: id },
        transaction: t,
      });
      if (pkgCount === 0) {
        await t.rollback();
        return res
          .status(400)
          .json(buildFail("FORECAST_NO_PACKAGES", "无包裹不能提交"));
      }
      const before = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      forecast.status = "palletizing";
      forecast.palletizing_started_at = new Date();
      await forecast.save({ transaction: t });
      const after = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Forecast",
        entityId: forecast.id,
        action: "submit-to-palletizing",
        user: req.user,
        before,
        after,
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      clearForecastListCache(agentId);
      return res.json(
        buildResp("已进入打板阶段", { id: forecast.id, status: "palletizing" })
      );
    } catch (e) {
      await t.rollback();
      console.error("forecast submit error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_SUBMIT_FAILED", "提交失败"));
    }
  }
);

// 限制 HAWB 分配仅在 booked
router.patch(
  "/forecasts/:id/hawb",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const { id } = req.params;
    const { client_id, hawb } = req.body || {};
    const agentId = req.user.id;
    const t = await db.sequelize.transaction();
    try {
      const forecast = await db.Forecast.findOne({
        where: { id, agent_id: agentId },
        transaction: t,
      });
      if (!forecast) {
        await t.rollback();
        return res
          .status(404)
          .json(buildFail("FORECAST_NOT_FOUND", "预报单不存在或无权限修改"));
      }
      if (forecast.status !== "booked") {
        await t.rollback();
        return res
          .status(400)
          .json(buildFail("FORECAST_NOT_BOOKED", "仅 booked 状态可分配 HAWB"));
      }
      const before = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      const client = await db.User.findOne({
        where: { id: client_id, client_type: "client" },
        transaction: t,
      });
      if (!client) {
        await t.rollback();
        return res
          .status(404)
          .json(buildFail("CLIENT_NOT_FOUND", "客户不存在"));
      }
      const updateResult = await db.Package.update(
        { hawb },
        { where: { forecast_id: id, client_id }, transaction: t }
      );
      if (updateResult[0] === 0) {
        await t.rollback();
        return res
          .status(404)
          .json(buildFail("NO_PACKAGES_FOR_CLIENT", "该客户无包裹"));
      }
      await forecast.reload({ transaction: t });
      const after = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Forecast",
        entityId: forecast.id,
        action: "assign-hawb-client",
        user: req.user,
        before,
        after,
        extra: { client_id, hawb, updated_packages: updateResult[0] },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json(
        buildResp("HAWB 分配成功", {
          hawb,
          client_id,
          updated_packages: updateResult[0],
        })
      );
    } catch (e) {
      await t.rollback();
      console.error("assign hawb error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_ASSIGN_HAWB_FAILED", "分配 HAWB 失败"));
    }
  }
);

router.post(
  "/forecasts/:id/batch-hawb",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const { id } = req.params;
    const { assignments } = req.body || {};
    const agentId = req.user.id;
    const t = await db.sequelize.transaction();
    try {
      const forecast = await db.Forecast.findOne({
        where: { id, agent_id: agentId },
        transaction: t,
      });
      if (!forecast) {
        await t.rollback();
        return res
          .status(404)
          .json(buildFail("FORECAST_NOT_FOUND", "预报单不存在或无权限修改"));
      }
      if (forecast.status !== "booked") {
        await t.rollback();
        return res
          .status(400)
          .json(buildFail("FORECAST_NOT_BOOKED", "仅 booked 状态可分配 HAWB"));
      }
      if (!Array.isArray(assignments) || !assignments.length) {
        await t.rollback();
        return res
          .status(400)
          .json(buildFail("INVALID_ASSIGNMENTS", "请提供 assignments 数组"));
      }
      const before = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      const results = [];
      for (const a of assignments) {
        if (!a.client_id || !a.hawb) continue;
        const client = await db.User.findByPk(a.client_id, { transaction: t });
        if (!client || client.client_type !== "client") continue;
        const upd = await db.Package.update(
          { hawb: a.hawb },
          { where: { forecast_id: id, client_id: a.client_id }, transaction: t }
        );
        if (upd[0] > 0)
          results.push({
            client_id: a.client_id,
            hawb: a.hawb,
            updated_packages: upd[0],
          });
      }
      await forecast.reload({ transaction: t });
      const after = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Forecast",
        entityId: forecast.id,
        action: "assign-hawb-batch",
        user: req.user,
        before,
        after,
        extra: { assignments: results },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json(buildResp("批量 HAWB 分配完成", { results }));
    } catch (e) {
      await t.rollback();
      console.error("batch hawb error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_BATCH_HAWB_FAILED", "批量分配失败"));
    }
  }
);

// ===== 清关状态流转 =====
router.post(
  "/forecasts/:id/clearance/transition",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    const { id } = req.params;
    const { target_status, reason } = req.body || {};
    const agentId = req.user.id;
    const valid = new Set([
      "pending",
      "in_progress",
      "partial",
      "completed",
      "exempted",
    ]);
    if (!valid.has(target_status))
      return res
        .status(400)
        .json(buildFail("FORECAST_CLEARANCE_INVALID", "无效清关目标状态"));
    const lockKey = `lock:forecast:clearance:${id}`;
    const r = await getRedis().catch(() => null);
    if (r) {
      const ok = await r.set(lockKey, agentId, { NX: true, EX: 5 });
      if (!ok)
        return res
          .status(429)
          .json(buildFail("FORECAST_CLEARANCE_BUSY", "清关状态处理中"));
    }
    const t = await db.sequelize.transaction();
    try {
      const forecast = await db.Forecast.findOne({
        where: { id, agent_id: agentId },
        transaction: t,
      });
      if (!forecast) {
        await t.rollback();
        return res
          .status(404)
          .json(buildFail("FORECAST_NOT_FOUND", "预报单不存在"));
      }
      const before = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      const current = forecast.clearance_status || "pending";
      // 允许的转换
      const allowed = {
        pending: ["in_progress", "exempted"],
        in_progress: ["partial", "completed", "exempted"],
        partial: ["completed"],
        completed: [],
        exempted: [],
      };
      if (!allowed[current] || !allowed[current].includes(target_status)) {
        await t.rollback();
        return res
          .status(400)
          .json(
            buildFail(
              "FORECAST_CLEARANCE_TRANSITION_FORBIDDEN",
              `不允许从 ${current} 到 ${target_status}`
            )
          );
      }
      forecast.clearance_status = target_status;
      if (target_status === "completed") forecast.cleared_at = new Date();
      await forecast.save({ transaction: t });
      const after = pickSnapshot(forecast, FORECAST_AUDIT_FIELDS);
      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Forecast",
        entityId: forecast.id,
        action: "clearance-transition",
        user: req.user,
        before,
        after,
        extra: { from: current, to: target_status, reason },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      return res.json(
        buildResp("清关状态更新成功", {
          id: forecast.id,
          clearance_status: target_status,
        })
      );
    } catch (e) {
      await t.rollback();
      console.error("clearance transition error", e);
      return res
        .status(500)
        .json(buildFail("FORECAST_CLEARANCE_FAILED", "清关状态更新失败"));
    } finally {
      try {
        if (r) await r.del(lockKey);
      } catch {}
      clearForecastListCache(agentId);
    }
  }
);

export default router;
