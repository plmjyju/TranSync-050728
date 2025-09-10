---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 指标与可观测性

## 1. 目标

统一采集 API 性能、业务流程 (拆板 / 出库 / 预约)、后台任务与资源利用度指标，实现快速定位与趋势分析。

## 2. 组件

| 组件                 | 作用         |
| -------------------- | ------------ |
| Prometheus           | 指标抓取     |
| Grafana              | 可视化与告警 |
| Loki / ELK (规划)    | 日志聚合     |
| OpenTelemetry (规划) | Trace 链路   |

## 3. 指标分类

| 类别     | 示例                            |
| -------- | ------------------------------- |
| API 延迟 | api_request_duration_seconds    |
| 业务延迟 | split_finalize_duration_seconds |
| 任务执行 | job_duration_seconds{job}       |
| 台账健康 | ledger_chain_gap_total          |
| 锁竞争   | redis_lock_wait_ms              |
| 错误比率 | api_error_total{code}           |

## 4. 采集模式

- 中间件埋点记录开始时间 → 响应后 Observe 直方图
- 后台任务包装器记录耗时、成功/失败计数
- Ledger 差异检测任务写 gap 指标

## 5. 标签维度 (避免过度基数)

| 维度      | 说明                 |
| --------- | -------------------- |
| method    | HTTP 方法            |
| route     | 归一化路由 (不含 ID) |
| code      | 业务错误代码         |
| warehouse | 仓库 ID (低基数)     |
| job       | 后台任务名           |

限制：不使用 package_id / pallet_id 作为标签。

## 6. 告警示例

| 规则              | 条件                                             |
| ----------------- | ------------------------------------------------ |
| 高延迟            | api_request_duration_seconds_p95 > 500ms 持续 5m |
| Finalize 失败激增 | increase(split_finalize_errors_total[5m]) > 10   |
| Outbox 堆积       | ledger_outbox_lag_seconds > 120                  |
| 链断裂            | increase(ledger_chain_gap_total[10m]) > 0        |
| 锁竞争高          | redis_lock_wait_ms_p95 > 200ms                   |

## 7. 日志关联 (规划)

- 在响应头注入 `x-trace-id`
- 日志行包含 traceId 便于追踪

## 8. 追踪 (未来)

- OpenTelemetry SDK 接入 Express + Sequelize instrumentation
- 关键 span：DB (Finalize 聚合查询)、Redis 锁获取、Ledger 批写

## 9. 隐私 & 成本

- 不记录敏感字段 (JWT, secret)
- 归档：超过 30 天低频查询指标降精度存储

## 10. 自检清单

1. 指标是否去重 (避免重复 Observe)? (Y/N)
2. 标签基数是否可控? (Y/N)
3. 是否覆盖关键业务路径? (Y/N)
4. 告警阈值是否经过基线验证? (Y/N)
5. 是否避免敏感泄露? (Y/N)

## 11. 扩展计划

- 业务 KPI 仪表板 (SLA, on-time-rate)
- Adaptive sampling (Trace)
- Anomaly detection (ML) 对关键延迟
