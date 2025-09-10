---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 错误处理与响应规范

## 1. 统一响应结构

成功: `{ success: true, message?, data? }`
失败: `{ success: false, code, message, ...context }`

## 2. HTTP 状态码映射

| 场景          | HTTP | code 示例              |
| ------------- | ---- | ---------------------- |
| 参数错误      | 400  | GENERIC_INVALID_PARAMS |
| 未认证        | 401  | AUTH_TOKEN_INVALID     |
| 权限不足      | 403  | AUTH_FORBIDDEN         |
| 资源不存在    | 404  | GENERIC_NOT_FOUND      |
| 冲突/状态非法 | 409  | SPLIT_STATUS_INVALID   |
| 频率限制      | 429  | GENERIC_RATE_LIMIT     |
| 服务器错误    | 500  | GENERIC_INTERNAL_ERROR |

## 3. 错误码设计原则

- 前缀定位模块 (SPLIT*, LEDGER*, OUTBOUND\_)
- 单一语义，避免含糊词 ("FAILED", "ERROR")
- 不暴露内部栈信息给客户端

## 4. 中间件流程

1. 路由抛出 Error 对象 (含 code)
2. 统一错误处理中间件映射 HTTP 状态 + 结构化输出
3. 记录日志: level=error, fields: code, path, requestId, tenant_id

## 5. 校验错误

- 聚合字段错误数组: `errors:[{field,message}]`
- code=GENERIC_INVALID_PARAMS

## 6. 并发/幂等冲突

- Finalize 哈希不匹配 → 409 + SPLIT_FINALIZE_IDEMPOTENCY_HASH_MISMATCH
- Redis 锁争用严重可返回 429 + GENERIC_RETRY_LATER (可添加)

## 7. 日志关联

- 响应头返回 `x-request-id`
- 日志包含 requestId，便于串联

## 8. 示例

```json
{
  "success": false,
  "code": "SPLIT_FINALIZE_SCAN_MISMATCH",
  "message": "扫描数量与确认数量不一致",
  "expected": 120,
  "scanned": 118
}
```

## 9. 自检清单

1. 是否使用统一结构? (Y/N)
2. 错误码是否有模块前缀? (Y/N)
3. 是否隐藏内部实现细节? (Y/N)
4. 是否正确映射 HTTP 状态码? (Y/N)
5. 是否记录必要上下文日志? (Y/N)
