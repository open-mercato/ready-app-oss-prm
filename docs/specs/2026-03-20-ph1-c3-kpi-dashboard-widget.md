# Phase 1, Commit 3: KPI Dashboard Widget — WIP Count Live Query

## Source
- App Spec sections: §1.4.2 (WIP count formula), §7 (Phase 1)
- User stories: US-2.3
- Commit plan: commits-WF1.md (Commit 4), commits-WF2.md (Commits 5, 6)

## What This Delivers
After this commit, the PM dashboard shows a "WIP This Month" tile displaying the count of deals that first reached SQL stage in the current month for the currently selected agency. BD sees their own org's WIP count. The widget uses a live query (no batch aggregation) — `COUNT(DISTINCT deal.id) WHERE wip_registered_at IN month`. WIC column shows "—" until Phase 2.

## Acceptance Criteria
**Domain (Vernon):**
- [ ] A deal without `wip_registered_at` does not appear in any WIP count regardless of pipeline stage
- [ ] `wip_registered_at` stored in UTC; WIP period attribution uses UTC month boundaries (stamped 2026-03-31T23:59:59Z = March)
- [ ] WIP live-query widget scopes by authenticated user's org (or PM's switched org) — no unscoped cross-org counts

**Business (Mat):**
- [ ] BD moves a deal to SQL → WIP count appears on dashboard immediately
- [ ] PM can switch between agencies and see each agency's WIP count

## Files
| File | Action | Purpose |
|------|--------|---------|
| `src/modules/partnerships/api/get/wip-count.ts` | Create | `GET /api/partnerships/wip-count?month=YYYY-MM` — returns `{ count: number, month: string }`. Auth-guarded: requires `partnerships.widgets.wip-count` feature. Org-scoped via `context.organizationId`. Exports `openApi`. |
| `src/modules/partnerships/widgets/dashboard/wip-count/widget.ts` | Create | Dashboard widget server definition: metadata (id: `partnerships.dashboard.wip-count`, features: `partnerships.widgets.wip-count`), lazy-load client component |
| `src/modules/partnerships/widgets/dashboard/wip-count/widget.client.tsx` | Create | Client component: calls `GET /api/partnerships/wip-count?month=YYYY-MM`, renders tile with count + month label. Month selector (current month default, previous months navigable). Shows "—" for WIC column (Phase 2). |
| `src/modules/partnerships/widgets/injection-table.ts` | Create | Register `partnerships.dashboard.wip-count` widget at `dashboard:widgets` injection spot |
| `src/modules/partnerships/i18n/en.json` | Create | i18n keys: `partnerships.widgets.wipCount.title` ("WIP This Month"), `partnerships.widgets.wipCount.subtitle` ("{{month}}"), `partnerships.widgets.wipCount.wicPlaceholder` ("WIC: —"), `partnerships.widgets.wipCount.noData` ("No WIP data for this period") |

## OM Patterns Used
- **Dashboard widget** — Reference: `$OM_REPO/packages/core/src/modules/customers/widgets/dashboard/customer-todos/widget.ts` (metadata, lazy loading, feature gates)
- **Widget client component** — Reference: `$OM_REPO/packages/core/src/modules/customers/widgets/dashboard/customer-todos/widget.client.tsx` (apiCall, loading states)
- **Widget injection** — Reference: `$OM_REPO/packages/core/src/modules/customers/widgets/injection-table.ts` (spot registration)
- **Custom GET route** — Reference: `$OM_REPO/packages/core/src/modules/customers/api/people/route.ts` (route with openApi export)

## Implementation Notes

### API Route: `GET /api/partnerships/wip-count`
Query parameters:
- `month` (optional, default: current month): `YYYY-MM` format, validated with Zod regex

Query logic:
```sql
SELECT COUNT(DISTINCT d.id) as count
FROM customer_deals d
JOIN entity_field_values efv ON efv.entity_id = d.id
  AND efv.field_definition_id = :wipRegisteredAtFieldId
WHERE d.organization_id = :organizationId
  AND d.tenant_id = :tenantId
  AND d.deleted_at IS NULL
  AND efv.value IS NOT NULL
  AND efv.value >= :monthStart   -- YYYY-MM-01T00:00:00Z
  AND efv.value < :nextMonthStart -- next month 1st
```

Note: The exact query depends on how the entities module stores custom field values. The interceptor writes `wip_registered_at` via the entities records API, so the value is in the entity field values table. The route must join to read it. Use `em.getConnection().execute()` for the raw query or adapt to the entities module's query API.

### Widget Display
- Title: "WIP This Month" (i18n key: `partnerships.widgets.wipCount.title`)
- Large number display: count value
- Subtitle: month name (e.g., "March 2026")
- Month navigation: left/right arrows to browse previous months
- Placeholder for WIC: "WIC: —" with tooltip "Available in Phase 2"

### Org Scoping
- PM with org switcher: `organizationId` comes from org switcher header, already resolved by platform context. No special case needed.
- BD/Admin: scoped to their own org automatically.
- Contributor: does NOT have `partnerships.widgets.wip-count` feature — widget not visible.

## Testing

### Unit Tests
- `api/get/wip-count.test.ts` — colocated

| Function | Test |
|----------|------|
| `handler` | Returns count=0 when no deals have `wip_registered_at` set |
| `handler` | Returns correct count scoped to organization |
| `handler` | Correctly filters by month boundaries (UTC) |
| `handler` | Rejects invalid month format with 400 |
| `handler` | Defaults to current month when `month` param omitted |

### Integration Test Scenarios

| ID | Type | Scenario | Expected Result |
|----|------|----------|-----------------|
| T1 | API | Create 3 deals, move 2 to SQL stage, query `GET /api/partnerships/wip-count?month=YYYY-MM` | `{ count: 2, month: "YYYY-MM" }` |
| T2 | API | Create deal, move to SQL in March, query for April | `{ count: 0, month: "YYYY-04" }` (deal not in April) |
| T3 | API | Two orgs: Org A has 2 WIP deals, Org B has 1. Query as Org A user | `{ count: 2 }` — no Org B leak |
| T4 | API | Query without `month` param | Returns current month count |

## Verification
```bash
yarn generate                    # After adding widget files
yarn typecheck                   # Must pass
yarn build                       # Must pass
yarn test                        # Unit tests pass
yarn test:integration:ephemeral  # Integration tests pass (T1-T4)
```
