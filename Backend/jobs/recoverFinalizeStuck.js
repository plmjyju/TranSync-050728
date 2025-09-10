import db from "../models/index.js";
import { withRedisLock } from "../utils/withRedisLock.js";
import { writeAudit } from "../utils/auditHelper.js";

const STUCK_MINUTES = parseInt(
  process.env.SPLIT_FINALIZE_STUCK_MINUTES || "10",
  10
); // 可根据需要调节

async function recoverOnce(limit = 100) {
  return withRedisLock("lock:split_finalize_recover", 20, async () => {
    const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
    const stuck = await db.SplitOrder.findAll({
      where: {
        finalize_in_progress: true,
        updated_at: { [db.Sequelize.Op.lt]: cutoff },
        status: { [db.Sequelize.Op.not]: db.SplitOrder.STATUSES.COMPLETED },
      },
      limit,
      order: [["updated_at", "ASC"]],
    });
    let recovered = 0;
    for (const so of stuck) {
      const before = so.toJSON();
      const needAutoRetry =
        before.status !== db.SplitOrder.STATUSES.CANCELLED &&
        before.status !== db.SplitOrder.STATUSES.COMPLETED;
      await so.update(
        {
          finalize_in_progress: false,
          last_finalize_error:
            (so.last_finalize_error || "") + " | recovered_stuck",
        },
        { silent: false }
      );
      recovered++;
      // Attempt redis cleanup of stale lock & scan seq
      try {
        const { getRedis } = await import("../utils/redisClient.js");
        const r = await getRedis();
        await r.del(`lock:split:${so.id}`);
        await r.expire(`split:${so.id}:scan_seq`, 900); // 15m
      } catch {}
      writeAudit({
        module: "warehouse",
        entityType: "SplitOrder",
        entityId: so.id,
        action: "split-order-finalize-recover",
        user: {
          id: 0,
          username: "system-finalize-recover",
          tenant_id: so.tenant_id,
          warehouse_id: so.warehouse_id,
        },
        before,
        after: so.toJSON(),
        extra: { minutes_threshold: STUCK_MINUTES, recovered: true },
      });
      // Auto retry finalize (deferred) - simple flag queue approach
      if (process.env.SPLIT_FINALIZE_AUTORETRY === "1" && needAutoRetry) {
        try {
          const { getRedis } = await import("../utils/redisClient.js");
          const r = await getRedis();
          await r.lPush(
            "queue:split_finalize_retry",
            JSON.stringify({ split_id: so.id, ts: Date.now() })
          );
          writeAudit({
            module: "warehouse",
            entityType: "SplitOrder",
            entityId: so.id,
            action: "split-order-finalize-retry-queued",
            user: {
              id: 0,
              username: "system-finalize-recover",
              tenant_id: so.tenant_id,
              warehouse_id: so.warehouse_id,
            },
            before: null,
            after: null,
            extra: { queued: true },
          });
        } catch {}
      }
    }
    writeAudit({
      module: "warehouse",
      entityType: "SplitOrder",
      entityId: 0,
      action: "split-order-finalize-recover-summary",
      user: { id: 0, username: "system-finalize-recover" },
      before: null,
      after: null,
      extra: {
        checked: stuck.length,
        recovered,
        minutes_threshold: STUCK_MINUTES,
      },
    });
    return { checked: stuck.length, recovered };
  });
}

export async function runOnce() {
  const result = await recoverOnce();
  console.log("Finalize recover run", result);
  return result;
}

if (process.argv[1] && process.argv[1].includes("recoverFinalizeStuck.js")) {
  runOnce().then(() => process.exit(0));
}
