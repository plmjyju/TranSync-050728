---
status: core
last-reviewed: 2025-08-19
owner: security
---

# 安全加固 (Security Hardening)

## 1. 目标

降低多租户 SaaS 平台在认证、数据隔离、供应链、运维层面的攻击面与泄露风险。

## 2. 认证与权限

- 统一 JWT 中间件；拒绝旁路
- 短期 Access Token + 规划 Refresh Token
- 权限最小化：仅授予必要 action code

## 3. 输入与数据安全

| 领域     | 策略                                  |
| -------- | ------------------------------------- |
| 参数验证 | Joi/Ajv schema 严格类型与范围         |
| SQL 注入 | 使用 Sequelize 绑定变量，不拼接字符串 |
| XSS      | 输出编码；前端 CSP                    |
| 文件上传 | 白名单 MIME，病毒扫描 (规划)          |
| 敏感日志 | 过滤密码、token、secret               |

## 4. 多租户隔离

- 所有查询 where tenant_id & warehouse_id
- 审计避免跨租户合并输出
- 定期抽样比对随机租户数据泄露风险

## 5. 加密与密钥

| 项              | 要点                           |
| --------------- | ------------------------------ |
| JWT Secret      | 轮换策略 (版本 + grace period) |
| 传输            | 强制 HTTPS，仅 TLS1.2+         |
| 静态数据 (规划) | 敏感列加密 (KMS)               |

## 6. 供应链安全

- 锁定依赖版本 (package-lock.json)
- 使用 npm audit + snyk (CI) 扫描
- 自建私有 registry 镜像缓存

## 7. 配置与凭证

- 不在代码库存放生产凭证
- 环境变量注入 → config/environment.js 校验
- 密钥回收：离职/撤权自动失效

## 8. 会话与重放防护

- Token 重放：可选绑定 UA / IP Hash
- 登出 (规划)：维护 denylist (短 TTL)
- 幂等键防重复提交 → 降低经济型攻击影响

## 9. 日志与监控

| 监控         | 指标/日志                                   |
| ------------ | ------------------------------------------- |
| 可疑权限拒绝 | api_error_total{code="AUTH_FORBIDDEN"} 激增 |
| 多次失败登录 | auth_login_failed_total 超阈值告警          |
| 异常链断裂   | ledger_chain_gap_total > 0                  |

## 10. 代码审查清单

1. 未直接访问 process.env? (Y/N)
2. 是否校验租户隔离? (Y/N)
3. 是否使用参数验证? (Y/N)
4. 是否避免输出敏感信息? (Y/N)
5. 是否处理错误并返回规范 code? (Y/N)

## 11. 灾难恢复

- 定期备份 MySQL + 校验还原演练
- Redis RDB + AOF 组合，并测试故障切换
- 台账哈希链可用于快速检测备份后数据篡改

## 12. 事件响应

- 预定义分级 (P1 泄露 / P2 可疑越权 / P3 单点失败)
- 审计检索加速索引 (entity_type, action, created_at)

## 13. 扩展计划

- WAF / Bot 防护集成
- 行级访问策略 (ABAC) 扩展 RBAC
- 自动化威胁检测 (行为分析)
