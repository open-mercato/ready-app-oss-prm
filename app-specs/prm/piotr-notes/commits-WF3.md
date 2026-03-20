# Commit Plan: WF3 — Code Contribution (WIC)

Verified against: upstream/main (2026-03-20, 543 commits ahead of local main)

## Platform verified

- `entities` module: `api/definitions.batch.ts` + `api/records.ts` — batch field seeding and record CRUD exist on upstream/main
- `entities/setup.ts` on upstream: minimal (role features only) — field seeding happens in app `setup.ts` via `POST /api/entities/definitions.batch` pattern
- `queue` package: worker auto-discovery via `workers/*.ts` + export `metadata { queue, id, concurrency }`. Local + BullMQ strategies.
- `customers` module AGENTS.md: `makeCrudRoute` with `indexer: { entityType }` is the reference CRUD pattern
- `n8n-nodes` (open-mercato/n8n-nodes, main): single generic REST node (`OpenMercato.node.ts`, 139 lines). Takes `method` + `path` + optional query/body JSON. Bootstrap only — no operation-specific nodes yet.
- n8n-nodes branches: `main` + `feat/openapi-based-n8n-nodes` (in progress, not merged)

---

## Phase 2 — Manual Import (Commits 1–5)

### Commit 1: GH username custom field seed on User
- Scope: `app`
- Pattern: `setup.ts seedDefaults` — POST to entities batch definitions API
- Files:
  - `src/modules/partnerships/setup.ts` (add to `seedDefaults`: POST `entities/definitions.batch` for `user:contributor_profile` with field `github_username`, type `text`, unique constraint note in description)
- Delivers: GH username field appears on User profile form (entities module renders custom fields automatically). Contributor can set their username. Field is visible to PM.
- Depends on: none (entities module is always available)
- Phase: 2

**Note on uniqueness/immutability:** The entities module stores the value; uniqueness across users and immutability-once-WIC-recorded are enforced at the import layer (Commit 3), not as a DB constraint on the custom field. This is consistent with the spec — it's a business invariant, not a DB unique index.

---

### Commit 2: ContributionUnit custom entity definition seed
- Scope: `app`
- Pattern: `setup.ts seedDefaults` — POST to entities batch definitions API for custom entity `partnerships:contribution_unit`
- Files:
  - `src/modules/partnerships/setup.ts` (extend `seedDefaults`: POST `entities/definitions.batch` for entity `partnerships:contribution_unit` with fields: `contributor_github_username` text, `pr_id` text, `month` text YYYY-MM, `feature_key` text, `level` select [L1_low|L1_high|L2|L3|L4|routine], `impact_bonus` boolean, `bounty_applied` boolean, `wic_score` float, `organization_id` text, `assessment_id` text, `assessment_source` select [manual_import|automated_pipeline])
- Delivers: ContributionUnit records can be created via `POST /api/entities/records`. The dedup key (contributor + month + feature_key) and assessment versioning are enforced by the import route (Commit 3), not the entity definition itself.
- Depends on: Commit 1 (same `setup.ts` file, same `seedDefaults` call)
- Phase: 2

**Note on WicAssessmentSource:** Stored as a field on ContributionUnit (per-record provenance). The assessment-level versioning (one active assessment per org+month, replace+archive) is implemented in the import route as a write transaction, not as a separate entity — this keeps the data model flat for Phase 2. Phase 4 can promote to a `WicAssessment` header entity if needed.

---

### Commit 3: WIC import API route
- Scope: `app`
- Pattern: custom POST route (`api/<method>/<path>.ts`) with Zod validation + `makeCrudRoute`-style idempotent write logic
- Files:
  - `src/modules/partnerships/api/POST/wic/import.ts`
- Delivers: `POST /api/partnerships/wic/import` accepts:
  ```json
  {
    "organizationId": "...",
    "month": "2026-03",
    "source": "manual_import",
    "records": [{ WicScoringResult }]
  }
  ```
  Route logic:
  1. Validate each record against `WicScoringResult` schema (Zod). Reject with 422 + field-level errors if any record fails — no partial batch insertion.
  2. Resolve `contributor_github_username` → User (look up custom field value in entities). Reject unmatched GH usernames with rejection list (422 with `unmatched_usernames` array).
  3. Check GH username uniqueness: if another User already has this GH username, reject.
  4. Load existing ContributionUnits for same org+month. Mark all existing records with `archived_at = now()` (soft-archive via a `status` field or `archived_at` on the entity record).
  5. Insert new ContributionUnits with `assessment_source = 'manual_import'`. Enforce dedup invariant at insert: if `(contributor_github_username, month, feature_key)` duplicates within the incoming batch, reject the entire batch (not silent dedup).
  6. Compute `wic_score = base_score + impact_bonus_delta * bounty_multiplier` inline.
  7. Respond with `{ imported: N, archived: M, rejected: [] }`.
  Exports `openApi` object. Wires `validateCrudMutationGuard` / `runCrudMutationGuardAfterSuccess`.
