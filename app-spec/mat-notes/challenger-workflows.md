# Challenger Review: §3 Workflows + §4 Workflow Gap Analysis

Reviewer: Vaughn Vernon (DDD practitioner persona)
Date: 2026-03-20
Subject: PRM App Spec — Workflows and Gap Analysis

---

## CRITICAL

### C1: WIP formula has a logical flaw that will produce wrong counts

The WIP formula in §1.4.2:

```
WIP(org, month) = COUNT(DISTINCT deals)
  WHERE deal.pipeline_stage IN ('sql', 'proposal', 'won')
  AND deal.created_at or deal.stage_changed_at IN month
```

The condition `created_at OR stage_changed_at IN month` is ambiguous and dangerous. A deal that was created in January, advanced to SQL in March, then moved back (or sits at SQL through April) — when does it count? The formula says "created in month OR stage changed in month." That means:

- A deal created at SQL in March counts for March.
- A deal created in February but promoted to SQL in March also counts for March.
- A deal promoted to SQL in March and still at SQL in April: does it count for April too? The formula says no (nothing was created or changed in April), but that contradicts the business intent of "active prospects this month."

**The real invariant is:** WIP should count deals that ARE at SQL or above at any point during the month — not deals that transitioned during the month. "Active" means in-state, not transition-based.

The correct formula is a snapshot at month-end (or last-active-day-of-month), not an event-based filter. Edge case 4 in the spec ("period boundary: deal created March 31, counted in March or April?") is a symptom of this deeper formula error, not a standalone edge case.

**Fix:** Replace the transition-based filter with a state snapshot: `COUNT(DISTINCT deals WHERE stage IN ('sql','proposal','won') AND stage_reached_at <= last_day_of_month AND (stage_left_at IS NULL OR stage_left_at > last_day_of_month))`.


### C2: "Won" in WIP is a naming collision with MIN

WIP counts deals at stages `('sql', 'proposal', 'won')`. MIN counts enterprise license deals that are `status = 'won'`. A deal at stage "won" in the CRM pipeline is counted in BOTH WIP and MIN if it meets the license criteria.

This means a single closed deal inflates two KPIs simultaneously, creating a double-counting invariant violation the domain currently has no rule to prevent. The WIC formula has an explicit anti-double-counting mechanism (Feature Key). WIP and MIN have nothing equivalent.

The business intent is almost certainly: WIP measures active in-flight prospects (pre-close), not closed deals. "Won" should be excluded from WIP and tracked exclusively through MIN. If "won" remains in WIP, the tier thresholds are calibrated against a polluted metric.

**Fix:** Remove `'won'` from WIP pipeline stages. Closed deals graduate out of WIP and are counted via MIN if they are enterprise license deals. Document this as an explicit invariant: a deal cannot contribute to both WIP and MIN in the same period.


### C3: WF3 boundary starts at "scheduled job triggers" — this hides the real aggregate root

WF3's boundary says: "Starts when: Scheduled job triggers (daily). Ends when: WIC scores recorded."

This treats the job as the aggregate root of the contribution domain. But the actual domain object is `ContributionUnit` — a record of what a developer contributed in a period, scored and attributed to an organization. The job is an infrastructure concern, not a domain boundary.

The consequence: edge case 2 ("Dev changes agency — old WIC stays with old org? follows them?") has no answer because there is no explicit invariant on ContributionUnit stating what `organization_id` means and when it is set. If organization attribution is set at job-run time based on current org membership, a dev who changes agencies mid-month will have their contributions split or entirely misattributed depending on when the job ran.

**Fix:** The domain boundary for WF3 must be the ContributionUnit aggregate, not the job trigger. Define the invariant explicitly: `ContributionUnit.organization_id` is set at the time the PR was merged, based on the contributor's org at merge time (or at scoring time — pick one, document it, enforce it). The job is just the mechanism that creates ContributionUnits, not the workflow itself.


### C4: WF5 has no domain event — tier change is a side effect without a published fact

WF5 ends when "PM approved tier change, agency sees updated status." But nothing in the workflow defines a domain event that downstream contexts can react to.

Tier change affects:
- RFP eligibility (WF4 audience filtering by tier)
- Agency dashboard display
- Future: website visibility, lead priority

