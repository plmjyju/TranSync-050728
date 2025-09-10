---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# FTZ 合规与多租户隔离

## 1. 目标

在保税/自贸区监管要求下保证：数据隔离、可追溯、不可抵赖、操作最小授权、快速稽核。

## 2. 合规关键能力

| 能力        | 实现                              | 说明                                                             |
| ----------- | --------------------------------- | ---------------------------------------------------------------- |
| 数据隔离    | tenant_id + warehouse_id 双键过滤 | 防交叉读取/聚合泄漏                                              |
| 审计        | writeAudit 结构化记录             | 包含 action / before / after / extra / user / tenant / warehouse |
| 可验证链    | FtzInventoryLedger 哈希链         | prev_hash + hash 构成不可抵赖链                                  |
| 结构追踪    | internal_move ledger              | 包裹结构移动全量链路                                             |
| 幂等 & 重放 | Redis 幂等哈希 + Outbox           | 确保失败恢复不重复业务语义                                       |
| 权限最小化  | RBAC + checkPermission            | 不同模块按粒度授权                                               |

## 3. 多租户策略

- 软隔离层：逻辑字段过滤 (tenant_id / warehouse_id)
- 代码规范：所有模型查询必须显式 where 附加；禁止裸 `findByPk` 不校验租户（若使用需补充条件）
- 审计扩展：审计记录携带租户/仓库，避免交叉统计

## 4. Ledger 合规点

| 方向              | 说明                     | unique_key 规则                                 |
| ----------------- | ------------------------ | ----------------------------------------------- |
| inbound           | 入仓生成库存初始         | in:<pallet_id>:<package_id>:<item_id>           |
| internal_move     | 结构位置变更，不影响数量 | move:<split_order_id>:<package_id>              |
| (future outbound) | 出区/出库                | out:<delivery_id>:<package_id>:<item_id> (规划) |

哈希串接：`hash = SHA256(prev_hash + json(payload_without_prev_hash))`，方向独立链，避免篡改串扰。

## 5. 审计覆盖矩阵 (节选)

| 场景          | Action                               | Extra 核心字段                                          |
| ------------- | ------------------------------------ | ------------------------------------------------------- |
| 拆板 finalize | split-order-finalize                 | idempotency_hash / ledger_written_count / pallets_input |
| finalize 重试 | split-order-finalize-retry-result    | reason / retried / missing\_\*                          |
| outbox 处理   | ledger-outbox-processed              | written / attempts                                      |
| stuck 恢复    | split-order-finalize-stuck-recovered | duration / requeued                                     |
| 扫描修复      | split-order-scan-seq-gap-fixed       | gap_start / gap_end                                     |

## 6. 幂等与复制合规

- Finalize 幂等：相同规范哈希重复调用 → 不重复 ledger
- Outbox 重放：unique_key + 版本化 payload 保证同一语义不重复落账
- Retry Worker：仅补状态/哈希，不重复结构写入

## 7. 数据保留与追溯

- Ledger 永不更新，仅追加
- Reversal (规划) 将通过新方向并包含 `reversal_of` 指针
- Audit 与 Ledger 搭配：Audit 提供语义上下文，Ledger 提供结构与链式证明

## 8. 安全扩展计划

- /metrics 访问控制 (IP allowlist 或内部网关)
- Outbox backlog 超阈值报警
- Ledger 链校验周期性任务 (重算 hash 校验完整性)

## 9. 自检清单 (修改前)

1. 是否新增跨租户查询风险? (Y/N)
2. 是否所有写操作包含审计? (Y/N)
3. 是否引入新的台账方向? 若是需 migration + 规范文档更新
4. 是否保持幂等语义 (finalize / outbox)? (Y/N)
5. 是否引入高风险长事务? (评估锁范围)
