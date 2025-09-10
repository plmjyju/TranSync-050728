---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 认证与会话 (Auth & Session)

## 1. 目标

提供模块化多客户端 (OMP / WMS / Agent / Client) 统一 JWT 认证与权限注入，最小化重复查询，确保性能 + 安全。

## 2. 流程概览

1. 登录路由根据 client_type 生成 JWT (aud=client_type)
2. `middlewares/authenticate.js`：
   - 解析 Authorization: Bearer <token>
   - 使用 `config.jwt.secret` 校验
   - 根据 userType (system/client) 组装 req.user
   - 记录调试日志（可在生产关闭）
3. `checkPermission()` 校验权限数组中是否包含所需 code

## 3. Token 载荷 (示例)

```json
{
  "id": 123,
  "username": "warehouse_op",
  "userType": "system",
  "roleId": 5,
  "permissions": ["warehouse.split_order.scan", "warehouse.pallet.view"],
  "aud": "wms",
  "exp": 1699999999
}
```

Client 用户 (customer) 模式：通过 Customer 表校验有效性 (isActive)。

## 4. 中间件要点

| 项       | 说明                                    |
| -------- | --------------------------------------- |
| 单一来源 | 禁止使用旧 middleware/auth.js           |
| 配置来源 | 不直接访问 process.env，使用 config.jwt |
| 错误语义 | Token 过期 vs 无效分开返回              |
| 权限集合 | 登录后缓存于 token，减少频繁关联查询    |

## 5. 权限检查

```js
router.post(
  "/split-orders/:id/finalize",
  authenticate,
  checkPermission("warehouse.split_order.finalize"),
  handler
);
```

支持多权限：`checkMultiplePermissions(["role.create","permission.view"])`。

## 6. 错误码建议

| 场景       | code               |
| ---------- | ------------------ |
| 缺少 token | AUTH_TOKEN_MISSING |
| token 过期 | AUTH_TOKEN_EXPIRED |
| token 无效 | AUTH_TOKEN_INVALID |
| 权限不足   | AUTH_FORBIDDEN     |

返回格式：`{ success:false, code, message }`。

## 7. 多租户上下文

- 目前基础 token 载荷不含 tenant_id / warehouse_id → 由上层业务 (如 Split 创建) 明确传入并写入记录
- 未来可在 token 增补 `tenantIds` / `warehouseIds` 以支持跨仓授权

## 8. 安全建议

- 缩短 token 过期时间 + 刷新机制 (后续规划 refresh token)
- 生产关闭调试 log，避免权限列表泄露
- 增加 IP / UA 绑定 (可选)

## 9. 自检

1. 新增路由是否添加 authenticate + checkPermission?
2. 是否复用统一中间件?
3. 是否避免额外 DB 拉取用户权限?
