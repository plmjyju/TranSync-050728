import db from "../models/index.js";
import { writeFtzInternalMoveLedger } from "../utils/ftzLedger.js";
import { withRedisLock } from "../utils/withRedisLock.js";
import { writeAudit } from "../utils/auditHelper.js";

// Exponential backoff schedule (minutes)
const BACKOFF_MINUTES = [1, 5, 15, 30, 60, 180, 360];
const MAX_ATTEMPTS = parseInt(
  process.env.LEDGER_OUTBOX_MAX_ATTEMPTS || "10",
  10
);

async function pickNextDelay(attempts) {
  const idx = Math.min(attempts, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[idx] * 60 * 1000; // ms
}

async function processBatch({ limit = 50 } = {}) {
  return await withRedisLock("lock:ledger_outbox:worker", 25, async () => {
    const t = await db.sequelize.transaction();
    try {
      // 选出 due 的 pending/failed 可重试记录
      const now = new Date();
      const rows = await db.FtzInventoryLedgerOutbox.findAll({
        where: {
          status: ["pending", "failed"],
          [db.Sequelize.Op.or]: [
            { next_retry_at: null },
            { next_retry_at: { [db.Sequelize.Op.lte]: now } },
          ],
        },
        order: [["id", "ASC"]],
        limit,
        transaction: t,
        lock: t.LOCK.UPDATE,
        skipLocked: true,
      });
      if (!rows.length) {
        await t.commit();
        return { picked: 0, processed: 0 };
      }
      // 先全部标记 processing
      for (const r of rows) {
        await r.update({ status: "processing" }, { transaction: t });
      }
      await t.commit();

      let processed = 0;
      for (const r of rows) {
        const payload = safeParse(r.payload_json) || {};
        const moves = payload.moves || [];
        const version = payload.version || r.version || 1;
        const userStub = {
          id: 0,
          // 系统用户占位，真实环境可使用系统账号ID
          username: "system-ledger-worker",
          tenant_id: r.tenant_id,
          warehouse_id: r.warehouse_id,
        };
        let newStatus = "completed";
        let last_error = null;
        try {
          const innerT = await db.sequelize.transaction();
          try {
            const result = await writeFtzInternalMoveLedger({
              moves: await rehydrateMoves(moves, version),
              user: userStub,
              transaction: innerT,
              split_order_id: r.split_order_id,
            });
            await innerT.commit();
            writeAudit({
              module: "warehouse",
              entityType: "SplitOrder",
              entityId: r.split_order_id,
              action: "split-order-ledger-outbox-processed",
              user: userStub,
              before: null,
              after: null,
              extra: { outbox_id: r.id, written: result.written },
            });
          } catch (ledgerErr) {
            await innerT.rollback();
            newStatus = "failed";
            last_error = ledgerErr.message?.slice(0, 500) || "ledger error";
          }
        } catch (err) {
          newStatus = "failed";
          last_error = err.message?.slice(0, 500) || "unknown error";
        }
        const updates = { status: newStatus };
        if (newStatus === "failed") {
          const attempts = r.attempts + 1;
          const permanent = attempts >= MAX_ATTEMPTS;
          updates.attempts = attempts;
          updates.last_error = last_error;
          const delay = permanent ? null : await pickNextDelay(attempts);
          updates.next_retry_at = permanent
            ? null
            : new Date(Date.now() + delay);
          updates.status = permanent ? "failed_permanent" : "failed";
          writeAudit({
            module: "warehouse",
            entityType: "SplitOrder",
            entityId: r.split_order_id,
            action: permanent
              ? "split-order-ledger-outbox-deadletter"
              : "split-order-ledger-outbox-fail",
            user: userStub,
            before: null,
            after: null,
            extra: { outbox_id: r.id, attempts, last_error, permanent },
          });
        }
        await r.update(updates);
        processed++;
      }
      return { picked: rows.length, processed };
    } catch (e) {
      try {
        await t.rollback();
      } catch {}
      console.error("processLedgerOutbox batch error", e);
      return { picked: 0, processed: 0, error: e.message };
    }
  });
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// 还原 moves：此处仅保留最小信息，若需要 items 细节，可在后续扩展（重新查询）
async function rehydrateMoves(moves, version) {
  if (!moves || !moves.length) return [];
  const packageIds = moves.map((m) => m.package_id).filter(Boolean);
  const packages = await db.Package.findAll({ where: { id: packageIds } });
  const pkgMap = new Map(packages.map((p) => [p.id, p]));
  let itemsByPkg = new Map();
  if (version >= 2) {
    // version 2 may include items snapshot
    for (const mv of moves) {
      if (mv.items && mv.items.length) {
        itemsByPkg.set(
          mv.package_id,
          mv.items.map((it) => ({ ...it }))
        ); // shallow clone
      }
    }
  }
  // Fallback: fetch items only when not provided (limited to present packages)
  if (itemsByPkg.size === 0 && db.PackageItem) {
    const fetched = await db.PackageItem.findAll({
      where: { package_id: packageIds },
    });
    for (const it of fetched) {
      if (!itemsByPkg.has(it.package_id)) itemsByPkg.set(it.package_id, []);
      itemsByPkg.get(it.package_id).push(it);
    }
  }
  const result = [];
  for (const mv of moves) {
    const pkg = pkgMap.get(mv.package_id);
    if (!pkg) continue;
    result.push({
      package: pkg,
      old_pallet_id: mv.old_pallet_id,
      new_pallet_id: mv.new_pallet_id,
      items: itemsByPkg.get(mv.package_id) || [],
    });
  }
  return result;
}

export async function runOnce() {
  return await processBatch({ limit: 50 });
}

if (process.argv[1] && process.argv[1].includes("processLedgerOutbox.js")) {
  runOnce().then((r) => {
    console.log("Ledger outbox processed", r);
    process.exit(0);
  });
}
