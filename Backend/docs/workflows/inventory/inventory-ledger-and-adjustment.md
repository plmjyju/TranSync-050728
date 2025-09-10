---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 库存台账与调整 (Inventory Ledger & Adjustment)

## 1. 目标

实现 FTZ 库存全链条 (inbound → internal_move → future outbound/adjustment) 的可验证追踪；为差异、盘点、纠错提供不可篡改基础。

## 2. 方向 (direction)

| direction         | 说明                   | 影响数量 |
| ----------------- | ---------------------- | -------- |
| inbound           | 入区登记               | +        |
| internal_move     | 结构移动 (pallet/位置) | 0        |
| outbound (规划)   | 出区 / 出库            | -        |
| adjustment (规划) | 盘点调整               | +/-      |
| reversal (规划)   | 冲正                   | 反向     |

## 3. 数据字段 (补充)

| 字段                     | 说明                                                 |
| ------------------------ | ---------------------------------------------------- |
| id                       | 主键                                                 |
| tenant_id / warehouse_id | 隔离                                                 |
| direction                | 链分组键                                             |
| unique_key               | 幂等去重                                             |
| prev_hash                | 前一条哈希                                           |
| hash                     | 当前哈希                                             |
| payload                  | JSON 业务数据 (package_id, pallet_id, action_ref 等) |
| created_at               | 时间                                                 |

## 4. 哈希规则

`hash = SHA256(prev_hash + JSON.stringify(payload_without_prev_hash))`

- 不同 direction 互不串链
- 空 prev_hash 代表链起点 (创世节点)

## 5. Internal Move 示例 payload

```json
{
  "package_id": 1001,
  "from_pallet_id": 55,
  "to_pallet_id": 89,
  "split_order_id": 777,
  "actor_user_id": 12,
  "moved_at": 1734659651000
}
```

## 6. 查询模式

- 最新节点: `ORDER BY id DESC LIMIT 1` (按自增 id 可代表时间序)
- 链验证: 取 direction 链全量遍历重算 (夜间任务)

## 7. 调整 (adjustment) 规划

- 触发条件：盘点差异 / 损耗登记
- 规则：新增 adjustment 行 (不修改历史 inbound)
- 幂等 unique_key: `adj:<inventory_check_id>:<package_id>:<delta>`

## 8. 冲正 (reversal) 规划

- 使用 direction=reversal, payload.reversal_of=<original_ledger_id>
- 不直接删除/修改原记录

## 9. 审计联动

- 每次批量写 ledger 返回 written/ skipped 数，审计 extra: ledger_written_count

## 10. 错误代码 (LEDGER* / ADJUST* / REVERSAL\_)

| Code                        | 场景               |
| --------------------------- | ------------------ |
| LEDGER_UNIQUE_KEY_DUP       | 重复 unique_key    |
| LEDGER_CHAIN_BROKEN         | 哈希不连续         |
| LEDGER_DIRECTION_INVALID    | 非法 direction     |
| ADJUST_INVALID_DELTA        | 调整数量不合法     |
| REVERSAL_TARGET_NOT_FOUND   | 原记录不存在       |
| REVERSAL_DIRECTION_MISMATCH | 目标方向不允许冲正 |

## 11. 性能优化

- 批量预构造 unique_key 集合 → 一次查询已存在 keys
- 使用 Map<unique_key, row> 判重 O(1)
- 分方向分页扫描写缓存 (验证任务)

## 12. 自检清单

1. 是否正确使用 direction 分链? (Y/N)
2. 是否不修改历史行? (Y/N)
3. 是否使用 unique_key 防重复? (Y/N)
4. 是否审计 ledger 写入计数? (Y/N)
5. 是否在夜间任务做链校验? (Y/N)

## 13. 扩展计划

- 位置移动 (location_move) 细分 direction 或统一 internal_move payload.location_from/to
- Ledger -> Kafka 事件投影
- 基于 ledger 生成库存快照表 (投影/物化视图)
