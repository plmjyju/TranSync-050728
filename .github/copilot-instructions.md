````instructions
# TranSync FTZ Warehouse Management System - AI Agent Instructions (Updated 2025-08-19)

## 商业级代码总规范（Commercial‑Grade Code Charter）

TL;DR：所有生成代码必须满足“可扩展、可复用、强解耦、易读易维护、可测试、可观测、向后兼容”的商用品质。若与下文任何具体规范冲突，以更严格者为准。

- 基础原则
  - 单一职责 + 明确边界：每个模块/函数只做一件清晰的事；输入/输出契约稳定。
  - 依赖倒置与解耦：面向接口与抽象（服务/仓储/适配器），隔离第三方与 I/O 副作用。
  - 可配置不硬编码：所有可变参数经集中配置或依赖注入，严禁散布 magic numbers。
  - 可测试：纯函数优先；关键分支可被单测覆盖；外部依赖可替身（mock/stub）。
  - 可观测：结构化日志、指标、审计（本项目已内置 writeAudit/Prometheus）。
  - 向后兼容：接口与事件负载升级遵循兼容策略；破坏性变更需版本化与迁移窗口。

- 后端架构与 API 设计
  - 分层：路由（认证/鉴权/校验）→ 应用服务（事务/用例）→ 领域服务/仓储（数据访问）→ 基础设施（外部系统）。
  - 路由硬约束：authenticate + checkPermission；仅用 Backend/config/environment.js（禁止直接 process.env）。
  - 事务：跨表/多行写操作必须在一个事务中完成；工具 withTx 优先。
  - 多租户隔离：始终按 client_id/tenant_id/warehouse_id 过滤（见“多租户与仓库范围”）。
  - 返回模式：成功 { success:true, message, ...data }；失败 { success:false, code, message, ...context }，错误码 UPPER_SNAKE 且有域前缀。
  - 并发与幂等：关键路径使用分布式锁与幂等键（Redis），避免重复变更；序列采用 Redis incr。
  - 性能：批量化查询/更新、避免 N+1、必要索引、游标/ID 分页优先、幂等判重批量预取。
  - 版本化：外部可见契约变更须引入 v2 路由或 payload version 字段，保留兼容期。

- 可扩展与复用
  - 公共能力抽象为可复用工具（withTx、tenantScope、success/fail、writeFtzInternalMoveLedger 等）。
  - 组合优于继承：前端使用 composable（如 useAutoTableHeight）与可配置组件（BaseTableSection）。
  - 提供 hook/扩展点：不在业务核心处写死流程，可通过策略/映射扩展。

- 安全与合规
  - 权限最小化：服务端强校验，不信任前端筛选；默认拒绝策略。
  - 输入/输出校验：白名单参数、严格类型/范围、SQL/JSON 注入防护；脱敏日志。
  - 机密管理：统一配置源；不在代码库硬编码凭据；外部调用设定超时/重试/熔断。

- 可观测与审计
  - writeAudit 记录每次结构性变更，含 before/after/extra 与用户上下文；重要读接口用 logRead/logViewDetail。
  - 指标：Prometheus 指标覆盖关键吞吐/错误/延迟；错误码维度暴露。

- 数据与迁移
  - ENUM/结构变更走 migration；遵循“先迁移，后依赖”；老数据回填策略明确；索引评审。
  - Ledger 不可变：仅追加，不回写；冲正使用 reversal，链按 direction/Tenant/Warehouse 隔离。

- 前端规范（Vue + Element Plus）
  - 组件化：BaseTableSection 负责表格布局/高度；严禁在属性中插入 HTML 注释；保持 :height="numericTableHeight"（不要改成 max-height）。
  - 自适应高度：通过 viewportH 等响应式依赖触发重算；分页区类名 pager-bar 不得变更。
  - 可配置样式：统一使用 CSS 变量与主题文件；避免行内样式硬编码业务含义。

- 代码风格与工程化
  - ESLint + Prettier + EditorConfig；import/order、no-unused-vars、consistent-return、no-restricted-properties(禁止 process.env)。
  - 提交规范：Conventional Commits；PR 模板需勾选检查清单（见下）。
  - CI 必须绿：lint、测试、构建通过才可合并；主分支保护与 CODEOWNERS 审核。

