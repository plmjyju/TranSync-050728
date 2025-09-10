---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 审计日志与哈希链台账

## 1. 目标

确保所有关键业务行为可追溯 (who / when / what / before / after)，并通过哈希链防篡改验证库存结构与流转事件。

## 2. 审计结构

字段 (示例)：

- module: "warehouse"
- entityType: "SplitOrder"
- entityId: 123
- action: "split-order-finalize"
- user: { id, username }
- before / after: 状态快照 (可为空)
- extra: 结构化上下文 (如 pallet_mapping, idempotency_hash)

截断策略：大数组只保留前 N (500) 条并加 `*_truncated: true`。

## 3. 写入策略

- 同步路径只做轻量排队，后台消费者批量落库 (降低 API 延迟)
- 失败队列 (deadletter) 用于人工回查

## 4. 台账 (FtzInventoryLedger)

| 字段                     | 说明                                                 |
| ------------------------ | ---------------------------------------------------- |
| direction                | 业务方向 (inbound / internal_move / future outbound) |
| tenant_id / warehouse_id | 租户 / 仓库隔离                                      |
| unique_key               | 幂等键，避免重复写                                   |
| prev_hash                | 前一条同方向链记录 hash                              |
| hash                     | 当前记录哈希 (prev_hash + payload)                   |
| payload (JSON)           | 业务上下文 (包裹、板、来源操作等)                    |

## 5. internal_move 特性

- 不改变数量，仅反映结构 (板/包裹关联变化)
- unique_key: move:<split_order_id>:<package_id> -> 确保同一拆板过程一次性写入

## 6. 哈希计算

```text
hash = SHA256(prev_hash + JSON.stringify(payload_without_prev_hash))
```

- prev_hash 为空表示链起点 (创世节点)
- 不同 direction 拥有独立链，互不串扰

## 7. Outbox 补偿

| 字段            | 说明                                                         |
| --------------- | ------------------------------------------------------------ |
| status          | pending / processing / completed / failed / failed_permanent |
| attempts        | 已尝试次数 (指数回退)                                        |
| payload_version | 结构版本 (含 items snapshot 支持重建)                        |

失败流程：pending → processing → (写入失败) → failed (回退 next_retry_at) → 超出阈值 → failed_permanent (审计)。

## 8. 重试 & 恢复

- processLedgerOutbox: 轮询 pending 按计划执行
- finalizeRetryWorker: 仅补 finalize 状态与哈希，不重复 ledger
- recoverFinalizeStuck: 复位卡死 finalize 标志 + 触发重试

## 9. 审计事件样例

| 场景            | action                               |
| --------------- | ------------------------------------ |
| Finalize 成功   | split-order-finalize                 |
| Finalize 重试   | split-order-finalize-retry-result    |
| 序列修复        | split-order-scan-seq-gap-fixed       |
| Outbox 写入失败 | ledger-outbox-failed                 |
| Outbox 重试成功 | ledger-outbox-processed              |
| Stuck 恢复      | split-order-finalize-stuck-recovered |

## 10. 验证与巡检

- 周期性重算链 (可夜间任务) 比对存储 hash → 异常写审计
- 统计链高度与 gap → 发现方向混用立即报警

## 11. 常见错误与防御

| 问题         | 防御                                             |
| ------------ | ------------------------------------------------ |
| 漏写审计     | 变更提交前使用审计检查清单                       |
| Ledger 重复  | 严格使用 unique_key + 预检集合                   |
| 修改历史行   | 严禁 UPDATE / DELETE ledger，使用新方向 reversal |
| 缺少租户过滤 | 代码 review 强制 where tenant_id/warehouse_id    |

## 12. 扩展计划

- outbound / adjustment / reversal 方向实现
- 审计数据归档策略 (冷热分层)
- 链一致性主动巡检指标输出 Prometheus

## 13. 自检清单

1. 是否写入审计? (Y/N)
2. 是否包含 tenant_id / warehouse_id? (Y/N)
3. Ledger 是否生成正确 direction 并独立链? (Y/N)
4. 是否避免重复 unique_key? (Y/N)
5. 大数组是否截断? (Y/N)
