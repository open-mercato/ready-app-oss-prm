# Commit Plan: WF5 — Tier Governance

Upstream verified: `git -C $OM_REPO fetch upstream`. All OM capabilities referenced below confirmed on upstream/main.

---

## Commit 1: PartnerLicenseDeal entity + PM-only CRUD route

- Scope: app
- Pattern: entity + CRUD route (copy customers `api/people/route.ts` + `commands/people.ts`)
- Files:
  - `src/modules/partnerships/data/entities.ts` — add `PartnerLicenseDeal` ORM entity (fields: `id`, `organization_id` FK to attributed agency, `company_id` FK to CRM company, `license_identifier` string, `industry_tag` string, `type` enum `enterprise`, `status` enum `won`, `is_renewal` boolean, `closed_at` date, `year` integer computed, `created_by` userId, `created_at`)
  - `src/modules/partnerships/commands/partner-license-deal.ts` — create/update/delete commands with undo support, `emitCrudSideEffects`
  - `src/modules/partnerships/api/partner-license-deals/route.ts` — `makeCrudRoute` with `indexer: { entityType: 'partnerships:partner_license_deal' }`, PM-only guard (check `partnership_manager` role feature), `openApi` export. Enforce invariants: unique `license_identifier + year`, no double-attribution (reject if company already attributed for same year).
  - `src/modules/partnerships/api/openapi.ts` — `createCrudOpenApiFactory({ defaultTag: 'Partnerships' })` if not yet created
  - `src/modules/partnerships/backend/partnerships/license-deals/page.tsx` — PM-only list page (DataTable: agency name, company name, industry tag, year, license identifier, status)
  - `src/modules/partnerships/backend/partnerships/license-deals/create/page.tsx` — CrudForm for manual creation (fallback; real flow is via attribution UI in Commit 2)
  - `src/modules/partnerships/migrations/YYYYMMDD_add_partner_license_deal.ts`
- Delivers: `PartnerLicenseDeal` entity persists. PM can list and manually create attribution records. MIN count query (`COUNT WHERE attributed_agency_id = org AND type=enterprise AND status=won AND is_renewal=false AND year = ?`) is answerable. Invariants enforced at API level.
- Depends on: none (first entity in this workflow)

---

## Commit 2: Cross-org company search + CRM read-only jump + attribution UI

- Scope: app
- Pattern: custom API route + backend page (cross-org search using Program Scope)
- Files:
  - `src/modules/partnerships/api/get/company-search.ts` — GET `/api/partnerships/company-search?q=<term>`. Queries `customers:company` across ALL organizations (Program Scope: `organizationsJson: null` identity context). Returns: `{ companyId, companyName, organizationId, agencyName, createdAt, dealCount }`. Scoped to PM role only.
  - `src/modules/partnerships/backend/partnerships/license-deals/attribute/page.tsx` — Attribution flow page: search box → result list (agency name, company name, date created, deal count) → click company → CRM read-only iframe/redirect to that agency's CRM company detail → "Confirm attribution" button → `POST /api/partnerships/partner-license-deals` with `{ companyId, organizationId (agency), licenseIdentifier, industryTag, ... }`. Replaces the manual create page as the primary flow for PM.
  - `src/modules/partnerships/i18n/en.json` — add keys for `partnerLicenseDeals.*`, `companySearch.*`
- Delivers: Full MIN attribution workflow. PM searches companies across all agencies, sees agency context, jumps to CRM for verification, creates `PartnerLicenseDeal`. MIN count is now accurate per US-5.6 success criteria.
- Depends on: Commit 1

---

## Commit 3: KPI aggregation worker + grace period state machine + TierChangeProposal generation

