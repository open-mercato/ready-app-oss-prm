# PRM Flagship Refactor — Design Spec

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Created** | 2026-03-19 |
| **Related** | SPEC-053, SPEC-053b, SPEC-068 |

## TLDR

Refactor the `partnerships` module API layer to use platform patterns (`makeCrudRoute`, Command pattern, openApi factory), fix i18n gaps, remove placeholder pages, and add search indexing — making `starter-b2b-prm` a compliant flagship example per SPEC-053 and SPEC-068.

## Problem Statement

The partnerships module was built with raw `em.find`/`em.findOne` calls in all 21 API routes. As the first official Open Mercato example app (SPEC-068), it should demonstrate platform patterns that developers will copy. Current state teaches anti-patterns:

- 0 of 21 routes use `makeCrudRoute`
- Manual pagination, inconsistent response shapes
- Portal RFP respond uses raw `em.persist` instead of Command pattern
- Hardcoded strings in portal and backend pages (RFP Detail, RFP Inbox, KPI Import)
- 2 placeholder "Coming Soon" pages in portal navigation
- Empty `search.ts` (no fulltext search indexing)
- Manual openApi objects instead of factory helper
- Raw `em.find`/`em.findOne` in custom routes instead of `findWithDecryption`

SPEC-053 compliance matrix claims "Command pattern for write operations: Compliant" and "No hardcoded user-facing strings" — but the implementation doesn't match.

## Scope

### In scope
1. Refactor 6 admin routes to `makeCrudRoute`
2. Cleanup 8 custom admin routes (openApi, response shape, N+1 fix, `findWithDecryption`)
3. Add Command pattern to portal RFP respond
4. Fix i18n gaps in portal and backend pages
5. Create `api/openapi.ts` factory helper
6. Remove placeholder pages (Case Studies, Team) from navigation
7. Add PartnerAgency to `search.ts`
8. Add ErrorMessage to DataTable pages
9. Clean up unused imports

### Out of scope (follow-up)
- UMES extension modules (`partnerships_customers_ext`, `partnerships_sales_ext`)
- External KPI import routes with machine auth (`/import/external`)
- Query engine integration for custom aggregation routes
- RFP campaign creation route (`partnerships.partner_rfp.issue` command) — no admin RFP creation route exists yet in the API layer; will be added when RFP admin UI is built

## Design

### 1. Route Classification

#### Routes migrating to `makeCrudRoute` (6)

| Route | Entity | Operations | Commands |
|-------|--------|------------|----------|
| `agencies/route.ts` | PartnerAgency | GET list, POST | `partnerships.partner_agency.self_onboard` |
| `tiers/route.ts` | PartnerTierDefinition | GET list, POST | `partnerships.partner_tier.define` |
| `tiers/[id]/route.ts` | PartnerTierDefinition | GET detail, PATCH | `partnerships.partner_tier.update` |
| `min/license-deals/route.ts` | PartnerLicenseDeal | GET list, POST, PUT | `partnerships.partner_license_deal.create`, `.update`, `.attribute` |
| `agencies/[organizationId]/tier-history/route.ts` | PartnerTierAssignment | GET list (read-only) | — |
| `kpi/min/route.ts` | PartnerLicenseDeal | GET list (read-only, filtered) | — |

Note: `min/license-deals` also has the `attributeLicenseDealCommand` registered — it will be wired as a separate PUT action or custom endpoint alongside the CRUD operations.

Each route will:
- Use `makeCrudRoute` with `orm`, `list`, `actions`, `indexer` config
- Export `metadata` with `requireAuth` + `requireFeatures`
- Export `openApi` using the partnerships factory helper
- Use `buildFilters` for query scoping
- Use `transformItem` for response normalization

#### `tier-history` specifics
- List-only `makeCrudRoute` on `PartnerTierAssignment`
- `buildFilters` resolves `partnerAgencyId` from path param `organizationId` (lookup via PartnerAgency)
- Sorted by `grantedAt desc`

#### `kpi/min` specifics
- List-only `makeCrudRoute` on `PartnerLicenseDeal`
- `buildFilters`: `dealType=enterprise`, `status=won`, `isRenewal=false`, year filter on `createdAt`
- Default: use `makeCrudRoute` returning flat paginated list; frontend handles grouping
- Fallback: if `makeCrudRoute` proves awkward for this use case, keep as custom route with proper pagination and consistent response shape

#### Custom admin routes staying custom (8)

| Route | Reason | Changes |
|-------|--------|---------|
| `agencies/[organizationId]/tier-assignments/route.ts` | Custom POST action | openApi factory, consistent response |
| `agencies/[organizationId]/tier-status/route.ts` | Computed view (eligibility) | openApi factory |
| `agencies/[organizationId]/tier-downgrade/route.ts` | Custom POST action | openApi factory |
| `kpi/dashboard/route.ts` | Multi-entity aggregation | **Fix N+1**: batch query instead of `agencies.map(async => ...)` |
| `kpi/me/route.ts` | Self-view combining agency+metrics+tier | openApi factory |
| `kpi/snapshots/import/route.ts` | Import action (Command) | openApi factory |
| `kpi/wic-runs/import/route.ts` | Import action (Command) | openApi factory |
| `kpi/wic-runs/[runId]/route.ts` | Detail with child entities | openApi factory |

