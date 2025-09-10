---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 系统架构总览

## 1. 目标与定位

TranSync 面向保税 / FTZ 多租户多仓库场景，提供入库、库存结构化（板/托/包裹）、拆板重组 (Split)、提货/出库、内部移动 (internal_move) 与审计可追溯、合规化的操作保障。核心设计聚焦：多租户隔离、权限最小化、哈希链不可抵赖、并发与幂等安全、可恢复的最终一致性。

## 2. 逻辑模块

| 模块            | 前缀        | 说明                                |
| --------------- | ----------- | ----------------------------------- |
| OMP 运营管理    | /api/omp    | 角色/权限/全局配置、跨仓运营视图    |
| WMS 仓库执行    | /api/wms    | 入库、分板、板操作、库存、出库执行  |
| Agent 货代      | /api/agent  | 预报、HAWB/MAWB、客户管理、包裹申报 |
| Client 终端客户 | /api/client | 包裹跟踪、预报、状态查询            |
| Common 公共     | /api/common | 共享字典、操作需求、税类等          |

动态装载：`utils/createClientAppRouter.js` 依据 clientType 挂载子路由，注入鉴权与权限策略。

## 3. 技术栈

- Runtime: Node.js (ESM)
- Web: Express 5
- 数据层: Sequelize + MySQL
- 缓存 & 并发控制: Redis (分布式锁 / 计数 / 幂等哈希 / 序列修复)
- 监控: Prometheus /metrics 暴露
- 安全: JWT + 细粒度权限表 (Permission / RolePermission)
- 审计: 异步队列写入 (audit queue) + 结构化字段

## 4. 数据核心模型 (精简)

| 模型                         | 关键字段                                         | 说明                  |
| ---------------------------- | ------------------------------------------------ | --------------------- |
| User / Role / Permission     | role_id, permissions                             | RBAC 授权与操作隔离   |
| SplitOrder (+ temps + scans) | status, finalize flags, tenant_id, warehouse_id  | 拆板重组流程主线      |
| Pallet / Package             | source_type, pallet_id, operation_requirement_id | 库内实体与追踪单元    |
| FtzInventoryLedger           | direction, hash, prev_hash, unique_key           | 方向隔离的哈希链台账  |
| FtzInventoryLedgerOutbox     | payload_version, status, attempts                | Ledger 失败补偿与重试 |

## 5. 并发与幂等

| 场景           | 手段                                                   | 说明                          |
| -------------- | ------------------------------------------------------ | ----------------------------- |
| Split finalize | Redis 分布式锁 + finalize_in_progress + Redis 幂等哈希 | 保证单次语义/可重放恢复       |
| 扫描序列       | Redis 递增键 + 序列空洞自修复                          | 避免 DB COUNT 竞争 + 顺序一致 |
| Ledger 写入    | unique_key + 预查询 (批量)                             | 防重复写入 / 幂等校验         |
| Outbox 重试    | 指数退避 + MAX_ATTEMPTS + deadletter 审计              | 降低瞬时失败放大风险          |

## 6. 多租户与仓库隔离

- 所有业务数据表逐步加入 `tenant_id` + `warehouse_id` (已在 SplitOrder / Pallet / Package / Ledger 实现)
- 查询必须带双层过滤 (where tenant_id AND warehouse_id)
- 审计与台账额外记录租户+仓库，避免跨租户聚合泄漏

## 7. 审计策略

- 所有状态跃迁 / 结构变化 / 失败恢复：writeAudit()
- Payload 体积控制：大数组截断并标记 `*_truncated`
- Finalize 附加: pallets_input, pallet_mapping, package_moves_total, idempotency_hash, ledger_written_count

## 8. 哈希链台账 (概述)

- 方向隔离：inbound / internal_move (未来 outbound / adjustment / reversal)
- 计算: `hash = SHA256(prev_hash + JSON(payload_without_prev_hash))`
- 不可变：禁止更新历史行，必要反向通过新方向 (reversal) 指针实现

## 9. 恢复与自愈

| 组件                 | 机制                                                  |
| -------------------- | ----------------------------------------------------- |
| finalizeRetryWorker  | 读取重试队列，只补状态 / 幂等哈希及完成标记           |
| processLedgerOutbox  | 重放 ledger 未写成功 payload (版本化)，写入成功即关闭 |
| recoverFinalizeStuck | 定时扫描 finalize_in_progress 超时单并重置/排队重试   |
| 序列 gap 修复        | 扫描时检测断档并审计补偿                              |

## 10. 监控

Prometheus 指标：

- split_scan_total{result}
- split_finalize_total{result}
- split_finalize_duration_seconds (Histogram)
- ledger_outbox_events_total{event}
- 计划：ledger_outbox_pending Gauge 定时刷新

## 11. 错误码规范

前缀 + 场景：`SPLIT_FINALIZE_*`, `SPLIT_SCAN_*`, `LEDGER_OUTBOX_*`, `AUTH_*`。失败返回统一 `{ success:false, code, message, ...context }`。

## 12. 部署/迁移原则

1. 严禁直接使用 process.env，统一 `config/environment.js`
2. 新增字段需 migration + backfill + 索引
3. ENUM 变更仅通过 migration
4. 顺序：DB 迁移 → 代码部署 (向后兼容) → 功能开关启用

## 13. 后续路线 (节选)

- outbound & adjustment ledger 方向 + reversal 机制
- finalize stuck 自动重试升级策略 (指数+上限)
- Outbox 指标 gauge 与 backlog SLA 报警
- 全局 split_order_active_id 加速排他校验

## 14. 术语引用

详见 `../glossary.md`。
