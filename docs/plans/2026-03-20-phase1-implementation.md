# PRM Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the PRM partnerships module Phase 1 — agency onboarding foundation + stamp-based WIP pipeline tracking with dashboard widgets.

**Architecture:** App-level module at `apps/prm/src/modules/partnerships/` extending the OM platform via UMES (setup.ts seeds, API interceptors, dashboard widgets, custom entities). Zero core modifications. All data lives in the `customers` module (CRM) and `entities` module (custom fields/entities), extended by the `partnerships` module.

**Tech Stack:** TypeScript, MikroORM, Zod, React (widget client components), OM auto-discovery (setup.ts, acl.ts, events.ts, ce.ts, api/interceptors.ts, widgets/)

**Specs:** `apps/prm/docs/specs/2026-03-20-ph1-c*.md` (5 specs)

**App directory:** `apps/prm/` (scaffolded OM app — modules go in `src/modules/`)

**OM monorepo:** `$OM_REPO/` (on `develop` branch, reference only)

---

## File Structure

```
apps/prm/src/modules/partnerships/
  index.ts                                    # Module metadata
  acl.ts                                      # Feature declarations
  setup.ts                                    # seedDefaults + seedExamples + defaultRoleFeatures
  events.ts                                   # Empty events config (Phase 2 adds AgencyTierChanged)
  ce.ts                                       # Case study custom entity declaration
  data/
    custom-fields.ts                          # CF definitions + PRM_SQL_STAGE_ORDER constant
  api/
    interceptors.ts                           # WIP stamp interceptor (targets customers/deals)
    get/
      wip-count.ts                            # GET /api/partnerships/wip-count
      onboarding-status.ts                    # GET /api/partnerships/onboarding-status
  widgets/
    injection-table.ts                        # Widget-to-slot mappings
    dashboard/
      wip-count/
        widget.ts                             # WIP count widget server definition
        widget.client.tsx                     # WIP count widget client component
      onboarding-checklist/
        widget.ts                             # Onboarding checklist widget server definition
        widget.client.tsx                     # Onboarding checklist widget client component
  i18n/
    en.json                                   # English translations
```

Test files (colocated):
```
  api/interceptors.test.ts                    # WIP interceptor unit tests
  api/get/wip-count.test.ts                   # WIP count route unit tests
  api/get/onboarding-status.test.ts           # Onboarding status route unit tests
```

---

## Task 1: Module Scaffold (index.ts, acl.ts, events.ts, ce.ts)

**Spec:** `2026-03-20-ph1-c1-foundation-seed.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/index.ts`
- Create: `apps/prm/src/modules/partnerships/acl.ts`
- Create: `apps/prm/src/modules/partnerships/events.ts`
- Create: `apps/prm/src/modules/partnerships/ce.ts`

- [ ] **Step 1: Create module metadata**

Create `index.ts`:
```typescript
import type { ModuleInfo } from '@$OM_REPO/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'partnerships',
  title: 'Partner Relationship Management',
  version: '0.1.0',
  description: 'B2B partner program management — agency onboarding, KPI tracking, tier governance, and lead distribution.',
  author: 'Open Mercato',
  license: 'Proprietary',
  ejectable: true,
}

export { features } from './acl'
```

- [ ] **Step 2: Create ACL features**

Create `acl.ts`:
```typescript
export const features = [
  { id: 'partnerships.manage', title: 'Manage partnerships', module: 'partnerships' },
  { id: 'partnerships.widgets.wip-count', title: 'View WIP count widget', module: 'partnerships' },
  { id: 'partnerships.widgets.onboarding-checklist', title: 'View onboarding checklist widget', module: 'partnerships' },
]
```

- [ ] **Step 3: Create events config (empty for Phase 1)**

Create `events.ts`:
```typescript
import { createModuleEvents } from '@$OM_REPO/shared/modules/events'

const events = [] as const

export const eventsConfig = createModuleEvents({ moduleId: 'partnerships', events })
export default eventsConfig
```

- [ ] **Step 4: Create custom entity declaration for case studies**

Create `ce.ts`. Reference `$OM_REPO/packages/core/src/modules/customers/ce.ts` for the exact structure. Declare `partnerships:case_study` with `labelField: 'title'`, `showInSidebar: false`, empty `fields: []` (actual fields are seeded via entities batch API in setup.ts).

