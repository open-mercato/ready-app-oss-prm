# WF3 WIC Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable PM to import WIC scores from external script and make scores visible to agencies via backend pages and dashboard widget.

**Architecture:** 4 atomic commits building on Phase 1 patterns. ContributionUnit custom entity seeded via `ensureCustomFieldDefinitions`. WIC import as custom POST route with all-or-nothing batch semantics. Display via backend pages + dashboard widget. GH username guard via API interceptor.

**Tech Stack:** TypeScript, Next.js, Zod, MikroORM, OM custom entities API, OM widget injection

**Spec:** `apps/prm/docs/specs/2026-03-23-wf3-wic-phase2-design.md`

---

## File Map

### Commit 2: ContributionUnit Entity
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/modules/partnerships/data/custom-fields.ts` | Add `CONTRIBUTION_UNIT_FIELDS` array + `WIC_LEVEL_OPTIONS` + `WIC_SOURCE_OPTIONS` |
| Modify | `src/modules/partnerships/data/ce.ts` | Add `partnerships:contribution_unit` entity definition |
| Modify | `src/modules/partnerships/setup.ts` | Import new fields, add to `seedCustomFields` fieldSets, widen `mapFieldDefinitions` type |

### Commit 3: WIC Import API
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/modules/partnerships/data/validators.ts` | Zod schemas: `wicScoringResultSchema`, `wicImportRequestSchema` |
| Create | `src/modules/partnerships/api/post/wic-import.ts` | POST route: validate, resolve GH users, archive, compute score, insert |
| Modify | `src/modules/partnerships/acl.ts` | Add `partnerships.wic.import` feature |
| Modify | `src/modules/partnerships/setup.ts` | Add `partnerships.wic.import` to PM role features |

### Commit 4: WIC Score Display
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/modules/partnerships/api/get/wic-scores.ts` | GET route: query ContributionUnits, org-scoped, role-filtered |
| Create | `src/modules/partnerships/backend/partnerships/my-wic/page.meta.ts` | Page metadata for agency WIC view |
| Create | `src/modules/partnerships/backend/partnerships/my-wic/page.tsx` | DataTable of ContributionUnits with month picker |
| Create | `src/modules/partnerships/backend/partnerships/wic-import/page.meta.ts` | Page metadata for PM import page |
| Create | `src/modules/partnerships/backend/partnerships/wic-import/page.tsx` | JSON upload + import button + result display |
| Create | `src/modules/partnerships/widgets/dashboard/wic-summary/widget.ts` | Widget registration metadata |
| Create | `src/modules/partnerships/widgets/dashboard/wic-summary/widget.client.tsx` | Widget component: total WIC + source badge |
| Modify | `src/modules/partnerships/acl.ts` | Add `partnerships.widgets.wic-summary` feature |
| Modify | `src/modules/partnerships/setup.ts` | Add widget feature to contributor role, add widget to dashboard defaults |
| Modify | `src/modules/partnerships/widgets/injection-table.ts` | Register wic-summary widget in injection table |
| Modify | `src/i18n/en.json` | Add WIC page + widget i18n keys |

### Commit 5: GH Username Immutability Guard
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/modules/partnerships/api/interceptors.ts` | Add GH username uniqueness + immutability interceptor |

---

## Task 1: ContributionUnit Entity Definition (Commit 2)

**Files:**
- Modify: `src/modules/partnerships/data/custom-fields.ts`
- Modify: `src/modules/partnerships/setup.ts`

- [ ] **Step 1: Add ContributionUnit field definitions to custom-fields.ts**

Add after `GH_USERNAME_FIELD` at the bottom of `custom-fields.ts`:

```typescript
// WIC level options (per App Spec WicScoringResult schema)
export const WIC_LEVEL_OPTIONS = ['L1', 'L2', 'L3', 'L4', 'routine'] as const;

// WIC assessment source options
export const WIC_SOURCE_OPTIONS = ['manual_import', 'automated_pipeline'] as const;

// ContributionUnit custom fields (entity: partnerships:contribution_unit)
export const CONTRIBUTION_UNIT_FIELDS: FieldDefinition[] = [
  { key: 'contributor_github_username', type: 'text', label: 'Contributor GitHub Username', required: true },
  { key: 'pr_id', type: 'text', label: 'PR ID', required: true },
  { key: 'month', type: 'text', label: 'Month', required: true },
  { key: 'feature_key', type: 'text', label: 'Feature Key', required: true },
  { key: 'level', type: 'select', label: 'Level', required: true, options: [...WIC_LEVEL_OPTIONS] },
  { key: 'impact_bonus', type: 'boolean', label: 'Impact Bonus', required: true },
  { key: 'bounty_applied', type: 'boolean', label: 'Bounty Applied', required: true },
  { key: 'wic_score', type: 'text', label: 'WIC Score', required: true }, // Stored as text; parsed to float at query time. cf.integer truncates decimals (0.25, 1.5, etc.)
  { key: 'organization_id', type: 'text', label: 'Organization ID', required: true },
  { key: 'assessment_id', type: 'text', label: 'Assessment ID', required: true },
  { key: 'assessment_source', type: 'select', label: 'Assessment Source', required: true, options: [...WIC_SOURCE_OPTIONS] },
];
```

- [ ] **Step 2: Add ContributionUnit entity to ce.ts**

In `src/modules/partnerships/data/ce.ts` (or wherever custom entities are defined — check if this file exists, otherwise create alongside `custom-fields.ts`), add:

```typescript
{
  id: 'partnerships:contribution_unit',
  label: 'Contribution Unit',
  description: 'WIC scoring record for code contributions.',
  labelField: 'feature_key',
  showInSidebar: false,
  fields: [],
}
```

- [ ] **Step 3: Widen mapFieldDefinitions and add to seedCustomFields in setup.ts**

In `setup.ts`:

