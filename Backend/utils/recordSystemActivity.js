export async function recordSystemActivity(
  { userId, clientType, event, ipAddress = null, userAgent = null },
  db
) {
  await db.SystemActivity.create({
    user_id: userId,
    client_type: clientType,
    event,
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}
