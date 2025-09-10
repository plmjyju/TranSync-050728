import db from "../models/index.js";
import { withRedisLock } from "../utils/withRedisLock.js";
import { writeAudit } from "../utils/auditHelper.js";
import { getRedis } from "../utils/redisClient.js";
import crypto from "crypto";

const BATCH = parseInt(process.env.SPLIT_FINALIZE_RETRY_BATCH || "20", 10);

async function popRetryQueue(max = BATCH) {
  const r = await getRedis();
  const items = [];
  for (let i = 0; i < max; i++) {
    const v = await r.rPop("queue:split_finalize_retry");
    if (!v) break;
    try {
      items.push(JSON.parse(v));
    } catch {}
  }
  return items;
}

function calcFinalizeHash(pallets) {
  const norm = [...pallets]
    .map((p) => ({
      temp_pallet_id: p.temp_pallet_id,
      confirmed_count: p.confirmed_count,
      input_pallet_code: p.input_pallet_code || null,
    }))
    .sort((a, b) => a.temp_pallet_id - b.temp_pallet_id);
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

async function attemptFinalize(split, userStub, t) {
  // Minimal finalize attempt: if finalize_in_progress skip; if completed no-op
  if (split.status === db.SplitOrder.STATUSES.COMPLETED)
    return { skipped: true, reason: "already_completed" };
  if (split.finalize_in_progress)
    return { skipped: true, reason: "in_progress" };
  // Build pallets spec from confirmed temp pallets
  const temps = await db.SplitOrderPalletTemp.findAll({
    where: { split_order_id: split.id },
    transaction: t,
  });
  const confirmedTemps = temps.filter((tp) => tp.status === "confirmed");
  if (!confirmedTemps.length)
    return { skipped: true, reason: "no_confirmed_temps" };
  // Integrity: ensure each confirmed temp has real pallet
  const missing = confirmedTemps
    .filter((tp) => !tp.pallet_id)
    .map((tp) => tp.id);
  if (missing.length) {
    writeAudit({
      module: "warehouse",
      entityType: "SplitOrder",
      entityId: split.id,
      action: "split-order-finalize-retry-missing-pallet",
      user: userStub,
      before: null,
      after: null,
      extra: { missing_temp_ids: missing },
    });
    return {
      skipped: true,
      reason: "missing_pallet",
      missing_count: missing.length,
    };
  }
  const pallets = confirmedTemps.map((tp) => ({
    temp_pallet_id: tp.id,
    confirmed_count: tp.scanned_package_count,
  }));
  const hash = calcFinalizeHash(pallets);
  const r = await getRedis();
  const hashKey = `split:${split.id}:finalize:hash`;
  const stored = await r.get(hashKey);
  if (split.status === db.SplitOrder.STATUSES.COMPLETED && stored === hash)
    return { skipped: true, reason: "idempotent" };
  // Since original finalize already created pallets & confirmed temps, here we only ensure hash stored & status set.
  if (split.status !== db.SplitOrder.STATUSES.COMPLETED) {
    await split.update(
      {
        status: db.SplitOrder.STATUSES.COMPLETED,
        completed_at: new Date(),
        finalize_in_progress: false,
      },
      { transaction: t }
    );
  } else if (split.finalize_in_progress) {
    await split.update({ finalize_in_progress: false }, { transaction: t });
  }
  if (!stored) {
    try {
      await r.set(hashKey, hash, { EX: 24 * 3600 });
    } catch {}
  }
  return { retried: true, pallets_count: pallets.length };
}

export async function runOnce() {
  return withRedisLock("lock:split_finalize_retry_worker", 25, async () => {
    const tasks = await popRetryQueue();
    if (!tasks.length) return { popped: 0, retried: 0 };
    let retried = 0;
    for (const task of tasks) {
      const { split_id } = task || {};
      if (!split_id) continue;
      const t = await db.sequelize.transaction();
      try {
        const split = await db.SplitOrder.findByPk(split_id, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!split) {
          await t.rollback();
          continue;
        }
        const userStub = {
          id: 0,
          username: "system-finalize-retry",
          tenant_id: split.tenant_id,
          warehouse_id: split.warehouse_id,
        };
        const result = await attemptFinalize(split, userStub, t);
        await t.commit();
        if (result.retried) retried++;
        writeAudit({
          module: "warehouse",
          entityType: "SplitOrder",
          entityId: split.id,
          action: "split-order-finalize-retry-result",
          user: userStub,
          before: null,
          after: null,
          extra: { ...result },
        });
      } catch (e) {
        await t.rollback();
        writeAudit({
          module: "warehouse",
          entityType: "SplitOrder",
          entityId: split_id,
          action: "split-order-finalize-retry-error",
          user: { id: 0, username: "system-finalize-retry" },
          before: null,
          after: null,
          extra: { error: e.message },
        });
      }
    }
    return { popped: tasks.length, retried };
  });
}

if (process.argv[1] && process.argv[1].includes("finalizeRetryWorker.js")) {
  runOnce().then((r) => {
    console.log("Finalize retry worker run", r);
    process.exit(0);
  });
}
