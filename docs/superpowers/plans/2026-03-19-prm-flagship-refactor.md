# PRM Flagship Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor partnerships module API layer to use platform patterns (`makeCrudRoute`, Command pattern, openApi factory), making starter-b2b-prm a compliant flagship example.

**Architecture:** Migrate 6 admin CRUD routes to `makeCrudRoute` with Command-driven writes. Clean up 8 custom admin routes and 5 portal routes with openApi factory, `findWithDecryption`, mutation guards. Remove placeholder pages, fix i18n, add search indexing.

**Tech Stack:** `makeCrudRoute` from `@open-mercato/shared/lib/crud/factory`, `createCrudOpenApiFactory` from `@open-mercato/shared/lib/openapi/crud`, `findWithDecryption` from `@open-mercato/shared/lib/encryption/find`, zod validators, Command pattern, entity IDs from `@/.mercato/generated/entities.ids.generated`

**Spec:** `docs/superpowers/specs/2026-03-19-prm-flagship-refactor-design.md`

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `api/openapi.ts` | Partnerships openApi factory helper |

### Files to rewrite (makeCrudRoute migration)
| File | Change |
|------|--------|
| `api/agencies/route.ts` | → makeCrudRoute with Command create |
| `api/tiers/route.ts` | → makeCrudRoute with Command create |
| `api/tiers/[id]/route.ts` | → makeCrudRoute with Command update |
| `api/min/license-deals/route.ts` | → makeCrudRoute with Command create/update/attribute |
| `api/agencies/[organizationId]/tier-history/route.ts` | → makeCrudRoute list-only |
| `api/kpi/min/route.ts` | → makeCrudRoute list-only |

### Files to modify (cleanup)
| File | Change |
|------|--------|
| `api/agencies/[organizationId]/tier-assignments/route.ts` | openApi factory, findWithDecryption, mutation guard |
| `api/agencies/[organizationId]/tier-status/route.ts` | openApi factory, findWithDecryption |
| `api/agencies/[organizationId]/tier-downgrade/route.ts` | openApi factory, findWithDecryption, mutation guard |
| `api/kpi/dashboard/route.ts` | openApi factory, findWithDecryption, fix N+1 |
| `api/kpi/me/route.ts` | openApi factory, findWithDecryption |
| `api/kpi/snapshots/import/route.ts` | openApi factory, mutation guard |
| `api/kpi/wic-runs/import/route.ts` | openApi factory, mutation guard |
| `api/kpi/wic-runs/[runId]/route.ts` | openApi factory, findWithDecryption |
| `api/portal/rfp/route.ts` | openApi export, findWithDecryption |
| `api/portal/rfp/[id]/route.ts` | openApi export, findWithDecryption |
| `api/portal/rfp/[id]/respond/route.ts` | Migrate to Command pattern, openApi export |
| `api/portal/dashboard/route.ts` | openApi export, findWithDecryption |
| `api/portal/kpi/route.ts` | openApi export, findWithDecryption |
| `search.ts` | Add PartnerAgency to search index |
| `widgets/injection/portal-nav/widget.ts` | Remove Case Studies + Team items |
| `frontend/[orgSlug]/portal/partnerships/rfp/[id]/page.tsx` | i18n hardcoded strings |
| `frontend/[orgSlug]/portal/partnerships/rfp/page.tsx` | i18n hardcoded strings |
| `backend/kpi/import/page.tsx` | i18n select labels |
| `backend/tiers/page.tsx` | Add ErrorMessage |
| `backend/kpi/page.tsx` | Add ErrorMessage |
| `backend/agencies/page.tsx` | Add ErrorMessage |
| `backend/min/page.tsx` | Add ErrorMessage, remove unused import |
| `data/validators.ts` | Add list query schemas for makeCrudRoute |

### Files to delete
| File | Reason |
|------|--------|
| `frontend/[orgSlug]/portal/partnerships/case-studies/page.tsx` | Placeholder |
| `frontend/[orgSlug]/portal/partnerships/team/page.tsx` | Placeholder |
| `api/portal/case-studies/route.ts` | Placeholder |
| `api/portal/case-studies/[id]/route.ts` | Placeholder |

All paths below are relative to `src/modules/partnerships/`.

---

## Task 1: Create openApi factory helper

