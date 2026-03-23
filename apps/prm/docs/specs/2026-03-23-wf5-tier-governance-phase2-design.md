# WF5 — Tier Governance Phase 2 Design

**Date:** 2026-03-23
**Phase:** 2
**Workflow:** WF5 — Tier Governance + MIN Attribution
**Source:** Piotr commit plan (`app-specs/prm/piotr-notes/commits-WF5.md`)

---

## Overview

Phase 2 governance: monthly tier evaluation using all 3 KPIs (WIC + WIP + MIN), grace period state machine, PM approval workflow, and MIN attribution via cross-org company search. Without tiers, the partner program has no teeth.

**7 atomic commits**, all app scope, zero upstream dependencies.

---

## Commit Map

| # | Commit | Pattern | Depends on |
|---|--------|---------|------------|
| 1 | PartnerLicenseDeal entity + PM CRUD | ORM entity + makeCrudRoute + backend page | None |
| 2 | Cross-org company search + attribution UI | Custom GET route + backend page | Commit 1 |
| 3 | KPI aggregation worker + grace period state machine | ORM entities + worker | Commit 1, WF3 |
| 4 | Tier evaluation workflow + AgencyTierChanged event | Workflow JSON + events.ts | Commit 3 |
| 5 | Cron trigger API | POST routes + crontab.example | Commit 4 |
| 6 | Tier progress dashboard widget | Widget injection | Commit 3, 4 |
| 7 | seedExamples Phase 2 | setup.ts seedExamples | Commits 1-6 |

---

## Tier Definitions (App Spec §1.4.1)

| Tier | WIC/month | WIP/month | MIN/year | Notes |
|------|-----------|-----------|----------|-------|
| OM Agency | 1 (L1-2) | 1 | 1 | Foundational; manual PM gate at onboarding |
| OM AI-native Agency | 2 (L1-4) | 5 | 2 | Higher match score |
| OM AI-native Expert | 3 (L1-4) | 15 | 5 (3 in vertical) | Vertical dominance |
| OM AI-native Core | 4 (L3-4) | 15 | 5 | Horizontal dominance |

All thresholds conjunctive — ALL 3 KPIs must meet for tier eligibility.

---

## Commit 1: PartnerLicenseDeal Entity + PM CRUD

**Pattern:** ORM entity + `makeCrudRoute` + backend page + migration

### ORM Entity: `PartnerLicenseDeal`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | auto |
| `organization_id` | UUID FK | Non-null, references attributed agency org |
| `company_id` | UUID FK | Non-null, references CRM CustomerEntity (company) |
| `license_identifier` | string | Non-null |
| `industry_tag` | string | Non-null |
| `type` | enum | `enterprise` (only value for now) |
| `status` | enum | `won` (only value for now) |
| `is_renewal` | boolean | Default false |
| `closed_at` | date | Non-null |
| `year` | integer | Computed from `closed_at` (UTC year) |
| `created_by` | UUID | userId of PM who created |
| `tenant_id` | UUID | Standard OM tenant scope |
| `created_at` | timestamp | auto |

**DB constraints:**
- Unique: `(license_identifier, year)` — no double-attribution at DB level
- FK: `organization_id` references directory.organization
- FK: `company_id` references customers.customer_entity

### CRUD Route

- `makeCrudRoute` at `/api/partnerships/partner-license-deals`
- PM-only: `requireFeatures: ['partnerships.manage']`
- `indexer: { entityType: 'partnerships:partner_license_deal' }`
- Invariant enforcement:
  - Reject if `(license_identifier, year)` already exists (422)
  - `year` computed server-side from `closed_at` (UTC)
- Exports `openApi`

### Backend Page: `/backend/partnerships/license-deals`

- PM-only (`partnerships.manage`)
- DataTable: agency name, company name, industry tag, year, license identifier, status
- pageOrder: 140

### Files

- `src/modules/partnerships/data/entities.ts` — PartnerLicenseDeal entity
- `src/modules/partnerships/commands/partner-license-deal.ts` — create/update/delete commands
- `src/modules/partnerships/api/partner-license-deals/route.ts` — makeCrudRoute
- `src/modules/partnerships/backend/partnerships/license-deals/page.meta.ts`
- `src/modules/partnerships/backend/partnerships/license-deals/page.tsx`
- `src/modules/partnerships/backend/partnerships/license-deals/create/page.meta.ts` — CrudForm fallback for manual creation (primary flow is attribution UI in Commit 2)
- `src/modules/partnerships/backend/partnerships/license-deals/create/page.tsx`
- `src/modules/partnerships/api/openapi.ts` — `createCrudOpenApiFactory({ defaultTag: 'Partnerships' })` if not already present from Phase 1
- `src/modules/partnerships/migrations/YYYYMMDD_add_partner_license_deal.ts`