- 测试与质量闸门
  - 单测：领域服务/工具函数需单测；关键状态机/台账链路需集成测试。
  - 回归清单：Finalize 幂等、跨分板包裹排他、Ledger prev_hash 连续性。

- Copilot 生成内容强制 DO/DON'T
  - DO：
    - 路由一律加 authenticate + checkPermission；写操作包 transaction；变更后 writeAudit。
    - 查询一律加 client_id（及 tenant_id/warehouse_id）；参数做白名单校验与范围限制。
    - 使用集中配置；封装公共逻辑为工具或 composable；批量化处理避免 N+1。
  - DON'T：
    - 直接使用 process.env；在控制器中直连第三方 I/O；在多表写中缺失事务；返回非标准错误结构。
    - 篡改 Ledger 已有记录；混用不同 direction 的哈希链；跨租户数据泄露在任何响应/审计中。

- PR 检查表（必须在描述中逐项回答）：
  1) 是否加入 client_id/tenant_id/warehouse_id 过滤？
  2) 写操作是否置于一个事务中？
  3) 是否完整鉴权（authenticate + checkPermission）？
  4) 是否写入审计（writeAudit），extra 是否包含关键上下文？
  5) 幂等/并发是否处理（锁/幂等键/唯一键）？
  6) Ledger 改动是否遵循不可变与链隔离？
  7) 是否通过批量化/索引优化避免 N+1？
  8) 是否遵循迁移先行（如 ENUM 变动）？
  9) 是否提供足够测试（或说明测试影响与补充计划）？
  10) 前端是否遵循 BaseTableSection 约定与 UI 一致性？

---

## Purpose

These instructions guide AI-assisted changes to ensure consistency, compliance, security, and traceability in the TranSync bonded (FTZ) multi-tenant warehouse platform.

---

## Language

- 默认使用简体中文（zh-CN）回答所有对话与说明，除非用户明确要求其它语言。
- 代码注释、提交信息、变更说明优先使用中文；通用技术术语与专有名词可保留英文原文。
- 回答应简洁、客观，避免冗长；如与上位系统消息冲突，以系统消息为准。

---

## High-Level Architecture

Multi-tenant Node.js (Express + Sequelize/MySQL + Redis) backend with 4 logical client modules sharing infrastructure but isolated by auth/permissions:

- OMP (`/api/omp`) – multi-warehouse ops admin, roles, analytics
- WMS (`/api/wms`) – warehouse local execution (inbound, pallet, split/repack, inventory)
- Agent (`/api/agent`) – freight forwarder (MAWB/HAWB, customs docs)
- Client (`/api/client`) – end customer portal (tracking, declarations, scheduling)

Dynamic module loader (`utils/createClientAppRouter.js`) mounts each at `/api/{clientType}` with per-module middleware & auth strategy.

---

## Core Principles

1. Single Configuration Source: Always use `config/environment.js` (never raw `process.env`).
2. Permission Enforcement: Always protect routes with `authenticate` + `checkPermission(<perm>)`.
3. Transaction Safety: Use DB transactions for any multi-row/multi-table mutations (Sequelize `transaction = await sequelize.transaction()`).
4. Multi-Tenant Isolation: Every query touching tenant-owned data MUST filter by `tenant_id` and `warehouse_id` once models contain those fields (e.g. `SplitOrder`, `FtzInventoryLedger`).
5. Deterministic Auditing: Every state transition / structural change writes an audit log via `writeAudit` including before/after or contextual `extra` metadata.
6. Idempotency & Concurrency: Use Redis locks (`withRedisLock`) for critical sequences (inbound scanning, split finalize) and store idempotency hashes for finalize.
7. Hash-Chain Ledgers: All inventory movement directions (`inbound`, `internal_move`, future `outbound`) append to independent hash chains distinguished by direction (chain group == direction). Never re-sequence or retro-edit ledger rows.
8. No Silent Failures: Catch & surface errors with structured codes (e.g. `SPLIT_FINALIZE_ERROR`). Update `last_finalize_error` fields where designed for resilience.

