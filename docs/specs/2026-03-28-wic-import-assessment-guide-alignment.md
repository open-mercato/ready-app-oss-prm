# WIC Import — Assessment Guide Alignment

**Date:** 2026-03-28
**Status:** Draft
**Scope:** Align WIC import schema, storage, API, and UI with the WIC Assessment Guide output format.

## Problem

The current WIC import schema models data at **per-feature/per-PR granularity** (`prId`, `featureKey`, boolean `impactBonus`/`bountyApplied`). The WIC Assessment Guide produces **one aggregated row per contributor per month** with numeric bonuses and textual justifications. There is no conversion layer — the two formats are incompatible.

The Assessment Guide is the source of truth. The import schema must match it.

## Source of Truth

`apps/prm/app-spec/Wic Assessment Guide` — defines the scoring algorithm, output columns, and the LLM-based evaluation process.

Assessment Guide output columns:
| osoba | GH profile | miesiac-rok | WIC script version | Ocena WIC | WIC Level | Bounty bonus | Why bonus | What we included and why? | What we excluded and why? |

## Changes

### 1. Import Schema (`validators.ts`)

**`wicScoringResultSchema`** — one record = one contributor per month:

```typescript
{
  contributorGithubUsername: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  wicScore: z.number().nonnegative(),
  level: z.enum(['L1', 'L2', 'L3', 'L4', 'routine']),
  impactBonus: z.number().min(0).max(0.5),
  bountyBonus: z.number().nonnegative(),
  whyBonus: z.string(),
  included: z.string(),
  excluded: z.string(),
  scriptVersion: z.string().min(1),
}
```

**Removed fields:** `prId`, `featureKey`, `bountyApplied` (boolean)
**Changed fields:** `impactBonus` boolean → number (0 / 0.25 / 0.5)
**New fields:** `bountyBonus` (number), `whyBonus`, `included`, `excluded`, `scriptVersion`

**`wicImportRequestSchema`** — envelope unchanged:

```typescript
{
  organizationId: z.string().uuid(),
  month: z.string().regex(MONTH_REGEX),
  source: z.enum(['manual_import', 'automated_pipeline']),
  records: z.array(wicScoringResultSchema).min(1).max(500),
}
```

### 2. Custom Fields (`custom-fields.ts`)

Replace `CONTRIBUTION_UNIT_FIELDS` for entity `partnerships:contribution_unit`:

| Key | Type | Required | Notes |
|-----|------|----------|-------|
| `contributor_github_username` | text | yes | GH login |
| `month` | text | yes | YYYY-MM |
| `wic_score` | text | yes | Stored as text (supports decimals) |
| `level` | select | yes | Options: L1, L2, L3, L4, routine |
| `impact_bonus` | text | yes | Numeric as text (0, 0.25, 0.5) |
| `bounty_bonus` | text | yes | Numeric as text |
| `why_bonus` | text | no | Bounty justification |
| `included` | text | no | What was scored and why |
| `excluded` | text | no | What was excluded and why |
| `script_version` | text | yes | Assessment algorithm version |
| `organization_id` | text | yes | Stamped from import |
| `assessment_id` | text | yes | Groups records from same import batch |
| `assessment_source` | select | yes | manual_import / automated_pipeline |
| `archived_at` | text | no | ISO timestamp, set when replaced by newer import |

**Removed:** `pr_id`, `feature_key`

### 3. Dedup Key

Changed from `(contributorGithubUsername, month, featureKey)` to `(contributorGithubUsername, month)`.

Within a single import batch, no two records may share the same `(contributorGithubUsername, month)`. Validated in the import handler.

### 4. Import API (`api/post/wic-import.ts`)

Changes:
- Use new Zod schema from validators.ts
- Dedup check on `(contributorGithubUsername, month)` instead of `(contributorGithubUsername, month, featureKey)`
- When soft-archiving previous records for same org+month: set `archived_at` field to current ISO timestamp (instead of only setting `deletedAt` on CFV rows). This preserves archived records as queryable data rather than soft-deleted rows.
- Insert new CFV rows with all new fields

**Archive semantics change:** Previous implementation soft-deleted old CFVs (`deletedAt = now`). New implementation keeps old CFVs alive but stamps them with `archived_at`. Only the records WITHOUT `archived_at` are "current". This enables the archive UI without needing to query soft-deleted rows.

### 5. Read API (`api/get/wic-scores.ts`)