**Files:**
- Create: `api/openapi.ts`

- [ ] **Step 1: Create the factory helper file**

```typescript
// api/openapi.ts
import { createCrudOpenApiFactory } from '@open-mercato/shared/lib/openapi/crud'

export const createPartnershipsCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: 'Partnerships',
})
```

- [ ] **Step 2: Verify import resolves**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/api/openapi.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/modules/partnerships/api/openapi.ts
git commit -m "feat(partnerships): add openApi factory helper"
```

---

## Task 2: Add list query schemas to validators

**Files:**
- Modify: `data/validators.ts`

The `makeCrudRoute` list config needs zod schemas for query params. Add schemas for agencies, tiers, license deals, tier history.

- [ ] **Step 1: Read current validators.ts to understand existing patterns**

Read: `src/modules/partnerships/data/validators.ts`

- [ ] **Step 2: Add list query schemas at the end of the file**

Add these schemas (after existing schemas):

```typescript
// ── List query schemas (for makeCrudRoute) ──────────────────

export const agencyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  search: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const tierListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  includeInactive: z.coerce.boolean().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const tierHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
})

export const licenseDealListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  status: z.enum(['open', 'won', 'lost']).optional(),
  dealType: z.enum(['enterprise', 'standard']).optional(),
  year: z.coerce.number().int().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const licenseDealMinQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  year: z.coerce.number().int().optional(),
})
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/data/validators.ts`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/data/validators.ts
git commit -m "feat(partnerships): add list query schemas for makeCrudRoute"
```

---

## Task 3: Migrate agencies/route.ts to makeCrudRoute

**Files:**
- Rewrite: `api/agencies/route.ts`

- [ ] **Step 1: Read the current route to understand exact behavior**

Read: `src/modules/partnerships/api/agencies/route.ts`

- [ ] **Step 2: Rewrite using makeCrudRoute**

Replace the entire file with:

```typescript
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { z } from 'zod'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { PartnerAgency } from '../../data/entities'
import { agencyListQuerySchema, onboardAgencySchema } from '../../data/validators'
import { createPartnershipsCrudOpenApi } from '../openapi'
import { createPagedListResponseSchema, defaultCreateResponseSchema } from '@open-mercato/shared/lib/openapi/crud'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.agencies.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.agencies.manage'] },
}

const agencyListItemSchema = z.object({
  id: z.string().uuid(),
  agencyOrganizationId: z.string().uuid(),
  name: z.string().nullable(),
  status: z.string(),
  onboardedAt: z.string().nullable(),
  createdAt: z.string(),
})

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: PartnerAgency,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: E.partnerships.partner_agency },
  list: {
    schema: agencyListQuerySchema,
    fields: ['id', 'agency_organization_id', 'name', 'status', 'onboarded_at', 'created_at'],
    sortFieldMap: {
      name: 'name',
      status: 'status',
      createdAt: 'created_at',
    },
    buildFilters: async (query: z.infer<typeof agencyListQuerySchema>) => {
      const filters: Record<string, any> = {}
      if (query.status) filters.status = { $eq: query.status }
      if (query.search) filters.name = { $ilike: `%${query.search}%` }
      return filters
    },
    transformItem: (item: any) => ({
      id: item.id,
      agencyOrganizationId: item.agency_organization_id,
      name: item.name ?? null,
      status: item.status,
      onboardedAt: item.onboarded_at ?? null,
      createdAt: item.created_at,
    }),
  },
  actions: {
    create: {
      commandId: 'partnerships.partner_agency.self_onboard',
      mapInput: async ({ raw, ctx }) => {
        const parsed = onboardAgencySchema.parse(raw)
        return {
          ...parsed,
          tenantId: ctx.auth?.tenantId,
          organizationId: ctx.auth?.orgId,
          userId: ctx.auth?.userId,
        }
      },
      response: ({ result }) => ({ id: result?.id }),
      status: 201,
    },
  },
})

export { routeMetadata as metadata }
export const { GET, POST } = crud

export const openApi = createPartnershipsCrudOpenApi({
  resourceName: 'Partner Agency',
  pluralName: 'Partner Agencies',
  querySchema: agencyListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(agencyListItemSchema),
  create: {
    schema: onboardAgencySchema,
    responseSchema: defaultCreateResponseSchema,
    description: 'Self-onboard a partner agency into the program.',
  },
})
```

