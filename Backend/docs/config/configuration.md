---
status: core
last-reviewed: 2025-08-19
owner: devops
---

# 配置体系 (Configuration)

## 1. 原则

- 单一来源：统一从 `config/environment.js` 导出
- 不在业务代码直接访问 `process.env`
- 可分层：默认 → 环境覆盖 → 运行时 (未来热加载)

## 2. 配置分组 (示例)

| 分组     | 键前缀   | 示例                         |
| -------- | -------- | ---------------------------- |
| 应用     | app      | app.port, app.logLevel       |
| 数据库   | db       | db.host, db.pool.max         |
| Redis    | redis    | redis.host, redis.lock.ttlMs |
| JWT      | jwt      | jwt.secret, jwt.expiresIn    |
| Jobs     | job      | job.outbox.batchSize         |
| Metrics  | metrics  | metrics.enabled              |
| Security | security | security.cors.origins        |

## 3. 结构示例

```js
module.exports = {
  app: { port: 3000, logLevel: "info" },
  db: { host: "localhost", pool: { max: 10 } },
  redis: { host: "127.0.0.1", lock: { ttlMs: 8000 } },
  jwt: { secret: "***", expiresIn: "2h" },
  job: { outbox: { batchSize: 100 } },
  metrics: { enabled: true },
};
```

## 4. 加载顺序

1. 读取 .env (dotenv) → 解析为临时对象
2. 应用默认值合并
3. 类型转换 (数字 / 布尔)
4. 导出冻结对象 (Object.freeze) 防止运行期修改

## 5. 校验

- 使用 schema (ajv / joi) 进行格式约束
- 缺失关键配置 → 启动失败 LOG + 退出码 !=0

## 6. 安全

- secret / key 不写入审计/日志
- 生产禁止使用默认 secret (检测 sentinel 值)

## 7. 变更策略

- 新增字段：先部署兼容读取，再使用
- 删除字段：代码移除前统计使用情况

## 8. 常见陷阱

| 问题                          | 避免                       |
| ----------------------------- | -------------------------- |
| 直接用 process.env.JWT_SECRET | 始终通过 config.jwt.secret |
| 忘记布尔转换                  | 显式 parseBool("true")     |
| 动态在代码修改 config         | 冻结结构                   |

## 9. 自检清单

1. 是否仅通过 config 引用? (Y/N)
2. 是否有 schema 校验? (Y/N)
3. 是否避免敏感值日志泄露? (Y/N)
4. 新配置是否向下兼容? (Y/N)
5. 是否提供默认值? (Y/N)

## 10. 扩展计划

- 支持远程配置中心 (Consul / etcd)
- 动态刷新 (watch) + 热重载受控参数
- 分环境差异 diff 工具
