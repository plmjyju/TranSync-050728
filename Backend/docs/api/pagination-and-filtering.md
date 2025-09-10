---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 分页与过滤规范

## 1. 目标

统一列表接口分页、过滤、排序行为，避免多租户数据泄露并提升查询可预测性。

## 2. 请求参数

| 参数     | 说明                     | 默认       |
| -------- | ------------------------ | ---------- |
| page     | 页码 (1 基)              | 1          |
| pageSize | 页大小 (1-200)           | 20         |
| sortBy   | 排序字段                 | created_at |
| sortDir  | asc / desc               | desc       |
| filters  | JSON 字符串或多 key 参数 | -          |

## 3. 响应结构

```json
{
  "success": true,
  "data": [...rows],
  "pagination": { "page":1, "pageSize":20, "total": 135, "totalPages": 7 }
}
```

## 4. 多租户安全

- 所有列表查询 where tenant_id & warehouse_id
- 禁止客户端直接传 tenant_id (后端由鉴权上下文注入)

## 5. 过滤实现

- 允许的字段白名单：服务端维护 (防止任意列注入)
- 操作符支持: eq, like, in, between (日期/数值)
- DSL 示例: `filters={"status":{"eq":"completed"},"created_at":{"between":["2025-08-01","2025-08-19"]}}`

## 6. 排序安全

- sortBy 在白名单中否则回退默认
- 组合排序支持: sortBy=created_at,id&sortDir=desc,asc (长度受限)

## 7. 性能优化

- COUNT(\*) 大表可选近似：预聚合表 / 缓存 (高频列表)
- 分页深翻 (page>1000) 提供游标方案 (规划)

## 8. 错误场景

| 场景         | code                   |
| ------------ | ---------------------- |
| 页大小超限   | GENERIC_INVALID_PARAMS |
| 非法过滤字段 | GENERIC_INVALID_PARAMS |
| 非法排序字段 | GENERIC_INVALID_PARAMS |

## 9. 示例请求

`GET /api/wms/split-orders?page=2&pageSize=50&sortBy=created_at&sortDir=desc&filters={"status":{"eq":"processing"}}`

## 10. 自检清单

1. 是否强制租户过滤? (Y/N)
2. 是否字段白名单校验? (Y/N)
3. 是否限制页大小? (Y/N)
4. 是否返回标准 pagination 对象? (Y/N)
5. 是否防止深度分页性能劣化? (Y/N)