- [ ] **Step 3: Type-check the route**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/api/agencies/route.ts`
Expected: No errors (or minor type issues to fix)

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/api/agencies/route.ts
git commit -m "refactor(partnerships): migrate agencies route to makeCrudRoute"
```

---

## Task 4: Migrate tiers/route.ts to makeCrudRoute

**Files:**
- Rewrite: `api/tiers/route.ts`

- [ ] **Step 1: Read current route**

Read: `src/modules/partnerships/api/tiers/route.ts`

- [ ] **Step 2: Rewrite using makeCrudRoute**

Follow same pattern as Task 3 but for PartnerTierDefinition:
- Entity: `PartnerTierDefinition`
- List fields: `id`, `key`, `label`, `wic_threshold`, `wip_threshold`, `min_threshold`, `is_active`, `created_at`
- Filter: `includeInactive` → conditionally add `isActive: { $eq: true }`
- Command create: `partnerships.partner_tier.define`
- indexer: `E.partnerships.partner_tier_definition`
- Use `tierListQuerySchema` and `createTierDefinitionSchema`

- [ ] **Step 3: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/api/tiers/route.ts`

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/api/tiers/route.ts
git commit -m "refactor(partnerships): migrate tiers route to makeCrudRoute"
```

---

## Task 5: Migrate tiers/[id]/route.ts to makeCrudRoute

**Files:**
- Rewrite: `api/tiers/[id]/route.ts`

- [ ] **Step 1: Read current route**

Read: `src/modules/partnerships/api/tiers/[id]/route.ts`

- [ ] **Step 2: Rewrite using makeCrudRoute**

- Entity: `PartnerTierDefinition`
- GET detail (by ID from path param)
- PATCH via Command: `partnerships.partner_tier.update`
- indexer: `E.partnerships.partner_tier_definition`
- Use `updateTierDefinitionSchema`

Note: `makeCrudRoute` GET returns a single item when `resolveIdentifiers` extracts an `id` from the request path. Check how the platform handles `[id]` path param extraction — the factory may need `resolveIdentifiers` config.

- [ ] **Step 3: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/api/tiers/\\[id\\]/route.ts`

- [ ] **Step 4: Commit**

```bash
git add "src/modules/partnerships/api/tiers/[id]/route.ts"
git commit -m "refactor(partnerships): migrate tiers detail route to makeCrudRoute"
```

---

## Task 6: Migrate min/license-deals/route.ts to makeCrudRoute

**Files:**
- Rewrite: `api/min/license-deals/route.ts`

- [ ] **Step 1: Read current route**

Read: `src/modules/partnerships/api/min/license-deals/route.ts`

- [ ] **Step 2: Rewrite using makeCrudRoute**

- Entity: `PartnerLicenseDeal`
- GET list with pagination
- POST via Command: `partnerships.partner_license_deal.create`
- PUT branches to either `update` or `attribute` command — use `actions.update` with `mapInput` that inspects the payload and routes to the correct command. If `makeCrudRoute` doesn't support branching, keep PUT as a custom handler alongside the CRUD-generated GET/POST.
- indexer: `E.partnerships.partner_license_deal`
- Use `licenseDealListQuerySchema`, `createLicenseDealSchema`

- [ ] **Step 3: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/api/min/license-deals/route.ts`

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/api/min/license-deals/route.ts
git commit -m "refactor(partnerships): migrate license-deals route to makeCrudRoute"
```

---

## Task 7: Migrate tier-history to makeCrudRoute (list-only)

**Files:**
- Rewrite: `api/agencies/[organizationId]/tier-history/route.ts`

- [ ] **Step 1: Read current route**

Read: `src/modules/partnerships/api/agencies/[organizationId]/tier-history/route.ts`

- [ ] **Step 2: Rewrite as list-only makeCrudRoute**

- Entity: `PartnerTierAssignment`
- GET list only (no POST/PUT/DELETE)
- `buildFilters` must resolve `partnerAgencyId` from path param `organizationId`:
  - Lookup `PartnerAgency` by `agencyOrganizationId === ctx.params.organizationId`
  - If not found, throw 404
  - Return filter: `{ partnerAgencyId: { $eq: agency.id } }`
- Sort: `grantedAt desc`
- indexer: `E.partnerships.partner_tier_assignment`
- Use `tierHistoryQuerySchema`
- Export only `GET` from crud (not POST/PUT/DELETE)

- [ ] **Step 3: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/api/agencies/\\[organizationId\\]/tier-history/route.ts`

