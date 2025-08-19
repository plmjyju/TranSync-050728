import { getRedis } from "./redisClient.js";

export async function withRedisLock(lockKey, ttlSec, fn) {
  const r = await getRedis().catch(() => null);
  const token = Date.now() + ":" + Math.random().toString(36).slice(2);
  if (r) {
    const ok = await r.set(lockKey, token, { NX: true, EX: ttlSec });
    if (!ok) throw new Error("LOCK_BUSY");
  }
  try {
    return await fn();
  } finally {
    if (r) {
      try {
        const v = await r.get(lockKey);
        if (v === token) await r.del(lockKey);
      } catch {}
    }
  }
}