---

## Data & Domain Models (Key)

- Package: Core unit with single `operation_requirement_id`, pallet association, inbound & sorting statuses.
- Pallet: Physical or logical board. `source_type` ENUM: `original`, `repacked`, `merged` (migration in progress toward standardized semantics). Tracks origin traceability (`origin_awb`, `origin_pmc_pallet_id`).
- Split Workflow Models:
  - `SplitOrder` (multi-tenant; status machine; finalize control flags)
  - `SplitOrderRequirementStat`
  - `SplitOrderPalletTemp` (temporary groupings prior to final pallet creation)
  - `SplitOrderPackageScan`
- FtzInventoryLedger: Immutable hash-chained ledger rows per direction.

---

## Split / Repack Workflow (拆板重组)

Statuses (centralized in `SplitOrder.STATUSES`):
`created → assigned → processing → verifying → completed / cancelled`

Phases:

1. CREATE: Collect source PMC pallet IDs + derive expected counts per operation requirement.
2. ASSIGN: Bind operator user.
3. SCAN: Package-by-package; enforce uniqueness & cross-split exclusivity.
4. PALLET FULL: Close temp board; optionally open next (only if total expected not yet met).
5. VERIFY START: Auto-fill dynamic requirement expected=0 to scanned count; enforce count parity.
6. FINALIZE: Atomic creation of new repacked pallets; migration of packages; source pallet box_count adjustment; internal move ledger write; audit & idempotency hash persist.
7. CANCEL: Allowed only pre-verifying; full cleanup of scans/temp stats.

Concurrency Controls:

- Redis lock per split (`lock:split:<id>`)
- `split.finalize_in_progress` boolean + `last_finalize_error` for stuck/failed finalization recovery.
- Idempotency hash (SHA256 normalized pallet specification) stored in Redis key `split:<id>:finalize:hash`.

Finalize MUST:

- Validate complete coverage of all non-empty temps.
- Enforce per-temp confirmed counts match scanned.
- Batch update packages pallet_id.
- Batch recompute source pallet remaining counts (single grouped query).
- Avoid re-counting for new pallets (use known lengths).
- Write `internal_move` ledger rows (one per package) BEFORE marking split completed.
- Commit, then persist idempotency hash.

---

## Ledger (FTZ Inventory Hash Chain)

Directions:

- `inbound`: Item-level entries when goods enter bonded inventory.
- `internal_move`: Non-quantity-affecting structural movement (e.g., repack / split pallet changes per package).
- (Future) `outbound`, `adjustment`, `reversal` fully chain-isolated.

Rules:

- Each ledger row includes `prev_hash`, `hash` (SHA256(prev_hash + JSON(payload_without_prev_hash))).
- Chain continuity filtered by `{direction, tenant_id, warehouse_id}`.
- `unique_key` ensures idempotency:
  - Inbound: `in:<pallet_id>:<package_id>:<item_id>`
  - Internal Move: `move:<split_order_id>:<package_id>` (one-time structural snapshot)
- Never mutate existing rows; reversals use `reversal` direction with `reversal_of` pointing to original.

---

## Auditing Requirements

Each significant route writes an audit log with:

- `module` (e.g., `warehouse`)
- `entityType` (e.g., `SplitOrder`)
- `entityId`
- `action` (e.g., `split-order-finalize`)
- `before` / `after` snapshots (when state transitions apply)
- `extra` recommended fields:
  - For finalize: `pallets_input`, `pallet_mapping`, `package_moves_total`, truncated `package_moves` (<=500 items) with `package_moves_truncated`, `idempotency_hash`, `ledger_written_count`.
  - For cancel: `reason`, `cleaned`.
  - For assign: `assigned_user_id`.

Add `transition_from` and `transition_to` when updating statuses (if not already captured).

---

## Multi-Tenant & Warehouse Scoping

Columns: `tenant_id`, `warehouse_id` present in `SplitOrder`, `FtzInventoryLedger` (and progressively added to others).

