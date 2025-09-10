---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# Pallet 管理与结构操作

## 1. 目标

提供对原始航空 PMC 板与内部重组 / 合并 / 拆分后板 (repacked / merged) 的全生命周期管理，确保包裹结构关系可追踪、审计完整，并与哈希链 internal_move 台账协同。

## 2. Pallet 类型

| source_type | 描述                  | 备注                  |
| ----------- | --------------------- | --------------------- |
| original    | 原始入库 PMC 或标准板 | 入库时创建            |
| repacked    | 拆板重组产生新板      | Split Finalize 创建   |
| merged      | 多板合并产生的新板    | (规划) Merge 操作产生 |

## 3. 核心字段

| 字段                     | 说明                       |
| ------------------------ | -------------------------- |
| id                       | 主键                       |
| tenant_id / warehouse_id | 租户/仓库隔离必填          |
| source_type              | Pallet 来源类型            |
| origin_pmc_pallet_id     | 若从原始 PMC 拆分保留引用  |
| origin_awb               | 原始运单号 (追溯)          |
| box_count                | 当前箱/包裹计数缓存 (冗余) |
| status (预留)            | active / locked / archived |

## 4. 操作矩阵

| 操作              | 入口                | 事务 | 审计                  | 台账                          |
| ----------------- | ------------------- | ---- | --------------------- | ----------------------------- |
| 创建原始板        | Inbound 入库        | 是   | pallet-create         | inbound ledger 已在包裹级写入 |
| 拆板扫描          | Split Scan          | 是   | split-scan-pallet-ref | 否                            |
| Finalize 生成新板 | Split Finalize      | 是   | split-order-finalize  | internal_move (包裹级)        |
| 合并 (规划)       | Merge API           | 是   | pallet-merge          | internal_move                 |
| 锁定 (防并发)     | Lock API / 拆板开始 | 是   | pallet-lock           | 否                            |
| 解锁              | 解锁 API / 完成     | 是   | pallet-unlock         | 否                            |

## 5. box_count 维护

- 仅在结构变更 (包裹迁移) 批量重算 `UPDATE pallets SET box_count = (SELECT COUNT(*) FROM packages WHERE pallet_id=...)`
- Split Finalize: 使用已知扫描数量直接累加，避免 COUNT N+1

## 6. 并发控制

- Redis 锁: `lock:pallet:<id>` 用于防止同时拆板与合并
- 结构写操作必须在 DB 事务下 + 行级 SELECT ... FOR UPDATE (后续可补)

## 7. 审计 extra 建议

| 场景          | extra 示例键                       |
| ------------- | ---------------------------------- |
| 创建          | origin_awb, source_type            |
| Finalize 新板 | from_split_order_id, package_count |
| 合并          | merged_from_ids, total_packages    |
| 锁定          | reason, lock_ttl                   |
| 解锁          | reason, duration                   |

## 8. 与 Split 协同

- Split Finalize 只在包裹层写 internal_move ledger；板本身无 ledger 行
- 新板创建后写审计，包含 pallet_mapping (旧临时板 → 新板 ID)

## 9. 错误代码 (PALLET\_\*)

| Code                             | 场景             |
| -------------------------------- | ---------------- |
| PALLET_NOT_FOUND                 | Pallet 不存在    |
| PALLET_LOCKED                    | Pallet 已锁定    |
| PALLET_MERGE_CONFLICT            | 合并源冲突       |
| PALLET_INVALID_SOURCE_TYPE       | 非法 source_type |
| PALLET_OPERATION_TENANT_MISMATCH | 跨租户操作       |

## 10. 指标建议

| Metric                        | 描述           |
| ----------------------------- | -------------- |
| pallet_active_total           | 活跃板数量     |
| pallet_locked_total           | 锁定板数量     |
| pallet_merge_latency_seconds  | 合并耗时       |
| pallet_finalize_created_total | 拆板产生新板数 |

## 11. 数据一致性策略

- box_count 作为冗余：出现不一致 → 夜间任务重算
- 定期校验：`SELECT pallet_id, COUNT(*) actual FROM packages GROUP BY pallet_id HAVING actual != (SELECT box_count FROM pallets p WHERE p.id=packages.pallet_id)`

## 12. 自检清单

1. 是否包含 tenant_id / warehouse_id 过滤? (Y/N)
2. 写操作是否在事务中? (Y/N)
3. 是否写入审计? (Y/N)
4. 是否避免重复结构写 (幂等)? (Y/N)
5. 是否未直接修改台账历史? (Y/N)

## 13. 扩展计划

- Pallet 状态机 (active→locked→archived)
- 温控 / 安全标签字段
- 位置 (storage_location_id) 与移动路径记录