```typescript
export const entities = [
  {
    id: 'partnerships:case_study',
    label: 'Case Study',
    description: 'Agency past project documentation for RFP matching.',
    labelField: 'title',
    showInSidebar: false,
    fields: [],
  },
]
```

- [ ] **Step 5: Run generator and verify**

Run: `cd apps/prm && yarn generate`
Expected: Module files regenerated, partnerships module discovered.

Run: `yarn typecheck`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/prm/src/modules/partnerships/index.ts \
       apps/prm/src/modules/partnerships/acl.ts \
       apps/prm/src/modules/partnerships/events.ts \
       apps/prm/src/modules/partnerships/ce.ts \
       apps/prm/generated/
git commit -m "feat(partnerships): scaffold module — metadata, ACL, events, case study CE

Implements: App Spec §2, US-1.3
Phase: 1, Commit: 1a (scaffold)
Pattern: OM module auto-discovery (index.ts, acl.ts, events.ts, ce.ts)"
```

---

## Task 2: Custom Field Definitions + Constants

**Spec:** `2026-03-20-ph1-c1-foundation-seed.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/data/custom-fields.ts`

- [ ] **Step 1: Define company profile fields, case study fields, wip_registered_at, and SQL stage constant**

Create `data/custom-fields.ts`. This file exports:
1. `COMPANY_PROFILE_FIELDS` — array of 13 field definitions for `customers:customer_company_profile`
2. `CASE_STUDY_FIELDS` — array of 19 field definitions for `partnerships:case_study` (with required flags on title, industry, technologies, budget_bucket, duration_bucket)
3. `WIP_REGISTERED_AT_FIELD` — datetime field definition for `customers:deal`
4. `PRM_SQL_STAGE_ORDER = 3` — constant matching the SQL stage order in the pipeline seed
5. `PRM_PIPELINE_NAME = 'PRM Pipeline'` — pipeline name constant
6. `PRM_PIPELINE_STAGES` — array of `{ name, value, order }` for 7 pipeline stages

Reference `$OM_REPO/packages/shared/src/modules/dsl/` for `cf.*` helpers if available, otherwise use plain objects matching the entities batch API schema.

Dictionary value arrays for select/multi-select fields:
- `SERVICES_OPTIONS`: Software Development, Consulting, Implementation, Training, Support, Integration
- `INDUSTRIES_OPTIONS`: Finance, Healthcare, Retail, Manufacturing, Technology, Education, Government, Energy, Logistics
- `TECHNOLOGIES_OPTIONS`: React, Node.js, Python, TypeScript, PostgreSQL, Docker, Kubernetes, AWS, Azure, GCP
- `BUDGET_BUCKET_OPTIONS`: <10k, 10k-50k, 50k-200k, 200k-500k, 500k+
- `DURATION_BUCKET_OPTIONS`: <1 month, 1-3 months, 3-6 months, 6-12 months, 12+ months
- `VERTICALS_OPTIONS`: FinTech, HealthTech, RetailTech, EdTech, GovTech, CleanTech

- [ ] **Step 2: Verify types**

Run: `yarn typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/prm/src/modules/partnerships/data/custom-fields.ts
git commit -m "feat(partnerships): add custom field definitions + pipeline constants

Implements: App Spec §1.4, US-1.2, US-1.3, US-2.2
Phase: 1, Commit: 1b (field definitions)
Pattern: OM custom fields DSL / entities batch API schema"
```

---

## Task 3: setup.ts — seedDefaults + defaultRoleFeatures

**Spec:** `2026-03-20-ph1-c1-foundation-seed.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/setup.ts`

**Reference:**
- `$OM_REPO/packages/core/src/modules/customers/setup.ts` — ModuleSetupConfig structure
- `$OM_REPO/packages/core/src/modules/customers/cli.ts` — seedDefaultPipeline pattern

- [ ] **Step 1: Create setup.ts with defaultRoleFeatures**

```typescript
import type { ModuleSetupConfig } from '@$OM_REPO/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    partner_admin: [
      'customers.*',
      'partnerships.manage',
      'partnerships.widgets.onboarding-checklist',
    ],
    partner_member: [
      'customers.*',
      'partnerships.case-studies.manage',
      'partnerships.widgets.wip-count',
      'partnerships.widgets.onboarding-checklist',
    ],
    partner_contributor: [
      'partnerships.widgets.onboarding-checklist',
    ],
    partnership_manager: [
      'customers.people.view',
      'customers.companies.view',
      'customers.deals.view',
      'customers.pipelines.view',
      'partnerships.manage',
      'partnerships.widgets.wip-count',
    ],
  },

  async seedDefaults(ctx) {
    // Implementation in next steps
  },
}

