# TranSync FTZ Warehouse Management System - AI Agent Instructions (Updated 2025-08-19)

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