- [ ] **Step 4: Commit**

```bash
git add "src/modules/partnerships/api/agencies/[organizationId]/tier-history/route.ts"
git commit -m "refactor(partnerships): migrate tier-history to makeCrudRoute list-only"
```

---

## Task 8: Migrate kpi/min to makeCrudRoute (list-only)

**Files:**
- Rewrite: `api/kpi/min/route.ts`

- [ ] **Step 1: Read current route**

Read: `src/modules/partnerships/api/kpi/min/route.ts`

- [ ] **Step 2: Decide: makeCrudRoute or custom with cleanup**

Try `makeCrudRoute` first:
- Entity: `PartnerLicenseDeal`
- GET list only
- `buildFilters`: `dealType=enterprise`, `status=won`, `isRenewal=false`, year filter from query
- `transformItem`: return flat deal items (frontend groups by agency)
- indexer: `E.partnerships.partner_license_deal`
- Use `licenseDealMinQuerySchema`

**Decision criterion:** if `buildFilters` + `transformItem` express the query cleanly, use `makeCrudRoute`. If the current aggregation (groupBy agency in JS) is essential to the response shape, keep custom with proper pagination, openApi factory, and `findWithDecryption`.

- [ ] **Step 3: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/api/kpi/min/route.ts`

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/api/kpi/min/route.ts
git commit -m "refactor(partnerships): migrate kpi/min to makeCrudRoute list-only"
```

---

## Task 9: Clean up custom admin routes (batch)

**Files:**
- Modify: `api/agencies/[organizationId]/tier-assignments/route.ts`
- Modify: `api/agencies/[organizationId]/tier-status/route.ts`
- Modify: `api/agencies/[organizationId]/tier-downgrade/route.ts`
- Modify: `api/kpi/me/route.ts`
- Modify: `api/kpi/wic-runs/[runId]/route.ts`

For each file apply these changes:

- [ ] **Step 1: Replace `em.find`/`em.findOne` with `findWithDecryption`/`findOneWithDecryption`**

Add import:
```typescript
import { findWithDecryption, findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
```

Replace all:
- `em.findOne(Entity, where)` → `findOneWithDecryption(em, Entity, where, undefined, { tenantId, organizationId })`
- `em.find(Entity, where, opts)` → `findWithDecryption(em, Entity, where, opts, { tenantId, organizationId })`

- [ ] **Step 2: Replace manual openApi with factory helper**

For read-only routes (tier-status, kpi/me, wic-runs/[runId]):
```typescript
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const openApi: OpenApiRouteDoc = {
  summary: 'Route description',
  methods: {
    GET: {
      summary: 'Get ...',
      tags: ['Partnerships'],
      responses: [{ status: 200, description: 'Success', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Not authenticated' },
        { status: 404, description: 'Not found' },
      ],
    },
  },
}
```

For write routes (tier-assignments, tier-downgrade): same pattern but add POST method doc.

- [ ] **Step 3: Add mutation guard to write routes (tier-assignments, tier-downgrade)**

Add to tier-assignments POST and tier-downgrade POST:
```typescript
import { runMutationGuards } from '@open-mercato/shared/lib/crud/mutation-guard-registry'
```

Before command execution:
```typescript
const guards = container.resolve('mutationGuards') ?? []
const guardResult = await runMutationGuards(guards, {
  tenantId, organizationId, userId: ctx.auth?.userId,
  resourceKind: 'partnerships:partner_tier_assignment',
  resourceId: agency.id,
  operation: 'create',
  requestMethod: 'POST',
  requestHeaders: req.headers,
  mutationPayload: parsed,
}, { userFeatures: ctx.auth?.features ?? [] })

if (!guardResult.ok) {
  return Response.json(guardResult.errorBody, { status: guardResult.errorStatus ?? 403 })
}
```

After successful command execution:
```typescript
for (const cb of guardResult.afterSuccessCallbacks) {
  await cb.guard.afterSuccess?.({ ...guardInput, metadata: cb.metadata })
}
```