- Scope: app
- Pattern: worker (queue package pattern: export `metadata` + idempotent handler)
- Files:
  - `src/modules/partnerships/data/entities.ts` — add `TierEvaluationState` ORM entity (`agencyId`, `currentTier`, `evaluationMonth` YYYY-MM string, `gracePeriodStartedAt` nullable date, `status` enum `OK | GracePeriod | ProposedDowngrade`). Add `TierChangeProposal` ORM entity (`id`, `organizationId`, `evaluationMonth`, `currentTier`, `proposedTier`, `type` enum `upgrade | downgrade`, `status` enum `Draft | PendingApproval | Approved | Rejected`, `rejectionReason` nullable string, `wicSnapshot` float, `wipSnapshot` integer, `minSnapshot` integer, `createdAt`, `resolvedAt`). Add `TierAssignment` ORM entity (`id`, `organizationId`, `tier`, `effectiveDate`, `approvedBy` userId, `reason` nullable string, `createdAt`). Enforce unique constraint: one open proposal per org per period (`organizationId + evaluationMonth` unique where `status IN (Draft, PendingApproval)`).
  - `src/modules/partnerships/workers/tier-evaluation.ts` — export `metadata = { queue: 'partnerships', id: 'tier-evaluation', concurrency: 2 }`. Handler (idempotent — check `TierEvaluationState.evaluationMonth` before mutating):
    1. For each agency org: read WIC = `SUM(wic_final) FROM ContributionUnits WHERE organization_id = org AND month = currentMonth`. Read WIP = `COUNT(DISTINCT deal_id) FROM customers:deals WHERE organization_id = org AND wip_registered_at IS NOT NULL AND wip_registered_at IN currentMonth`. Read MIN = `COUNT(*) FROM PartnerLicenseDeals WHERE attributed_agency_id = org AND type=enterprise AND status=won AND is_renewal=false AND year = currentYear`.
    2. Compute `TierEligibility`: compare WIC/WIP/MIN against tier thresholds (conjunctive — all 3 must meet). Determine highest tier agency qualifies for.
    3. Load `TierEvaluationState` for org + evaluationMonth. Apply grace period state machine: if `TierEligibility < currentTier` → if `status=OK` set `status=GracePeriod, gracePeriodStartedAt=now` (no proposal). If `status=GracePeriod` → set `status=ProposedDowngrade`, create `TierChangeProposal (type=downgrade)`. If `TierEligibility > currentTier` → create `TierChangeProposal (type=upgrade)` regardless of grace state. If `TierEligibility == currentTier` → if `status=GracePeriod` reset to `status=OK` (recovery).
    4. Guard: skip org if open proposal already exists for this period (invariant: one per org per period).
    5. Save `TierEvaluationState` + any new `TierChangeProposal`. `em.flush()` — on failure: `em.clear()`.
  - `src/modules/partnerships/migrations/YYYYMMDD_add_tier_entities.ts`
- Delivers: Full KPI aggregation + grace period state machine. After worker runs: `TierEvaluationState` rows reflect OK/GracePeriod/ProposedDowngrade. `TierChangeProposal` rows created for agencies eligible for upgrade or second-month downgrade. US-5.1, US-5.2a, US-5.2b satisfied.
- Depends on: Commit 1 (PartnerLicenseDeal for MIN reads), WF3 Commit (ContributionUnits for WIC reads), WF2 Commit (wip_registered_at stamps for WIP reads)

---

## Commit 4: Tier evaluation workflow definition + AgencyTierChanged event

