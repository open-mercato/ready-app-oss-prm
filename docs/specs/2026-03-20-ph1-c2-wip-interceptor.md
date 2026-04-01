# Phase 1, Commit 2: WIP Interceptor — Stamp wip_registered_at on First SQL Stage Transition

## Source
- App Spec sections: §1.4.2 (WIP count formula), §3 (WF2 journey), §7 (Phase 1 domain criteria)
- User stories: US-2.2
- Commit plan: commits-WF1.md (Commit 3), commits-WF2.md (Commit 4)

## What This Delivers
After this commit, when a BD moves a deal to SQL stage or above for the first time, the system automatically stamps `wip_registered_at` with the current UTC timestamp. This stamp is immutable — moving the deal backward and forward again does not re-stamp. BD cannot write the field directly. This is the core mechanism that powers WIP counting.

## Acceptance Criteria
**Domain (Vernon):**
- [ ] `wip_registered_at` is never overwritten once set: moving a stamped deal backward to Qualified and forward to SQL again — timestamp does not change
- [ ] `wip_registered_at` is only stamped when the deal transitions INTO a stage at or above SQL for the first time — not on deal creation, not on non-qualifying stage changes
- [ ] A deal without `wip_registered_at` does not appear in any WIP count, regardless of its current pipeline stage
- [ ] `wip_registered_at` timestamp is stored in UTC; WIP period attribution uses UTC month boundaries (deal stamped 2026-03-31T23:59:59Z = March)
- [ ] BD cannot create or modify `wip_registered_at` directly — only the API interceptor writes it

**Business (Mat):**
- [ ] BD moves a deal to SQL → WIP count visible on KPI dashboard immediately (live query)
- [ ] Stamp is immutable — moving deal backward and forward does not re-stamp

## Files
| File | Action | Purpose |
|------|--------|---------|
| `src/modules/partnerships/api/interceptors.ts` | Create | `after` hook on `customers/deals` PATCH — stamps `wip_registered_at` on first SQL+ transition. `before` hook on `customers/deals` PATCH/POST — strips `wip_registered_at` from request body to prevent direct writes. |

## OM Patterns Used
- **API interceptor (after hook)** — Reference: `$OM_REPO/packages/core/src/modules/payment_gateways/api/interceptors.ts` (interceptor structure with before/after hooks)
- **ApiInterceptor type** — Import: `import type { ApiInterceptor } from '@$OM_REPO/shared/lib/crud/api-interceptor'`

## Implementation Notes

### Interceptor Targeting
The interceptor must target `customers/deals` routes from the `partnerships` module. The OM interceptor auto-discovery at `api/interceptors.ts` exports an `interceptors` array. Each interceptor declares which routes it targets via the `routes` property (e.g., `routes: ['customers/deals']`) and which methods via `methods` (e.g., `methods: ['PATCH', 'POST']`). Reference: `$OM_REPO/packages/core/AGENTS.md` → API Interceptors section for the exact contract.

### After Hook Logic (on `customers/deals` PATCH)
1. Read `pipelineStageId` from the response body (the deal PATCH has already succeeded).
2. If `pipelineStageId` was not changed in this PATCH, skip (no stage transition).
3. Load the pipeline stage record from `em` using `pipelineStageId`, read its `order` property.
4. Import `PRM_SQL_STAGE_ORDER` constant from `data/custom-fields.ts`. If stage `order >= PRM_SQL_STAGE_ORDER`, continue.
5. Load the deal record from `em` using the record id from the response body.
6. Read `wip_registered_at` custom field value. If already set (non-null), skip — immutability enforced.
7. If null, write current UTC timestamp (`new Date().toISOString()`) to `wip_registered_at` custom field via entities records API.
8. Confirm `context.organizationId` matches the deal's `organizationId` before writing (org-scoped guard).

### Before Hook Logic (on `customers/deals` PATCH and POST)
1. If request body contains `wip_registered_at` field (custom field payload), strip it silently.
2. This prevents BD from setting the field directly via API.

### Stage Identification
Match SQL stage by `order >= PRM_SQL_STAGE_ORDER` (3), not by label string. This is rename-safe. The constant comes from `data/custom-fields.ts` where it's tied to the pipeline seed definition.

### Edge Cases
- Deal created directly at SQL stage (e.g., via import): the interceptor fires on POST too? No — the `after` hook is on PATCH only. Deal creation at SQL stage does NOT auto-stamp. This is correct per the spec: "transitions INTO SQL+ for the first time" — creation is not a transition. If needed, a separate POST hook could be added, but the spec says PATCH only.
- Deal moved backward past SQL then forward again: `wip_registered_at` already set, skip. Correct.
- Multiple rapid PATCHes: idempotent — check-before-write pattern.

## Testing

### Unit Tests
- `interceptors.test.ts` — colocated with `api/interceptors.ts`

| Function | Test |
|----------|------|
| `afterDealPatch` | Stamps `wip_registered_at` when deal transitions to SQL stage (order >= 3) and field is null |
| `afterDealPatch` | Does NOT stamp when deal transitions to stage below SQL (order < 3) |
| `afterDealPatch` | Does NOT overwrite when `wip_registered_at` is already set |
| `afterDealPatch` | Does NOT stamp when `pipelineStageId` was not changed in the PATCH |
| `beforeDealPatch` | Strips `wip_registered_at` from request body if present |

### Integration Test Scenarios

| ID | Type | Scenario | Expected Result |
|----|------|----------|-----------------|
| T1 | API | Create deal at "New" stage, PATCH to "SQL" stage | `wip_registered_at` is set to current UTC timestamp |
| T2 | API | Create deal, move to SQL (stamped), move back to Qualified, move to SQL again | `wip_registered_at` timestamp unchanged from first stamp |
| T3 | API | Create deal, move to "Proposal" stage (order 4, above SQL) | `wip_registered_at` is set (any stage >= SQL triggers stamp) |
| T4 | API | Create deal, move to "Contacted" stage (order 1, below SQL) | `wip_registered_at` remains null |
| T5 | API | PATCH deal with `wip_registered_at` in custom fields body | Field is stripped, not persisted (write-protection) |

## Verification
```bash
yarn typecheck                   # Must pass
yarn build                       # Must pass
yarn test                        # Unit tests pass
yarn test:integration:ephemeral  # Integration tests pass (T1-T5)
```