MANDATORY: All read/write queries for tenant-specific resources include these filters either directly in `where` or via default scopes.

Do NOT leak cross-tenant data in aggregate counts or audit outputs.

---

## Error & Response Patterns

Success: `{ success: true, message, ...data }`
Failure: `{ success: false, code, message, ...context }`
Use stable error codes (UPPER_SNAKE) beginning with domain prefix, e.g. `SPLIT_FINALIZE_SCAN_MISMATCH`.

---

## Idempotency Patterns

- Finalize: Hash of normalized pallet definitions → Redis; repeated call with identical hash returns success (idempotent) if already completed; mismatch returns 409.
- Future: Provide `Idempotency-Key` header for general POST mutation safety (plan).

---

## Concurrency & Locking

- Redis distributed locks for split operations & inbound DO operations.
- Optional DB row-level locks (`SELECT ... FOR UPDATE`) can supplement for high-integrity paths (recommended for package-level conflicting processes in future iteration).

---

## Performance Guidelines

- Replace per-row counts with grouped aggregation (already applied to source pallet remain counts in finalize).
- Avoid N+1 ledger existence checks; batch prefetch by `unique_key` or `package_id` (implemented for internal move).
- Use Maps keyed by `package_id` for item grouping instead of repeated `filter` loops.
- Sequence numbers: prefer Redis atomic increment over DB COUNT where sequential ordering is only for display.

---

## Naming & Conventions

- Models: PascalCase.
- DB columns: snake_case.
- Associations: camelCase alias.
- ENUM additions require migration scripts (never inline hot modifications in production without migration).

---

## Migrations Checklist

When adding fields (e.g., `tenant_id`, `warehouse_id`, status flags):

1. Create migration adding columns + indexes.
2. Backfill existing rows if non-null needed.
3. Update model definitions.
4. Deploy migration before code depending on the new schema reaches production.

---

## Common Pitfalls & Avoidance

| Pitfall                        | Mitigation                                        |
| ------------------------------ | ------------------------------------------------- |
| Direct env access              | Use centralized config import                     |
| Missing tenant filter          | Always include tenant/warehouse in where clause   |
| Incomplete finalize rollback   | Ensure `finalize_in_progress` reset in catch path |
| Duplicate scanning             | Unique constraint (logical + existence check)     |
| Ledger chain mixing directions | Always pass correct direction / chain grouping    |
| Overly large audit payloads    | Truncate & mark `*_truncated` flags               |

---

## Security & Compliance

- Enforce permission codes at route-level; never trust front-end for filtering.
- Log every structural data mutation.
- Sensitive tenant separation validated at query boundaries.
- Hash chain ensures tamper evidence for FTZ inventory events.

---

## Testing & Validation

- Use Postman collections provided (`TranSync_Complete_Client_API.postman_collection.json`).
- Add unit/integration tests for:
  - Finalize idempotency (same payload → single ledger write)
  - Cross-split package exclusivity
  - Ledger hash continuity (prev_hash consistency)

---

## Future Roadmap (Reference)

- Add outbound & adjustment ledger handlers with reversal flows.
- Implement finalize recovery job scanning `finalize_in_progress` older than threshold.
- Introduce global `split_order_active_id` on Package for O(1) exclusivity checks.
- Replace `source_type` ENUM semantics with standardized taxonomy (e.g., `pmc`, `standard`, `virtual`).
- Introduce event outbox for asynchronous downstream updates (inventory projections, notifications).

---

## When Modifying Code – Checklist

1. Does your change include tenant & warehouse scoping? (Y/N)
2. Are all write operations inside a transaction? (Y/N)
3. Are permissions applied correctly? (Y/N)
4. Is audit written with sufficient context `extra`? (Y/N)
5. For ledger-impacting operations: Are unique keys, hash, and chain grouping correct? (Y/N)
6. Is finalize idempotency preserved, if affected? (Y/N)
7. Are model ENUM changes backed by a migration? (Y/N)
8. Are performance-critical loops batched or pre-grouped? (Y/N)

---

## Example Patterns

Route Protection:

