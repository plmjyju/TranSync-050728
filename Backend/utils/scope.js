// utils/scope.js
// 统一多租户/仓库作用域注入，避免跨租户/跨仓库数据泄漏
// 仅当模型包含对应字段且 req.user 携带值时才注入，不破坏无该字段的模型

export function applyScopeToWhere(where = {}, model, user = {}) {
  const scoped = { ...(where || {}) };
  try {
    const attrs = model?.rawAttributes || {};
    if (attrs.tenant_id && user.tenant_id) scoped.tenant_id = user.tenant_id;
    if (attrs.warehouse_id && user.warehouse_id)
      scoped.warehouse_id = user.warehouse_id;
  } catch {}
  return scoped;
}

export default { applyScopeToWhere };