- Scope: app
- Pattern: workflow JSON definition (`examples/` in partnerships module) + events declaration
- Files:
  - `src/modules/partnerships/events.ts` — declare `AgencyTierChanged` event using `createModuleEvents`: `{ id: 'partnerships.agency.tier_changed', label: 'Agency Tier Changed', entity: 'tier_assignment', category: 'lifecycle' }`. Payload type: `{ agencyId: string, previousTier: string, newTier: string, effectiveDate: string, approvedBy: string }`.
  - `src/modules/partnerships/examples/tier-evaluation-workflow.json` — workflow definition (seeded via `setup.ts seedDefaults`):
    ```
    START
      → AUTOMATED step: activity CALL_API to POST /api/queue/partnerships/tier-evaluation (enqueues job for specific org)
      → USER_TASK "Review Tier Change Proposal" (assignedToRoles: ['partnership_manager'])
          form fields: proposal summary (read-only KPI snapshot), approve/reject radio, reason textarea
      → transition on approve: AUTOMATED step with activities:
          1. UPDATE_ENTITY TierChangeProposal → status=Approved
          2. UPDATE_ENTITY TierAssignment → create/update with new tier, effectiveDate, approvedBy={{context.userId}}
          3. EMIT_EVENT partnerships.agency.tier_changed with payload from context
      → transition on reject: AUTOMATED step with activities:
          1. UPDATE_ENTITY TierChangeProposal → status=Rejected, rejectionReason={{context.reason}}
      → END
    ```
  - `src/modules/partnerships/setup.ts` — add `seedDefaults` hook to load `tier-evaluation-workflow.json` into `WorkflowDefinition` table via `workflowExecutor` service. Add `defaultRoleFeatures`: `partnership_manager: ['partnerships.tier.approve']`.
  - `src/modules/partnerships/api/post/enqueue-tier-evaluation.ts` — POST `/api/partnerships/enqueue-tier-evaluation` (PM or cron-authenticated). Enqueues one `tier-evaluation` job per active agency org. Returns job IDs. This is the entry point called by the cron trigger (Commit 5) and by the workflow's AUTOMATED step for per-org runs.
- Delivers: Full PM approval flow. PM sees `TierChangeProposal` as a USER_TASK in the workflow task inbox. Approves/rejects with reason. On approval: `TierAssignment` updated, `AgencyTierChanged` event fired (downstream: RFP audience filtering, agency dashboard). Full audit trail via `WorkflowEvent` log. US-5.3 satisfied.
- Depends on: Commit 3 (entities + worker), platform workflows module (confirmed upstream)

---

## Commit 5: Cron trigger mechanism (shared with WF3)

- Scope: app
- Pattern: API endpoint + external crontab config (no scheduler module in OM — verified upstream)
- Files:
  - `src/modules/partnerships/api/post/trigger-monthly-evaluation.ts` — POST `/api/partnerships/trigger-monthly-evaluation`. Authenticated via API key (`x-api-key` header checked against env `CRON_SECRET`). Enqueues tier evaluation for all orgs by calling the enqueue logic from Commit 4. Returns `{ jobsEnqueued: N }`. Export `openApi`.
  - `src/modules/partnerships/api/post/trigger-wic-import.ts` — (if WF3 cron not already in place) POST `/api/partnerships/trigger-wic-import` — same pattern, same `CRON_SECRET` auth. Enqueues WIC import worker for all orgs.
  - `crontab.example` (at app root) — documented example crontab entries:
    ```
    # Monthly tier evaluation — 1st of each month, 02:00 UTC
    0 2 1 * * curl -X POST https://app/api/partnerships/trigger-monthly-evaluation -H "x-api-key: $CRON_SECRET"
    # Daily WIC import trigger
    0 6 * * * curl -X POST https://app/api/partnerships/trigger-wic-import -H "x-api-key: $CRON_SECRET"
    ```
  - `.env.example` — add `CRON_SECRET=` entry
- Delivers: Monthly tier evaluation runs automatically. WF3 import also triggerable via cron. No new OM dependency — external crontab (system, Docker, or hosted cron service like GitHub Actions scheduled workflow) POSTs to the API. The API endpoint is stateless and idempotent (enqueueing the same job twice is safe because the worker checks `TierEvaluationState.evaluationMonth` before mutating). US-5.1 "Scheduled job runs monthly" success criterion met.
- Depends on: Commit 4 (enqueue endpoint)

---

## Commit 6: Tier progress widget (dashboard injection)

