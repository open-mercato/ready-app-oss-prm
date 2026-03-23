# Vernon's Domain Acceptance Criteria — PRM

> These criteria are additive to Mat's business acceptance criteria in §7.
> Each criterion is testable by an automated test or a manual verification step.
> Scope is deliberately phase-specific — do not apply later-phase invariants to earlier phases.

---

## Phase 1: Core Loop

### Domain criteria

**Domain invariants**
- [ ] `wip_registered_at` is never overwritten once set: submitting a deal stage change for a deal that already has `wip_registered_at` leaves the field unchanged (verified by moving a stamped deal backward to Qualified and forward to SQL again — timestamp does not change)
- [ ] `wip_registered_at` is only stamped when the deal transitions INTO a stage at or above SQL for the first time — not on deal creation, not on non-qualifying stage changes
- [ ] A deal without `wip_registered_at` does not appear in any WIP count, regardless of its current pipeline stage
- [ ] `wip_registered_at` timestamp is stored in UTC; WIP period attribution uses UTC month boundaries exclusively (deal stamped 2026-03-31T23:59:59Z counts as March, not April)

**Aggregate consistency**
- [ ] Every Deal aggregate has a non-null `organization_id` matching the BD's org at creation time — no orphan deals
- [ ] Company records created by a BD are scoped to that BD's org — a BD from Org A cannot create a Company record under Org B
- [ ] Agency Admin sees only records belonging to their own org; no cross-org CRM data leaks through any API route or dashboard widget in Phase 1

**Event completeness**
- [ ] No domain events are required for Phase 1 (WIP stamp is a field mutation, not an event; AgencyTierChanged is Phase 2). Confirm no phantom event listeners are wired that would silently fail.

**Data integrity**
- [ ] BD cannot create or modify `wip_registered_at` directly — the field is write-protected for all non-system actors; only the API interceptor may set it
- [ ] PM's org switcher reads are always read-only — no write operation is permitted through a switched-org context (verified: creating a deal while switcher is on Org B is rejected or re-scoped to PM's own context)
- [ ] Case study saved in Phase 1 must contain all five minimum required fields (industry tag, tech stack tag, budget range, duration, project description) — partial saves are rejected at the entity level, not just the UI

**Anti-corruption**
- [ ] The WIP live-query widget (`COUNT WHERE wip_registered_at IN month`) reads only from the authenticated user's org (or, for PM, the currently switched org) — no unscoped query can return cross-org deal counts

---

## Phase 2: Governance + KPI + MIN

### Domain criteria

**Domain invariants**
- [ ] GitHub username is unique across the entire system — attempting to save a GH username that already belongs to another User is rejected with a validation error, not silently truncated or renamed
- [ ] Once a ContributionUnit has been recorded against a GH username, that username field on the User becomes immutable for non-PM actors — a Contributor cannot change it themselves after their first import
- [ ] At most one open TierChangeProposal exists per org per evaluation period — attempting to generate a second proposal for the same org+period (e.g., by re-running the worker) is a no-op, not a duplicate insert
- [ ] TierEvaluationState transitions are one-directional within a period: `OK → GracePeriod → ProposedDowngrade`; the state cannot skip from OK directly to ProposedDowngrade in a single evaluation run
- [ ] `GracePeriod` resets to `OK` only when the agency's KPIs meet the threshold for their current tier in the same evaluation cycle — partial recovery (meeting 2 of 3 KPI thresholds) does not reset grace period
- [ ] A PartnerLicenseDeal cannot reference more than one CRM Company — the `crm_company_id` field is non-null and non-array
- [ ] No double-attribution: the composite unique key `(license_identifier, year)` on PartnerLicenseDeal is enforced at the database level, not only in application logic
- [ ] A PartnerLicenseDeal is only counted toward MIN if `type = enterprise`, `status = won`, and `is_renewal = false` — all three conditions are enforced by the MIN aggregation query, not assumed from data quality