- [ ] **Step 4: Type-check all modified files**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/modules/partnerships/api/agencies/ src/modules/partnerships/api/kpi/me/ src/modules/partnerships/api/kpi/wic-runs/
git commit -m "refactor(partnerships): cleanup custom admin routes (findWithDecryption, openApi, mutation guards)"
```

---

## Task 10: Fix KPI dashboard N+1 and cleanup

**Files:**
- Modify: `api/kpi/dashboard/route.ts`

- [ ] **Step 1: Read current route**

Read: `src/modules/partnerships/api/kpi/dashboard/route.ts`

- [ ] **Step 2: Replace N+1 with batch queries**

Replace `agencies.map(async => getLatestMetricValues(...))` pattern with:
1. Fetch all agencies in one query
2. Fetch latest metric snapshots for all agencies in one query (group by `partnerAgencyId`)
3. Fetch current tier assignments for all agencies in one query
4. Merge in JS

Use `findWithDecryption` for all queries.

- [ ] **Step 3: Add openApi export and mutation guard imports (not needed — GET only)**

Replace manual `openApi` with typed version using `OpenApiRouteDoc`.

- [ ] **Step 4: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit src/modules/partnerships/api/kpi/dashboard/route.ts`

- [ ] **Step 5: Commit**

```bash
git add src/modules/partnerships/api/kpi/dashboard/route.ts
git commit -m "fix(partnerships): eliminate N+1 in KPI dashboard, add openApi"
```

---

## Task 11: Clean up KPI import routes (mutation guards + openApi)

**Files:**
- Modify: `api/kpi/snapshots/import/route.ts`
- Modify: `api/kpi/wic-runs/import/route.ts`

- [ ] **Step 1: Read both files**

Read both import route files.

- [ ] **Step 2: Add mutation guard, openApi, and findWithDecryption**

Same pattern as Task 9 Step 3 for mutation guards.
Add typed `openApi` export with POST method doc.
Replace any `em.find`/`em.findOne` with encrypted variants.

- [ ] **Step 3: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/api/kpi/snapshots/ src/modules/partnerships/api/kpi/wic-runs/import/
git commit -m "refactor(partnerships): add mutation guards and openApi to KPI import routes"
```

---

## Task 12: Portal RFP respond → Command pattern

**Files:**
- Modify: `api/portal/rfp/[id]/respond/route.ts`
- May modify: `commands/` (if `partnerships.partner_rfp.respond` command doesn't exist yet)

- [ ] **Step 1: Read current respond route and check if command exists**

Read: `src/modules/partnerships/api/portal/rfp/[id]/respond/route.ts`
Search: `grep -r "partner_rfp.respond" src/modules/partnerships/commands/`

- [ ] **Step 2: Create respond command if missing**

If command doesn't exist, create it in a new file `commands/rfp.ts` or add to existing commands file. Follow the pattern from `commands/agencies.ts`:

```typescript
import { registerCommand } from '@open-mercato/shared/lib/commands'
// ... register partnerships.partner_rfp.respond command
// - Validate campaign is published
// - Create or update PartnerRfpResponse
// - Emit partnerships.partner_rfp.responded event
// - Undoable
```

- [ ] **Step 3: Rewrite respond route to use CommandBus**

Replace raw `em.create`/`em.persist`/`em.flush` with:
```typescript
const commandBus = container.resolve('commandBus')
const result = await commandBus.execute('partnerships.partner_rfp.respond', input, {
  tenantId: auth.tenantId,
  organizationId: auth.orgId,
  userId: auth.sub,
})
```

Add `openApi` export and mutation guard.

- [ ] **Step 4: Register command in di.ts**

Add import to `di.ts`:
```typescript
import './commands/rfp'
```

- [ ] **Step 5: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/modules/partnerships/commands/rfp.ts src/modules/partnerships/api/portal/rfp/ src/modules/partnerships/di.ts
git commit -m "refactor(partnerships): migrate portal RFP respond to Command pattern"
```

---

## Task 13: Portal routes openApi cleanup

**Files:**
- Modify: `api/portal/rfp/route.ts`
- Modify: `api/portal/rfp/[id]/route.ts`
- Modify: `api/portal/dashboard/route.ts`
- Modify: `api/portal/kpi/route.ts`

