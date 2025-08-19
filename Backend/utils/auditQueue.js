// 简易异步审计日志队列（Redis + 内存备份 + 死信重试）。生产可换成专业 MQ。
import db from "../models/index.js";
import { getRedis } from "./redisClient.js";

// 回退内存队列
const fallbackQueue = [];
let flushing = false;
const BATCH_SIZE = 50;
const REDIS_LIST_KEY = "audit:queue";
const DEAD_LETTER_KEY = "audit:dead"; // 死信列表
const MAX_FALLBACK = 5000; // 防止内存爆炸
const MAX_RETRY = 5; // 最大重试次数

async function pushRedis(task) {
  try {
    const r = await getRedis();
    await r.rPush(REDIS_LIST_KEY, JSON.stringify({ ...task, __retry: 0 }));
    return true;
  } catch (e) {
    return false;
  }
}

export async function auditAsync(task) {
  const ok = await pushRedis(task);
  if (!ok) {
    // 退回内存
    if (fallbackQueue.length < MAX_FALLBACK)
      fallbackQueue.push({ ...task, __retry: 0 });
    if (!flushing) flushFallback();
  }
}

async function flushFallback() {
  flushing = true;
  while (fallbackQueue.length) {
    const batch = fallbackQueue.splice(0, BATCH_SIZE);
    try {
      await persistBatch(batch);
    } catch (e) {
      console.error("Fallback audit flush failed", e);
      break; // 避免死循环
    }
  }
  flushing = false;
}

async function persistBatch(batch) {
  if (!batch.length) return;
  await db.AuditLog.bulkCreate(
    batch.map((t) => ({
      module: t.module,
      entity_type: t.entityType,
      entity_id: t.entityId,
      action: t.action,
      user_id: t.user?.id || null,
      user_type: t.user?.userType || null,
      before_json: t.before ? JSON.stringify(t.before) : null,
      after_json: t.after ? JSON.stringify(t.after) : null,
      extra_json: t.extra ? JSON.stringify(t.extra) : null,
      ip: t.ip || null,
      ua: t.ua || null,
    }))
  );
}

// 处理失败: 记录到死信队列
async function pushDeadLetter(r, task, error) {
  try {
    const payload = { ...task, failedAt: Date.now(), error: error?.message };
    await r.rPush(DEAD_LETTER_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error("Dead-letter push failed", e);
  }
}

// 重新投递（带指数退避）
async function requeueWithBackoff(r, task) {
  const retry = (task.__retry || 0) + 1;
  if (retry > MAX_RETRY) return false;
  task.__retry = retry;
  const delayMs = Math.min(30000, 200 * Math.pow(2, retry));
  setTimeout(async () => {
    try {
      await r.rPush(REDIS_LIST_KEY, JSON.stringify(task));
    } catch (e) {
      console.error("Requeue failed", e);
    }
  }, delayMs);
  return true;
}

// 后台轮询 Redis 拉取入库（可在 index.js 中 import 启动）
export async function startAuditRedisConsumer() {
  const r = await getRedis();
  (async function loop() {
    while (true) {
      try {
        const values = await r.lPopCount(REDIS_LIST_KEY, BATCH_SIZE);
        if (values && values.length) {
          const batchRaw = values
            .map((v) => {
              try {
                return JSON.parse(v);
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          const toPersist = [];
          for (const task of batchRaw) {
            try {
              toPersist.push(task);
            } catch (e) {
              console.error("Audit task parse error", e);
            }
          }
          try {
            await persistBatch(toPersist);
          } catch (e) {
            console.error("Persist batch error", e);
            // 拆分重试/死信
            for (const task of toPersist) {
              const ok = await requeueWithBackoff(r, task);
              if (!ok) await pushDeadLetter(r, task, e);
            }
          }
        } else {
          await new Promise((res) => setTimeout(res, 500));
        }
      } catch (e) {
        console.error("Audit Redis consumer error", e);
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  })();
}

// 查询死信概况（可在管理端暴露）
export async function getDeadLetterStats(limit = 20) {
  try {
    const r = await getRedis();
    const len = await r.lLen(DEAD_LETTER_KEY);
    const slice = await r.lRange(DEAD_LETTER_KEY, -limit, -1);
    return {
      length: len,
      samples: slice.map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return s;
        }
      }),
    };
  } catch (e) {
    return { length: 0, samples: [], error: e.message };
  }
}