**Aggregate consistency**
- [ ] Every ContributionUnit has a non-null `organization_id` set at import time from the contributor's org membership — no ContributionUnit is created without an org
- [ ] ContributionUnit dedup key `(contributor_id, month, feature_key)` is enforced as a unique constraint at creation — re-importing the same record for the same person+month+feature_key replaces the existing unit, not appends
- [ ] Re-importing WIC for an org+month archives the previous assessment (with a timestamp) and replaces it — after re-import, exactly one active assessment exists for that org+month, and exactly one archived version exists per prior import
- [ ] `WicAssessmentSource` is always set on import — no ContributionUnit is created with a null or unrecognised source value
- [ ] TierAssignment is only mutated via the PM-approval path — no background worker or import can directly update an agency's active TierAssignment
- [ ] After PM approves a TierChangeProposal, the proposal moves to `Approved` state and is immutable thereafter; it cannot be re-approved or re-rejected

**Event completeness**
- [ ] `AgencyTierChanged` is published on every PM approval of a TierChangeProposal — verified by: approve a proposal and assert the event payload contains `{ agencyId, previousTier, newTier, effectiveDate, approvedBy }` with all fields non-null
- [ ] `AgencyTierChanged` is NOT published on proposal rejection — rejecting a proposal produces no tier-change event
- [ ] No tier change takes effect without a corresponding audit log entry (agencyId, previousTier, newTier, reason, approvedBy, timestamp)

**Data integrity**
- [ ] Agency users (Admin, BD, Contributor) cannot create, update, or delete PartnerLicenseDeal records — these routes are restricted to PM role only
- [ ] WIC import rejects any record whose `contributorGithubUsername` does not match a registered User in the system — unmatched usernames are returned in a rejection list, not silently dropped or created as ghost users
- [ ] MIN calendar year boundary is UTC: a PartnerLicenseDeal with `closed_at = 2026-12-31T23:59:59Z` counts in year 2026; one with `closed_at = 2027-01-01T00:00:00Z` counts in year 2027
- [ ] KPI thresholds are conjunctive — tier eligibility requires ALL of WIC, WIP, and MIN to meet the threshold; an agency cannot qualify by exceeding two KPIs while missing the third

**Anti-corruption**
- [ ] The WIC import API rejects any record that does not conform to the `WicScoringResult` schema — missing required fields, unknown `level` values, or malformed `month` (non `YYYY-MM` format) result in a 422 with a field-level error list; no partial batch insertion
- [ ] The KPI aggregation worker reads WIC from ContributionUnits (not raw import files), WIP from `wip_registered_at` stamps (not deal stage at query time), and MIN from PartnerLicenseDeal records — no worker reads data from a source outside these three aggregates

---

## Phase 3: RFP

### Domain criteria

**Domain invariants**
- [ ] A PartnerRfpCampaign has exactly one lifecycle state at any point — states do not overlap and transitions are enforced (no campaign can be simultaneously `Published` and `Draft`)
- [ ] Once a campaign deadline has passed, no new PartnerRfpResponse can be submitted — the USER_TASK form is closed and submissions after deadline are rejected, not silently accepted
- [ ] Exactly one winning agency per RFP campaign — the PM selection step may be invoked only once per campaign; a second winner-selection attempt on a campaign already in `Awarded` state is rejected
- [ ] An agency cannot submit more than one response per RFP campaign — a second submission from the same org replaces or is rejected; duplicate responses are not accumulated

**Aggregate consistency**
- [ ] Every PartnerRfpResponse has a non-null `rfp_campaign_id` and a non-null `responding_agency_id` — orphan responses are not permitted
- [ ] `CampaignPublished` event payload includes audience definition (all / selected agencies / tier-filtered) — consumers (e.g., notification worker) must be able to derive the exact set of notified agencies from the event alone
- [ ] `RfpAwarded` event payload includes `{ rfpId, winningAgencyId }` both non-null — event is not published until PM explicitly selects a winner via the workflow USER_TASK step
- [ ] Audience filtering by tier uses the current TierAssignment (approved, effective) at the time of campaign creation — it does not use TierEligibility (the unapproved recommendation)

