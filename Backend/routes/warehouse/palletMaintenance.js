import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import { withRedisLock } from "../../utils/withRedisLock.js";
import { writeAudit } from "../../utils/auditHelper.js";

const router = express.Router();
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

// 校验板是否允许软删除
function canSoftDelete(pallet) {
  if (!pallet) return { ok: false, reason: "PALLET_NOT_FOUND" };
  if (pallet.is_deleted) return { ok: false, reason: "ALREADY_DELETED" };
  // 禁止删除已拆板、已出库、已入库后的敏感状态
  if (
    [
      "stored",
      "waiting_clear",
      "delivered",
      "dispatched",
      "unpacked",
      "returned",
    ].includes(pallet.status)
  ) {
    return { ok: false, reason: "STATUS_FORBIDDEN" };
  }
  return { ok: true };
}

// 软删除板
router.post(
  "/pallets/:id/delete",
  authenticate,
  checkPermission("warehouse.pallet.delete"),
  async (req, res) => {
    const { id } = req.params;
    const lockKey = `lock:pallet:delete:${id}`;
    try {
      await withRedisLock(lockKey, 5, async () => {
        const t = await db.sequelize.transaction();
        try {
          const pallet = await db.Pallet.findByPk(id, { transaction: t });
          const check = canSoftDelete(pallet);
          if (!check.ok) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("PALLET_DELETE_FORBIDDEN", check.reason));
          }
          const before = pallet.toJSON();
          // 校验是否存在包裹引用
          const pkgCount = await db.Package.count({
            where: { pallet_id: id },
            transaction: t,
          });
          if (pkgCount > 0) {
            await t.rollback();
            return res
              .status(400)
              .json(
                buildFail(
                  "PALLET_DELETE_HAS_PACKAGES",
                  "存在绑定包裹, 需先解绑/转移"
                )
              );
          }
          await pallet.update(
            {
              is_deleted: true,
              deleted_at: new Date(),
              deleted_by: req.user.id,
            },
            { transaction: t }
          );
          const after = pallet.toJSON();
          await t.commit();
          writeAudit({
            module: "warehouse",
            entityType: "Pallet",
            entityId: pallet.id,
            action: "soft-delete",
            user: req.user,
            before,
            after,
          });
          res.json(buildResp("板已软删除", { id: pallet.id }));
        } catch (e) {
          await t.rollback();
          console.error("soft delete pallet error", e);
          return res
            .status(500)
            .json(buildFail("PALLET_DELETE_FAILED", "软删除失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("PALLET_DELETE_BUSY", "删除处理中"));
      throw e;
    }
  }
);

// 还原板
router.post(
  "/pallets/:id/restore",
  authenticate,
  checkPermission("warehouse.pallet.delete"),
  async (req, res) => {
    const { id } = req.params;
    const lockKey = `lock:pallet:restore:${id}`;
    try {
      await withRedisLock(lockKey, 5, async () => {
        const t = await db.sequelize.transaction();
        try {
          const pallet = await db.Pallet.findByPk(id, { transaction: t });
          if (!pallet) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("PALLET_NOT_FOUND", "板不存在"));
          }
          if (!pallet.is_deleted) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("PALLET_NOT_DELETED", "板未被删除"));
          }
          const before = pallet.toJSON();
          await pallet.update(
            { is_deleted: false, deleted_at: null, deleted_by: null },
            { transaction: t }
          );
          const after = pallet.toJSON();
          await t.commit();
          writeAudit({
            module: "warehouse",
            entityType: "Pallet",
            entityId: pallet.id,
            action: "restore",
            user: req.user,
            before,
            after,
          });
          res.json(buildResp("板已还原", { id: pallet.id }));
        } catch (e) {
          await t.rollback();
          console.error("restore pallet error", e);
          return res
            .status(500)
            .json(buildFail("PALLET_RESTORE_FAILED", "还原失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("PALLET_RESTORE_BUSY", "还原处理中"));
      throw e;
    }
  }
);

// 驳回板(业务场景: 录入错误 / 未通过质检)
router.post(
  "/pallets/:id/reject",
  authenticate,
  checkPermission("warehouse.pallet.reject"),
  async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    const lockKey = `lock:pallet:reject:${id}`;
    try {
      await withRedisLock(lockKey, 5, async () => {
        const t = await db.sequelize.transaction();
        try {
          const pallet = await db.Pallet.findByPk(id, { transaction: t });
          if (!pallet) {
            await t.rollback();
            return res
              .status(404)
              .json(buildFail("PALLET_NOT_FOUND", "板不存在"));
          }
          if (pallet.is_deleted) {
            await t.rollback();
            return res
              .status(400)
              .json(buildFail("PALLET_ALREADY_DELETED", "板已删除不可驳回"));
          }
          if (!["pending"].includes(pallet.status)) {
            await t.rollback();
            return res
              .status(400)
              .json(
                buildFail("PALLET_REJECT_STATUS_INVALID", "当前状态不可驳回")
              );
          }
          const before = pallet.toJSON();
          await pallet.update(
            {
              status: "incident",
              remark:
                (pallet.remark ? pallet.remark + " | " : "") +
                `REJECT:${reason || "未提供原因"}`,
            },
            { transaction: t }
          );
          const after = pallet.toJSON();
          await t.commit();
          writeAudit({
            module: "warehouse",
            entityType: "Pallet",
            entityId: pallet.id,
            action: "reject",
            user: req.user,
            before,
            after,
            extra: { reason },
          });
          res.json(buildResp("板已驳回", { id: pallet.id }));
        } catch (e) {
          await t.rollback();
          console.error("reject pallet error", e);
          return res
            .status(500)
            .json(buildFail("PALLET_REJECT_FAILED", "驳回失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("PALLET_REJECT_BUSY", "驳回处理中"));
      throw e;
    }
  }
);

// 批量软删除
router.post(
  "/pallets/batch-delete",
  authenticate,
  checkPermission("warehouse.pallet.delete"),
  async (req, res) => {
    const { ids = [] } = req.body || {};
    if (!Array.isArray(ids) || !ids.length)
      return res
        .status(400)
        .json(buildFail("PALLET_BATCH_DELETE_EMPTY", "缺少 ids"));
    const lockKey = "lock:pallet:batch-delete";
    try {
      await withRedisLock(lockKey, 10, async () => {
        const t = await db.sequelize.transaction();
        try {
          const pallets = await db.Pallet.scope("withDeleted").findAll({
            where: { id: ids },
            transaction: t,
          });
          const result = { deleted: [], skipped: [] };
          for (const p of pallets) {
            if (p.is_deleted) {
              result.skipped.push({ id: p.id, reason: "already_deleted" });
              continue;
            }
            if (
              [
                "stored",
                "waiting_clear",
                "delivered",
                "dispatched",
                "unpacked",
                "returned",
              ].includes(p.status)
            ) {
              result.skipped.push({ id: p.id, reason: "status_forbidden" });
              continue;
            }
            const pkgCount = await db.Package.count({
              where: { pallet_id: p.id },
              transaction: t,
            });
            if (pkgCount > 0) {
              result.skipped.push({ id: p.id, reason: "has_packages" });
              continue;
            }
            const before = p.toJSON();
            await p.update(
              {
                is_deleted: true,
                deleted_at: new Date(),
                deleted_by: req.user.id,
              },
              { transaction: t }
            );
            writeAudit({
              module: "warehouse",
              entityType: "Pallet",
              entityId: p.id,
              action: "soft-delete",
              user: req.user,
              before,
              after: p.toJSON(),
              extra: { batch: true },
            });
            result.deleted.push(p.id);
          }
          await t.commit();
          res.json(buildResp("批量软删除完成", result));
        } catch (e) {
          await t.rollback();
          console.error("batch delete pallets error", e);
          return res
            .status(500)
            .json(buildFail("PALLET_BATCH_DELETE_FAILED", "批量软删除失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("PALLET_BATCH_DELETE_BUSY", "批量删除处理中"));
      throw e;
    }
  }
);

// 批量还原
router.post(
  "/pallets/batch-restore",
  authenticate,
  checkPermission("warehouse.pallet.delete"),
  async (req, res) => {
    const { ids = [] } = req.body || {};
    if (!Array.isArray(ids) || !ids.length)
      return res
        .status(400)
        .json(buildFail("PALLET_BATCH_RESTORE_EMPTY", "缺少 ids"));
    const lockKey = "lock:pallet:batch-restore";
    try {
      await withRedisLock(lockKey, 10, async () => {
        const t = await db.sequelize.transaction();
        try {
          const pallets = await db.Pallet.scope("withDeleted").findAll({
            where: { id: ids },
            transaction: t,
          });
          const result = { restored: [], skipped: [] };
          for (const p of pallets) {
            if (!p.is_deleted) {
              result.skipped.push({ id: p.id, reason: "not_deleted" });
              continue;
            }
            const before = p.toJSON();
            await p.update(
              { is_deleted: false, deleted_at: null, deleted_by: null },
              { transaction: t }
            );
            writeAudit({
              module: "warehouse",
              entityType: "Pallet",
              entityId: p.id,
              action: "restore",
              user: req.user,
              before,
              after: p.toJSON(),
              extra: { batch: true },
            });
            result.restored.push(p.id);
          }
          await t.commit();
          res.json(buildResp("批量还原完成", result));
        } catch (e) {
          await t.rollback();
          console.error("batch restore pallets error", e);
          return res
            .status(500)
            .json(buildFail("PALLET_BATCH_RESTORE_FAILED", "批量还原失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("PALLET_BATCH_RESTORE_BUSY", "批量还原处理中"));
      throw e;
    }
  }
);

// 物理清理 (删除超过 retentionDays 且无引用)
router.delete(
  "/pallets/cleanup",
  authenticate,
  checkPermission("warehouse.pallet.cleanup"),
  async (req, res) => {
    const { retentionDays = 30, limit = 100 } = req.query;
    const days = parseInt(retentionDays) || 30;
    const max = Math.min(500, parseInt(limit) || 100);
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const lockKey = "lock:pallet:cleanup";
    try {
      await withRedisLock(lockKey, 30, async () => {
        const t = await db.sequelize.transaction();
        try {
          const candidates = await db.Pallet.scope("withDeleted").findAll({
            where: {
              is_deleted: true,
              deleted_at: { [db.Sequelize.Op.lt]: cutoff },
            },
            limit: max,
            transaction: t,
          });
          const removed = [];
          const skipped = [];
          for (const p of candidates) {
            const refCount = await db.Package.count({
              where: { pallet_id: p.id },
              transaction: t,
            });
            if (refCount > 0) {
              skipped.push({ id: p.id, reason: "has_packages" });
              continue;
            }
            const before = p.toJSON();
            await p.destroy({ force: true, transaction: t });
            writeAudit({
              module: "warehouse",
              entityType: "Pallet",
              entityId: p.id,
              action: "purge",
              user: req.user,
              before,
              after: null,
              extra: { retentionDays: days },
            });
            removed.push(p.id);
          }
          await t.commit();
          res.json(buildResp("清理完成", { removed, skipped }));
        } catch (e) {
          await t.rollback();
          console.error("pallet cleanup error", e);
          return res
            .status(500)
            .json(buildFail("PALLET_CLEANUP_FAILED", "清理失败"));
        }
      });
    } catch (e) {
      if (e.message === "LOCK_BUSY")
        return res
          .status(429)
          .json(buildFail("PALLET_CLEANUP_BUSY", "清理处理中"));
      throw e;
    }
  }
);

export default router;
