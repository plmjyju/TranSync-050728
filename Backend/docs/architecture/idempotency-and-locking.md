---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 幂等与锁控制 (Idempotency & Locking)

## 1. 目标

防止重复提交 / 并发写冲突，保障拆板 Finalize、入库 Finalize、预约创建等关键路径的一致性与可恢复性。

## 2. 幂等手段

| 场景             | 手段                      | 说明                               |
| ---------------- | ------------------------- | ---------------------------------- |
| Split Finalize   | 规格归一化 + SHA256 哈希  | Redis key split:<id>:finalize:hash |
| Inbound Finalize | 订单状态 + 批量插入幂等键 | 状态遏制重放                       |
| Ledger 写入      | unique_key                | 方向 + 业务标识构造                |
| Delivery 创建    | 窗口冲突检测 + 锁         | 避免重复窗口重叠                   |

## 3. Redis 锁模式

`SET key value NX PX <ttl>` 成功视为获取；失败需重试/backoff。

| 锁 Key 模式                       | 用途           | TTL                       |
| --------------------------------- | -------------- | ------------------------- |
| lock:split:<id>                   | 拆板 finalize  | 30s (可续期)              |
| lock:delivery:window:<wid>:<date> | 预约时间窗口   | 5s                        |
| lock:job:<name>                   | 后台任务单实例 | job 期望执行耗时 + buffer |
| lock:inbound:awb:<awb>            | 防重复入库单   | 10s                       |

## 4. 续期 (可选)

- Watchdog 定时 (TTL/2) 延长关键长事务锁 (如 finalize 处理 > TTL)

## 5. 客户端幂等键 (规划)

HTTP Header: Idempotency-Key

- 服务器保存 (Redis setnx) → 请求完成缓存结果 → 相同键返回缓存

## 6. Finalize 哈希生成

```js
function hashPalletSpec(pallets) {
  // 1. 对新板列表按临时板ID排序
  // 2. 每板内包裹ID升序
  // 3. 归一化对象 { temp_id, packages:[id...] }
  // 4. JSON.stringify → SHA256
}
```

## 7. 错误恢复

| 场景                    | 恢复策略                               |
| ----------------------- | -------------------------------------- |
| 锁 TTL 过期导致并发进入 | 检测 finalize_in_progress 标志冲突回退 |
| 哈希不匹配重复调用      | 返回 409 + 现有哈希                    |
| Ledger 写入部分失败     | 事务回滚 + last_finalize_error 设置    |

## 8. 风险与边界

- 锁粒度过粗 → 吞吐降低
- TTL 设置过短 → 长事务误释放
- 幂等缓存膨胀 → 需 TTL 清理 (建议 24h)

## 9. 监控指标

| Metric                      | 说明           |
| --------------------------- | -------------- |
| redis_lock_acquire_total    | 尝试获取锁次数 |
| redis_lock_contention_total | 竞争失败次数   |
| idempotency_conflict_total  | 幂等冲突统计   |

## 10. 自检清单

1. 是否有锁保护的共享写路径? (Y/N)
2. 锁 TTL 是否覆盖最长执行时间? (Y/N)
3. 幂等键是否稳定可复制? (Y/N)
4. 冲突是否返回明确错误码? (Y/N)
5. 失败是否正确释放锁/复位标志? (Y/N)

## 11. 扩展计划

- Redlock 多实例共识
- 客户端级全局幂等服务 (HTTP cache)
- 锁使用统计 → 动态调参 TTL