None of these are connected via an explicit event. The current design relies on direct coupling: WF4 reads current tier at query time. That means if tier is stale (PM hasn't approved for weeks — edge case 4), RFP audience filtering operates on incorrect data with no way to detect or signal the inconsistency.

The missing domain event: `AgencyTierChanged { agencyId, previousTier, newTier, effectiveDate, approvedBy }`.

Without this event, the system has hidden temporal coupling between WF4 and WF5 that will produce silent correctness failures.

**Fix:** Define `AgencyTierChanged` as an explicit domain event published when PM approves. WF4 audience filtering subscribes to this event (or reads from a projection updated by it). Edge case 4 ("PM doesn't approve for weeks") must state explicitly: until `AgencyTierChanged` is published, the old tier governs all dependent workflows.

---

## WARNING

### W1: WF1 combines two distinct aggregate lifecycles in one workflow boundary

WF1 ends when "Admin completed onboarding, min 1 BD invited, BD completed onboarding, first deal logged." This means WF1 does not complete until a BD, who is a separate user in a separate session at a separate time, completes their sub-workflow.

These are two distinct aggregate lifecycles: `AgencyProfile` (owned by Admin) and `DealPipeline` (owned by BD). They have different actors, different timings, different failure modes. Crammed into one workflow, the system cannot distinguish between "Admin onboarded but no BD ever joined" and "Admin onboarded, BD joined but never created a deal." Both look like "WF1 incomplete."

Edge case 3 ("Admin fills profile but never invites BD") is a symptom. The spec handles it as an edge case rather than recognizing that Admin onboarding and BD onboarding are two separate workflow completions.

**Fix:** Split into WF1a (Agency Profile Onboarding — ends when Admin completes profile + case study) and WF1b (BD Pipeline Onboarding — ends when BD creates first deal). Emit `AgencyProfileOnboarded` and `BDPipelineActivated` as separate events. "Agency is operational" is a projection of both events having fired, not a single workflow completion gate.


### W2: The WIC scoring algorithm lives outside the domain boundary with no ACL defined

The WIC algorithm is described as living in `/Users/maciejgren/Documents/SDRC/` (WIC Assessment Guide + scoring rules). LLM scoring is used for "bounty auto-adjudication, ownership analysis, quality assessment."

The anti-corruption layer between the external LLM result and the `ContributionUnit` domain object is not defined anywhere in §3 or §4. The gap analysis notes "Gap: GitHub API integration" but treats it purely as a build effort, not as a translation boundary.

Questions that have no answer in the current spec:
- If the LLM returns a score of 0.75, which level does that map to? (L1=0.25/0.5, L2=1.0, L3=0.5, L4=1.0 — these overlap)
- What validates that the LLM output conforms to the domain's scoring schema before writing a ContributionUnit?
- What happens when the external script (Phase 1-3 workaround: "PM runs external script and imports via API") produces a score format inconsistent with the domain formula?

The import API endpoint (WF3 workaround) is 1 commit. But the translation/validation logic between "external scoring result" and "valid ContributionUnit" is not counted and not specified. This is where production bugs will live.

**Fix:** Define an explicit ACL interface: `WicScoringResult { contributorGithubUsername, prId, month, level: L1|L2|L3|L4|routine, impactBonus: bool, bountyApplied: bool }`. The import API validates against this schema before constructing ContributionUnits. Any score outside this contract is rejected, not silently accepted.


### W3: "Feature Key" deduplication rule is defined in §1.3 but has no enforcement point in any workflow

The Feature Key anti-double-counting rule: "same feature key + same month + same person = one unit." This is the most important invariant in WIC scoring (prevents gaming via multiple small PRs on the same feature).

But WF3 has no step that enforces this. The journey goes: "GitHub API fetch PRs -> group by (person, month, feature key) -> LLM scoring." Grouping is mentioned, but grouping is not deduplication. If two PRs have the same feature key and the LLM scores both independently, the grouping step must collapse them to one unit before scoring — otherwise the invariant is never enforced.

In the workaround path (manual import), there is zero mention of how the PM-run external script or the import API enforces the Feature Key dedup rule. PM could inadvertently import two records with the same feature key.

**Fix:** The Feature Key deduplication must be enforced as an invariant at ContributionUnit creation, not as a processing hint in the job description. The import API must return an error (not silently discard or silently merge) when a duplicate Feature Key is submitted for the same person+month.


### W4: WF4's "handoff complete" end boundary is undefined

WF4 ends when "PM selected agency, handoff complete." "Handoff complete" is not defined anywhere in the Ubiquitous Language or in the workflow journey. The workflow's journey ends at "handoff to sales" but what state change signals completion? Does the PM click a button? Does an email go out? Does a PartnerLicenseDeal get created (which would be the start of MIN)?

This matters because RFP conversion rate (10 RFP/month x 30% conversion = 3 MIN/month) implies that some RFPs result in MIN. But the spec explicitly says "NOT this workflow: MIN attribution (WF5)." So handoff is between RFP close and MIN creation — but what entity or event bridges them?

Without a defined bridge, the 30% conversion ROI claim is untrackable in the system. The PM will close an RFP and then manually create a PartnerLicenseDeal with no link to the originating RFP.

**Fix:** Define "handoff complete" as: PM sets RFP status to `Awarded`, system emits `RfpAwarded { rfpId, winningAgencyId, leadContactInfo }`. PartnerLicenseDeal creation (by PM later) should optionally reference `rfpId` for attribution tracking. This makes the ROI claim measurable.


### W5: Grace period is a domain rule but has no aggregate enforcing it

Tier governance includes: "1 month grace period — agency falling below threshold gets 1 calendar month to recover before downgrade proposal is generated." This is a core business rule protecting agency relationships.

But WF5's journey goes: "aggregates KPIs -> compares with thresholds -> generates upgrade/downgrade proposal." There is no step that checks whether a downgrade proposal was already generated last month and the grace period is still active. The KPI aggregation job runs monthly — it will generate a new downgrade proposal every month even if the agency is in grace period, unless something explicitly prevents it.

The gap matrix has: "Compare 3 KPIs against 4 tier thresholds, generate PartnerTierAssignment draft. Grace period check (1 month). Bundled — same commit." The grace period check is noted but not specified. What is the state machine? What entity tracks "currently in grace period"? When does grace period start? When does it expire?

**Fix:** Model `TierEvaluationState` explicitly: `{ agencyId, currentTier, evaluationMonth, gracePeriodStartedAt, status: OK|GracePeriod|ProposedDowngrade|ProposedUpgrade }`. The monthly job reads this state before generating any proposal. Grace period prevents a second downgrade proposal if one was already generated in the prior month.


### W6: WF2 edge case 3 ("same prospect in two agencies") is noted but has no domain rule

"Same prospect in two agencies — both count WIP — conflict at RFP." This is identified as an edge case with no resolution. At 15+ agencies, duplicate prospect tracking will happen. When both agencies submit an RFP response for the same lead, the PM is selecting between two agencies who both claim an existing relationship.

The spec leaves this as "PM must audit manually." That is acceptable for v1, but the domain model should at minimum enforce that two deals cannot reference the same Company record from different orgs without a flag. Currently, the customers module creates a Company per org — so there is no shared Company entity across orgs, meaning the duplication is invisible to the system.

This needs to be documented as a known domain model limitation (not just an edge case), and the workaround (PM manual audit) needs to be explicit. The alternative — shared Company entity across orgs — is a significant model change that should be deferred intentionally, not accidentally.

---

## OK

### OK1: Workflow boundaries are correctly scoped at the flywheel unit level

Each workflow maps to exactly one flywheel contribution (onboarding unlocks WIP/MIN; pipeline generates WIP; code generates WIC; RFP generates MIN; governance maintains quality). None of the workflows are accidentally cross-flywheel. The "NOT this workflow" sections are explicit and correct. This is good boundary discipline.


### OK2: WIC L1/L2 scoring asymmetry is preserved correctly

The spec notes L2 = 1.0 base score and L1 = 0.5/0.25. L4 = 1.0 and L3 = 0.5. The non-linear scale (L2 higher than L3) is intentional per the scoring guide and is preserved correctly in the formula. This is a domain nuance that many systems would accidentally flatten to a linear 0.25/0.5/0.75/1.0 scale.


### OK3: WF4 workflow engine mapping is correct

RFP as `START -> SEND_EMAIL -> WAIT_FOR_TIMER -> USER_TASK (BD) -> USER_TASK (PM) -> END` is a valid and clean use of the workflows module. The gap analysis correctly identifies that only the custom entities and the comparison page are new code; the orchestration itself is platform-native. Good fit-to-platform judgment.


### OK4: Scheduler gap is correctly identified once and shared across WF2/WF3/WF5

The Piotr finding about no scheduler module is correct, the solution (one shared cron trigger mechanism counted as 1 additional commit) is the right approach. It correctly avoids triple-counting the same infrastructure gap. Clean gap analysis discipline.


### OK5: MIN data ownership is correctly modeled

MIN is PM-generated only. Agency users cannot create or modify MIN source records. This correctly prevents the most obvious gaming vector (agency self-reporting closed deals). The data ownership distinction between WIC (system-generated), WIP (agency-generated, system-counted), and MIN (PM-generated) is clean and explicit.

---

## Summary

Five critical or warning issues require specification changes before technical spec generation:

1. WIP formula (C1, C2) — fix the snapshot vs. transition logic and remove "won" from WIP to prevent double-counting with MIN.
2. ContributionUnit aggregate root (C3) — org attribution invariant must be explicit before the import workaround is built.
3. AgencyTierChanged event (C4) — without it, WF4 tier-based filtering has invisible temporal coupling to WF5.
4. WIC ACL and Feature Key enforcement (W2, W3) — define the translation contract before the import API is specced.
5. Grace period state machine (W5) — needs an explicit entity or the rule exists only in prose.

WF1 split (W1) and RFP handoff bridge (W4) are model improvements that will pay off at Phase 2 but are not blockers for Phase 1.