1. **Widen `mapFieldDefinitions` parameter type** from the union `typeof AGENCY_PROFILE_FIELDS | typeof CASE_STUDY_FIELDS` to the generic `FieldDefinition[]` type. Import `FieldDefinition` from `./data/custom-fields` (it may need to be exported first — if so, add `export` to the type definition in `custom-fields.ts`).

2. **Import new fields:**
```typescript
import {
  // ... existing imports ...
  CONTRIBUTION_UNIT_FIELDS,
} from './data/custom-fields'
```

3. **Add to fieldSets array** in `seedCustomFields`, after the case_study entry:
```typescript
{
  entity: 'partnerships:contribution_unit',
  fields: mapFieldDefinitions(CONTRIBUTION_UNIT_FIELDS),
},
```

**Note on `wic_score` storage:** The field is declared as `type: 'text'` which maps to `cf.text()`. This stores the value in `CustomFieldValue.valueText`. Both the import route (writer) and GET route (reader) use `valueText`, keeping the convention consistent. This avoids `cf.integer` which truncates decimals like 0.25 and 1.5.

- [ ] **Step 3: Run yarn generate and verify**

Run: `cd apps/prm && yarn generate`
Expected: Module files regenerated without errors.

Run: `cd apps/prm && yarn typecheck`
Expected: No type errors.

- [ ] **Step 4: Run yarn initialize to test seeding**

Run: `cd apps/prm && yarn initialize`
Expected: `seedDefaults` runs successfully. ContributionUnit entity definition is created. No errors in console.

- [ ] **Step 5: Commit**

```bash
git add apps/prm/src/modules/partnerships/data/custom-fields.ts apps/prm/src/modules/partnerships/setup.ts
git commit -m "feat(partnerships): seed ContributionUnit custom entity definition

11 custom fields for WIC scoring: contributor, PR, month, feature_key,
level (L1-L4|routine), impact_bonus, bounty_applied, wic_score,
organization_id, assessment_id, assessment_source.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: WIC Import API Route (Commit 3)

**Files:**
- Create: `src/modules/partnerships/data/validators.ts`
- Create: `src/modules/partnerships/api/post/wic-import.ts`
- Modify: `src/modules/partnerships/acl.ts`
- Modify: `src/modules/partnerships/setup.ts`

- [ ] **Step 1: Create validators.ts with Zod schemas**

Create `src/modules/partnerships/data/validators.ts`:

```typescript
import { z } from 'zod'
import { WIC_LEVEL_OPTIONS, WIC_SOURCE_OPTIONS } from './custom-fields'

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export const wicScoringResultSchema = z.object({
  contributorGithubUsername: z.string().min(1, 'GitHub username is required'),
  prId: z.string().min(1, 'PR ID is required'),
  month: z.string().regex(MONTH_REGEX, 'month must be in YYYY-MM format'),
  featureKey: z.string().min(1, 'Feature key is required'),
  level: z.enum(WIC_LEVEL_OPTIONS),
  impactBonus: z.boolean(),
  bountyApplied: z.boolean(),
})

export type WicScoringResult = z.infer<typeof wicScoringResultSchema>

export const wicImportRequestSchema = z.object({
  organizationId: z.string().uuid('organizationId must be a valid UUID'),
  month: z.string().regex(MONTH_REGEX, 'month must be in YYYY-MM format'),
  source: z.enum(WIC_SOURCE_OPTIONS),
  records: z.array(wicScoringResultSchema).min(1, 'At least one record is required'),
})

export type WicImportRequest = z.infer<typeof wicImportRequestSchema>
```

- [ ] **Step 2: Add `partnerships.wic.import` feature to acl.ts**

Add to the features array in `acl.ts`:

```typescript
{ id: 'partnerships.wic.import', title: 'Import WIC scores', module: 'partnerships' },
```

- [ ] **Step 3: Add feature to PM role in setup.ts**

In `setup.ts`, add `'partnerships.wic.import'` to the `partnership_manager` features array in `PRM_ROLE_FEATURES`.

- [ ] **Step 4: Create the WIC import route**

Create `src/modules/partnerships/api/post/wic-import.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createRequestContainer } from '@$OM_REPO/shared/lib/di/container'
import { getAuthFromRequest } from '@$OM_REPO/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@$OM_REPO/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@$OM_REPO/shared/lib/crud/errors'
import { CustomFieldValue } from '@$OM_REPO/core/modules/entities/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@$OM_REPO/shared/lib/openapi'
import { v4 as uuidv4 } from 'uuid'
import { wicImportRequestSchema, type WicScoringResult } from '../../data/validators'

export const metadata = {
  path: '/partnerships/wic/import',
  POST: { requireAuth: true, requireFeatures: ['partnerships.wic.import'] },
}

// ---------------------------------------------------------------------------
// WIC Score computation (App Spec §1.4.2)
// ---------------------------------------------------------------------------

const BASE_SCORES: Record<string, number> = {
  L4: 1.0,
  L3: 0.5,
  L2: 1.0,
  L1: 0.5, // L1 default; sub-level (0.25) determined by external script
  routine: 0.0,
}

function computeWicScore(record: WicScoringResult): number {
  const baseScore = BASE_SCORES[record.level] ?? 0
  const impactBonus = record.impactBonus ? 0.5 : 0
  const bountyMultiplier = record.bountyApplied ? 1.5 : 1.0
  return (baseScore + impactBonus) * bountyMultiplier
}

// ---------------------------------------------------------------------------
// GH username resolution
// ---------------------------------------------------------------------------

const USER_ENTITY_ID = 'auth:user'
const GH_FIELD_KEY = 'github_username'
const CU_ENTITY_ID = 'partnerships:contribution_unit'