- Depends on: Commit 2 (ContributionUnit entity must exist before writing records)
- Phase: 2

---

### Commit 4: WIC score display — backend page (Contributor + PM view)
- Scope: `app`
- Pattern: backend page (`backend/<path>/page.tsx`) + widget injection for KPI dashboard
- Files:
  - `src/modules/partnerships/backend/partnerships/wic/page.tsx` (list page: DataTable showing ContributionUnits for current month, columns: contributor, feature_key, level, wic_score, bounty_applied, source. Scoped by org via `resolveOrganizationScope`. RBAC: `partner_contributor` sees own rows only; `partner_admin`, `partner_member` see all org rows; `partnership_manager` sees all orgs.)
  - `src/modules/partnerships/widgets/kpi-wic-summary.widget.tsx` (injected into KPI dashboard card: total WIC score this month for current org, source badge `manual` | `automated`)
- Delivers: Contributor logs in, sees WIC score breakdown. PM sees score per org on KPI dashboard. "Missing PR?" flow: contributor sees which feature_keys are present, can flag to Admin offline.
- Depends on: Commit 3 (needs data to display)
- Phase: 2

---

### Commit 5: GH username immutability guard + PM override audit log
- Scope: `app`
- Pattern: API interceptor on User profile update (`entities/records` PUT) — intercept before write
- Files:
  - `src/modules/partnerships/subscribers/gh-username-immutability.ts` (subscriber on `entities.records.updated` event — if field is `github_username` AND ContributionUnit records exist for this user, reject update unless actor has `partnership_manager` role. If PM overrides: write audit log entry via `audit_logs` module.)
- Delivers: GH username becomes immutable once WIC is recorded against it. PM can override with audit trail. Non-PM update attempt returns 403 with explanation.
- Depends on: Commit 3 (ContributionUnit records must exist to check)
- Phase: 2

---

## Phase 4 — n8n Automated Pipeline (Commits 6–8)

### Commit 6: n8n-nodes — WIC-specific operation on Open Mercato node
- Scope: `n8n`
- Pattern: extend `OpenMercato.node.ts` with operation group for WIC import (or document that the generic REST node is sufficient as-is)
- Files:
  - `open-mercato/n8n-nodes: src/nodes/OpenMercato/OpenMercato.node.ts` (add optional "WIC Import" operation preset: pre-fills path `/api/partnerships/wic/import`, method POST, body template matching `WicScoringResult[]` schema — reduces config friction in n8n UI)
  - `open-mercato/n8n-nodes: examples/wic-pipeline.json` (example n8n workflow JSON — see Commit 7)

**Assessment:** The existing generic REST node (`method` + `path` + body JSON) is functionally sufficient to call `POST /api/partnerships/wic/import`. A dedicated operation preset reduces user error but is not strictly required. If the n8n-nodes upstream PR timeline is a blocker, Commit 7 can use the generic node as-is with documented path/body. Flag: this is an upstream PR to `open-mercato/n8n-nodes` — needs review + merge before the workflow is distributable as an official example.

- Delivers: n8n users can select "WIC Import" operation from the Open Mercato node dropdown instead of manually typing path + body schema.
- Depends on: Commit 3 (import API must exist before the node operation is useful)
- Phase: 4

---

### Commit 7: n8n WIC pipeline workflow definition
- Scope: `n8n`
- Pattern: n8n workflow JSON (importable via n8n UI or CLI)
- Files:
  - `app-specs/prm/n8n-workflows/wic-pipeline.json` (workflow JSON stored in app-specs for documentation; deployed to n8n instance separately)
