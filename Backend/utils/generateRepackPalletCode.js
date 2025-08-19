import { getRedis } from "./redisClient.js";

export async function generateRepackPalletCode(awb, oprAbbr = null) {
  const key = `seq:repack:${awb}`;
  const r = await getRedis();
  const n = await r.incr(key); // 不重置，按 AWB 递增
  const seq = n < 100 ? String(n).padStart(2, "0") : String(n);
  return `${awb}-${seq}${oprAbbr ? `-${oprAbbr}` : ""}`;
}
