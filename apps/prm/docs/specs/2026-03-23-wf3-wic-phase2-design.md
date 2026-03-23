# WF3 — WIC (Work-in-Community) Phase 2 Design

**Date:** 2026-03-23
**Phase:** 2
**Workflow:** WF3 — Code Contribution Scoring
**Scope:** Manual import workaround (automated n8n pipeline deferred to Phase 4)

---

## Overview

Phase 2 enables PM to import WIC scores from the external `wic_assessment.mjs` script and makes scores visible to agencies. This is the manual workaround — PM runs the script externally, gets `WicScoringResult[]` JSON, and imports via API.

**4 atomic commits** (Commit 1 from Piotr's plan is skipped — `github_username` custom field already exists in Phase 1).

---

## Commit Map

| # | Commit | Pattern | Depends on |
|---|--------|---------|------------|
| 2 | ContributionUnit Entity | `setup.ts` seed | Phase 1 |
| 3 | WIC Import API | Custom POST route | Commit 2 |
| 4 | WIC Score Display | Backend pages + widget | Commit 3 |
| 5 | GH Username Immutability + Uniqueness Guard | API interceptor | Commit 3 |

---

## Commit 2: ContributionUnit Custom Entity Definition

**Entity ID:** `partnerships:contribution_unit`
**Label field:** `feature_key`
**Pattern:** `setup.ts seedDefaults` — POST to `entities/definitions.batch`

### Custom Fields

| Key | Type | Required | Notes |
|-----|------|----------|-------|
| `contributor_github_username` | text | yes | GH handle, resolved to User at import |
| `pr_id` | text | yes | GitHub PR identifier |
| `month` | text | yes | `YYYY-MM` format |
| `feature_key` | text | yes | e.g. `prm.wic-import` |
| `level` | select | yes | Options: `L1`, `L2`, `L3`, `L4`, `routine` (per App Spec WicScoringResult schema) |
| `impact_bonus` | boolean | yes | |
| `bounty_applied` | boolean | yes | |
| `wic_score` | decimal | yes | Computed at import (supports fractional: 0.25, 0.5, 1.5, etc.) |
| `organization_id` | text | yes | Stamped from contributor's org at import time. Used for org+month archive queries and page scoping. |
| `assessment_id` | text | yes | Groups records from same import batch |
| `assessment_source` | select | yes | Options: `manual_import`, `automated_pipeline` |

**Note on L1 sub-levels:** App Spec defines two L1 score variants (0.5 for complex fix/large refactor, 0.25 for smaller fix/hardening). The `level` enum stores `L1`; the score computation logic (Commit 3) determines which variant applies based on `impactBonus` and scoring rules from the WIC Assessment Guide.

### Invariants

- **Dedup key:** `(contributor_github_username, month, feature_key)` — enforced at import API level (Commit 3), not DB constraint
- **Organization scoping:** `organization_id` custom field stamped from contributor's org at import time. (OM entities also have a built-in `record.organizationId`, but the explicit custom field is needed for cross-org queries by PM.)
- **Assessment versioning:** Flat model (per-record `assessment_id` + soft-archive via `archived_at`). Phase 4 may promote to a `WicAssessment` header entity if needed.

### Files

- `src/modules/partnerships/setup.ts` — extend `seedDefaults`
- `src/modules/partnerships/data/custom-fields.ts` — add `CONTRIBUTION_UNIT_FIELDS`
- `src/modules/partnerships/data/ce.ts` — add entity definition

---

## Commit 3: WIC Import API Route

**Route:** `POST /api/partnerships/wic/import`
**Pattern:** Custom POST route with Zod validation + transactional batch semantics
**RBAC:** Requires `partnerships.manage` feature (PM only)

### Request Schema

```json
{
  "organizationId": "uuid",
  "month": "2026-03",
  "source": "manual_import",
  "records": [
    {
      "contributorGithubUsername": "octocat",
      "prId": "open-mercato/open-mercato#142",
      "month": "2026-03",
      "featureKey": "prm.wic-import",
      "level": "L2",
      "impactBonus": true,
      "bountyApplied": false
    }
  ]
}
```

### Route Logic (all-or-nothing transaction)

1. Zod validate each record against `WicScoringResult` schema. Reject entire batch with 422 + field-level errors if any record fails.
2. Reject batch if `(contributorGithubUsername, month, featureKey)` duplicates within incoming records. Dedup operates on raw input strings (pre-resolution); this is safe because GH usernames are unique per the enforced invariant.
3. Resolve `contributorGithubUsername` -> User via custom field lookup on `auth:user`. Reject with 422 + `unmatchedUsernames[]` if any fail.
4. Check GH username uniqueness across system — no two Users may share the same handle. If duplicate found, reject with 422.
5. Soft-archive existing ContributionUnits for same org+month (`archived_at = now()`).
6. Compute `wic_score` per record: `(base_score + impact_bonus) * bounty_multiplier` where:
   - `base_score`: L4=1.0, L3=0.5, L2=1.0, L1=0.5 or 0.25 (determined by scoring rules), routine=0.0
   - `impact_bonus`: +0.5 if `impactBonus` is true, +0.0 if false. (The external scoring script determines this based on scope and completeness criteria from the WIC Assessment Guide.)
   - `bounty_multiplier`: 1.5 if `bountyApplied`, else 1.0
7. Insert new ContributionUnits with shared `assessment_id` (UUID) + `assessment_source`.

### Response

**Success (200):**
```json
{ "imported": 12, "archived": 8, "assessmentId": "uuid" }
```

**Note:** No `rejected` field in success response — all-or-nothing semantics mean any validation failure rejects the entire batch (422). This is an intentional simplification from Piotr's plan which included `rejected: []`.

**Errors:**
- `422` — Validation failures, unmatched usernames, within-batch duplicates, GH username conflicts
- `403` — Missing `partnerships.manage` feature

### Guards

- `validateCrudMutationGuard` before processing
- `runCrudMutationGuardAfterSuccess` after commit
- Exports `openApi` route doc

### Files

- `src/modules/partnerships/api/POST/wic/import.ts` (~150 lines)
- `src/modules/partnerships/data/validators.ts` — `wicImportSchema`, `wicScoringResultSchema`

---

## Commit 4: WIC Score Display

### Backend Page 1: `/backend/partnerships/wic-import` (PM only)

**Purpose:** PM imports WIC scores and sees results inline.

- Org selector (dropdown of all agencies)
- Month picker (default: current month)
- JSON upload area (paste or file upload of `WicScoringResult[]` output from `wic_assessment.mjs`). Note: App Spec mentions CSV/markdown upload, but JSON was chosen because the external script outputs `WicScoringResult[]` as JSON directly. CSV/markdown support deferred unless needed.
- "Import" button — calls `POST /api/partnerships/wic/import`
- Inline result display:
  - **Success:** "Imported 12 records, archived 8 previous" + DataTable of imported ContributionUnits
  - **Error:** Field-level error list + unmatched usernames table
- RBAC: `partnership_manager` only (feature: `partnerships.manage`)

### Backend Page 2: `/backend/partnerships/my-wic` (agency view)

**Purpose:** Agency users see WIC score breakdown. Path follows App Spec convention (`/my-wic`, consistent with `/my-tier` pattern). Dashboard WIC widget links here.

- DataTable of ContributionUnits for selected month
- Columns: contributor name, PR ID, feature key, level, WIC score, bounty status, source badge
- Month picker (default: current month)
- **Organization scoping:**
  - `partner_contributor` — own rows only
  - `partner_admin` / `partner_member` — all rows in own org
  - `partnership_manager` — all orgs (cross-org view with org filter)
- Pagination, sort by `wic_score` desc

### KPI Dashboard Widget: `partnerships.dashboard.wic-summary`

- Tile: "WIC Score: **147**" + source badge (`manual` | `automated`)
- Total WIC score for current month, org-scoped
- **Roles:** `partner_contributor` only (per App Spec). Admin/BD see WIC as part of Tier Status widget in WF5.
- Feature: `partnerships.widgets.wic-summary`
- Size: `sm`, supports refresh
- Click-through: links to `/backend/partnerships/my-wic`

### Files

- `src/modules/partnerships/backend/partnerships/wic-import/page.meta.ts`
- `src/modules/partnerships/backend/partnerships/wic-import/page.tsx`
- `src/modules/partnerships/backend/partnerships/my-wic/page.meta.ts`
- `src/modules/partnerships/backend/partnerships/my-wic/page.tsx`
- `src/modules/partnerships/widgets/dashboard/wic-summary/widget.ts`
- `src/modules/partnerships/widgets/dashboard/wic-summary/widget.client.tsx`
- `src/modules/partnerships/acl.ts` — add `partnerships.widgets.wic-summary` feature
- `src/i18n/en.json` — add WIC pages + widget labels

---

## Commit 5: GH Username Immutability + Uniqueness Guard

**Pattern:** API interceptor on `entities/records` PUT and PATCH (same pattern as WIP stamp interceptor in Phase 1)

### Logic

1. Interceptor `before` hook: check if update targets `github_username` field on `auth:user`
2. If not — passthrough
3. If yes — **Uniqueness check:** query all Users for matching `github_username` value. If another User already has this handle, reject with 403: "GitHub username is already in use"
4. **Immutability check:** query active (non-archived) ContributionUnits matching `contributor_github_username` for the current user
5. No CU found — allow update (uniqueness already passed)
6. CU found + actor is non-PM — reject with 403: "GitHub username cannot be changed once WIC is recorded"
7. CU found + actor is PM — allow + write audit log via `actionLogService.log()` with `snapshotBefore`/`snapshotAfter`

**Note:** Uniqueness is enforced both here (at profile save time) and in the import API (Commit 3, step 4). Belt-and-suspenders — the interceptor prevents duplicates before any WIC import happens.

### Interceptor Config

- **ID:** `partnerships.gh-username-immutability`
- **Target route:** `entities/records`
- **Methods:** `PUT`, `PATCH`
- **Priority:** 50

### Files

- `src/modules/partnerships/api/interceptors.ts` — extend existing file (add second interceptor alongside WIP stamp)

---

## Platform Dependencies

All capabilities verified on upstream/main — **zero upstream changes needed:**

| Capability | OM Module | Status |
|------------|-----------|--------|
| Custom entity batch definitions | `entities/api/definitions.batch.ts` | Available |
| Entity record CRUD + soft-delete | `entities/api/records.ts` | Available |
| Organization scoping | `resolveOrganizationScopeForRequest` | Available |
| API interceptors | Interceptor pattern (Phase 1 WIP stamp) | Available |
| Audit logging | `audit_logs/services/actionLogService` | Available |
| RBAC feature guards | `rbacService.userHasAllFeatures` | Available |
| Dashboard widget injection | `lazyDashboardWidget` pattern | Available |
| Mutation guards | `validateCrudMutationGuard` | Available |

---

## Acceptance Criteria (from App Spec)

- [ ] GH username unique across system (enforced at profile save + import time), immutable once WIC recorded (except PM override with audit)
- [ ] WIC import rejects non-conforming records with 422 + field-level errors
- [ ] WIC import rejects unmatched GH usernames with rejection list
- [ ] Feature key dedup: same `(contributor, month, feature_key)` in batch rejects entire batch
- [ ] WIC import archives previous assessment, replaces with exactly 1 active per org+month
- [ ] WicAssessmentSource always set on import (no nulls)
- [ ] Every ContributionUnit has non-null `organization_id` from contributor's org at import time
- [ ] Contributor can see own WIC scores
- [ ] PM can import WIC scores via upload UI (paste/upload -> validate -> replace)
- [ ] PM can see WIC scores across all agencies