- Delivers: Complete n8n workflow:
  1. **Schedule Trigger** — daily at 02:00 UTC
  2. **HTTP Request node** — GitHub GraphQL API: fetch merged PRs from `open-mercato/open-mercato` for the current month. Query: `repository.pullRequests(states: MERGED, first: 100)` with author login, merged date, title, body, files changed count, linked issues.
  3. **Code node** — group PRs by `author.login + mergedMonth + featureKey`. featureKey extracted from PR title (SPEC-xxx pattern) or linked issue number or PR id fallback. Enforce dedup: same person+month+featureKey = one ContributionUnit.
  4. **HTTP Request node** (or Open Mercato node) — call LLM API (OpenAI or compatible) with WIC Assessment Guide rubric prompt. Input: PR title, body, files changed count, linked issues. Output: `{ level, impactBonus, bountyApplied, reasoning }`.
  5. **Code node** — assemble `WicScoringResult[]` array from steps 3+4. Set `source = "automated_pipeline"`.
  6. **Open Mercato node** — `POST /api/partnerships/wic/import` with assembled payload. One call per org (group by organization_id, resolved from GH username lookup in step 2 via a pre-fetched user map).
  7. **Error handling** — IF node: on HTTP error from import API, send notification (email or Slack node) with rejected_usernames list.
- Depends on: Commit 3 (import API), Commit 6 (n8n node operation preset — or generic node as fallback)
- Phase: 4

**Note on LLM scoring:** The WIC Assessment Guide rubric (at `/Users/maciejgren/Documents/SDRC/`) defines L1-L4 scoring criteria. The n8n Code node embeds the rubric as a prompt template. This keeps LLM logic in n8n, not in OM. OM only sees the final `WicScoringResult[]` — clean ACL boundary.

---

### Commit 8: n8n WIC pipeline — documentation + env config
- Scope: `external`
- Pattern: setup documentation + `.env.example` additions
- Files:
  - `apps/prm/.env.example` (add: `N8N_BASE_URL`, `N8N_API_KEY`, `GITHUB_GRAPHQL_TOKEN`, `OPENAI_API_KEY` or equivalent)
  - `apps/prm/docs/wic-pipeline-setup.md` — ONLY if explicitly requested. Otherwise: note in app README.
- Delivers: Developer bootstrapping the app knows which env vars to configure for the n8n WIC pipeline. n8n instance URL and auth token documented.
- Depends on: Commit 7 (workflow JSON defines which external services are needed)
- Phase: 4

---

## Summary

| Commit | Description | Scope | Phase | Depends on |
|--------|-------------|-------|-------|------------|
| 1 | GH username custom field seed | `app` | 2 | none |
| 2 | ContributionUnit custom entity seed | `app` | 2 | 1 |
| 3 | WIC import API (`POST /api/partnerships/wic/import`) | `app` | 2 | 2 |
| 4 | WIC score display — backend page + KPI dashboard widget | `app` | 2 | 3 |
| 5 | GH username immutability guard + PM audit override | `app` | 2 | 3 |
| 6 | n8n-nodes — WIC Import operation preset | `n8n` | 4 | 3 |
| 7 | n8n WIC pipeline workflow JSON | `n8n` | 4 | 3, 6 |
| 8 | Env config + setup docs | `external` | 4 | 7 |

**Total Phase 2 (manual import workaround): 5 commits**
**Total Phase 4 (n8n automation): 3 commits**
**Grand total WF3: 8 commits**

---

## Flags

**Commit 6 — upstream PR to `open-mercato/n8n-nodes`:** The generic REST node is functionally sufficient. The WIC operation preset is a DX improvement. If shipping Phase 4 quickly, skip Commit 6 and use the generic node in Commit 7 — reduces 8 commits to 7 with no loss of functionality. If the operation preset is built, it requires PR review from the n8n-nodes maintainer.

**No `core-module` flags.** All WF3 work lives in `app` or `n8n`. The entities module's existing `definitions.batch` + `records` APIs absorb all data model needs without modification.

**Cron trigger:** WF3 Phase 4 uses n8n Schedule Trigger — no OM-side cron worker needed. This resolves the "no scheduler module" finding from the gap matrix. The import API (Commit 3) is the integration point; n8n owns the schedule.

**GH username uniqueness implementation note:** Not enforced as a DB unique index (entities module custom fields don't support DB-level constraints). Enforced at import time (Commit 3, step 3: reject if another User has same github_username value). This is the correct layer — business invariant, not schema constraint.
