---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# Delivery 预约 / 派送单工作流

## 1. 目的

管理客户提货/派送预约，从创建、调度、执行到完成的全链路可视化与合规追踪 (FTZ 出区准备)。

## 2. 生命周期状态 (示例, 代码中常量集中)

created → scheduled → vehicle_assigned → loading → dispatched → completed / cancelled

取消约束：loading 后仅支持异常取消 (需权限 + 原因审计)。

## 3. 核心实体

| 实体               | 关键字段                                                  | 说明                          |
| ------------------ | --------------------------------------------------------- | ----------------------------- |
| DeliveryOrder      | tenant_id, warehouse_id, status, planned_window_start/end | 主体记录                      |
| DeliveryOrderItem  | package_id / pallet_id, quantity                          | 明细绑定库存实体              |
| VehicleAssignment  | vehicle_plate, driver_name, contact                       | 车辆与司机信息                |
| DeliveryCheckpoint | type, timestamp, meta                                     | 过程追踪 (装车开始/完成/出库) |

## 4. 关键约束

- 明细引用的包裹 / 板必须当前处于可出库状态 (合规校验点)
- 不允许跨租户/跨仓引用 (where tenant_id & warehouse_id)
- 预约时间窗口冲突需在创建/修改时检测 (同仓库资源利用率)

## 5. 权限建议 (示例)

- delivery.order.create
- delivery.order.schedule
- delivery.order.assign_vehicle
- delivery.order.load
- delivery.order.dispatch
- delivery.order.complete
- delivery.order.cancel

所有路由模式：authenticate + checkPermission(code)

## 6. 并发控制

- 预约创建使用 Redis 锁 key: lock:delivery:window:<warehouse_id>:<date_bucket>
- 装车阶段对同一 package_id 二次装载使用 unique constraint + 逻辑校验

## 7. 审计点

| 动作     | action                          | extra 示例                          |
| -------- | ------------------------------- | ----------------------------------- |
| 创建     | delivery-order-create           | items_count, window, source_channel |
| 调度     | delivery-order-schedule         | window_update_from/to               |
| 指派车辆 | delivery-order-vehicle-assign   | vehicle_plate, driver_name          |
| 装车开始 | delivery-order-loading-start    | operator_id                         |
| 装车完成 | delivery-order-loading-complete | loaded_items, discrepancies         |
| 发车     | delivery-order-dispatch         | checkpoint_id                       |
| 完成     | delivery-order-complete         | proof_docs, item_settle_count       |
| 取消     | delivery-order-cancel           | reason                              |

## 8. 与台账交互

当前阶段 (示例) 出库方向未上线：

- 仅记录结构/准备审计，不写 outbound ledger
  未来：完成出区放行后写 direction=outbound 链

## 9. 预约窗口冲突检测

伪代码：

```sql
SELECT COUNT(*) FROM delivery_orders
WHERE warehouse_id=? AND tenant_id=?
  AND status IN ('created','scheduled','vehicle_assigned','loading')
  AND (planned_window_start < :end AND planned_window_end > :start)
```

> count > 0 → 冲突

## 10. 数据校验

- 时间窗口 start < end
- 同一 package 不可重复在未完成出库预约中出现 (唯一性校验)
- 若引用 pallet, pallet 当前必须未锁定 (e.g. 正在拆板)

## 11. 错误代码 (示例前缀 DELIVERY\_)

| Code                               | 场景               |
| ---------------------------------- | ------------------ |
| DELIVERY_WINDOW_CONFLICT           | 预约时间冲突       |
| DELIVERY_ITEM_NOT_AVAILABLE        | 包裹或板状态不可用 |
| DELIVERY_INVALID_STATUS_TRANSITION | 非法状态迁移       |
| DELIVERY_VEHICLE_ALREADY_ASSIGNED  | 重复指派           |
| DELIVERY_LOAD_QUANTITY_MISMATCH    | 装车数量不符       |
| DELIVERY_CANNOT_CANCEL             | 当前状态不可取消   |

## 12. 指标 & 监控 (建议)

| Metric                         | 说明                          |
| ------------------------------ | ----------------------------- |
| delivery_active_count          | 活跃预约数 (label: warehouse) |
| delivery_on_time_rate          | 准点率                        |
| delivery_load_duration_seconds | 装车耗时                      |
| delivery_cancel_ratio          | 取消率                        |

## 13. 扩展路线

- 出区 (outbound) ledger 对接
- 车辆实时定位 Webhook / GPS 集成
- 预约 SLA 违约告警
- 装车扫描与 package 状态联动

## 14. 自检清单

1. 是否校验租户/仓库隔离? (Y/N)
2. 是否所有写操作在事务中? (Y/N)
3. 是否有必要的审计记录? (Y/N)
4. 是否避免重复预约 / 重复装车? (Y/N)
5. 错误代码是否规范? (Y/N)