async function resolveGithubUsers(
  em: EntityManager,
  tenantId: string,
  usernames: string[]
): Promise<{ resolved: Map<string, { userId: string; organizationId: string }>; unmatched: string[] }> {
  const resolved = new Map<string, { userId: string; organizationId: string }>()
  const unmatched: string[] = []

  // Look up custom field values for github_username
  const ghFieldValues = await em.find(CustomFieldValue, {
    entityId: USER_ENTITY_ID,
    fieldKey: GH_FIELD_KEY,
    tenantId,
    deletedAt: null,
    valueText: { $in: usernames },
  })

  const ghMap = new Map<string, string>() // username -> userId (recordId)
  for (const fv of ghFieldValues) {
    if (fv.valueText && fv.recordId) {
      // Check for uniqueness: if two users have the same GH username, that's an error
      if (ghMap.has(fv.valueText)) {
        throw new CrudHttpError(422, {
          error: 'duplicate_github_username',
          message: `GitHub username "${fv.valueText}" is assigned to multiple users`,
        })
      }
      ghMap.set(fv.valueText, fv.recordId)
    }
  }

  // Resolve user -> organization mapping
  for (const username of usernames) {
    const userId = ghMap.get(username)
    if (!userId) {
      unmatched.push(username)
      continue
    }
    // Get user's organization from User entity
    const { User } = await import('@$OM_REPO/core/modules/auth/data/entities')
    const user = await em.findOne(User, { id: userId, deletedAt: null })
    if (!user || !user.organizationId) {
      unmatched.push(username)
      continue
    }
    resolved.set(username, { userId, organizationId: user.organizationId })
  }

  return { resolved, unmatched }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function POST(req: Request) {
  try {
    const body = await req.json()

    // 1. Validate request
    const parseResult = wicImportRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'validation_failed', issues: parseResult.error.issues },
        { status: 422 },
      )
    }
    const input = parseResult.data

    // 2. Check for within-batch duplicates: (contributor, month, featureKey)
    const seen = new Set<string>()
    for (const record of input.records) {
      const dedupKey = `${record.contributorGithubUsername}::${record.month}::${record.featureKey}`
      if (seen.has(dedupKey)) {
        return NextResponse.json(
          {
            error: 'duplicate_in_batch',
            message: `Duplicate (contributor, month, feature_key) in batch: ${dedupKey}`,
          },
          { status: 422 },
        )
      }
      seen.add(dedupKey)
    }

    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const tenantId = auth.tenantId

    // 3. Resolve GH usernames -> Users
    const uniqueUsernames = [...new Set(input.records.map((r) => r.contributorGithubUsername))]
    const { resolved, unmatched } = await resolveGithubUsers(em, tenantId, uniqueUsernames)

    if (unmatched.length > 0) {
      return NextResponse.json(
        { error: 'unmatched_usernames', unmatchedUsernames: unmatched },
        { status: 422 },
      )
    }

    // 4. Verify all resolved users belong to the target organization
    for (const [username, userInfo] of resolved) {
      if (userInfo.organizationId !== input.organizationId) {
        return NextResponse.json(
          {
            error: 'organization_mismatch',
            message: `Contributor "${username}" belongs to org ${userInfo.organizationId}, not ${input.organizationId}`,
          },
          { status: 422 },
        )
      }
    }

    // 5. Soft-archive existing ContributionUnits for same org+month
    const existingCUs = await em.find(CustomFieldValue, {
      entityId: CU_ENTITY_ID,
      fieldKey: 'month',
      valueText: input.month,
      organizationId: input.organizationId,
      tenantId,
      deletedAt: null,
    })

    // Get all record IDs for this org+month to archive all their fields
    const recordIdsToArchive = [...new Set(existingCUs.map((cu) => cu.recordId))]
    let archivedCount = 0

    if (recordIdsToArchive.length > 0) {
      const allFieldsToArchive = await em.find(CustomFieldValue, {
        entityId: CU_ENTITY_ID,
        recordId: { $in: recordIdsToArchive },
        tenantId,
        deletedAt: null,
      })
      for (const field of allFieldsToArchive) {
        field.deletedAt = new Date()
      }
      archivedCount = recordIdsToArchive.length
    }

    // 6. Insert new ContributionUnits
    const assessmentId = uuidv4()

    for (const record of input.records) {
      const wicScore = computeWicScore(record)
      const recordId = uuidv4()

      // NOTE: All values stored as valueText for consistency. Both this import route
      // and the GET /wic-scores route use valueText. This avoids cf.integer/cf.float
      // mismatches and keeps the reader/writer contract self-contained.
      const fields: Array<{ key: string; value: string }> = [
        { key: 'contributor_github_username', value: record.contributorGithubUsername },
        { key: 'pr_id', value: record.prId },
        { key: 'month', value: record.month },
        { key: 'feature_key', value: record.featureKey },
        { key: 'level', value: record.level },
        { key: 'impact_bonus', value: String(record.impactBonus) },
        { key: 'bounty_applied', value: String(record.bountyApplied) },
        { key: 'wic_score', value: String(wicScore) },
        { key: 'organization_id', value: input.organizationId },
        { key: 'assessment_id', value: assessmentId },
        { key: 'assessment_source', value: input.source },
      ]

      for (const field of fields) {
        em.persist(em.create(CustomFieldValue, {
          entityId: CU_ENTITY_ID,
          recordId,
          fieldKey: field.key,
          valueText: field.value,
          organizationId: input.organizationId,
          tenantId,
          createdAt: new Date(),
        }))
      }
    }

    await em.flush()

    return NextResponse.json({
      imported: input.records.length,
      archived: archivedCount,
      assessmentId,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/wic/import.POST] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const postDoc: OpenApiMethodDoc = {
  summary: 'Import WIC scores for an organization',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Import successful' },
    { status: 422, description: 'Validation error, unmatched usernames, or duplicates' },
    { status: 401, description: 'Unauthorized' },
    { status: 403, description: 'Missing required feature' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'WIC score import',
  methods: { POST: postDoc },
}

export default POST
```

**Important implementation notes:**
- The route creates CustomFieldValue rows directly (same pattern as WIP stamp interceptor). Each ContributionUnit "record" is a set of CustomFieldValue rows sharing the same `recordId`.
- `uuid` package should already be available via OM dependencies. If not, use `crypto.randomUUID()`.
- The `User` import inside the function is dynamic to avoid circular dependency issues. If this doesn't work, move it to the top-level import.
- Verify the exact shape of `CustomFieldValue` entity — it may have additional required fields (`fieldsetId`, `sortOrder`, etc.). Check the Phase 1 interceptor's `em.create(CustomFieldValue, ...)` call in `interceptors.ts:60-68` for the minimal required fields.
- **Mutation guards:** The design spec mentions `validateCrudMutationGuard` / `runCrudMutationGuardAfterSuccess`. These are used by `makeCrudRoute` for standard CRUD operations. For this custom route, check if the pattern applies — if OM requires mutation guards on all data-modifying routes, add them. If they only apply to CRUD-generated routes, skip and document why.

- [ ] **Step 5: Run yarn generate**

Run: `cd apps/prm && yarn generate`

- [ ] **Step 6: Run yarn typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: No type errors. Fix any import issues.

- [ ] **Step 7: Test manually with yarn dev**

Run: `cd apps/prm && yarn dev`

Then test the import endpoint with curl:
```bash
curl -X POST http://localhost:3000/api/partnerships/wic/import \
  -H "Content-Type: application/json" \
  -H "Cookie: <pm-session-cookie>" \
  -d '{
    "organizationId": "<acme-org-id>",
    "month": "2026-03",
    "source": "manual_import",
    "records": [{
      "contributorGithubUsername": "test-user",
      "prId": "$OM_REPO/open-mercato#1",
      "month": "2026-03",
      "featureKey": "test.feature",
      "level": "L2",
      "impactBonus": false,
      "bountyApplied": false
    }]
  }'
```

Expected: 422 with `unmatched_usernames` (since no user has `github_username = test-user` yet) or 200 if user exists.

- [ ] **Step 8: Commit**

```bash
git add apps/prm/src/modules/partnerships/data/validators.ts \
  apps/prm/src/modules/partnerships/api/post/wic-import.ts \
  apps/prm/src/modules/partnerships/acl.ts \
  apps/prm/src/modules/partnerships/setup.ts
git commit -m "feat(partnerships): WIC import API — batch validate, resolve, archive, insert

POST /api/partnerships/wic/import accepts WicScoringResult[] JSON.
All-or-nothing: validates schema, checks within-batch dedup, resolves
GH usernames to Users, archives previous assessment for same org+month,
computes wic_score per record, inserts new ContributionUnits.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: WIC Score Display — Pages + Widget (Commit 4)

**Files:**
- Create: `src/modules/partnerships/api/get/wic-scores.ts`
- Create: `src/modules/partnerships/backend/partnerships/my-wic/page.meta.ts`
- Create: `src/modules/partnerships/backend/partnerships/my-wic/page.tsx`
- Create: `src/modules/partnerships/backend/partnerships/wic-import/page.meta.ts`
- Create: `src/modules/partnerships/backend/partnerships/wic-import/page.tsx`
- Create: `src/modules/partnerships/widgets/dashboard/wic-summary/widget.ts`
- Create: `src/modules/partnerships/widgets/dashboard/wic-summary/widget.client.tsx`
- Modify: `src/modules/partnerships/acl.ts`
- Modify: `src/modules/partnerships/setup.ts`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Create WIC scores GET API route**

Create `src/modules/partnerships/api/get/wic-scores.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@$OM_REPO/shared/lib/di/container'
import { getAuthFromRequest } from '@$OM_REPO/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@$OM_REPO/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@$OM_REPO/shared/lib/crud/errors'
import { CustomFieldValue } from '@$OM_REPO/core/modules/entities/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@$OM_REPO/shared/lib/openapi'

export const metadata = {
  path: '/partnerships/wic-scores',
  GET: { requireAuth: true },
}

const CU_ENTITY_ID = 'partnerships:contribution_unit'

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  organizationId: z.string().uuid().optional(),
})

type ContributionUnitRow = {
  recordId: string
  contributorGithubUsername: string
  prId: string
  month: string
  featureKey: string
  level: string
  impactBonus: boolean
  bountyApplied: boolean
  wicScore: number
  organizationId: string
  assessmentSource: string
}

async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const parseResult = querySchema.safeParse({
      month: url.searchParams.get('month') ?? undefined,
      organizationId: url.searchParams.get('organizationId') ?? undefined,
    })
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0]?.message }, { status: 400 })
    }

    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const em = container.resolve('em') as EntityManager
    const tenantId = scope?.tenantId ?? auth.tenantId
    const userOrgId = scope?.selectedId ?? auth.orgId ?? null

    // Determine current month if not provided
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const month = parseResult.data.month ?? currentMonth

    // Determine org scope based on role
    const rbacService = container.resolve('rbacService') as any
    const userId = auth.userId
    const isPM = await rbacService.userHasAllFeatures(userId, ['partnerships.manage'], { tenantId })

    let orgFilter: string | null = null
    if (isPM && parseResult.data.organizationId) {
      orgFilter = parseResult.data.organizationId // PM can filter by any org
    } else if (!isPM) {
      orgFilter = userOrgId // non-PM sees own org only
    }
    // PM with no filter: sees all orgs (orgFilter = null)

    // Query month field values to find matching record IDs
    const monthFilter: Record<string, unknown> = {
      entityId: CU_ENTITY_ID,
      fieldKey: 'month',
      valueText: month,
      tenantId,
      deletedAt: null,
    }
    if (orgFilter) monthFilter.organizationId = orgFilter

    const monthValues = await em.find(CustomFieldValue, monthFilter)
    const recordIds = monthValues.map((v) => v.recordId)

    if (recordIds.length === 0) {
      return NextResponse.json({ records: [], month, totalWicScore: 0 })
    }

    // Fetch all field values for these records
    const allValues = await em.find(CustomFieldValue, {
      entityId: CU_ENTITY_ID,
      recordId: { $in: recordIds },
      tenantId,
      deletedAt: null,
    })

    // Group by recordId
    const grouped = new Map<string, Record<string, string>>()
    for (const fv of allValues) {
      if (!grouped.has(fv.recordId)) grouped.set(fv.recordId, {})
      grouped.get(fv.recordId)![fv.fieldKey] = fv.valueText ?? ''
    }

    // Filter by contributor if non-PM, non-admin role (contributor sees own only)
    const isContributor = !isPM && !(await rbacService.userHasAllFeatures(userId, ['customers.*'], { tenantId }))

    // Get current user's GH username for contributor filtering
    let currentUserGhUsername: string | null = null
    if (isContributor) {
      const userGhField = await em.findOne(CustomFieldValue, {
        entityId: 'auth:user',
        recordId: userId,
        fieldKey: 'github_username',
        tenantId,
        deletedAt: null,
      })
      currentUserGhUsername = userGhField?.valueText ?? null
    }

    const records: ContributionUnitRow[] = []
    let totalWicScore = 0

    for (const [recordId, fields] of grouped) {
      // Contributor filter: only show own records
      if (isContributor && currentUserGhUsername && fields.contributor_github_username !== currentUserGhUsername) {
        continue
      }

      const wicScore = parseFloat(fields.wic_score ?? '0')
      totalWicScore += wicScore

      records.push({
        recordId,
        contributorGithubUsername: fields.contributor_github_username ?? '',
        prId: fields.pr_id ?? '',
        month: fields.month ?? '',
        featureKey: fields.feature_key ?? '',
        level: fields.level ?? '',
        impactBonus: fields.impact_bonus === 'true',
        bountyApplied: fields.bounty_applied === 'true',
        wicScore,
        organizationId: fields.organization_id ?? '',
        assessmentSource: fields.assessment_source ?? '',
      })
    }

    // Sort by wicScore desc
    records.sort((a, b) => b.wicScore - a.wicScore)

    return NextResponse.json({ records, month, totalWicScore })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/wic-scores.GET] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const responseSchema = z.object({
  records: z.array(z.object({
    recordId: z.string(),
    contributorGithubUsername: z.string(),
    prId: z.string(),
    month: z.string(),
    featureKey: z.string(),
    level: z.string(),
    impactBonus: z.boolean(),
    bountyApplied: z.boolean(),
    wicScore: z.number(),
    organizationId: z.string(),
    assessmentSource: z.string(),
  })),
  month: z.string(),
  totalWicScore: z.number(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'WIC contribution scores',
  methods: {
    GET: {
      summary: 'List WIC scores for a given month',
      tags: ['Partnerships'],
      responses: [
        { status: 200, description: 'WIC scores for the requested month', schema: responseSchema },
      ],
    } satisfies OpenApiMethodDoc,
  },
}

export default GET
```

- [ ] **Step 2: Create My WIC page metadata**

Create `src/modules/partnerships/backend/partnerships/my-wic/page.meta.ts`:

```typescript
export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.widgets.wic-summary'], // any partnership role with WIC access
  pageTitle: 'WIC Scores',
  pageTitleKey: 'partnerships.myWic.title',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 130,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'WIC Scores', labelKey: 'partnerships.myWic.title' },
  ],
}
```

- [ ] **Step 3: Create My WIC page component**

Create `src/modules/partnerships/backend/partnerships/my-wic/page.tsx`:

```tsx
"use client"

import * as React from 'react'
import { Page, PageBody } from '@$OM_REPO/ui/backend/Page'
import { apiCall } from '@$OM_REPO/ui/backend/utils/apiCall'
import { useT } from '@$OM_REPO/shared/lib/i18n/context'
import { Spinner } from '@$OM_REPO/ui/primitives/spinner'

type WicRecord = {
  recordId: string
  contributorGithubUsername: string
  prId: string
  featureKey: string
  level: string
  impactBonus: boolean
  bountyApplied: boolean
  wicScore: number
  assessmentSource: string
}

type WicScoresResponse = {
  records: WicRecord[]
  month: string
  totalWicScore: number
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-')
  if (!year || !monthNum) return month
  const date = new Date(Number(year), Number(monthNum) - 1, 1)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function offsetMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export default function MyWicPage() {
  const t = useT()
  const [month, setMonth] = React.useState(currentYearMonth)
  const [data, setData] = React.useState<WicScoresResponse | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    setLoading(true)
    apiCall<WicScoresResponse>(`/api/partnerships/wic-scores?month=${encodeURIComponent(month)}`)
      .then((call) => {
        if (call.ok && call.result) setData(call.result)
        setLoading(false)
      })
  }, [month])

  return (
    <Page>
      <PageBody>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {t('partnerships.myWic.title')} — {formatMonthLabel(month)}
          </h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonth((m) => offsetMonth(m, -1))}
              className="rounded px-2 py-1 text-sm hover:bg-muted/50">&larr;</button>
            <span className="text-sm font-medium">{formatMonthLabel(month)}</span>
            <button type="button" onClick={() => setMonth((m) => offsetMonth(m, 1))}
              className="rounded px-2 py-1 text-sm hover:bg-muted/50">&rarr;</button>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner className="h-8 w-8 text-muted-foreground" />
          </div>
        ) : !data || data.records.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-muted-foreground">{t('partnerships.myWic.noData')}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              Total WIC Score: <span className="font-bold text-foreground">{data.totalWicScore.toFixed(2)}</span>
            </div>
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Contributor</th>
                    <th className="px-4 py-3 text-left font-medium">PR</th>
                    <th className="px-4 py-3 text-left font-medium">Feature</th>
                    <th className="px-4 py-3 text-left font-medium">Level</th>
                    <th className="px-4 py-3 text-right font-medium">Score</th>
                    <th className="px-4 py-3 text-center font-medium">Bounty</th>
                    <th className="px-4 py-3 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => (
                    <tr key={r.recordId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{r.contributorGithubUsername}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.prId}</td>
                      <td className="px-4 py-3">{r.featureKey}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{r.level}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{r.wicScore.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">{r.bountyApplied ? '1.5x' : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.assessmentSource === 'manual_import' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {r.assessmentSource === 'manual_import' ? 'manual' : 'automated'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageBody>
    </Page>
  )
}
```

- [ ] **Step 4: Create WIC Import page (PM only)**

Create `src/modules/partnerships/backend/partnerships/wic-import/page.meta.ts`:

```typescript
export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.wic.import'],
  pageTitle: 'Import WIC Scores',
  pageTitleKey: 'partnerships.wicImport.title',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 125,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'Import WIC Scores', labelKey: 'partnerships.wicImport.title' },
  ],
}
```

Create `src/modules/partnerships/backend/partnerships/wic-import/page.tsx`:

```tsx
"use client"

import * as React from 'react'
import { Page, PageBody } from '@$OM_REPO/ui/backend/Page'
import { apiCall } from '@$OM_REPO/ui/backend/utils/apiCall'
import { useT } from '@$OM_REPO/shared/lib/i18n/context'
import { Spinner } from '@$OM_REPO/ui/primitives/spinner'

type ImportResult = {
  imported: number
  archived: number
  assessmentId: string
}

type ImportError = {
  error: string
  issues?: Array<{ path: string[]; message: string }>
  unmatchedUsernames?: string[]
  message?: string
}

type OrgOption = { id: string; name: string }

export default function WicImportPage() {
  const t = useT()
  const [orgs, setOrgs] = React.useState<OrgOption[]>([])
  const [selectedOrg, setSelectedOrg] = React.useState('')
  const [month, setMonth] = React.useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [jsonInput, setJsonInput] = React.useState('')
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [error, setError] = React.useState<ImportError | null>(null)

  // Load org list from agencies API
  React.useEffect(() => {
    apiCall<{ agencies: Array<{ organizationId: string; name: string }> }>('/api/partnerships/agencies')
      .then((call) => {
        if (call.ok && call.result) {
          setOrgs(call.result.agencies.map((a) => ({ id: a.organizationId, name: a.name })))
        }
      })
  }, [])

  const handleImport = React.useCallback(async () => {
    setImporting(true)
    setResult(null)
    setError(null)

    try {
      const records = JSON.parse(jsonInput)
      const body = {
        organizationId: selectedOrg,
        month,
        source: 'manual_import' as const,
        records: Array.isArray(records) ? records : [records],
      }

      const call = await apiCall<ImportResult>('/api/partnerships/wic/import', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })

      if (call.ok && call.result) {
        setResult(call.result)
      } else {
        setError(call.result as unknown as ImportError)
      }
    } catch (err) {
      setError({ error: 'parse_error', message: 'Invalid JSON input' })
    } finally {
      setImporting(false)
    }
  }, [selectedOrg, month, jsonInput])

  return (
    <Page>
      <PageBody>
        <h2 className="text-lg font-semibold mb-4">{t('partnerships.wicImport.title')}</h2>

        <div className="grid gap-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium mb-1">{t('partnerships.wicImport.organization')}</label>
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Select agency...</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('partnerships.wicImport.month')}</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('partnerships.wicImport.jsonInput')}
            </label>
            <p className="text-xs text-muted-foreground mb-1">
              Paste WicScoringResult[] JSON from wic_assessment.mjs output. App Spec mentions CSV/markdown — JSON chosen because the external script outputs JSON directly.
            </p>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={12}
              className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              placeholder='[{"contributorGithubUsername": "...", "prId": "...", ...}]'
            />
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !selectedOrg || !jsonInput}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {importing ? <Spinner className="h-4 w-4 mr-2" /> : null}
            {t('partnerships.wicImport.importButton')}
          </button>

          {result && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                Import successful: {result.imported} records imported, {result.archived} archived.
              </p>
              <p className="text-xs text-green-600 mt-1">Assessment ID: {result.assessmentId}</p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">{error.error}: {error.message}</p>
              {error.unmatchedUsernames && (
                <ul className="mt-2 text-xs text-destructive">
                  {error.unmatchedUsernames.map((u) => <li key={u}>Unmatched: {u}</li>)}
                </ul>
              )}
              {error.issues && (
                <ul className="mt-2 text-xs text-destructive">
                  {error.issues.map((i, idx) => <li key={idx}>{i.path.join('.')}: {i.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
```

- [ ] **Step 5: Create WIC summary widget**

Create `src/modules/partnerships/widgets/dashboard/wic-summary/widget.ts`:

```typescript
import { lazyDashboardWidget, type DashboardWidgetModule } from '@$OM_REPO/shared/modules/dashboard/widgets'

const WicSummaryWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule = {
  metadata: {
    id: 'partnerships.dashboard.wic-summary',
    title: 'WIC Score',
    description: 'Shows the total WIC score for the current month.',
    features: ['dashboards.view', 'partnerships.widgets.wic-summary'],
    defaultSize: 'sm',
    defaultEnabled: true,
    tags: ['partnerships', 'kpi'],
    category: 'partnerships',
    icon: 'code',
    supportsRefresh: true,
  },
  Widget: WicSummaryWidget,
}

export default widget
```

Create `src/modules/partnerships/widgets/dashboard/wic-summary/widget.client.tsx`:

```tsx
"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@$OM_REPO/shared/modules/dashboard/widgets'
import { apiCall } from '@$OM_REPO/ui/backend/utils/apiCall'
import { Spinner } from '@$OM_REPO/ui/primitives/spinner'
import { useT } from '@$OM_REPO/shared/lib/i18n/context'

type WicScoresResponse = {
  month: string
  totalWicScore: number
  records: Array<{ assessmentSource: string }>
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-')
  if (!year || !monthNum) return month
  const date = new Date(Number(year), Number(monthNum) - 1, 1)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

const WicSummaryWidget: React.FC<DashboardWidgetComponentProps> = ({
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const [data, setData] = React.useState<WicScoresResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const month = currentYearMonth()
      const call = await apiCall<WicScoresResponse>(`/api/partnerships/wic-scores?month=${encodeURIComponent(month)}`)
      if (call.ok && call.result) {
        setData(call.result)
      } else {
        setError(t('partnerships.widgets.wicSummary.noData'))
      }
    } catch {
      setError(t('partnerships.widgets.wicSummary.noData'))
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [onRefreshStateChange, t])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh, refreshToken])

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  // Determine source badge
  const sources = new Set(data?.records.map((r) => r.assessmentSource) ?? [])
  const sourceBadge = sources.has('automated_pipeline') ? 'automated' : sources.has('manual_import') ? 'manual' : null

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-5xl font-bold tabular-nums text-foreground">
        {data?.totalWicScore?.toFixed(1) ?? '0'}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('partnerships.widgets.wicSummary.subtitle', { month: formatMonthLabel(data?.month ?? currentYearMonth()) })}
      </p>
      {sourceBadge && (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          sourceBadge === 'manual' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
        }`}>
          {sourceBadge}
        </span>
      )}
      <a href="/backend/partnerships/my-wic" className="text-xs text-primary hover:underline mt-1">
        {t('partnerships.widgets.wicSummary.viewDetails')}
      </a>
    </div>
  )
}