**Event completeness**
- [ ] `CampaignPublished` is published when PM triggers the RFP workflow — not at entity creation (draft state), only on explicit publish action
- [ ] `RfpAwarded` is published when PM selects the winner — losing agencies are notified through the workflow, but no separate `RfpRejected` domain event is required (workflow notification is sufficient)
- [ ] No RFP state transition produces a silent failure — if a workflow step fails (e.g., SEND_EMAIL), the campaign remains in its prior state and does not advance

**Data integrity**
- [ ] A Contributor cannot view, create, or respond to an RFP — the route and UI are inaccessible for the `partner_contributor` role
- [ ] An agency that is not in the campaign audience cannot submit a response — audience membership is validated at submission time, not only at notification time (guards against audience changing after notification)
- [ ] Case studies auto-linked to an RFP response are read-only snapshots at the time of linking — subsequent edits to a case study do not retroactively alter what PM saw during evaluation
- [ ] File attachments on PartnerRfpCampaign and PartnerRfpResponse are stored with the campaign/response record — deleting the parent entity does not leave orphaned files; files are accessible only to valid audience members and PM

**Anti-corruption**
- [ ] RFP audience tier-filter reads TierAssignment records, not a computed or cached field — if TierAssignment is not yet set for an agency (new agency, no tier approved yet), that agency is excluded from tier-filtered campaigns, not defaulted to Tier 1

---

## Phase 4: n8n Automation + AI

### Domain criteria

**Domain invariants**
- [ ] The n8n automated pipeline uses the same WIC import API as Phase 2 manual import — it does not write ContributionUnits directly to the database, bypassing schema validation and dedup logic
- [ ] `WicAssessmentSource = automated_pipeline` is set by the n8n workflow on every automated import — it is never set by the manual import path, and the two values are mutually exclusive per import run
- [ ] Re-running the n8n daily pipeline for the same org+month follows the same versioned replace+archive semantics as manual re-import — no duplicate ContributionUnits are produced
- [ ] The n8n invitation flow (US-1.1b) produces exactly one User account per invited email — a second invite to the same email before acceptance either resends the token (no duplicate account) or is rejected with a clear error

**Aggregate consistency**
- [ ] AI-generated RFP scores (tech fit, domain fit) are stored as attributes on PartnerRfpResponse, not as a separate aggregate — they do not affect the response's workflow state and do not constitute an approval or recommendation record
- [ ] Scores posted back by n8n are idempotent — re-scoring an already-scored response overwrites the prior scores, not appends a second scoring record
- [ ] The invitation token is single-use — once accepted (account created), the token is invalidated; a second click on the same link produces an error, not a second account

**Event completeness**
- [ ] No new domain events are introduced in Phase 4 — n8n interactions are API calls (POST to import API, POST scores back); they do not publish domain events directly
- [ ] If the n8n WIC pipeline fails mid-run (e.g., GitHub API timeout), no partial ContributionUnit batch is committed — the import API either accepts the full batch or rejects it; partial writes are not permitted

**Data integrity**
- [ ] AI scoring results are clearly marked as `source: ai_assisted` in the stored score record — PM cannot mistake an AI score for a PM decision
- [ ] The n8n workflow cannot elevate its own API permissions — it authenticates as a service account with write access limited to the WIC import endpoint and the RFP score endpoint; it cannot approve tiers, create MIN records, or modify TierAssignment
- [ ] GH username immutability rule holds for automated imports: if the n8n pipeline encounters a GH username that has been PM-overridden (audit log exists), it uses the current registered username, not the GitHub-sourced one

**Anti-corruption**
- [ ] The WIC import API remains the anti-corruption layer in Phase 4 — n8n output is validated against `WicScoringResult` schema on every POST, identical to Phase 2; schema relaxation for the automated path is not permitted
- [ ] RFP scoring input to the LLM is assembled by n8n reading from OM via the Open Mercato node — n8n does not receive raw database exports or unstructured dumps; all data passes through OM's access-controlled API
- [ ] AI scores posted back by n8n are validated for range (`tech_fit` and `domain_fit` must be numeric, 0–5 inclusive) before being persisted — out-of-range or non-numeric scores are rejected with a 422, not clamped silently
