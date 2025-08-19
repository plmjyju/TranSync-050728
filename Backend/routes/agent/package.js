import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import {
  writeAudit,
  pickSnapshot,
  PACKAGE_AUDIT_FIELDS,
  INBOND_AUDIT_FIELDS,
} from "../../utils/auditHelper.js";
import { getRedis } from "../../utils/redisClient.js";

const router = express.Router();

// ==== 辅助函数与常量 === =
const buildError = (code, message, extra = {}) => ({
  success: false,
  code,
  message,
  ...extra,
});
const UPPER = (v) => (typeof v === "string" ? v.trim().toUpperCase() : v);

// 允许从哪些前置状态进入代理端入库确认
const ALLOWED_PRE_RECEIVE_STATUS = new Set(["prepared", "arrived"]);
// 入库后目标状态
const RECEIVED_STATUS = "agent_received"; // 与模型扩展状态匹配

async function loadPackageByCode(package_code, transaction) {
  return db.Package.findOne({
    where: { package_code: UPPER(package_code) },
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
    transaction,
  });
}

function checkAgentOwnership(agentId, pkg) {
  const clientSalesRepId =
    pkg.client?.salesRepId || pkg.inbond?.client?.salesRepId;
  return clientSalesRepId === agentId;
}

// ==== 单包裹扫码入库（替代原 confirm-arrival）====
router.post(
  "/scan/receive",
  authenticate,
  checkPermission("agent.package.receive"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    const r = await getRedis().catch(() => null);
    try {
      const agentId = req.user.id;
      const { package_code, note, warehouse_location } = req.body || {};
      if (!package_code) {
        await t.rollback();
        return res
          .status(400)
          .json(buildError("PKG_CODE_MISSING", "package_code 不能为空"));
      }
      const lockKey = `pkg:scan:lock:${package_code}`;
      if (r) {
        const lock = await r.set(lockKey, agentId, { NX: true, EX: 5 });
        if (!lock) {
          await t.rollback();
          return res
            .status(429)
            .json(buildError("PKG_SCAN_BUSY", "包裹正在处理中"));
        }
      }

      const pkg = await loadPackageByCode(package_code, t);
      if (!pkg) {
        await t.rollback();
        return res
          .status(404)
          .json(buildError("PKG_NOT_FOUND", "包裹不存在", { package_code }));
      }
      if (!checkAgentOwnership(agentId, pkg)) {
        await t.rollback();
        return res
          .status(403)
          .json(buildError("PKG_AGENT_FORBIDDEN", "无权限操作该客户包裹"));
      }

      const pkgBefore = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);

      if (pkg.status === RECEIVED_STATUS) {
        await t.commit();
        // 幂等仍写一条审计 after-only
        writeAudit({
          module: "agent",
          entityType: "Package",
          entityId: pkg.id,
          action: "receive.idempotent",
          user: req.user,
          before: pkgBefore,
          after: pkgBefore,
          extra: { note, idempotent: true },
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
        return res.json({
          success: true,
          message: "包裹已入库(幂等返回)",
          package: {
            id: pkg.id,
            package_code: pkg.package_code,
            status: pkg.status,
            storage_time: pkg.storage_time,
            warehouse_location: pkg.warehouse_location,
          },
        });
      }

      if (!ALLOWED_PRE_RECEIVE_STATUS.has(pkg.status)) {
        await t.rollback();
        return res
          .status(400)
          .json(
            buildError(
              "PKG_STATUS_INVALID",
              `当前状态(${pkg.status})不可入库，需在: ${[
                ...ALLOWED_PRE_RECEIVE_STATUS,
              ].join("/")}`
            )
          );
      }

      const prevStatus = pkg.status;
      pkg.status = RECEIVED_STATUS;
      pkg.arrival_confirmed_at = pkg.arrival_confirmed_at || new Date();
      pkg.arrival_confirmed_by = pkg.arrival_confirmed_by || agentId;
      pkg.storage_time = new Date();
      pkg.storage_operator = String(agentId);
      if (warehouse_location) pkg.warehouse_location = warehouse_location;
      if (note) {
        pkg.remark = pkg.remark
          ? `${pkg.remark}\n[Receive] ${note}`
          : `[Receive] ${note}`;
      }
      await pkg.save({ transaction: t });

      await db.PackageLog.create(
        {
          package_id: pkg.id,
          action: "agent_receive",
          performed_by: agentId,
          status_from: prevStatus,
          status_to: RECEIVED_STATUS,
          notes: note || "Agent scan receive",
        },
        { transaction: t }
      );

      // 判断该 Inbond 是否全部入库
      let inbondCompleted = false;
      let inbondAfterSnap = null;
      let inbondBeforeSnap = null;
      let inbondIdForAudit = null;
      if (pkg.inbond_id) {
        const counts = await db.Package.findAll({
          where: { inbond_id: pkg.inbond_id },
          attributes: ["status"],
          transaction: t,
        });
        const allReceived = counts.every((p) => p.status === RECEIVED_STATUS);
        if (allReceived) {
          const inbond = await db.Inbond.findByPk(pkg.inbond_id, {
            transaction: t,
          });
          if (inbond && inbond.status !== "completed") {
            inbondBeforeSnap = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
            const prevInbondStatus = inbond.status;
            inbond.status = "completed"; // 若未来新增更细状态可调整
            inbond.completed_at = new Date();
            inbond.completed_by = agentId;
            await inbond.save({ transaction: t });
            inbondCompleted = true;
            inbondAfterSnap = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
            inbondIdForAudit = inbond.id;
            if (db.InbondLog) {
              await db.InbondLog.create(
                {
                  inbond_id: inbond.id,
                  action: "completed",
                  performed_by: agentId,
                  status_from: prevInbondStatus,
                  status_to: "completed",
                  notes: "All packages received (agent scan)",
                },
                { transaction: t }
              );
            }
          }
        }
      }

      const pkgAfter = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);

      await t.commit();
      writeAudit({
        module: "agent",
        entityType: "Package",
        entityId: pkg.id,
        action: "receive",
        user: req.user,
        before: pkgBefore,
        after: pkgAfter,
        extra: { note, warehouse_location },
        ip: req.ip,
        ua: req.headers["user-agent"],
      });
      if (inbondCompleted && inbondIdForAudit) {
        writeAudit({
          module: "agent",
          entityType: "Inbond",
          entityId: inbondIdForAudit,
          action: "auto-complete",
          user: req.user,
          before: inbondBeforeSnap,
          after: inbondAfterSnap,
          extra: { trigger: "all_packages_received" },
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }

      return res.json({
        success: true,
        message: inbondCompleted ? "包裹入库并完成 Inbond" : "包裹入库成功",
        package: {
          id: pkg.id,
          package_code: pkg.package_code,
          status: pkg.status,
          storage_time: pkg.storage_time,
          warehouse_location: pkg.warehouse_location,
        },
        inbond_completed: inbondCompleted,
      });
    } catch (e) {
      await t.rollback();
      console.error("scan receive error", e);
      return res
        .status(500)
        .json(buildError("PKG_RECEIVE_ERROR", "包裹入库失败"));
    }
  }
);

// ==== 批量扫码入库 === =
router.post(
  "/scan/receive-batch",
  authenticate,
  checkPermission("agent.package.receive"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    const r = await getRedis().catch(() => null);
    try {
      const agentId = req.user.id;
      const { package_codes, note, warehouse_location } = req.body || {};
      if (!Array.isArray(package_codes) || package_codes.length === 0) {
        await t.rollback();
        return res
          .status(400)
          .json(buildError("PKG_CODE_LIST_EMPTY", "package_codes 不能为空"));
      }
      if (package_codes.length > 300) {
        await t.rollback();
        return res
          .status(400)
          .json(buildError("PKG_CODE_LIST_TOO_LARGE", "一次最多300个"));
      }

      const successes = [];
      const errors = [];
      const touchedInbonds = new Set();
      const pkgAuditRecords = []; // {id,before,after,action,extra}
      const inbondAuditRecords = []; // {id,before,after}

      for (let i = 0; i < package_codes.length; i++) {
        const code = package_codes[i];
        try {
          if (!code) throw buildError("PKG_CODE_EMPTY", "空的package_code");
          if (r) {
            const lock = await r.set(`pkg:scan:lock:${code}`, agentId, {
              NX: true,
              EX: 5,
            });
            if (!lock) throw buildError("PKG_SCAN_BUSY", "包裹处理中");
          }
          const pkg = await loadPackageByCode(code, t);
          if (!pkg)
            throw buildError("PKG_NOT_FOUND", "包裹不存在", {
              package_code: code,
            });
          if (!checkAgentOwnership(agentId, pkg))
            throw buildError("PKG_AGENT_FORBIDDEN", "无权限");

          const beforeSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
          if (pkg.status === RECEIVED_STATUS) {
            successes.push({
              package_code: pkg.package_code,
              id: pkg.id,
              status: pkg.status,
              duplicated: true,
            });
            pkgAuditRecords.push({
              id: pkg.id,
              before: beforeSnap,
              after: beforeSnap,
              action: "receive.idempotent",
              extra: { idempotent: true, note },
            });
            continue;
          }
          if (!ALLOWED_PRE_RECEIVE_STATUS.has(pkg.status)) {
            throw buildError(
              "PKG_STATUS_INVALID",
              `状态(${pkg.status})不可入库`
            );
          }
          const prevStatus = pkg.status;
          pkg.status = RECEIVED_STATUS;
          pkg.arrival_confirmed_at = pkg.arrival_confirmed_at || new Date();
          pkg.arrival_confirmed_by = pkg.arrival_confirmed_by || agentId;
          pkg.storage_time = new Date();
          pkg.storage_operator = String(agentId);
          if (warehouse_location) pkg.warehouse_location = warehouse_location;
          if (note)
            pkg.remark = pkg.remark
              ? `${pkg.remark}\n[Batch Receive] ${note}`
              : `[Batch Receive] ${note}`;
          await pkg.save({ transaction: t });
          await db.PackageLog.create(
            {
              package_id: pkg.id,
              action: "agent_receive",
              performed_by: agentId,
              status_from: prevStatus,
              status_to: RECEIVED_STATUS,
              notes: note || "Batch receive",
            },
            { transaction: t }
          );
          if (pkg.inbond_id) touchedInbonds.add(pkg.inbond_id);
          const afterSnap = pickSnapshot(pkg, PACKAGE_AUDIT_FIELDS);
          pkgAuditRecords.push({
            id: pkg.id,
            before: beforeSnap,
            after: afterSnap,
            action: "receive",
            extra: { note, warehouse_location },
          });
          successes.push({
            id: pkg.id,
            package_code: pkg.package_code,
            status: pkg.status,
          });
        } catch (inner) {
          errors.push({
            index: i,
            package_code: code,
            code: inner.code || undefined,
            message: inner.message,
          });
        }
      }

      const completedInbonds = [];
      for (const inbondId of touchedInbonds) {
        const statuses = await db.Package.findAll({
          where: { inbond_id: inbondId },
          attributes: ["status"],
          transaction: t,
        });
        if (
          statuses.length > 0 &&
          statuses.every((p) => p.status === RECEIVED_STATUS)
        ) {
          const inbond = await db.Inbond.findByPk(inbondId, { transaction: t });
          if (inbond && inbond.status !== "completed") {
            const before = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
            const prev = inbond.status;
            inbond.status = "completed";
            inbond.completed_at = new Date();
            inbond.completed_by = agentId;
            await inbond.save({ transaction: t });
            const after = pickSnapshot(inbond, INBOND_AUDIT_FIELDS);
            inbondAuditRecords.push({ id: inbond.id, before, after });
            completedInbonds.push({
              id: inbond.id,
              inbond_code: inbond.inbond_code,
            });
            if (db.InbondLog) {
              await db.InbondLog.create(
                {
                  inbond_id: inbond.id,
                  action: "completed",
                  performed_by: agentId,
                  status_from: prev,
                  status_to: "completed",
                  notes: "All packages received (batch)",
                },
                { transaction: t }
              );
            }
          }
        }
      }

      if (errors.length > 0 && successes.length === 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          code: "PKG_BATCH_ALL_FAILED",
          message: "全部入库失败",
          errors,
        });
      }

      await t.commit();
      for (const r of pkgAuditRecords) {
        writeAudit({
          module: "agent",
          entityType: "Package",
          entityId: r.id,
          action: r.action,
          user: req.user,
          before: r.before,
          after: r.after,
          extra: r.extra,
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }
      for (const ib of inbondAuditRecords) {
        writeAudit({
          module: "agent",
          entityType: "Inbond",
          entityId: ib.id,
          action: "auto-complete",
          user: req.user,
          before: ib.before,
          after: ib.after,
          extra: { trigger: "all_packages_received_batch" },
          ip: req.ip,
          ua: req.headers["user-agent"],
        });
      }

      return res.json({
        success: true,
        message:
          `成功入库 ${successes.length} 个包裹` +
          (completedInbonds.length
            ? `，完成 ${completedInbonds.length} 个 Inbond`
            : ""),
        received: successes,
        completed_inbonds: completedInbonds.length
          ? completedInbonds
          : undefined,
        errors: errors.length ? errors : undefined,
        summary: {
          total: package_codes.length,
          success: successes.length,
          failed: errors.length,
          inbonds_completed: completedInbonds.length,
        },
      });
    } catch (e) {
      await t.rollback();
      console.error("batch scan receive error", e);
      return res
        .status(500)
        .json(buildError("PKG_BATCH_RECEIVE_ERROR", "批量入库失败"));
    }
  }
);

export default router;