All custom routes will:
- Use openApi factory helper (not manual objects)
- Return consistent `{ ok, data: { ... } }` response shape
- Validate query params with zod
- Use `findWithDecryption`/`findOneWithDecryption` instead of raw `em.find`/`em.findOne` (per AGENTS.md convention — `makeCrudRoute` handles this internally for migrated routes, but custom routes must use the encrypted variants explicitly)
- Wire `validateCrudMutationGuard` before mutation logic and `runCrudMutationGuardAfterSuccess` after successful mutation for all custom POST/PUT/PATCH/DELETE handlers (per `packages/core/AGENTS.md` — `makeCrudRoute` handles this internally for migrated routes)

Note on encryption: No PRM entities currently have encrypted fields, but using `findWithDecryption` is the platform convention and ensures forward compatibility if encrypted fields are added later.

#### `kpi/dashboard` N+1 fix
Current: `Promise.all(agencies.map(async agency => getLatestMetricValues(...)))` — O(n) DB queries.
Fix: Single query joining `partner_agencies` with latest metric snapshots and current tier assignments, or batch fetch metrics + tiers for all agencies in 2 queries, then merge in JS.

### 2. Portal Routes (7)

| Route | Changes |
|-------|---------|
| `portal/rfp/[id]/respond/route.ts` | **Migrate to Command pattern** (`partnerships.partner_rfp.respond`) |
| `portal/rfp/route.ts` | openApi export, `findWithDecryption`, consistent response |
| `portal/rfp/[id]/route.ts` | openApi export, `findWithDecryption` |
| `portal/dashboard/route.ts` | openApi export, `findWithDecryption` |
| `portal/kpi/route.ts` | openApi export, `findWithDecryption` |
| `portal/case-studies/route.ts` | **Delete** (placeholder) |
| `portal/case-studies/[id]/route.ts` | **Delete** (placeholder) |

Portal routes stay custom (platform convention — portal never uses `makeCrudRoute`). Auth pattern: `getCustomerAuthFromRequest` + `requireCustomerFeature`.

All remaining portal routes will export `openApi` with tag `['Partner Portal']` (per AGENTS.md: "API routes MUST export `openApi` for documentation generation").

### 3. OpenApi Factory Helper

Create `src/modules/partnerships/api/openapi.ts`:

```typescript
import { createCrudOpenApiFactory } from '@open-mercato/shared/lib/openapi/crud'

export const createPartnershipsCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: 'Partnerships',
})
```

All admin routes import from this file. Portal routes use manual `openApi` objects with `['Partner Portal']` tag (portal routes don't use CRUD factory pattern).

### 4. i18n Fixes

#### Portal pages
- `frontend/.../rfp/[id]/page.tsx` — "Submit Response", "Update Response", "Campaign Details", error messages, success messages (~10 strings)
- `frontend/.../rfp/page.tsx` — "No RFP campaigns available", empty state description (~3 strings)

#### Backend pages
- `backend/kpi/import/page.tsx` — select option labels "WIC", "MIN", "Manual", "Ingest" (~4 strings)

All will use `useT()` with `partnerships.*` translation keys.

### 5. Placeholder Pages Removal

Delete:
- `frontend/[orgSlug]/portal/partnerships/case-studies/page.tsx`
- `frontend/[orgSlug]/portal/partnerships/team/page.tsx`
- `api/portal/case-studies/route.ts`
- `api/portal/case-studies/[id]/route.ts`

Remove from `widgets/injection/portal-nav/widget.ts`:
- "Case Studies" menu item
- "Team" menu item

### 6. Search Configuration

Update `search.ts` to index `PartnerAgency`:

```typescript
entities: [
  {
    entityType: 'partnerships:partner_agency',
    entity: PartnerAgency,
    fields: ['name', 'status'],
    // ... standard search config
  },
]
```

### 7. Backend UI Fixes

- Add `ErrorMessage` component to DataTable pages (tiers, KPI, agencies, MIN) for failed query states
- Remove unused `apiCall` import from `backend/min/page.tsx`

## Testing Strategy

- Existing integration tests (TC-008/009/010) must continue passing
- Existing Playwright e2e suite must continue passing
- Response shapes may change (standardized pagination) — update test assertions accordingly

## Risks

### Response shape changes break existing tests
- **Severity**: Medium
- **Mitigation**: Update test assertions as part of refactor. Run full test suite after each route migration.

### makeCrudRoute doesn't fit tier-history or kpi/min well
- **Severity**: Low
- **Mitigation**: If `makeCrudRoute` is awkward for these routes, keep custom with standardized response shape and `findWithDecryption`. Decision criterion: if route needs more than `buildFilters` + `transformItem` to express the query, it stays custom.

## Changelog

### 2026-03-19
- Initial design spec. Approved by user after Piotr review.
- Fixed review issues: path param names (`[organizationId]` not `[orgId]`), added `findWithDecryption` requirement for custom routes, noted `partner_rfp.issue` as out-of-scope (no route exists), confirmed portal routes get `openApi` exports, noted `attributeLicenseDealCommand` wiring, clarified `kpi/min` fallback criterion, renamed i18n section to cover portal+backend, added encryption forward-compatibility note.
