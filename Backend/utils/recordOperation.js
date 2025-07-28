export async function recordOperation(
  {
    actorId,
    clientType,
    targetType,
    targetId,
    action,
    remark = "",
    inbondCode = null,
    forecastCode = null,
    palletCode = null,
    packageCode = null,
  },
  db
) {
  await db.OperationLog.create({
    actor_id: actorId,
    client_type: clientType,
    target_type: targetType,
    target_id: targetId,
    action,
    remark,
    inbond_code: inbondCode,
    forecast_code: forecastCode,
    pallet_code: palletCode,
    package_code: packageCode,
  });
}