- Scope: app
- Pattern: widget injection (`widgets/injection/` + `widgets/injection-table.ts`)
- Files:
  - `src/modules/partnerships/widgets/injection/tier-status/widget.ts` — server component. Reads `TierAssignment` (current tier) + `TierEvaluationState` (grace period status) + live KPI values (WIC/WIP/MIN for current period, same queries as worker) for the requesting user's `organization_id`. Computes progress-to-next-tier percentages per KPI. Returns structured data.
  - `src/modules/partnerships/widgets/injection/tier-status/widget.client.tsx` — client component. Renders: current tier badge, KPI progress bars (WIC X/threshold, WIP X/threshold, MIN X/threshold), grace period warning banner (shown when `status=GracePeriod`), "pending approval" notice (shown when open `TierChangeProposal` exists). Role-scoped rendering: Admin + BD see full view. Contributor sees tier badge only. PM sees all agencies (list view with per-agency tier status).
  - `src/modules/partnerships/widgets/injection-table.ts` — register spot: `dashboards.main:widgets` (or equivalent dashboard spot ID from example app pattern). `InjectionPosition.last`.
  - `src/modules/partnerships/i18n/en.json` — add `tierStatus.*` keys: `currentTier`, `gracePeriodWarning`, `pendingApproval`, `progressToNext`, per-KPI labels.
- Delivers: Agency users (Admin, BD, Contributor) see tier status on dashboard. PM sees per-agency summary. Grace period warning visible. Proposal pending notice visible. US-5.4 and US-5.5 satisfied. `AgencyTierChanged` event (Commit 4) triggers cache invalidation so widget reflects approved changes immediately.
- Depends on: Commit 3 (TierEvaluationState + TierAssignment entities), Commit 4 (AgencyTierChanged event for cache bust)

---

## Commit 7: seedExamples for Phase 2 (tier + MIN demo data)

- Scope: app
- Pattern: `setup.ts seedExamples` hook
- Files:
  - `src/modules/partnerships/setup.ts` — extend `seedExamples` with Phase 2 demo data:
    - 3 demo agencies at different tiers: `OM Agency (Demo)`, `AI-native Agency (Demo)`, `AI-native Expert (Demo)`
    - `TierAssignment` rows for each demo agency showing progression history (2 historical entries + current)
    - `ContributionUnits` for current + previous month across demo contributor users
    - `PartnerLicenseDeals` attributed to demo agencies (1-5 MIN per agency, enterprise type, won, is_renewal=false, varying industry tags)
    - One `TierEvaluationState` in `GracePeriod` (for "AI-native Agency (Demo)" — below WIP threshold this month)
    - One `TierChangeProposal` in `PendingApproval` state (upgrade for "AI-native Expert (Demo)")
- Delivers: `yarn initialize` populates all tier + MIN demo data. Developer running the example sees working tier widgets, grace period warning, pending proposal in PM task inbox. US-7.2 Phase 2 criteria met.
- Depends on: Commits 1–6 (all entities must exist before seeding)

---

## Summary

| Commit | What ships | Scope | US covered |
|--------|-----------|-------|-----------|
| 1 | PartnerLicenseDeal entity + PM CRUD | app | US-5.6 (partial) |
| 2 | Cross-org company search + attribution UI | app | US-5.6 (complete) |
| 3 | KPI aggregation worker + grace period state machine + TierChangeProposal generation | app | US-5.1, US-5.2a, US-5.2b |
| 4 | Tier evaluation workflow JSON + AgencyTierChanged event | app | US-5.3 |
| 5 | Cron trigger API endpoint + crontab.example (shared WF3+WF5) | app | US-5.1 (scheduling) |
| 6 | Tier progress dashboard widget | app | US-5.4, US-5.5 |
| 7 | seedExamples Phase 2 (tiers + MIN demo data) | app | US-7.2 |

**Total: 7 atomic commits.** No `core-module` or `official-module` flags. All app scope.

**Spec gap vs this plan:** The App Spec §4 gap matrix lists WF5 at 5 commits (aggregation worker, grace state machine, tier workflow, tier widget, MIN attribution). This plan breaks it to 7 because:
- MIN attribution split into 2 commits (entity+CRUD, then cross-org search+UI) — each is independently deployable and testable.
- Cron trigger counted as 1 commit here (spec counted it separately as "shared").
- seedExamples added as Commit 7 (spec bundled it per-phase without a separate commit number).

**Ordering constraint:** Commits 1-2 (MIN) and Commit 3 (worker) can be developed in parallel. Commit 4 depends on Commit 3 (needs entities). Commits 5-6 depend on Commit 4. Commit 7 depends on all prior commits.
