import crypto from "crypto";
import db from "../models/index.js";

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

// 获取最新一条哈希 (全局或按租户/仓库可选)
async function getPrevHash({
  tenant_id,
  warehouse_id,
  transaction,
  chain_group,
}) {
  const where = { direction: chain_group };
  if (tenant_id && db.FtzInventoryLedger.rawAttributes?.tenant_id)
    where.tenant_id = tenant_id;
  if (warehouse_id && db.FtzInventoryLedger.rawAttributes?.warehouse_id)
    where.warehouse_id = warehouse_id;
  const last = await db.FtzInventoryLedger.findOne({
    where,
    order: [["id", "DESC"]],
    attributes: ["hash"],
    transaction,
  });
  return last?.hash || "";
}

// 写入入库台账 (item 粒度, 幂等)
export async function writeFtzInboundLedger({
  doObj,
  changedPallets, // 仅本次真正新入库的板
  rels, // DeliveryOrderPallet 关系列表已过滤到本次 codes
  packages, // 相关包裹集合
  items, // 相关包裹的明细项
  user,
  transaction,
}) {
  if (!changedPallets || changedPallets.length === 0)
    return { written: 0, skipped: 0 };

  const changedPalletIds = new Set(changedPallets.map((p) => p.id));
  const palletAwbMap = new Map();
  for (const r of rels) palletAwbMap.set(r.pallet_id, r.awb);
  const packagesById = new Map(packages.map((p) => [p.id, p]));

  // 仅写属于本次新增入库的板上的 items
  const targetItems = items.filter((it) => {
    const pkg = packagesById.get(it.package_id);
    return pkg && changedPalletIds.has(pkg.pallet_id);
  });
  if (targetItems.length === 0) return { written: 0, skipped: 0 };

  const tenant_id = user.tenant_id;
  const warehouse_id = user.warehouse_id;
  const now = new Date();
  let prevHash = await getPrevHash({
    tenant_id,
    warehouse_id,
    transaction,
    chain_group: "inbound",
  });

  const rows = [];
  let written = 0,
    skipped = 0;
  for (const it of targetItems) {
    const pkg = packagesById.get(it.package_id);
    const pallet_id = pkg.pallet_id;
    const unique_key = `in:${pallet_id}:${pkg.id}:${it.id}`;
    const exist = await db.FtzInventoryLedger.findOne({
      where: { unique_key, direction: "inbound", ledger_status: "active" },
      transaction,
    });
    if (exist) {
      skipped++;
      continue;
    }
    const core = {
      direction: "inbound",
      delivery_order_id: doObj.id,
      pallet_id,
      package_id: pkg.id,
      forecast_id: pkg.forecast_id || null,
      customer_id: pkg.customer_id || null,
      warehouse_id: warehouse_id || null,
      tenant_id: tenant_id || null,
      mawb: pkg.mawb || null,
      hawb: palletAwbMap.get(pallet_id) || null,
      do_number: doObj.do_number,
      reference_no: null,
      customs_entry_no: null,
      batch_no: null,
      sku_code: it.tracking_no || null,
      hs_code: it.hs_code || null,
      goods_name_cn: it.product_description || null,
      goods_name_en: it.product_name_en || null,
      origin_country: it.origin_country || null,
      lot_no: null,
      serial_no: null,
      brand: null,
      model: null,
      qty: it.quantity || it.item_count || 1,
      uom: "PCS",
      secondary_qty: null,
      secondary_uom: null,
      gross_weight_kg: it.weight_kg || null,
      net_weight_kg: it.weight_kg || null,
      volume_cbm: null,
      declared_value: it.total_price || it.unit_price || null,
      currency: "USD",
      exchange_rate: null,
      bond_status: "bonded",
      customs_status: null,
      ledger_status: "active",
      inbound_time: pkg.storage_time || now,
      outbound_time: null,
      operator_id: user.id,
      operator_name: user.username,
      source_action: "inbound-scan",
      zone_code: it.ftz_zone_code || null,
      warehouse_location: null,
      area_type: null,
      danger_class: null,
      temperature_range: null,
      expiry_date: null,
      manufacturer: null,
      revision: 1,
      reversal_of: null,
      prev_hash: prevHash || null,
      unique_key,
    };
    const hashPayload = { ...core };
    delete hashPayload.prev_hash;
    const hash = sha256((prevHash || "") + JSON.stringify(hashPayload));
    core.hash = hash;
    prevHash = hash; // 链式
    rows.push(core);
    written++;
  }
  if (rows.length)
    await db.FtzInventoryLedger.bulkCreate(rows, { transaction });
  return { written, skipped };
}