export default WicSummaryWidget
```

- [ ] **Step 6: Add widget feature to acl.ts and setup.ts**

Add to `acl.ts` features array:
```typescript
{ id: 'partnerships.widgets.wic-summary', title: 'View WIC summary widget', module: 'partnerships' },
```

In `setup.ts`, add `'partnerships.widgets.wic-summary'` to `partner_contributor` features in `PRM_ROLE_FEATURES`.

Also add `'partnerships.dashboard.wic-summary'` to the `AGENCY_WIDGETS` array in `seedDefaults`.

Add to `src/modules/partnerships/widgets/injection-table.ts` in the `'dashboard:widgets'` array:
```typescript
{
  widgetId: 'partnerships.dashboard.wic-summary',
  priority: 25,
},
```

- [ ] **Step 7: Add i18n keys**

Add these keys to the module-level i18n file (check if `src/modules/partnerships/i18n/en.json` exists; if not, add to app-level `src/i18n/en.json` — follow whichever pattern Phase 1 uses):
```json
"partnerships.myWic.title": "WIC Scores",
"partnerships.myWic.noData": "No WIC scores for this month.",
"partnerships.wicImport.title": "Import WIC Scores",
"partnerships.wicImport.organization": "Agency",
"partnerships.wicImport.month": "Month",
"partnerships.wicImport.jsonInput": "WIC Scoring Results (JSON)",
"partnerships.wicImport.importButton": "Import",
"partnerships.widgets.wicSummary.noData": "No WIC data",
"partnerships.widgets.wicSummary.subtitle": "WIC Score — {month}",
"partnerships.widgets.wicSummary.viewDetails": "View details"
```

- [ ] **Step 8: Run yarn generate + typecheck**

Run: `cd apps/prm && yarn generate && yarn typecheck`

- [ ] **Step 9: Verify with yarn dev**

Run: `cd apps/prm && yarn dev`
- Check `/backend/partnerships/my-wic` renders (empty state)
- Check `/backend/partnerships/wic-import` renders (PM only)
- Check WIC summary widget appears on contributor dashboard

- [ ] **Step 10: Commit**

```bash
git add apps/prm/src/modules/partnerships/api/get/wic-scores.ts \
  apps/prm/src/modules/partnerships/backend/partnerships/my-wic/ \
  apps/prm/src/modules/partnerships/backend/partnerships/wic-import/ \
  apps/prm/src/modules/partnerships/widgets/dashboard/wic-summary/ \
  apps/prm/src/modules/partnerships/acl.ts \
  apps/prm/src/modules/partnerships/setup.ts \
  apps/prm/src/i18n/en.json