```js
router.post(
  "/split-orders/:id/finalize",
  authenticate,
  checkPermission("warehouse.split_order.finalize"),
  handler
);
```

Ledger Internal Move Write:

```js
await writeFtzInternalMoveLedger({
  moves: moveLedgerPayload,
  user: req.user,
  transaction: t,
  split_order_id: split.id,
});
```

Audit Finalize:

```js
writeAudit({
  module: "warehouse",
  entityType: "SplitOrder",
  entityId: split.id,
  action: "split-order-finalize",
  user: req.user,
  before: null,
  after: null,
  extra: { idempotency_hash: hash, ledger_written_count: lr.written },
});
```

---

## Emergency Procedures

Model Load Issue:

```bash
find models/ -name "*.js" -size 0
```

Permission Reset:

```bash
node seed/initPermissionsAndRoles.js
```

DB Connectivity:

```bash
node test-env.js
```

Stuck Finalize:

- Check `finalize_in_progress` + `last_finalize_error`.
- If safe, manually reset flag or trigger recovery job.

---

## 文档同步与动态维护（copilot-frontend.md / copilot-backend.md）

目的

- 将前后端 Copilot 指南作为“活文档”（Living Docs），持续反映仓库真实实现，指导后续生成代码保持一致。

硬性规则（必须执行）

- 触发条件：当以下路径发生变更时，必须在同一 PR 中同步更新相应文档。
  - 前端 → 更新 .github/copilot-frontend.md
    - frontend-client/src/components/common/BaseTableSection.vue（高度算法/prop/类名）
    - frontend-client/src/router/**/*.js（动态路由候选、守卫、菜单派生逻辑）
    - frontend-client/src/views/**/*.vue（核心列表页结构/槽位约定/分页参数）
    - frontend-client/src/api/http.js（拦截器、错误规范、token 键）
  - 后端 → 更新 .github/copilot-backend.md
    - Backend/routes/**/*（新增/修改接口、权限键、响应结构、分页/过滤参数）
    - Backend/models/**/*（新增字段/关联/索引/约束）
    - Backend/utils/**/*（writeAudit、withRedisLock、sequence、响应封装等）
    - Backend/config/environment.js（配置项影响开发约定）
- PR 模板：必须勾选“已同步 copilot-frontend.md / copilot-backend.md / copilot-instructions.md”。
- 提交信息：使用 Conventional Commits，例如：
  - docs(frontend): sync copilot-frontend.md with BaseTableSection height changes
  - docs(backend): sync copilot-backend.md for /api/client/packages filters
- 文档页眉需包含同步标记：
  - Last Synced: YYYY-MM-DD | commit <short-hash>

同步内容建议（最小集合）

- 前端文档需至少更新以下小节：
  - “与当前代码实现的实时约束”：列明 BaseTableSection 必须使用 :height="numericTableHeight"、pager-bar 类名、viewportH 依赖、当前动态路由候选清单等。
  - “维护指引”：列出需要同步的文件清单与步骤。
- 后端文档需至少更新以下小节：
  - “当前代码状态”：最新的路由清单（按模块）、关键模型字段/关联、错误码风格、核心工具清单。
  - “后端路由模板”：保持与当前硬约束一致的示例片段。

审核要点

- 所有新增/变更接口是否在文档中反映（路径、方法、权限、请求/响应要点）。
- 影响前端布局/高度/交互的组件变更是否反映在“实时约束”。
- 错误码/返回结构是否与文档一致；若有差异需同步修订文档或回改代码保持一致。

可选自动化（推荐）

- 在 CI 中加入路径变更守卫：当触发路径变更而 PR 中未修改相应文档文件时标红（可作为必需检查）。
- 在文档保存脚本中自动写入 Last Synced 时间与当前 commit 短哈希。

---

## Do / Don't Summary

DO:

- Use transactions, tenant scoping, audit logs, hash chains.
- Normalize & hash finalize payloads.
- Batch queries instead of loops for counts.

DON'T:

- Access `process.env` directly.
- Mix ledger directions in the same chain.
- Leave `finalize_in_progress` true after errors.
- Return ambiguous error codes.

---

End of instructions.
````
