---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 性能与扩展性设计

## 1. 目标

确保拆板 Finalize、批量台账写入、预约并发等高频路径低延迟 (<p95 SLA) 与线性扩展能力。

## 2. 关键策略

| 策略            | 说明                               |
| --------------- | ---------------------------------- |
| 批量操作        | 扫描迁移 / ledger 写入一次性批处理 |
| 读写分离 (规划) | MySQL 读副本缓解热点               |
| Redis 锁 & 计数 | 原子自增 / 去重 / 互斥             |
| 预聚合          | 避免实时 COUNT(\*) 反复查询        |
| 幂等哈希        | Finalize 避免重复重算              |
| 分链哈希台账    | 减少跨方向扫描范围                 |

## 3. 数据访问

- 使用 `IN (...)` 批量获取包裹 / pallet 状态
- 聚合统计采用单次 GROUP BY 替代多次子查询

## 4. Ledger 写入优化

- 预生成 unique_key 列表，对已存在集合过滤
- Map<package_id, items[]> 构造 payload 减少 O(n^2) 查找

## 5. 缓存

| 场景                   | Key 模式                                  |
| ---------------------- | ----------------------------------------- |
| 权限列表               | perms:user:<id>:v1                        |
| Operation Requirements | requirements:tenant:<tid>:warehouse:<wid> |
| 临时拆板扫描计数       | split:scan:count:<split_id>               |

失效策略：写操作后删除相关 key (而非更新)；利用短 TTL 兜底

## 6. 并发与锁粒度

| 领域     | 锁 Key                            | 说明              |
| -------- | --------------------------------- | ----------------- |
| 拆板     | lock:split:<id>                   | Finalize 全局互斥 |
| 预约窗口 | lock:delivery:window:<wid>:<date> | 防冲突创建        |
| 后台任务 | lock:job:<name>                   | 单实例执行        |

## 7. 指标 (Prometheus)

| Metric                          | 含义           |
| ------------------------------- | -------------- |
| api_request_duration_seconds    | API 延迟直方图 |
| split_finalize_duration_seconds | Finalize 耗时  |
| ledger_outbox_lag_seconds       | Outbox 滞后    |
| redis_lock_wait_ms              | 获取锁等待     |
| db_conn_usage                   | 连接池使用率   |

## 8. 压测基线 (示意)

| 场景               | 目标          |
| ------------------ | ------------- |
| 100 并发扫描       | p95 < 120ms   |
| Finalize 1000 包裹 | p95 < 3s      |
| Outbox 写入 1k/s   | 错误率 < 0.1% |

## 9. 退化与降级

- Outbox 高延迟：暂停非关键后台指标采集
- 权限缓存穿透：快速失败 + 局部回填

## 10. 内存管理

- 避免在内存构造超大数组 (>50k)；分块处理
- Streaming 查询 (未来) 处理超大日志导出

## 11. 自检清单

1. 是否批量化 SQL? (Y/N)
2. 是否避免 N+1? (Y/N)
3. 是否使用锁控制高争用区? (Y/N)
4. 是否设置关键指标监控? (Y/N)
5. 是否满足压测基线? (Y/N)

## 12. 扩展计划

- Sharding: 按 tenant 水平拆分
- Ledger CQRS 投影 (供报表) 减轻主链查询压力
- Spot 实例工作节点 + 任务再平衡