export default setup
```

- [ ] **Step 2: Implement seedDefaults — pipeline seeding**

Inside `seedDefaults`, add pipeline seeding logic:
1. Check if pipeline with name `PRM_PIPELINE_NAME` already exists (idempotent guard)
2. If not, create pipeline via `em` (reference `seedDefaultPipeline` in customers `cli.ts`)
3. Create 7 pipeline stages with correct order values

Import `PRM_PIPELINE_NAME`, `PRM_PIPELINE_STAGES` from `data/custom-fields.ts`.

- [ ] **Step 3: Implement seedDefaults — custom field seeding**

Add to `seedDefaults`:
1. Seed `wip_registered_at` datetime field on `customers.deal` entity via entities batch definitions API
2. Seed 13 company profile custom fields on `customers:customer_company_profile`
3. Seed 19 case study fields on `partnerships:case_study`
4. All seeds guarded by existence check (idempotent)

Import field definitions from `data/custom-fields.ts`.

- [ ] **Step 4: Implement seedDefaults — dictionary seeding**

Add to `seedDefaults`:
1. Seed 6 dictionaries with their option values
2. Idempotent: check if dictionary exists before creating

- [ ] **Step 5: Verify build**

Run: `yarn generate && yarn typecheck && yarn build`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add apps/prm/src/modules/partnerships/setup.ts apps/prm/generated/
git commit -m "feat(partnerships): seed roles, pipeline, custom fields, dictionaries

Implements: App Spec §1.3, §1.4, US-1.2, US-1.3, US-2.1
Phase: 1, Commit: 1c (seedDefaults)
Pattern: setup.ts seedDefaults + defaultRoleFeatures"
```

---

## Task 4: WIP Interceptor

**Spec:** `2026-03-20-ph1-c2-wip-interceptor.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/api/interceptors.ts`
- Create: `apps/prm/src/modules/partnerships/api/interceptors.test.ts`

**Reference:**
- `$OM_REPO/apps/mercato/src/modules/example/api/interceptors.ts` — cross-module interceptor pattern
- `$OM_REPO/packages/shared/src/lib/crud/api-interceptor.ts` — ApiInterceptor type

- [ ] **Step 1: Write failing unit tests for the WIP interceptor**

Create `api/interceptors.test.ts` with tests:
1. `afterDealPatch` stamps `wip_registered_at` when deal transitions to SQL stage (order >= 3) and field is null
2. `afterDealPatch` does NOT stamp when deal transitions to stage below SQL (order < 3)
3. `afterDealPatch` does NOT overwrite when `wip_registered_at` is already set
4. `afterDealPatch` does NOT stamp when `pipelineStageId` was not changed
5. `beforeDealPatch` strips `wip_registered_at` from request body if present

Mock: `em` (EntityManager), `context` (InterceptorContext), pipeline stage records.

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test -- --testPathPattern=interceptors`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the interceptor**

Create `api/interceptors.ts`:

```typescript
import type { ApiInterceptor } from '@$OM_REPO/shared/lib/crud/api-interceptor'
import { PRM_SQL_STAGE_ORDER } from '../data/custom-fields'

