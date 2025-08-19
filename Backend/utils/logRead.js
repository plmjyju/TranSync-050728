import { writeAudit } from "./auditHelper.js";
import config from "../config/environment.js"; // 需确保存在相应配置模块

// 商业化可调优配置读取（若没有对应字段，使用默认）
const readCfg = (config.audit && config.audit.read) || {};
const ENABLED = readCfg.enabled !== false; // 默认开启
const MAX_QUERY_JSON = readCfg.maxQueryJson || 1024; // 截断长度
const ALWAYS_ACTION_ENDPOINTS = new Set(readCfg.alwaysEndpoints || []); // 可以由外部注入，如导出/下载
const SENSITIVE_KEYS = new Set(
  readCfg.sensitiveKeys || [
    "tracking_no",
    "receiver_phone",
    "receiver_email",
    "receiver_postcode",
    "sender_license",
    "hs_code",
    "manufacturer_mid",
  ]
);

// 采样策略：敏感/有过滤必记；否则前5页必记；其余按随机/页号哈希或固定间隔
function shouldRecord({ page, hasFilters, hasSensitive, action, sampleBase }) {
  if (!ENABLED) return false;
  if (ALWAYS_ACTION_ENDPOINTS.has(action)) return true; // 明确强制
  if (hasSensitive || hasFilters) return true;
  if (page <= 5) return true;
  // 商业化可插拔：默认每 10 次取 1（按 sampleBase 计数或页号哈希）
  return sampleBase % 10 === 0;
}

// 生成采样基数：优先使用页号 + 用户 + 路径，保证相同组合稳定
function buildSampleBase({ page, userId, path }) {
  const str = `${page}|${userId}|${path}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 131 + str.charCodeAt(i)) >>> 0; // 简单 hash
  }
  return hash;
}

// 过滤掉通用分页/排序字段，保留业务过滤
const DEFAULT_IGNORED = new Set([
  "page",
  "pageSize",
  "limit",
  "offset",
  "order",
  "sort",
  "direction",
]);
function extractBusinessFilters(query) {
  const filtered = {};
  const keys = Object.keys(query || {});
  let hasFilters = false;
  let hasSensitive = false;
  const sensitiveKeysUsed = [];
  for (const k of keys) {
    if (DEFAULT_IGNORED.has(k)) continue;
    const v = query[k];
    if (v === undefined || v === null || v === "") continue;
    hasFilters = true;
    // 复制时防止爆炸长度
    filtered[k] = String(v).slice(0, 200);
    if (SENSITIVE_KEYS.has(k)) {
      hasSensitive = true;
      sensitiveKeysUsed.push(k);
    }
  }
  return { filtered, hasFilters, hasSensitive, sensitiveKeysUsed };
}

/**
 * 通用只读审计
 * params:
 *  - req: Express Request
 *  - meta: { entityType, actionHint, page, pageSize, resultCount, force, entityId }
 */
export function logRead(req, meta = {}) {
  try {
    if (!ENABLED && !meta.force) return;
    const startAt = meta.startAt; // 可选：调用方传入记录开始时间，计算耗时
    const duration_ms = startAt ? Date.now() - startAt : undefined;

    const {
      entityType = "Unknown",
      actionHint,
      page = 1,
      pageSize,
      resultCount,
      entityId = null,
      force = false,
    } = meta;
    const {
      filtered: queryFiltered,
      hasFilters,
      hasSensitive,
      sensitiveKeysUsed,
    } = extractBusinessFilters(req.query);

    let action = actionHint;
    if (!action) {
      if (actionHint === "export") action = "export"; // 显式传入 export 优先
      else action = hasFilters || hasSensitive ? "search" : "list";
    }

    const sampleBase = buildSampleBase({
      page,
      userId: req.user?.id || 0,
      path: req.path,
    });
    const record =
      force ||
      shouldRecord({ page, hasFilters, hasSensitive, action, sampleBase });
    if (!record) return;

    // 构造轻量 extra
    const extra = {
      endpoint: req.originalUrl,
      method: req.method,
      page,
      page_size: pageSize,
      result_count: resultCount,
      query: queryFiltered,
      sensitive_filters: sensitiveKeysUsed.length
        ? sensitiveKeysUsed
        : undefined,
      sampled: !(hasFilters || hasSensitive) && page > 5,
      duration_ms,
    };

    // 控制 query 体积
    let extraStr = JSON.stringify(extra);
    if (extraStr.length > MAX_QUERY_JSON) {
      extra.truncated = true;
      // 简单截断 query 内容
      if (extra.query) {
        extra.query = JSON.parse(
          JSON.stringify(extra.query).slice(0, MAX_QUERY_JSON / 2)
        );
      }
    }

    writeAudit({
      module: req.moduleContext || "client", // 可由上游中间件设置模块
      entityType,
      entityId,
      action,
      user: req.user,
      before: null,
      after: null,
      extra,
      ip: req.ip,
      ua: req.headers["user-agent"],
    });
  } catch (err) {
    // 避免影响主流程
    console.warn("logRead failed", err);
  }
}

// 快速用于详情接口（必记）：
export function logViewDetail(
  req,
  { entityType, entityId, startAt, resultExists }
) {
  logRead(req, {
    entityType,
    entityId,
    actionHint: "view",
    page: 1,
    pageSize: 1,
    resultCount: resultExists ? 1 : 0,
    force: true, // 详情强制
    startAt,
  });
}

// 快速用于导出接口（必记）
export function logExport(req, { entityType, resultCount, startAt }) {
  logRead(req, {
    entityType,
    actionHint: "export",
    page: 1,
    pageSize: resultCount,
    resultCount,
    force: true,
    startAt,
  });
}