git commit -m "feat(partnerships): WIC score display — My WIC page, import page, KPI widget

/backend/partnerships/my-wic: DataTable of ContributionUnits with month
picker. Contributor sees own rows, Admin/BD sees org, PM sees all.
/backend/partnerships/wic-import: PM-only JSON upload + import button.
Dashboard widget: total WIC score + source badge for contributors.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: GH Username Immutability + Uniqueness Guard (Commit 5)

**Files:**
- Modify: `src/modules/partnerships/api/interceptors.ts`

- [ ] **Step 1: Add GH username interceptor to interceptors.ts**

Add a new interceptor to the `interceptors` array in `interceptors.ts`:

```typescript
// Add to interceptors array:
{
  id: 'partnerships.gh-username-immutability',
  targetRoute: 'entities/records',
  methods: ['PUT', 'PATCH'],
  priority: 50,
  // NOTE: `before` receives (request, context) as TWO separate params, not request.context
  // This matches the OM ApiInterceptor type. See Phase 1 `after` hook for context shape.
  async before(request, context) {
    // Only intercept updates to auth:user entity's github_username field
    const entityId = request.body?.entityId as string | undefined
    const customFields = request.body?.customFields as Record<string, unknown> | undefined

    if (entityId !== 'auth:user' || !customFields || !('github_username' in customFields)) {
      return { ok: true }
    }

    const newUsername = customFields.github_username as string | null
    if (!newUsername) return { ok: true } // clearing is allowed if no CUs exist (checked below)

    const recordId = request.body?.id as string | undefined
    if (!recordId) return { ok: true }

    // Fork EM to avoid dirty state (same pattern as Phase 1 WIP stamp after hook)
    const em = context.em.fork()
    const tenantId = context.tenantId

    // 1. Uniqueness check: does another user already have this GH username?
    const existingGhField = await em.findOne(CustomFieldValue, {
      entityId: 'auth:user',
      fieldKey: 'github_username',
      valueText: newUsername,
      tenantId,
      deletedAt: null,
    })

    if (existingGhField && existingGhField.recordId !== recordId) {
      return {
        ok: false,
        statusCode: 403,
        body: { error: 'GitHub username is already in use by another user' },
      }
    }

    // 2. Immutability check: does this user have ContributionUnits?
    const cuWithUsername = await em.findOne(CustomFieldValue, {
      entityId: 'partnerships:contribution_unit',
      fieldKey: 'contributor_github_username',
      valueText: newUsername,
      tenantId,
      deletedAt: null,
    })

    // Also check if the user's CURRENT username has CUs (in case they're trying to change FROM a scored username)
    const currentGhField = await em.findOne(CustomFieldValue, {
      entityId: 'auth:user',
      recordId,
      fieldKey: 'github_username',
      tenantId,
      deletedAt: null,
    })

    const currentUsername = currentGhField?.valueText
    let hasCUs = !!cuWithUsername

    if (!hasCUs && currentUsername && currentUsername !== newUsername) {
      const cuWithCurrentUsername = await em.findOne(CustomFieldValue, {
        entityId: 'partnerships:contribution_unit',
        fieldKey: 'contributor_github_username',
        valueText: currentUsername,
        tenantId,
        deletedAt: null,
      })
      hasCUs = !!cuWithCurrentUsername
    }

    if (!hasCUs) return { ok: true } // No CUs exist — allow the change

    // 3. Check if actor is PM (context provides userId and container)
    const userId = context.userId
    const rbacService = context.container?.resolve('rbacService') as any

    let isPM = false
    if (rbacService && userId) {
      isPM = await rbacService.userHasAllFeatures(userId, ['partnerships.manage'], { tenantId })
    }

    if (!isPM) {
      return {
        ok: false,
        statusCode: 403,
        body: { error: 'GitHub username cannot be changed once WIC is recorded. Contact your Partnership Manager.' },
      }
    }

    // PM override — allowed. Audit log will be written in after hook.
    return { ok: true }
  },
  async after(request, response, context) {
    if (response.statusCode !== 200) return {}

    const entityId = request.body?.entityId as string | undefined
    const customFields = request.body?.customFields as Record<string, unknown> | undefined
    if (entityId !== 'auth:user' || !customFields || !('github_username' in customFields)) {
      return {}
    }

    // If we got here, it was a PM override. Write audit log.
    try {
      const actionLogService = context.container?.resolve('actionLogService') as any
      if (actionLogService) {
        await actionLogService.log({
          action: 'partnerships.gh_username.pm_override',
          entityType: 'auth:user',
          entityId: request.body?.id,
          userId: context.userId,
          tenantId: context.tenantId,
          changesJson: { github_username: customFields.github_username },
          context: 'PM override of immutable GitHub username (WIC recorded)',
        })
      }
    } catch (err) {
      console.error('[partnerships.gh-username-immutability] Failed to write audit log', err)
    }

    return {}
  },
},
```