export const interceptors: ApiInterceptor[] = [
  {
    id: 'partnerships.wip-stamp-guard',
    targetRoute: 'customers/deals',
    methods: ['PATCH', 'POST'],
    priority: 50,
    async before(request) {
      // Strip wip_registered_at from custom fields in body to prevent direct writes
      if (request.body?.custom && typeof request.body.custom === 'object') {
        const custom = { ...request.body.custom } as Record<string, unknown>
        delete custom.wip_registered_at
        return { ok: true, body: { ...request.body, custom } }
      }
      return { ok: true }
    },
  },
  {
    id: 'partnerships.wip-stamp-after',
    targetRoute: 'customers/deals',
    methods: ['PATCH'],
    priority: 50,
    async after(_request, response, context) {
      // Only process successful PATCHes that changed pipelineStageId
      if (response.statusCode !== 200) return {}
      const body = response.body as Record<string, unknown>
      const dealId = body.id as string | undefined
      const pipelineStageId = body.pipelineStageId as string | undefined
      if (!dealId || !pipelineStageId) return {}

      // Load pipeline stage to check order
      // Load deal to check existing wip_registered_at
      // If stage.order >= PRM_SQL_STAGE_ORDER and wip_registered_at is null:
      //   Write current UTC timestamp via entities records API
      // Otherwise: no-op

      // Implementation uses context.em and context.container
      // Full logic per spec

      return {}
    },
  },
]
```

Full `after` hook implementation:
1. Load pipeline stage by `pipelineStageId` from `em`
2. Check `stage.order >= PRM_SQL_STAGE_ORDER`
3. Load `wip_registered_at` custom field value for the deal
4. If null, write `new Date().toISOString()` via entities records API
5. Verify `context.organizationId` matches deal's org

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `yarn test -- --testPathPattern=interceptors`
Expected: All 5 tests PASS

- [ ] **Step 5: Run generator and build**

Run: `yarn generate && yarn typecheck && yarn build`
Expected: All pass. Interceptor auto-discovered in `interceptors.generated.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/prm/src/modules/partnerships/api/interceptors.ts \
       apps/prm/src/modules/partnerships/api/interceptors.test.ts \
       apps/prm/generated/
git commit -m "feat(partnerships): WIP interceptor — stamp wip_registered_at on SQL+ transition

Implements: App Spec §1.4.2, US-2.2
Phase: 1, Commit: 2
Pattern: OM API interceptor (after hook on customers/deals PATCH)"
```

---

## Task 5: WIP Count API Route

**Spec:** `2026-03-20-ph1-c3-kpi-dashboard-widget.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/api/get/wip-count.ts`
- Create: `apps/prm/src/modules/partnerships/api/get/wip-count.test.ts`

- [ ] **Step 1: Write failing unit tests for wip-count route**

Create `api/get/wip-count.test.ts`:
1. Returns `{ count: 0 }` when no deals have `wip_registered_at`
2. Returns correct count scoped to organization
3. Correctly filters by month boundaries (UTC)
4. Rejects invalid month format with 400
5. Defaults to current month when `month` param omitted

Mock: `em` (with query results), `context`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test -- --testPathPattern=wip-count`
Expected: FAIL

- [ ] **Step 3: Implement the WIP count route**

Create `api/get/wip-count.ts`:
- Zod schema for query: `month` optional, regex `^\d{4}-\d{2}$`
- Handler: query deals with `wip_registered_at` in the specified month, scoped by `organizationId`
- Auth guard: `requireFeatures: ['partnerships.widgets.wip-count']`
- Export `openApi` object
- Return `{ count: number, month: string }`

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test -- --testPathPattern=wip-count`
Expected: All 5 tests PASS

- [ ] **Step 5: Verify build**

Run: `yarn typecheck && yarn build`
Expected: Pass

- [ ] **Step 6: Commit**

```bash
git add apps/prm/src/modules/partnerships/api/get/wip-count.ts \
       apps/prm/src/modules/partnerships/api/get/wip-count.test.ts
git commit -m "feat(partnerships): WIP count API route — live query endpoint

Implements: App Spec §1.4.2, US-2.3
Phase: 1, Commit: 3a (API route)
Pattern: OM custom GET route with openApi export"
```

---

## Task 6: WIP Count Dashboard Widget

**Spec:** `2026-03-20-ph1-c3-kpi-dashboard-widget.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/widgets/dashboard/wip-count/widget.ts`
- Create: `apps/prm/src/modules/partnerships/widgets/dashboard/wip-count/widget.client.tsx`
- Create: `apps/prm/src/modules/partnerships/widgets/injection-table.ts`
- Create: `apps/prm/src/modules/partnerships/i18n/en.json`

**Reference:**
- `$OM_REPO/packages/core/src/modules/customers/widgets/dashboard/customer-todos/widget.ts`
- `$OM_REPO/packages/core/src/modules/customers/widgets/dashboard/customer-todos/widget.client.tsx`

- [ ] **Step 1: Create i18n translations**

Create `i18n/en.json`:
```json
{
  "partnerships": {
    "widgets": {
      "wipCount": {
        "title": "WIP This Month",
        "subtitle": "{{month}}",
        "wicPlaceholder": "WIC: \u2014",
        "noData": "No WIP data for this period"
      },
      "onboardingChecklist": {
        "title": "Getting Started",
        "fillProfile": "Fill your company profile",
        "addCaseStudy": "Add a case study",
        "inviteBd": "Invite a Business Developer",
        "inviteContributor": "Invite a Contributor",
        "addProspect": "Add a prospect company",
        "createDeal": "Create your first deal",
        "allDone": "All set! You're ready to go."
      }
    }
  }
}
```

- [ ] **Step 2: Create widget server definition**

Create `widgets/dashboard/wip-count/widget.ts`:
- Use `lazyDashboardWidget(() => import('./widget.client'))` pattern
- Metadata: `id: 'partnerships.dashboard.wip-count'`, `features: ['dashboards.view', 'partnerships.widgets.wip-count']`, `defaultSize: 'sm'`, `defaultEnabled: true`, `category: 'partnerships'`

- [ ] **Step 3: Create widget client component**

Create `widgets/dashboard/wip-count/widget.client.tsx`:
- Calls `GET /api/partnerships/wip-count?month=YYYY-MM` via `apiCall`
- Renders: large count number, month name subtitle, month navigation arrows
- WIC placeholder: "WIC: —" with note about Phase 2
- Loading state with `LoadingMessage`
- Error handling

- [ ] **Step 4: Create injection table**

Create `widgets/injection-table.ts`:
```typescript
import type { InjectionTableEntry } from '@$OM_REPO/shared/modules/widgets/injection-table'

