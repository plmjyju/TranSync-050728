---
status: core
last-reviewed: 2025-08-19
owner: operations
---

# 后台任务与恢复机制

## 1. 目标

保障拆板 Finalize、Ledger Outbox、卡死恢复等关键异步流程的可持续运行、可观测与可修复。

## 2. 任务分类

| 任务                 | 描述                                   | 周期   |
| -------------------- | -------------------------------------- | ------ |
| processLedgerOutbox  | 批处理台账 outbox 事件                 | 每 10s |
| finalizeRetryWorker  | 重试 finalize 失败步骤 (不重复 ledger) | 每 30s |
| recoverFinalizeStuck | 检测 finalize_in_progress 超时重置     | 每 1m  |
| metricsCollect       | 采集业务/系统指标                      | 每 15s |
| auditArchive (规划)  | 审计归档/分层存储                      | 每日   |

## 3. 调度与幂等

- 使用 Redis 分布式锁: `lock:job:<name>` 防止多实例重复执行
- 每个任务写心跳 (Redis key job:heartbeat:<name>) 监控侧报警

## 4. 失败与回退

| 场景                   | 策略                            |
| ---------------------- | ------------------------------- |
| Ledger Outbox 单条失败 | attempts++ 指数退避，下次重试   |
| Finalize 重试仍错误    | 更新 last_finalize_error + 审计 |
| Stuck 重复恢复         | 记录恢复次数，超过阈值报警      |

## 5. 指数退避公式

`delay = base * 2^(attempt-1)` 上限 cap 30m

## 6. 监控指标

| Metric                        | 说明              |
| ----------------------------- | ----------------- |
| job_runs_total{job}           | 运行次数          |
| job_failures_total{job}       | 失败次数          |
| job_duration_seconds{job}     | 运行耗时分布      |
| job_stuck_detected_total      | 检测到卡死次数    |
| finalize_retry_attempts_total | Finalize 重试次数 |

## 7. 日志 & 审计

- 每次恢复动作 (stuck → reset) 写审计 action=split-order-finalize-stuck-recovered
- 错误堆栈记录结构化字段 code, job, attempt

## 8. 配置 (config/environment.js)

| Key                              | 作用              |
| -------------------------------- | ----------------- |
| JOB_OUTBOX_BATCH_SIZE            | Outbox 批处理条数 |
| JOB_FINALIZE_RETRY_LIMIT         | Finalize 最大重试 |
| JOB_FINALIZE_STUCK_THRESHOLD_SEC | 卡死阈值          |
| METRICS_ENABLED                  | 是否启用指标      |

## 9. 手动恢复指南

1. 检查 split.finalize_in_progress=true 且更新时间 > 阈值
2. 确认无实际 DB 事务悬挂 (SHOW PROCESSLIST)
3. 运行恢复任务或人工重置 flag 并记录审计
4. 重新触发 finalizeRetryWorker

## 10. 自检清单

1. 任务是否有分布式锁? (Y/N)
2. 是否写心跳? (Y/N)
3. 失败是否限制最大重试? (Y/N)
4. 是否有监控指标? (Y/N)
5. 恢复动作是否审计? (Y/N)

## 11. 扩展计划

- Outbox DLQ 可视化面板
- 任务统一调度框架 (BullMQ / Agenda) 替换手写循环
- 支持多区域 (multi-region) 锁降级策略