- [ ] **Step 1: Read all 4 portal route files**

- [ ] **Step 2: Add openApi export and findWithDecryption to each**

For each file:
- Replace `em.find`/`em.findOne` with `findWithDecryption`/`findOneWithDecryption`
- Add typed `openApi` export with tag `['Partner Portal']`
- Ensure consistent `{ ok, data }` response shape

- [ ] **Step 3: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/api/portal/
git commit -m "refactor(partnerships): add openApi and findWithDecryption to portal routes"
```

---

## Task 14: Remove placeholder pages

**Files:**
- Delete: `frontend/[orgSlug]/portal/partnerships/case-studies/page.tsx`
- Delete: `frontend/[orgSlug]/portal/partnerships/team/page.tsx`
- Delete: `api/portal/case-studies/route.ts`
- Delete: `api/portal/case-studies/[id]/route.ts`
- Modify: `widgets/injection/portal-nav/widget.ts`

- [ ] **Step 1: Delete placeholder page files**

```bash
cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm
rm src/modules/partnerships/frontend/\[orgSlug\]/portal/partnerships/case-studies/page.tsx
rm src/modules/partnerships/frontend/\[orgSlug\]/portal/partnerships/team/page.tsx
rm src/modules/partnerships/api/portal/case-studies/route.ts
rm src/modules/partnerships/api/portal/case-studies/\[id\]/route.ts
```

- [ ] **Step 2: Remove empty directories**

```bash
rmdir src/modules/partnerships/frontend/\[orgSlug\]/portal/partnerships/case-studies/
rmdir src/modules/partnerships/frontend/\[orgSlug\]/portal/partnerships/team/
rmdir src/modules/partnerships/api/portal/case-studies/\[id\]/
rmdir src/modules/partnerships/api/portal/case-studies/
```

- [ ] **Step 3: Read and edit portal-nav widget**

Read: `src/modules/partnerships/widgets/injection/portal-nav/widget.ts`

Remove the "Case Studies" and "Team Management" menu items from the items array. Keep only: Partner Dashboard, KPI Details, RFP Campaigns.

- [ ] **Step 4: Commit**

```bash
git add -A src/modules/partnerships/frontend/ src/modules/partnerships/api/portal/case-studies/ src/modules/partnerships/widgets/
git commit -m "chore(partnerships): remove placeholder pages (case-studies, team) from portal nav"
```

---

## Task 15: Fix i18n hardcoded strings

**Files:**
- Modify: `frontend/[orgSlug]/portal/partnerships/rfp/[id]/page.tsx`
- Modify: `frontend/[orgSlug]/portal/partnerships/rfp/page.tsx`
- Modify: `backend/kpi/import/page.tsx`
- Modify: `i18n/en.json` (add new translation keys)

- [ ] **Step 1: Read all 3 files to identify hardcoded strings**

- [ ] **Step 2: Replace hardcoded strings with useT() calls**

In `rfp/[id]/page.tsx` replace:
- `"Submit Response"` → `t('partnerships.portal.rfp.submitResponse', 'Submit Response')`
- `"Update Response"` → `t('partnerships.portal.rfp.updateResponse', 'Update Response')`
- `"Campaign Details"` → `t('partnerships.portal.rfp.campaignDetails', 'Campaign Details')`
- `"Failed to load RFP details"` → `t('partnerships.portal.rfp.loadError', 'Failed to load RFP details')`
- `"Failed to submit response. Please try again."` → `t('partnerships.portal.rfp.submitError', 'Failed to submit response. Please try again.')`
- `"Response submitted"` → `t('partnerships.portal.rfp.responseSubmitted', 'Response submitted')`
- `"Your response has been submitted successfully."` → `t('partnerships.portal.rfp.submitSuccess', 'Your response has been submitted successfully.')`
- `"This campaign is closed and no longer accepting responses."` → `t('partnerships.portal.rfp.campaignClosed', 'This campaign is closed and no longer accepting responses.')`

In `rfp/page.tsx` replace:
- `"No RFP campaigns available"` → `t('partnerships.portal.rfp.noRfps', 'No RFP campaigns available')`
- `"New campaigns will appear here when published."` → `t('partnerships.portal.rfp.noRfpsDescription', 'New campaigns will appear here when published.')`

In `backend/kpi/import/page.tsx` replace select labels:
- `'WIC'` → `t('partnerships.kpi.metricType.wic', 'WIC')`
- `'MIN'` → `t('partnerships.kpi.metricType.min', 'MIN')`
- `'Manual'` → `t('partnerships.kpi.source.manual', 'Manual')`
- `'Ingest'` → `t('partnerships.kpi.source.ingest', 'Ingest')`

- [ ] **Step 3: Add new keys to i18n JSON files**

Read: `src/modules/partnerships/i18n/en.json`

Add all new `partnerships.portal.rfp.*` and `partnerships.kpi.*` keys with their English values. The fallback strings in `useT()` serve as runtime defaults, but the JSON file is the source of truth for translators.

- [ ] **Step 4: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/modules/partnerships/frontend/ src/modules/partnerships/backend/kpi/ src/modules/partnerships/i18n/
git commit -m "fix(partnerships): replace hardcoded strings with i18n useT() calls"
```