**Key pattern notes:**
- `before(request, context)` — TWO separate params (not `request.context`). Matches OM `ApiInterceptor` type.
- `context.em.fork()` — fork EM to avoid dirty state. Same as Phase 1 WIP stamp `after` hook.
- `statusCode: 403` — not `status`. Matches `InterceptorBeforeResult` type.
- `context.userId`, `context.tenantId`, `context.container` — available on interceptor context.

- [ ] **Step 2: Run yarn typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: No type errors. Fix import issues or context shape mismatches.

- [ ] **Step 3: Test manually**

Test scenarios with `yarn dev`:
1. Set a GH username on a user profile — should work (no CUs yet)
2. Import WIC data for that username
3. Try to change the GH username as non-PM — should get 403
4. Try to change as PM — should work + audit log written

- [ ] **Step 4: Commit**

```bash
git add apps/prm/src/modules/partnerships/api/interceptors.ts
git commit -m "feat(partnerships): GH username immutability + uniqueness guard

Intercepts entities/records PUT/PATCH for auth:user github_username.
Rejects if username already taken (uniqueness). Rejects non-PM changes
when ContributionUnits exist (immutability). PM can override with
audit log via actionLogService.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Integration Tests + Final Verification

**Files:**
- Create: `src/modules/partnerships/__integration__/TC-PRM-009.spec.ts` (WIC import)
- Create: `src/modules/partnerships/__integration__/TC-PRM-010.spec.ts` (WIC display)
- Create: `src/modules/partnerships/__integration__/TC-PRM-011.spec.ts` (GH username guard)

- [ ] **Step 1: Write integration test for WIC import API**

Test cases for TC-PRM-009:
- Valid import → 200, records created, archived count correct
- Duplicate (contributor, month, featureKey) in batch → 422
- Unmatched GH username → 422 with `unmatchedUsernames`
- Re-import same org+month → archives previous, creates new
- WIC score computation: verify `(base + bonus) * bounty` formula

- [ ] **Step 2: Write integration test for WIC display**

Test cases for TC-PRM-010:
- GET `/api/partnerships/wic-scores` returns imported records
- Contributor sees only own records
- PM sees all orgs
- Month filter works

- [ ] **Step 3: Write integration test for GH username guard**

Test cases for TC-PRM-011:
- Set GH username before WIC import → allowed
- Change GH username after WIC import (non-PM) → 403
- Change GH username after WIC import (PM) → allowed
- Duplicate GH username → 403

- [ ] **Step 4: Run full integration test suite**

Run: `cd apps/prm && yarn test:integration`
Expected: All tests pass (Phase 1 + Phase 2).

- [ ] **Step 5: Commit tests**

```bash
git add apps/prm/src/modules/partnerships/__integration__/
git commit -m "test(partnerships): WF3 WIC Phase 2 integration tests

TC-PRM-009: WIC import API — validation, dedup, archive, score computation
TC-PRM-010: WIC score display — org scoping, role filtering, month filter
TC-PRM-011: GH username guard — uniqueness, immutability, PM override

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
