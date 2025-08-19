import { getRedis } from "./redisClient.js";

/**
 * 创建一个基于 Redis 的固定窗口计数限流器
 * @param {string} prefix key 前缀
 * @param {number} windowSec 窗口秒数
 * @param {number} limit 最大次数
 * @returns (id:string) => {ok:boolean,retryAfter:number,remaining:number}
 */
export function createRateLimiter(prefix, windowSec, limit) {
  return async function (id) {
    const r = await getRedis();
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `${prefix}:${id}:${Math.floor(now / windowSec)}`;
    const ttl = await r.ttl(windowKey);
    const multi = r.multi();
    multi.incr(windowKey);
    if (ttl === -1) multi.expire(windowKey, windowSec);
    const [count] = await multi.exec();
    const current = Number(count);
    if (current > limit) {
      const retryAfter = ttl > 0 ? ttl : windowSec;
      return { ok: false, retryAfter, remaining: 0 };
    }
    return { ok: true, retryAfter: 0, remaining: limit - current };
  };
}