export default [
  {
    widgetId: 'partnerships.dashboard.wip-count',
    spot: 'dashboard:widgets',
  },
] satisfies InjectionTableEntry[]
```

- [ ] **Step 5: Run generator and verify**

Run: `yarn generate && yarn typecheck && yarn build`
Expected: Widget discovered, all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/prm/src/modules/partnerships/widgets/ \
       apps/prm/src/modules/partnerships/i18n/ \
       apps/prm/generated/
git commit -m "feat(partnerships): WIP count dashboard widget — live KPI tile

Implements: App Spec §7, US-2.3
Phase: 1, Commit: 3b (dashboard widget)
Pattern: OM dashboard widget injection (lazyDashboardWidget + injection-table)"
```

---

## Task 7: Onboarding Status API Route

**Spec:** `2026-03-20-ph1-c4-onboarding-checklist-widget.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/api/get/onboarding-status.ts`
- Create: `apps/prm/src/modules/partnerships/api/get/onboarding-status.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `api/get/onboarding-status.test.ts`:
1. Returns 4 items for `partner_admin` role, all uncompleted in fresh org
2. Returns 2 items for `partner_member` role
3. Returns 403 for `partnership_manager` (no checklist for PM)
4. Marks "Fill profile" as completed when services field is populated
5. Returns `allCompleted: true` when all items pass

Mock: `em`, `context`, role checks.

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test -- --testPathPattern=onboarding-status`
Expected: FAIL

- [ ] **Step 3: Implement the onboarding status route**

Create `api/get/onboarding-status.ts`:
- Auth guard: `requireFeatures: ['partnerships.widgets.onboarding-checklist']`
- Detect user's role (partner_admin vs partner_member) from context
- Run 4 or 2 completion check queries (all `COUNT` with `LIMIT 1`, very fast):
  - Profile: check if company profile has non-empty services or industries
  - Case study: check if `partnerships:case_study` records exist for org
  - BD invited: check users with `partner_member` role in org
  - Contributor invited: check users with `partner_contributor` role in org
  - Prospect added (BD only): check company records in org
  - Deal created (BD only): check deal records in org
- Return `{ role, items: [{ id, label, completed, link }], allCompleted }`
- Export `openApi`

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test -- --testPathPattern=onboarding-status`
Expected: All 5 tests PASS

- [ ] **Step 5: Verify build**

Run: `yarn typecheck && yarn build`
Expected: Pass

- [ ] **Step 6: Commit**

```bash
git add apps/prm/src/modules/partnerships/api/get/onboarding-status.ts \
       apps/prm/src/modules/partnerships/api/get/onboarding-status.test.ts
git commit -m "feat(partnerships): onboarding status API — role-conditional completion checks

