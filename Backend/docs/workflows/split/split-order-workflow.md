---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# Split Order Workflow (拆板重组)

## Status Flow

created → assigned → processing → verifying → completed / cancelled

## Phases

1. Create: collect source PMC pallet IDs, derive expected counts per operation requirement.
2. Assign: bind operator user.
3. Scan: per package uniqueness + cross-split exclusivity.
4. Pallet Full: close temp board; optionally open next until expected satisfied.
5. Verify Start: auto-fill dynamic requirement expected=0 to scanned count; enforce parity.
6. Finalize (idempotent):
   - Validate coverage & counts
   - Create repacked pallets
   - Move packages (batch)
   - Adjust source pallet box_count
   - Write internal_move ledger rows (hash chain)
   - Audit with truncated package list
   - Persist idempotency hash (Redis) post-commit
7. Cancel (pre-verifying only): cleanup scans & temps.

## Concurrency & Safety

- Redis lock: lock:split:<id>
- Flags: finalize_in_progress, last_finalize_error
- Idempotency hash key: split:<id>:finalize:hash
- Retry queue + finalizeRetryWorker for recovery
- Stuck recovery job resets finalize_in_progress

## Ledger (internal_move)

- One row per package
- Chain group = direction (internal_move)
- unique_key = move:<split_order_id>:<package_id>

## Auditing

Action examples:

- split-order-create
- split-order-assign
- split-order-scan
- split-order-pallet-full
- split-order-verify-start
- split-order-finalize (extra: pallets_input, pallet_mapping, package_moves_total, idempotency_hash, ledger_written_count)
- split-order-finalize-retry-result / -error / -missing-pallet
- split-order-cancel

## Multi-Tenant Enforcement

All queries filter tenant_id + warehouse_id.

## Error Codes (pattern)

SPLIT*FINALIZE*_, SPLIT*SCAN*_, SPLIT*VERIFY*\*.

## Performance

- Batch updates & counts
- Pre-group packages map
- Pagination for large item loads
- Redis sequences with gap detection & repair

## Future Enhancements

- Outbound ledger integration
- Full pallet reconstruction on retry
- Global split_order_active_id on Package
