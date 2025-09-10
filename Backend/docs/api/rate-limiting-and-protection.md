---
status: extended
last-reviewed: 2025-08-19
owner: security
---

# 频率限制与保护 (Rate Limiting & Protection)

## 1. 目标

防止暴力破解、爬取及资源滥用，同时保障关键操作 (拆板 Finalize、出库) 不被误阻断。

## 2. 策略组件

| 组件             | 说明                        |
| ---------------- | --------------------------- |
| 全局速率限制     | IP + 路由维度令牌桶         |
| 敏感操作独立配额 | 登录 / Finalize 单独限额    |
| 并发限制         | 同一 split 同时 finalize=1  |
| 滑动窗口统计     | Redis Sorted Set / Incr+TTL |

## 3. Key 设计

`rate:<scope>:<identifier>` 例：`rate:login:ip:1.2.3.4`

## 4. 登录限制示例

- 窗口：5 分钟 10 次失败
- 超限：返回 429 + AUTH_RATE_LIMIT (可加入 error-codes)

## 5. 通用中间件逻辑

1. 生成 key
2. INCR 若首次 → EXPIRE=窗口
3. 超过阈值 → 拒绝

## 6. 排除清单

- 内部健康检查 /metrics 路由不做限制
- 后台任务内部调用使用内部签名 header 绕过

## 7. 指标

| Metric                      | 描述               |
| --------------------------- | ------------------ |
| rate_limit_block_total      | 被阻次数           |
| rate_limit_near_quota_total | 接近阈值次数 (80%) |

## 8. 告警

- 5 分钟内单 IP 被阻 > 100 → 可能攻击
- 某租户短期大量 AUTH_FORBIDDEN → 权限暴力枚举风险

## 9. 自检清单

1. 是否对敏感路径启用限制? (Y/N)
2. 阻断是否返回明确错误码? (Y/N)
3. 是否排除必要内部路由? (Y/N)
4. 是否监控阻断指标? (Y/N)
5. 是否允许白名单/动态调整? (Y/N)

## 10. 扩展计划

- 用户行为评分黑名单
- Adaptive 限流 (根据系统负载)
- 基于滑动窗口 + 令牌桶混合算法