Implements: App Spec §7, US-1.7, US-1.8
Phase: 1, Commit: 4a (API route)
Pattern: OM custom GET route with live data queries"
```

---

## Task 8: Onboarding Checklist Dashboard Widget

**Spec:** `2026-03-20-ph1-c4-onboarding-checklist-widget.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/widgets/dashboard/onboarding-checklist/widget.ts`
- Create: `apps/prm/src/modules/partnerships/widgets/dashboard/onboarding-checklist/widget.client.tsx`
- Modify: `apps/prm/src/modules/partnerships/widgets/injection-table.ts`

- [ ] **Step 1: Create widget server definition**

Create `widgets/dashboard/onboarding-checklist/widget.ts`:
- Metadata: `id: 'partnerships.dashboard.onboarding-checklist'`, `features: ['dashboards.view', 'partnerships.widgets.onboarding-checklist']`, `defaultSize: 'md'`, `defaultEnabled: true`, `category: 'partnerships'`

- [ ] **Step 2: Create widget client component**

Create `widgets/dashboard/onboarding-checklist/widget.client.tsx`:
- Calls `GET /api/partnerships/onboarding-status` via `apiCall`
- If `allCompleted` is true, render nothing (auto-dismiss)
- Otherwise, render checklist: each item as a row with checkmark icon (completed) or circle (pending), label from i18n, and link to relevant page
- Completed items: green checkmark, muted text
- Pending items: open circle, bold text, clickable link

- [ ] **Step 3: Add to injection table**

Add entry to `widgets/injection-table.ts`:
```typescript
{
  widgetId: 'partnerships.dashboard.onboarding-checklist',
  spot: 'dashboard:widgets',
},
```

- [ ] **Step 4: Run generator and verify**

Run: `yarn generate && yarn typecheck && yarn build`
Expected: Widget discovered, all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/prm/src/modules/partnerships/widgets/ \
       apps/prm/generated/
git commit -m "feat(partnerships): onboarding checklist widget — role-conditional, auto-dismiss

Implements: App Spec §7, US-1.7, US-1.8
Phase: 1, Commit: 4b (dashboard widget)
Pattern: OM dashboard widget injection (role-conditional rendering, data-driven)"
```

---

## Task 9: seedExamples — Phase 1 Demo Data

**Spec:** `2026-03-20-ph1-c5-seed-examples.md`

**Files:**
- Modify: `apps/prm/src/modules/partnerships/setup.ts`

**Reference:**
- `$OM_REPO/packages/core/src/modules/customers/cli.ts` — seedCustomerExamples pattern

- [ ] **Step 1: Add seedExamples function to setup.ts**

Add `seedExamples` to the `ModuleSetupConfig` export. Implementation:

1. **Create 3 demo organizations** (agencies):
   - "Acme Digital (Demo)" — FinTech, team 21-50
   - "Nordic AI Labs (Demo)" — HealthTech, team 6-20
   - "CloudBridge Solutions (Demo)" — RetailTech, team 1-5

2. **Create demo users** (10 total):
   - `pm@demo.local` — partnership_manager
   - Per agency: admin, bd, contributor (3 users each = 9)
   - All passwords: bcrypt hash of `demo1234`

3. **Fill company profiles** (custom fields on company entities):
   - Acme + Nordic: full profiles (services, industries, technologies)
   - CloudBridge: minimal (only name, no services — demonstrates incomplete onboarding)

4. **Create case studies** (entity records):
   - Acme: 2 case studies
   - Nordic: 1 case study
   - CloudBridge: 0 (incomplete onboarding)

5. **Create CRM companies (prospects)** per agency

6. **Create deals at various pipeline stages**:
   - Acme: 5 deals (New, Contacted, SQL with stamp 2026-03-10, Proposal with stamp 2026-02-15, Won)
   - Nordic: 3 deals (Qualified, SQL with stamp 2026-03-18, Lost)
   - CloudBridge: 2 deals (New, Contacted — no WIP)

7. **Stamp wip_registered_at** directly on qualifying deals (bypassing interceptor for seed)

Guard: check if "Acme Digital (Demo)" org already exists before seeding.

- [ ] **Step 2: Verify full initialization**

Run: `yarn typecheck && yarn build`
Expected: Pass.

Run: `yarn initialize`
Expected: All demo data created. Verify by checking logs or querying.

- [ ] **Step 3: Commit**

```bash
git add apps/prm/src/modules/partnerships/setup.ts
git commit -m "feat(partnerships): seedExamples — Phase 1 demo data

Implements: App Spec §7, US-7.1, US-7.2
Phase: 1, Commit: 5
Pattern: setup.ts seedExamples (3 agencies, users, deals, case studies, WIP stamps)"
```

---

## Task 10: Integration Tests

