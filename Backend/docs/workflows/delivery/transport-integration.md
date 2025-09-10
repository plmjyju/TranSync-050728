---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 运输与外部系统集成

## 1. 场景

对接第三方运输管理系统 (TMS)、海关放行查询、GPS/车载终端，实现预约 → 执行 → 出区全流程信息同步。

## 2. 集成方式

| 类型     | 方式      | 说明                           |
| -------- | --------- | ------------------------------ |
| 主动推送 | Webhook   | 状态变化实时通知外部 TMS       |
| 被动拉取 | REST Pull | 定时拉取车辆实时位置、放行状态 |
| 批量文件 | SFTP CSV  | 对接海关批量放行清单 (离线)    |

## 3. 事件 Webhook 模型 (示例)

```json
{
  "event": "delivery.dispatched",
  "ts": 1734659200000,
  "tenant_id": 11,
  "warehouse_id": 3,
  "data": {
    "delivery_order_id": 901,
    "vehicle_plate": "沪A12345",
    "packages": ["PKG001", "PKG002"],
    "checkpoint_id": 5678
  },
  "signature": "sha256=..."
}
```

签名：HMAC-SHA256(secret, rawBody) → header: X-Signature

## 4. 安全

- 双向：入口校验 IP 白名单 + 签名；出口含重放窗口 (timestamp ±300s)
- 重放防御：Redis key replay:webhook:<signature> TTL=300s

## 5. 重试策略

- 失败指数退避：1m / 5m / 15m / 1h / 6h (上限尝试 N=5)
- 状态保留：outbox + attempts + last_error

## 6. 幂等

- 外部调用必须提供 Idempotency-Key (建议)
- 系统内部 Webhook 发送记录 request_id；对方回调携带以避免重复处理

## 7. GPS / 位置集成

Pull 周期：60s (可配置)
标准化字段：lat, lon, speed, heading, captured_at
异常：速度=0 超过阈值 → 触发潜在延误告警 (Prometheus 告警规则)

## 8. 海关放行状态

- 定时任务 poll: customs_clearance_status
- 状态映射：pending → reviewing → released / rejected
- DeliveryOrder 出库前需 released

## 9. 错误代码前缀 TRANSPORT\_

| Code                             | 场景           |
| -------------------------------- | -------------- |
| TRANSPORT_WEBHOOK_SIGN_INVALID   | 签名无效       |
| TRANSPORT_WEBHOOK_REPLAY         | 重放攻击拦截   |
| TRANSPORT_GPS_FETCH_FAILED       | 位置拉取失败   |
| TRANSPORT_CLEARANCE_NOT_RELEASED | 未放行禁止出库 |
| TRANSPORT_OUTBOX_MAX_RETRY       | 超过最大重试   |

## 10. 监控指标

| Metric                          | 说明           |
| ------------------------------- | -------------- |
| transport_webhook_success_total | Webhook 成功数 |
| transport_webhook_failure_total | Webhook 失败数 |
| transport_webhook_latency_ms    | 发送耗时直方图 |
| transport_gps_pull_latency_ms   | GPS 拉取耗时   |
| transport_gps_stale_positions   | 过期位置数量   |

## 11. 配置建议 (config/environment.js)

| Key                      | 说明             |
| ------------------------ | ---------------- |
| TMS_WEBHOOK_ENDPOINT     | 对方接收地址     |
| TMS_WEBHOOK_SECRET       | 签名密钥         |
| GPS_POLL_INTERVAL_MS     | 位置拉取周期     |
| CUSTOMS_POLL_INTERVAL_MS | 放行状态轮询周期 |

## 12. 测试要点

- 模拟签名错误 / 重放
- Webhook 异常 HTTP 500 → 验证重试调度
- GPS 长时间无更新 → 触发 stale 告警

## 13. 扩展路线

- Kafka 事件流替代 Webhook 重试
- 车辆数字孪生：实时可视化轨迹
- 自动调度算法 (容量 + 路径优化)
