# TranSync 后端（Node.js + Express + Sequelize + Redis）Copilot 指示文档（2025-09-19）

目的

- 让 Copilot 生成的后端代码与本仓库实际实现保持一致，满足“商业级代码总规范”。
- 与 .github/copilot-instructions.md 对齐：强鉴权、事务化、审计、租户隔离、幂等、性能。

语言

- 默认中文注释与信息，技术名词保留英文。

技术与边界

- 框架：Express；ORM：Sequelize；DB：MySQL；缓存/锁：Redis；监控：Prometheus。
- 配置：仅从 Backend/config/environment.js 读取，禁止直接 process.env。

核心硬约束（必须）

- 鉴权与权限：所有受保护路由使用 authenticate + checkPermission('<模块.权限>').
- 事务：多行/多表写入必须使用单一事务对象（sequelize.transaction）。
- 审计：结构性变更必须 writeAudit（含 before/after/extra、user、ip、ua）。
- 多租户隔离：按 client_id/tenant_id/warehouse_id 过滤（模型具备相关字段时）。
- 错误返回：{ success:false, code, message, ...context }，错误码 UPPER_SNAKE 并带域前缀。
- 并发与幂等：关键路径使用 withRedisLock + 幂等键；序列使用 Redis INCR。
- 性能：避免 N+1；批量化；分页上限；必要索引；尽量使用 include 选择性字段。

当前代码状态（与实现同步）

- 路由结构
  - /api/client：Backend/routes/client/index.js 作为入口，挂载 forecasts、inbond、package、operation-requirements、item-templates。
  - packages 列表接口：GET /api/client/packages（package.js 内）；按 client_id 约束，支持分页与过滤，含 logRead 审计。
  - 登录：POST /api/client/login（JWT），权限数组默认内置 CLIENT_PERMISSIONS（需后续收敛为后端查询）。

- 模型与领域
  - Package（含 mawb/hawb、operation_requirement_id、tenant_id/warehouse_id 预留）；Pallet、SplitOrder、FtzInventoryLedger 等。
  - 台账（FTZ）：方向链 inbound/internal_move（未来 outbound/adjustment），prev_hash/hash 链式约束，unique_key 实现幂等。

- 关键工具
  - writeAudit、logRead/logViewDetail、sequence（nextPackageSequence/formatPackageCode）。

- 错误码风格
  - 例如：PKG_REQUIREMENT_NOT_ALLOWED、CLIENT_LOGIN_INVALID、ITEM_UPDATE_ERROR。

后端路由模板（粘贴以引导 Copilot）

```js
router.post(
  '/x',
  authenticate,
  checkPermission('client.x.create'),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const clientId = req.user.id;
      // 参数白名单与校验...
      // 读 → 校验归属 → 写（传 { transaction: t }）
      await t.commit();
      writeAudit({ module: 'client', entityType: 'X', entityId: id, action: 'create', user: req.user, before: null, after: snap, extra: {}, ip: req.ip, ua: req.headers['user-agent'] });
      return res.status(201).json({ success: true, message: '创建成功', data });
    } catch (e) {
      try { await t.rollback(); } catch {}
      return res.status(500).json({ success: false, code: 'CLIENT_X_CREATE_ERROR', message: e.message });
    }
  }
);
```

维护指引（动态更新）

- 当以下文件改动时，立即同步本文件“当前代码状态”章节：
  - Backend/routes/client/*.js（新增路由、权限键、返回结构）
  - Backend/models/*.js（新增字段、关联、索引）
  - Backend/utils/*（审计、锁、序列、响应格式）
- PR 模板增加复选项：“已同步 copilot-backend.md”。
- 如引入新业务域（如 AirWaybill 独立资源）：
  - 新建 routes/client/airwaybills.js，权限 client.airwaybill.view（以及 create/edit）。
  - 在此文档登记接口清单与权限。