**Spec:** `2026-03-20-ph1-c2-wip-interceptor.md`, `2026-03-20-ph1-c3-kpi-dashboard-widget.md`, `2026-03-20-ph1-c4-onboarding-checklist-widget.md`

**Files:**
- Create: `apps/prm/src/modules/partnerships/__integration__/TC-WIP-001.spec.ts`
- Create: `apps/prm/src/modules/partnerships/__integration__/TC-KPI-001.spec.ts`
- Create: `apps/prm/src/modules/partnerships/__integration__/TC-ONBOARD-001.spec.ts`

**Reference:**
- `$OM_REPO/.ai/skills/integration-tests/SKILL.md` — Playwright test conventions

- [ ] **Step 1: WIP interceptor integration tests (T1-T5 from spec)**

Create `TC-WIP-001.spec.ts`:
- Setup: create org, user, pipeline, deal
- T1: Move deal to SQL → `wip_registered_at` is set
- T2: Move stamped deal backward+forward → timestamp unchanged
- T3: Move deal to Proposal (above SQL) → stamp set
- T4: Move deal to Contacted (below SQL) → stamp remains null
- T5: PATCH deal with wip_registered_at in body → field stripped
- Teardown: clean up created records

- [ ] **Step 2: KPI widget integration tests (T1-T4 from spec)**

Create `TC-KPI-001.spec.ts`:
- T1: Create deals, move 2 to SQL, query wip-count → count=2
- T2: Stamp in March, query April → count=0
- T3: Two orgs, verify no cross-org leak
- T4: Query without month param → returns current month

- [ ] **Step 3: Onboarding checklist integration tests (T1-T5 from spec)**

Create `TC-ONBOARD-001.spec.ts`:
- T1: Fresh org admin → 4 items, all uncompleted
- T2: Fill profile → "Fill profile" completed
- T3: Complete all admin steps → allCompleted=true
- T4: Fresh org BD → 2 items
- T5: BD creates company+deal → allCompleted=true

- [ ] **Step 4: Run integration tests**

Run: `yarn test:integration:ephemeral`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/prm/src/modules/partnerships/__integration__/
git commit -m "test(partnerships): Phase 1 integration tests — WIP, KPI, onboarding

Phase: 1
Pattern: Playwright integration tests (self-contained, no demo data dependency)"
```

---

## Task 11: Final Verification + Phase Completion

- [ ] **Step 1: Run full verification suite**

```bash
cd apps/prm
yarn generate
yarn typecheck
yarn build
yarn test
yarn initialize
yarn test:integration:ephemeral
```

All must pass.

- [ ] **Step 2: Verify acceptance criteria**

Re-read App Spec §7 Phase 1 acceptance criteria (12 domain + 6 business). Verify each one against the implementation:

**Vernon domain (10):**
- [ ] wip_registered_at immutability
- [ ] wip_registered_at only on first SQL+ transition
- [ ] Deals without stamp excluded from WIP
- [ ] UTC timestamps + month boundaries
- [ ] Deal org scoping
- [ ] Company org scoping
- [ ] BD cannot write wip_registered_at
- [ ] PM org switcher read-only
- [ ] Case study minimum required fields
- [ ] WIP widget org-scoped

**Mat business (6):**
- [ ] PM can onboard agency
- [ ] BD deal → SQL → WIP count appears
- [ ] PM org switcher + per-agency WIP
- [ ] Admin checklist (4 items)
- [ ] BD checklist (2 items)
- [ ] Checklist items link + checkmark + auto-dismiss

- [ ] **Step 3: Update spec status**

Add implementation status to each spec file.

---

## Dependency Graph

```
Task 1 (scaffold) ─┬─> Task 2 (custom fields) ─> Task 3 (setup.ts seedDefaults)
                    │                                      │
                    │        ┌─────────────────────────────┘
                    │        │
                    │        ├─> Task 4 (interceptor) ─> Task 5 (wip-count route) ─> Task 6 (wip widget)
                    │        │
                    │        └─> Task 7 (onboarding route) ─> Task 8 (onboarding widget)
                    │                                                      │
                    │        ┌─────────────────────────────────────────────┘
                    │        │
                    └────────┴─> Task 9 (seedExamples) ─> Task 10 (integration tests) ─> Task 11 (verification)
```

**Parallelizable:** Tasks 4+7 (interceptor + onboarding route) can run in parallel after Task 3.
Tasks 5+6 and 7+8 are sequential within each branch.
