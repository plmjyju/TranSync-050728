---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 术语表 (Glossary)

| 术语                  | 说明                        | 备注                                  |
| --------------------- | --------------------------- | ------------------------------------- |
| Tenant (租户)         | 多租户逻辑隔离主体          | 通过 tenant_id 区分                   |
| Warehouse (仓库)      | 物理 / 逻辑仓库节点         | warehouse_id                          |
| Package               | 单个包裹单位 (具唯一追踪码) | 关联 operation_requirement_id         |
| Pallet                | 板 (原始 / 重组 / 合并)     | source_type: original/repacked/merged |
| SplitOrder            | 拆板/重组操作单             | 状态机 created→...→completed          |
| Outbox                | 可靠事件暂存表/队列         | 异步补偿/重试机制                     |
| FtzInventoryLedger    | FTZ 库存哈希链台账          | direction 分链                        |
| Direction             | 台账方向分类                | inbound/internal_move/...             |
| Internal Move         | 结构移动 (不变更数量)       | 记录包裹与板关系变更                  |
| Finalize              | 拆板最终提交阶段            | 创建新板+迁移包裹+写 ledger           |
| Idempotency Hash      | 幂等哈希 (SHA256)           | 规格规范化后计算                      |
| Redis Lock            | 分布式互斥锁                | 键模式 lock:<domain>:<id>             |
| Unique Key            | 台账幂等唯一键              | direction-specific 构造               |
| Audit Log             | 审计日志                    | before/after/extra 结构化             |
| Picking Task          | 出库拣选任务单元            | 并行执行                              |
| Delivery Order        | 预约/派送单                 | 出区准备                              |
| Vehicle Assignment    | 车辆指派记录                | 车牌/司机                             |
| Checkpoint            | 过程节点                    | 时间戳+类型                           |
| Ledger Chain          | 哈希链序列                  | prev_hash + hash                      |
| Reversal              | 逆向更正方向                | 不直接修改历史                        |
| Recovery Job          | 恢复任务                    | 修复 stuck finalize 等                |
| Sequence Gap          | 序列缺口                    | 需补偿或审计解释                      |
| SLA                   | 服务级别协议                | 指标合规性                            |
| Wave Picking          | 波次拣选                    | 出库优化策略                          |
| Clearance (放行)      | 海关批准出区                | 前置条件                              |
| HAWB / MAWB           | 分/主运单                   | 货代场景                              |
| PMC Pallet            | 航空 PMC 板                 | 原始承载体                            |
| Operation Requirement | 操作需求配置                | 驱动拆板期望                          |
