import { auditAsync } from "./auditQueue.js";

// 生成精简快照，避免把大字段/隐私写入审计
export function pickSnapshot(entity, fields) {
  if (!entity) return null;
  const o = {};
  fields.forEach((f) => {
    o[f] = entity[f];
  });
  return o;
}

export function writeAudit({
  module,
  entityType,
  entityId,
  action,
  user,
  before,
  after,
  extra,
  ip,
  ua,
}) {
  auditAsync({
    module,
    entityType,
    entityId,
    action,
    user,
    before,
    after,
    extra,
    ip,
    ua,
  });
}

export const PACKAGE_AUDIT_FIELDS = [
  "id",
  "package_code",
  "status",
  "operation_requirement_id",
  "inbond_id",
  "length_cm",
  "width_cm",
  "height_cm",
  "weight_kg",
  "warehouse_location",
  "storage_time",
];

export const INBOND_AUDIT_FIELDS = [
  "id",
  "inbond_code",
  "status",
  "shipping_type",
  "clearance_type",
  "tax_type_id",
  "completed_at",
];

// 新增：包裹明细审计字段白名单
export const PACKAGE_ITEM_AUDIT_FIELDS = [
  "id",
  "package_id",
  "tracking_no",
  "client_code",
  "weight_kg",
  "quantity",
  "length_cm",
  "width_cm",
  "height_cm",
  "hs_code",
  "unit_price",
  "total_price",
];

export const FORECAST_AUDIT_FIELDS = [
  "id",
  "forecast_code",
  "mawb",
  "status",
  "clearance_status",
  "delivery_status",
  "has_incident",
  "total_packages",
  "cleared_packages",
  "dispatched_packages",
  "delivered_packages",
  "incident_packages",
];

export async function withAuditTransaction(
  sequelize,
  workFn,
  auditRecordsCollector = []
) {
  const t = await sequelize.transaction();
  try {
    const result = await workFn(t, auditRecordsCollector);
    await t.commit();
    // 事务后统一写审计
    for (const rec of auditRecordsCollector) {
      try {
        writeAudit(rec);
      } catch (e) {
        console.warn("writeAudit failed in withAuditTransaction", e);
      }
    }
    return result;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}
