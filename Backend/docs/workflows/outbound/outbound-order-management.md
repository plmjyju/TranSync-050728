---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# Outbound 出库订单管理

## 1. 目标

管理出区/出库订单，从创建、拣选、复核到放行与台账写入 (future outbound ledger)。

## 2. 生命周期 (建议)

created → picking → picked → reviewing → reviewed → dispatched → completed / cancelled

## 3. 核心实体

| 实体              | 描述                             |
| ----------------- | -------------------------------- |
| OutboundOrder     | 主记录 (租户/仓库/状态/出库类型) |
| OutboundOrderItem | 关联 package/pallet + 计划数量   |
| PickingTask       | 拣选子任务 (可以并行)            |
| PickingScan       | 拣选扫描明细 (追踪差异)          |
| ReviewRecord      | 复核记录 (双人校验可选)          |

## 4. 关键规则

- 创建时校验库存可用性 (包裹无活动拆板/冻结)
- Picking 阶段允许部分完成，订单进入 picked 需所有任务完成
- Reviewing 阶段不允许新增/删除明细，仅数量调整 (审计)
- Dispatched 需已获得海关放行 (customs released)

## 5. 并发与锁

- 订单级锁：lock:outbound:<id>
- 包裹锁：后续可升级 Redis set active_outbound:<package_id>
- 拣选任务状态变更统一事务 + 行级 SELECT ... FOR UPDATE

## 6. 审计事件

| 动作         | action                           |
| ------------ | -------------------------------- |
| 创建         | outbound-order-create            |
| 状态迁移     | outbound-order-status-transition |
| 拣选任务创建 | outbound-picking-task-create     |
| 拣选扫描     | outbound-picking-scan            |
| 复核完成     | outbound-order-review-complete   |
| 放行发运     | outbound-order-dispatch          |
| 完成         | outbound-order-complete          |
| 取消         | outbound-order-cancel            |

extra 字段建议：items_expected, items_picked, discrepancies, customs_clearance_ref

## 7. 错误代码前缀 OUTBOUND\_

| Code                         | 场景           |
| ---------------------------- | -------------- |
| OUTBOUND_PACKAGE_UNAVAILABLE | 包裹不可用     |
| OUTBOUND_INVALID_STATUS      | 非法状态跳转   |
| OUTBOUND_PICK_TASK_CONFLICT  | 拣选任务冲突   |
| OUTBOUND_PICK_SCAN_DUP       | 重复扫描       |
| OUTBOUND_REVIEW_DISCREPANCY  | 复核差异未处理 |
| OUTBOUND_CANNOT_DISPATCH     | 不满足发运条件 |

## 8. 指标建议

| Metric                            | 说明         |
| --------------------------------- | ------------ |
| outbound_active_orders            | 活跃订单数   |
| outbound_picking_latency_seconds  | 拣选耗时     |
| outbound_review_discrepancy_total | 复核差异次数 |
| outbound_dispatch_blocked_total   | 发运被阻次数 |

## 9. 台账写入 (未来)

- direction=outbound
- unique_key: out:<outbound_order_id>:<package_id>:<item_id>
- 写入顺序：全部 ledger rows 成功 → 状态标记 completed

## 10. 自检清单

1. 租户/仓库过滤是否完整? (Y/N)
2. 状态迁移是否统一校验? (Y/N)
3. 拣选扫描是否去重幂等? (Y/N)
4. 审计 extra 是否丰富? (Y/N)
5. Ledger 写入是否与完成状态解耦? (Y/N)

## 11. 扩展计划

- 波次 (wave) 拣选
- 任务智能分配 (基于货位热度)
- 语音/手持设备实时反馈
- 出库异常处理 (替代品 / 部分发运)