// 内部移动(拆板/重组)台账：不改变库存数量，仅追踪 pallet 变更。
export async function writeFtzInternalMoveLedger({
  moves,
  user,
  transaction,
  split_order_id,
}) {
  if (!moves || moves.length === 0) return { written: 0 };
  const tenant_id = user.tenant_id;
  const warehouse_id = user.warehouse_id;
  // 汇总所有包裹 & 构造新 unique_key 列表
  const packageIds = [];
  const keyMap = new Map(); // package_id -> unique_key
  for (const mv of moves) {
    const pkg = mv.package;
    if (!pkg) continue;
    if (!keyMap.has(pkg.id)) {
      const k = `move:${split_order_id}:${pkg.id}`;
      keyMap.set(pkg.id, k);
      packageIds.push(pkg.id);
    }
  }
  // 预取已存在记录（新旧格式）
  const existing = await db.FtzInventoryLedger.findAll({
    where: {
      direction: "internal_move",
      [db.Sequelize.Op.or]: [
        { unique_key: [...keyMap.values()] },
        { package_id: packageIds },
      ],
    },
    attributes: ["package_id", "unique_key"],
    transaction,
  });
  const skipPkg = new Set(existing.map((r) => r.package_id));
  let prevHash = await getPrevHash({
    tenant_id,
    warehouse_id,
    transaction,
    chain_group: "internal_move",
  });
  const rows = [];
  let written = 0;
  for (const mv of moves) {
    const pkg = mv.package;
    if (!pkg) continue;
    if (skipPkg.has(pkg.id)) continue; // 已存在旧或新记录
    if (!mv.items || mv.items.length === 0) continue;
    const its = mv.items;
    let totalWeight = 0,
      totalDeclared = 0;
    for (const it of its) {
      if (it?.weight_kg) totalWeight += Number(it.weight_kg) || 0;
      if (it?.total_price) totalDeclared += Number(it.total_price) || 0;
      else if (it?.unit_price && it?.quantity)
        totalDeclared +=
          (Number(it.unit_price) || 0) * (Number(it.quantity) || 1);
    }
    const firstItem = its[0] || {};
    const unique_key = keyMap.get(pkg.id);
    const core = {
      direction: "internal_move",
      delivery_order_id: null,
      pallet_id: mv.new_pallet_id,
      package_id: pkg.id,
      forecast_id: pkg.forecast_id || null,
      customer_id: pkg.customer_id || null,
      warehouse_id: warehouse_id || null,
      tenant_id: tenant_id || null,
      mawb: pkg.mawb || null,
      hawb: pkg.hawb || null,
      do_number: null,
      reference_no: String(mv.old_pallet_id),
      customs_entry_no: null,
      batch_no: null,
      sku_code: firstItem.tracking_no || null,
      hs_code: firstItem.hs_code || null,
      goods_name_cn: firstItem.product_description || null,
      goods_name_en: firstItem.product_name_en || null,
      origin_country: firstItem.origin_country || null,
      lot_no: null,
      serial_no: null,
      brand: null,
      model: null,
      qty: 0,
      uom: "PCS",
      secondary_qty: null,
      secondary_uom: null,
      gross_weight_kg: totalWeight || null,
      net_weight_kg: totalWeight || null,
      volume_cbm: null,
      declared_value: totalDeclared || null,
      currency: "USD",
      exchange_rate: null,
      bond_status: "bonded",
      customs_status: null,
      ledger_status: "active",
      inbound_time: null,
      outbound_time: null,
      operator_id: user.id,
      operator_name: user.username,
      source_action: "internal_move",
      zone_code: firstItem.ftz_zone_code || null,
      warehouse_location: null,
      area_type: null,
      danger_class: null,
      temperature_range: null,
      expiry_date: null,
      manufacturer: null,
      revision: 1,
      reversal_of: null,
      prev_hash: prevHash || null,
      unique_key,
    };
    const hashPayload = { ...core };
    delete hashPayload.prev_hash;
    const hash = sha256((prevHash || "") + JSON.stringify(hashPayload));
    core.hash = hash;
    prevHash = hash;
    rows.push(core);
    written++;
  }
  if (rows.length)
    await db.FtzInventoryLedger.bulkCreate(rows, { transaction });
  return { written };
}