---

## Task 16: Add search configuration

**Files:**
- Modify: `search.ts`

- [ ] **Step 1: Read current search.ts**

Read: `src/modules/partnerships/search.ts`

- [ ] **Step 2: Add PartnerAgency to search index**

Read reference search.ts from a core module (e.g., customers) to see exact config shape, then update partnerships search.ts with PartnerAgency entity.

- [ ] **Step 3: Commit**

```bash
git add src/modules/partnerships/search.ts
git commit -m "feat(partnerships): add PartnerAgency to search index"
```

---

## Task 17: Backend UI fixes (ErrorMessage + unused import)

**Files:**
- Modify: `backend/tiers/page.tsx`
- Modify: `backend/kpi/page.tsx`
- Modify: `backend/agencies/page.tsx`
- Modify: `backend/min/page.tsx`

- [ ] **Step 1: Read all 4 DataTable pages**

- [ ] **Step 2: Add ErrorMessage for failed queries**

In each page, add error state handling. Import:
```typescript
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
```

Add error state:
```typescript
const [error, setError] = useState<string | null>(null)
```

In the data fetch, add catch handler. Before the DataTable render:
```typescript
if (error) return <ErrorMessage message={error} />
```

- [ ] **Step 3: Remove unused apiCall import from min/page.tsx**

Read `backend/min/page.tsx` and remove the unused `apiCall` import.

- [ ] **Step 4: Type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/modules/partnerships/backend/
git commit -m "fix(partnerships): add ErrorMessage to DataTable pages, remove unused import"
```

---

## Task 18: Run full type-check and fix any remaining issues

- [ ] **Step 1: Full type-check**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && npx tsc --noEmit`

Fix any remaining type errors.

- [ ] **Step 2: Lint**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && yarn lint`

Fix any lint issues.

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix(partnerships): resolve remaining type and lint issues from flagship refactor"
```

---

## Task 19: Run integration tests and fix assertions

- [ ] **Step 1: Run existing integration tests**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && yarn test:integration`

- [ ] **Step 2: Fix broken test assertions**

Response shapes will have changed (standardized pagination from `makeCrudRoute`). Update test assertions to match new response format:
- `{ items, total, page, pageSize, totalPages }` for list routes
- Consistent `{ ok, data }` envelope

- [ ] **Step 3: Commit test fixes**

```bash
git add -A
git commit -m "test(partnerships): update integration test assertions for makeCrudRoute response shapes"
```

---

## Task 20: Final verification

- [ ] **Step 1: Run full build**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && yarn build`

- [ ] **Step 2: Run all tests**

Run: `cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm && yarn test:integration`

- [ ] **Step 3: Verify no raw em.find remains in routes**

Run: `grep -rn "em\.find\|em\.findOne\|em\.findAndCount" src/modules/partnerships/api/ --include="*.ts" | grep -v node_modules`

Expected: No results (all replaced with `findWithDecryption` or `makeCrudRoute`)

- [ ] **Step 4: Verify all routes export openApi**

Run: `grep -rL "openApi" src/modules/partnerships/api/ --include="*.ts" | grep route`

Expected: No results (all route files export openApi)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(partnerships): complete flagship refactor — all routes use platform patterns"
```