---

## Commit 2: Cross-Org Company Search + Attribution UI

### GET `/api/partnerships/company-search`

- **Query:** `?q=<search term>`
- **Scope:** Program Scope (`organizationsJson: null`) — searches CRM companies across ALL agencies
- **RBAC:** PM only (`partnerships.manage`)
- **Response:** `Array<{ companyId, companyName, organizationId, agencyName, createdAt, dealCount }>`

### Backend Page: `/backend/partnerships/license-deals/attribute`

- PM-only (`partnerships.manage`)
- **Flow:**
  1. Search box → calls company-search API
  2. Result list: agency name, company name, date created, deal count
  3. Click company → CRM read-only view (link to that agency's CRM company detail)
  4. "Confirm attribution" button → form with license_identifier, industry_tag, closed_at
  5. Submit → POST to `/api/partnerships/partner-license-deals`
- pageOrder: 145

### Files

- `src/modules/partnerships/api/get/company-search.ts`
- `src/modules/partnerships/backend/partnerships/license-deals/attribute/page.meta.ts`
- `src/modules/partnerships/backend/partnerships/license-deals/attribute/page.tsx`
- `src/modules/partnerships/i18n/en.json` — add `partnerLicenseDeals.*`, `companySearch.*` keys

---

## Commit 3: KPI Aggregation Worker + Grace Period State Machine

### New ORM Entities

**TierEvaluationState:**

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | auto |
| `organization_id` | UUID FK | Non-null, unique with evaluationMonth |
| `current_tier` | string | Tier name |
| `evaluation_month` | string | YYYY-MM |
| `grace_period_started_at` | timestamp | Nullable |
| `status` | enum | `OK`, `GracePeriod`, `ProposedDowngrade` |
| `tenant_id` | UUID | Standard |
| `created_at` | timestamp | auto |
| `updated_at` | timestamp | auto |

**TierChangeProposal:**

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | auto |
| `organization_id` | UUID FK | Non-null |
| `evaluation_month` | string | YYYY-MM |
| `current_tier` | string | |
| `proposed_tier` | string | |
| `type` | enum | `upgrade`, `downgrade` |
| `status` | enum | `Draft`, `PendingApproval`, `Approved`, `Rejected` |
| `rejection_reason` | string | Nullable |
| `wic_snapshot` | float | KPI value at evaluation time |
| `wip_snapshot` | integer | |
| `min_snapshot` | integer | |
| `resolved_at` | timestamp | Nullable (set on approve/reject) |
| `tenant_id` | UUID | Standard |
| `created_at` | timestamp | auto |

Unique constraint: one open proposal per org per period — `(organization_id, evaluation_month)` WHERE `status IN ('Draft', 'PendingApproval')`

**TierAssignment:**

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | auto |
| `organization_id` | UUID FK | Non-null |
| `tier` | string | Tier name |
| `effective_date` | date | |
| `approved_by` | UUID | userId of PM |
| `reason` | string | Nullable |
| `tenant_id` | UUID | Standard |
| `created_at` | timestamp | auto |

### Worker: `tier-evaluation`

- **Queue:** `partnerships`
- **ID:** `tier-evaluation`
- **Concurrency:** 2
- **Input:** `{ organizationId: string, evaluationMonth: string }`

**Handler logic (idempotent):**

1. Check `TierEvaluationState` for org+month — if already exists and processed, skip.
2. Read KPIs:
   - WIC: `SUM(wic_final)` from ContributionUnit CFVs (field: `wic_score` stores wic_final value) WHERE org+month, deletedAt=null
   - WIP: `COUNT` from `wip_registered_at` CFVs WHERE org+month, deletedAt=null
   - MIN: `COUNT` from PartnerLicenseDeal WHERE org, type=enterprise, status=won, is_renewal=false, year=currentYear
3. Compute TierEligibility: highest tier where ALL 3 KPIs meet thresholds. **Note:** OM Agency tier admission is a manual PM gate at onboarding — the automated worker does not downgrade below OM Agency and does not automatically grant OM Agency status. The worker evaluates tiers 2-4 only.
4. Load/create TierEvaluationState for org+month.
5. Apply grace period state machine:
   - Eligibility < currentTier:
     - status=OK → set GracePeriod, gracePeriodStartedAt=now (no proposal)
     - status=GracePeriod → set ProposedDowngrade, create TierChangeProposal(type=downgrade)
   - Eligibility > currentTier → create TierChangeProposal(type=upgrade)
   - Eligibility == currentTier:
     - status=GracePeriod → reset to OK (recovery)
     - status=OK → no-op
6. Guard: skip if open proposal already exists for org+period.
7. Save. On flush failure: `em.clear()`.

### Files

- `src/modules/partnerships/data/entities.ts` — add TierEvaluationState, TierChangeProposal, TierAssignment
- `src/modules/partnerships/workers/tier-evaluation.ts`
- `src/modules/partnerships/migrations/YYYYMMDD_add_tier_entities.ts`

---

## Commit 4: Tier Evaluation Workflow + AgencyTierChanged Event

### AgencyTierChanged Event

Add to `events.ts`:
```
{ id: 'partnerships.agency.tier_changed', label: 'Agency Tier Changed', entity: 'tier_assignment', category: 'lifecycle' }
```

**Payload:** `{ agencyId, previousTier, newTier, effectiveDate, approvedBy }` — all non-null.

Published ONLY on approval, NOT on rejection.

### Workflow Definition

Seeded via `setup.ts seedDefaults`:

```
START
  → AUTOMATED: CALL_API POST /api/queue/partnerships/tier-evaluation
  → USER_TASK "Review Tier Change Proposal" (partnership_manager)
      form: KPI snapshot (read-only), approve/reject radio, reason textarea
  → On APPROVE:
      UPDATE TierChangeProposal → status=Approved, resolvedAt=now
      UPDATE/CREATE TierAssignment → new tier, effectiveDate, approvedBy
      EMIT_EVENT partnerships.agency.tier_changed
      WRITE audit log entry (agencyId, previousTier, newTier, reason, approvedBy, timestamp)
  → On REJECT:
      UPDATE TierChangeProposal → status=Rejected, rejectionReason, resolvedAt=now
  → END
```

### Enqueue API

`POST /api/partnerships/enqueue-tier-evaluation`
- PM or cron-authenticated
- Enqueues one `tier-evaluation` job per active agency org
- Returns `{ jobsEnqueued: N }`

### Files

- `src/modules/partnerships/events.ts` — add AgencyTierChanged
- `src/modules/partnerships/examples/tier-evaluation-workflow.json`
- `src/modules/partnerships/setup.ts` — seed workflow definition
- `src/modules/partnerships/api/post/enqueue-tier-evaluation.ts`
- `src/modules/partnerships/acl.ts` — add `partnerships.tier.approve` feature
- `src/modules/partnerships/setup.ts` — add `partnerships.tier.approve` to `partnership_manager` role

---

## Commit 5: Cron Trigger API

### `POST /api/partnerships/trigger-monthly-evaluation`

- Auth: `x-api-key` header checked against `CRON_SECRET` env var
- Enqueues tier evaluation for all active agency orgs
- Stateless, idempotent (worker checks evaluationMonth before mutating)
- Returns `{ jobsEnqueued: N }`
- Exports `openApi`

### `POST /api/partnerships/trigger-wic-import` (if not already in place)

Same pattern — triggers WIC import for all orgs.

### Files

- `src/modules/partnerships/api/post/trigger-monthly-evaluation.ts`
- `src/modules/partnerships/api/post/trigger-wic-import.ts`
- `crontab.example` — documented crontab entries
- `.env.example` — add `CRON_SECRET=`

---

## Commit 6: Tier Progress Dashboard Widget

### Widget: `partnerships.dashboard.tier-status`

**Server data:** Reads TierAssignment (current tier) + TierEvaluationState (grace period status) + live KPI values (WIC/WIP/MIN) for requesting user's org. Computes progress-to-next-tier percentages.

**Client rendering:**
- Current tier badge
- KPI progress bars: WIC X/threshold %, WIP X/threshold %, MIN X/threshold %
- Grace period warning banner (when status=GracePeriod)
- "Pending approval" notice (when open TierChangeProposal exists)

**Role-scoped:**
- Admin + BD: full view (tier badge + KPI bars + warnings)
- Contributor: tier badge only
- PM: list view with per-agency tier status

**Features:** `partnerships.widgets.tier-status`
**Size:** `md`, icon: `shield`, supportsRefresh: true

### Files

- `src/modules/partnerships/widgets/dashboard/tier-status/widget.ts`
- `src/modules/partnerships/widgets/dashboard/tier-status/widget.client.tsx`
- `src/modules/partnerships/api/get/tier-status.ts` — GET route for widget data
- `src/modules/partnerships/widgets/injection-table.ts` — register tier-status
- `src/modules/partnerships/acl.ts` — add `partnerships.widgets.tier-status` feature
- `src/modules/partnerships/setup.ts` — add widget feature to Admin/BD roles, add to AGENCY_WIDGETS
- `src/modules/partnerships/i18n/en.json` — add `tierStatus.*` keys

---

## Commit 7: seedExamples Phase 2

Extend `setup.ts seedExamples` with:

- **TierAssignment** history: 2-3 historical entries + current per demo agency
  - Acme Digital → OM Agency
  - Nordic AI Labs → OM AI-native Agency
  - CloudBridge → OM Agency (new)
- **ContributionUnits** for current + previous month (via WIC import API or direct seed)
- **PartnerLicenseDeals**: 1-5 per agency, enterprise, won, is_renewal=false, varying industry tags
- **TierEvaluationState**: one in GracePeriod (Nordic — below WIP threshold), one OK (Acme)
- **TierChangeProposal**: one PendingApproval (upgrade for Acme to AI-native Agency)
- **GH usernames** linked on demo Contributor users

### Files

- `src/modules/partnerships/setup.ts` — extend seedExamples

---

## Platform Dependencies

All verified on upstream/main — **zero upstream changes needed:**

| Capability | OM Module | Status |
|------------|-----------|--------|
| ORM entities + migrations | MikroORM + CLI | Available |
| makeCrudRoute | customers module reference | Available |
| Queue workers (auto-discovery) | queue package | Available |
| Workflow JSON definitions | workflows module | Available |
| Cross-org search (Program Scope) | `organizationsJson: null` | Available |
| Event bus + subscribers | events package | Available |
| Dashboard widget injection | shared/modules/dashboard | Available |
| Audit logging | audit_logs module | Available |

---

## Acceptance Criteria (from App Spec + Vernon)

### Domain Invariants
- [ ] At most one open TierChangeProposal per org per evaluation period
- [ ] TierEvaluationState transitions one-directional: OK → GracePeriod → ProposedDowngrade
- [ ] GracePeriod resets to OK only when ALL thresholds met (conjunctive)
- [ ] PartnerLicenseDeal references exactly one CRM Company (non-null)
- [ ] No double-attribution: unique `(license_identifier, year)` at DB level
- [ ] MIN counted only if type=enterprise, status=won, is_renewal=false
- [ ] TierAssignment only mutated via PM-approval path
- [ ] Approved TierChangeProposal immutable — cannot re-approve or re-reject
- [ ] AgencyTierChanged published on every PM approval with full payload
- [ ] AgencyTierChanged NOT published on rejection
- [ ] Agency users cannot create/update/delete PartnerLicenseDeal (PM-only)
- [ ] MIN calendar year boundary is UTC
- [ ] KPI thresholds are conjunctive — all 3 must meet
- [ ] No tier change takes effect without a corresponding audit log entry (agencyId, previousTier, newTier, reason, approvedBy, timestamp)
- [ ] KPI aggregation worker reads WIC from ContributionUnits, WIP from wip_registered_at stamps, and MIN from PartnerLicenseDeal records — no other data sources
- [ ] Same CRM company cannot be attributed to two different agencies via PartnerLicenseDeal (application-level check: reject if company_id already has a PartnerLicenseDeal for a different organization_id)

### Business Criteria
- [ ] PM can attribute license sale to agency (cross-org search → verify in CRM → create deal)
- [ ] System evaluates tiers monthly with grace period and proposals
- [ ] PM can approve/reject tier changes with reason
- [ ] Agency Admin sees current tier, KPI values vs thresholds, progress %, grace period warning
