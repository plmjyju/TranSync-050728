import { getRedis } from "./redisClient.js";
import db from "../models/index.js";

// Redis key helpers
const inbondSeqKey = (agentId, customerId, dateStr) =>
  `seq:inbond:${agentId}:${customerId}:${dateStr}`;
const packageSeqKey = (inbondId) => `seq:package:${inbondId}`;

// Convert a positive integer (1-based) to alphabet sequence: 1->A, 26->Z, 27->AA, 28->AB ...
function toAlphaSequence(n) {
  if (n <= 0) return "A";
  let result = "";
  while (n > 0) {
    n--; // shift to 0-based
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

// Daily inbond sequence per agent + customer + date (UTC date)
export async function nextInbondDailySequence(agentId, customerId) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  try {
    const r = await getRedis();
    const key = inbondSeqKey(agentId, customerId, dateStr);
    const val = await r.incr(key); // starts at 1
    // Set TTL for 3 days (auto clean) only when first created
    if (val === 1) await r.expire(key, 3 * 24 * 3600);
    return { seq: val, dateStr };
  } catch (e) {
    // fallback: count existing (race possible)
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const count = await db.Inbond.count({
      where: {
        client_id: customerId,
        created_at: { [db.Sequelize.Op.between]: [start, end] },
      },
    });
    return { seq: count + 1, dateStr };
  }
}

export async function generateInbondCodeAtomic(agentId, customerId) {
  // Agent base36 (was existing logic) keep same for backward compatibility
  function toBase36(num) {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let n = num;
    let out = "";
    if (n === 0) return "00";
    while (n > 0) {
      out = chars[n % 36] + out;
      n = Math.floor(n / 36);
    }
    return out.padStart(2, "0");
  }
  const agentCode = toBase36(agentId);
  const customerCode = customerId.toString().padStart(3, "0");
  const { seq, dateStr } = await nextInbondDailySequence(agentId, customerId);
  const sequenceToken = toAlphaSequence(seq); // previously single letter
  return `IB${agentCode}${customerCode}-${dateStr}${sequenceToken}`;
}

export async function nextPackageSequence(inbondId) {
  try {
    const r = await getRedis();
    const key = packageSeqKey(inbondId);
    const val = await r.incr(key); // persistent sequence per inbond
    return val; // 1-based
  } catch (e) {
    // fallback to counting (race possible)
    const count = await db.Package.count({ where: { inbond_id: inbondId } });
    return count + 1;
  }
}

export function formatPackageCode(inbondCode, seq) {
  return `${inbondCode}-${seq.toString().padStart(3, "0")}`;
}
