---
status: extended
last-reviewed: 2025-08-19
owner: backend
---

# Outbox 模式与事件分发

## 1. 目标

保障关键数据变更 (拆板完成、库存移动、出库/预约状态) 的可靠异步分发，避免跨系统分布式事务，同时提供失败补偿与可追踪性。

## 2. Outbox 模式概述

- 写业务数据与 outbox 记录同一 DB 事务
- 后台任务轮询 pending outbox 行，发布到下游 (HTTP/Webhook/消息队列)
- 发布成功后标记 completed

## 3. 结构示例

| 字段           | 说明                                                         |
| -------------- | ------------------------------------------------------------ |
| id             | 主键                                                         |
| aggregate_type | 实体类型 (SplitOrder / DeliveryOrder)                        |
| aggregate_id   | 实体 ID                                                      |
| event_type     | 领域事件 (split.finalized)                                   |
| payload        | JSON 序列化负载                                              |
| status         | pending / processing / completed / failed / failed_permanent |
| attempts       | 尝试次数                                                     |
| next_retry_at  | 下次重试时间                                                 |
| last_error     | 最后一次错误摘要                                             |

## 4. 事件命名规范

<domain>.<action>[.<phase>] 例：

- split.finalized
- delivery.dispatched
- outbound.reviewed

## 5. 事务集成

```text
BEGIN;
UPDATE split_orders SET status='completed' WHERE id=?;
INSERT INTO outbox (...);
COMMIT;
```

确保事件与状态变更原子一致。

## 6. 发布适配器

| 方式      | 适配器               | 说明                    |
| --------- | -------------------- | ----------------------- |
| Webhook   | HttpWebhookPublisher | POST JSON + 重试        |
| MQ (规划) | KafkaPublisher       | 同步写主题 (异步 flush) |
| 内部订阅  | LocalBusPublisher    | 进程内回调 (降耦期间)   |

## 7. 重试策略

指数回退 base=30s；attempt>5 → failed_permanent + 审计 action=outbox-failed-permanent

## 8. 幂等

- 下游需接受重复事件：提供 event_id (outbox.id) + 自身去重表
- Webhook 签名包含 event_id 防篡改

## 9. 审计联动

发送失败与永久失败写审计 (action=outbox-send-failed / outbox-failed-permanent) extra: attempts, last_error

## 10. 监控指标

| Metric                        | 描述         |
| ----------------------------- | ------------ |
| outbox_pending_total          | 待处理数量   |
| outbox_retry_total            | 重试次数     |
| outbox_failed_permanent_total | 永久失败累计 |
| outbox_dispatch_latency_ms    | 调用耗时     |

## 11. 去重缓存 (可选)

Redis set: outbox:dispatched:<id> TTL=24h 防止偶发重复发送 (应用层 bug)。

## 12. 升级路径

- 引入 Kafka 后：轮询改为事务内写本地 + Debezium CDC 抓取，移除主动轮询
- 增加事件版本字段 event_version，兼容负载结构演进

## 13. 自检清单

1. 业务更新与 outbox 是否同事务? (Y/N)
2. 失败是否有重试 + 上限? (Y/N)
3. 是否记录审计? (Y/N)
4. 是否可水平扩展消费者 (基于乐观锁)? (Y/N)
5. 下游是否具备幂等去重? (Y/N)

## 14. 扩展计划

- 死信队列可视化重放
- 事件追踪链路 (trace id 注入)
- 事件契约 (schema registry)
