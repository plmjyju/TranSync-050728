---
status: core
last-reviewed: 2025-08-19
owner: qa
---

# 测试策略

## 1. 目标

保障多租户、拆板工作流、台账哈希链、权限控制与并发锁等关键路径的正确性与可回归性。

## 2. 测试层次

| 层级         | 关注点                     | 工具                          |
| ------------ | -------------------------- | ----------------------------- |
| 单元测试     | 纯函数 / 权限校验逻辑      | Jest / Vitest                 |
| 集成测试     | API 路由 + DB + Redis      | Supertest + Testcontainers    |
| 端到端 (E2E) | 典型业务场景               | Postman / Newman / Playwright |
| 性能 / 压测  | 并发 finalize / split 扫描 | k6 / Locust                   |
| 安全测试     | 权限绕过 / JWT 伪造        | 自定义脚本                    |

## 3. 关键用例

- Split Finalize 幂等：相同 payload 重复提交仅一次 ledger 写入
- Cross-split exclusivity：包裹在另一个活动拆板中被拒绝扫描
- Ledger hash continuity：prev_hash 串联正确，断链报警
- Outbox retry：模拟一次 DB 故障后重试成功
- Redis 锁丢失 (TTL 到期) 场景恢复 (预留)

## 4. 数据构造

- 使用工厂 (factory) 生成用户/角色/权限/包裹/板
- 每个测试租户独立 tenant_id，避免交叉污染
- 使用事务回滚 / 或 schema truncate 重置

## 5. 隔离策略

- 进程级并发测试需为 Redis key 添加测试前缀 `test:<suite>:...`
- 避免真实生产配置：强制注入测试 config/environment override

## 6. 覆盖指标

| Metric         | 目标                   |
| -------------- | ---------------------- |
| 行覆盖率       | >70% 核心模块          |
| 关键工作流路径 | 100% (create→finalize) |
| 错误代码分支   | 90%+                   |

## 7. 性能基线 (示例)

| 场景                     | 指标          |
| ------------------------ | ------------- |
| Split Finalize 1000 包裹 | < 3s (p95)    |
| 并发 20 finalize 重试    | 0 ledger 重复 |

## 8. 回归策略

- 主分支合并前 GitHub Action 运行集成+关键 E2E
- 每日夜间完整 E2E + 性能冒烟

## 9. 工具与框架建议

- Testcontainers: 动态 MySQL / Redis / MinIO (如需)
- Faker: 构造随机但可重复数据
- ESLint + Prettier: 质量门禁

## 10. 异常注入 (Chaos)

- 人工注入 finalize 中途 Redis 失联 → 期望恢复任务补偿
- Ledger Outbox 随机失败 5% → 验证重试统计

## 11. 报告与指标

- 覆盖率上传 Codecov
- 测试用时、失败率 Prometheus Pushgateway (可选)

## 12. 自检清单

1. 是否覆盖幂等与并发冲突用例? (Y/N)
2. 是否验证权限拒绝路径? (Y/N)
3. 是否校验台账哈希链连续性? (Y/N)
4. 是否具备失败重试场景? (Y/N)
5. 是否度量性能基线? (Y/N)