**Response type `WicScoreRecord`:**

```typescript
{
  recordId: string,
  contributorGithubUsername: string,
  month: string,
  wicScore: number,
  level: string,
  impactBonus: number,
  bountyBonus: number,
  whyBonus: string,
  included: string,
  excluded: string,
  scriptVersion: string,
  assessmentSource: string,
  archivedAt: string | null,
  assessmentId: string,
}
```

**Removed:** `prId`, `featureKey`, `bountyApplied`
**Added:** `bountyBonus`, `whyBonus`, `included`, `excluded`, `scriptVersion`, `archivedAt`, `assessmentId`
**Changed:** `impactBonus` boolean → number

**New query parameter:** `includeArchived=true` (default false). When false, only returns records where `archived_at` is null. When true, returns all records for the month.

### 6. My WIC Page (`backend/partnerships/my-wic/page.tsx`)

**Current assessment table columns:**

| Contributor | Level | Score | Impact Bonus | Bounty Bonus | Why Bonus | Source |

`included` and `excluded` shown as expandable row detail (click row to expand) — these can be long texts.

**Archive section** — below current assessment, collapsed by default:

```
▸ Previous assessments (N)
```

When expanded, shows a list of previous assessments identified by:
- Date (from `archivedAt`)
- Source (manual_import / automated_pipeline)
- Script version

Each item is expandable — clicking reveals the same table layout as current assessment but with the archived data.

**Implementation:** Fetch with `includeArchived=true`, group by `assessmentId`, separate current (no `archivedAt`) from archived. Sort archived by `archivedAt` descending.

### 7. WIC Import Page — Agentic IDE Helper

Replace the current hardcoded prompt with one that references the Assessment Guide:

```
Użyj WIC Assessment Guide i oblicz WIC score dla poniższych kont GitHub
za okres {selectedMonth} na repozytorium open-mercato/open-mercato.

Konta ({agencyName}):
  - {githubUsername} ({name})
  ...

Wygeneruj rezultat w postaci JSON array:
[
  {
    "contributorGithubUsername": "<gh-username>",
    "month": "{selectedMonth}",
    "wicScore": <suma base+impact+bounty>,
    "level": "L1|L2|L3|L4|routine",
    "impactBonus": <0|0.25|0.5>,
    "bountyBonus": <wartość liczbowa bonusu>,
    "whyBonus": "<tytuł bounty lub pusty string>",
    "included": "<co zaliczono i dlaczego>",
    "excluded": "<co odrzucono i dlaczego>",
    "scriptVersion": "1.0-agent"
  }
]

Output ONLY the JSON array, no explanation.
```

Also update the JSON placeholder in the textarea to match the new schema.

### 8. Integration Tests

| Test | Changes needed |
|------|---------------|
| TC-PRM-009 (WIC Import) | New fixture JSON, validate new fields, test archive-on-reimport |
| TC-PRM-010 (My WIC) | New table columns, test archive section expand/collapse |
| TC-PRM-011 (GH Username Guard) | Fixture update only (remove prId/featureKey from test data) |
| TC-PRM-032, TC-PRM-035 | Fixture updates for new schema |

### 9. Migration Note

Existing ContributionUnit CFV data in dev/staging uses the old schema (has `pr_id`, `feature_key`, lacks new fields). Since this is a pre-production PRM starter, no data migration is needed — existing test data can be wiped and re-imported with the new format.

## Files Affected

| File | Change |
|------|--------|
| `data/validators.ts` | New wicScoringResultSchema |
| `data/custom-fields.ts` | New CONTRIBUTION_UNIT_FIELDS |
| `api/post/wic-import.ts` | New schema, dedup key, archive semantics |
| `api/get/wic-scores.ts` | New response type, includeArchived param |
| `backend/partnerships/my-wic/page.tsx` | New columns, archive section |
| `backend/partnerships/wic-import/page.tsx` | New Agentic Helper prompt, new placeholder |
| `i18n/en.json` | New translation keys for archive UI + new columns |
| `__integration__/TC-PRM-009.spec.ts` | Updated fixtures + archive test |
| `__integration__/TC-PRM-010.spec.ts` | Updated columns + archive UI test |
| `__integration__/TC-PRM-011.spec.ts` | Fixture update |
| `__integration__/TC-PRM-032.spec.ts` | Fixture update |
| `__integration__/TC-PRM-035.spec.ts` | Fixture update |
