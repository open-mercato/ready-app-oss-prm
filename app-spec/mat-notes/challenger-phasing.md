# DDD Review: §7 Phasing & Rollout Plan
**Reviewer:** Vaughn Vernon perspective — DDD practitioner
**Date:** 2026-03-20
**Subject:** PRM App Spec §7 Phasing & Rollout Plan

---

## CRITICAL

### C1: Phase 2 tier evaluation runs without MIN — invariant violated

The tier aggregate enforces three KPIs as a conjunction: WIC AND WIP AND MIN must all meet thresholds. Phase 2 ships tier evaluation (US-5.1–5.5) but MIN tracking is not delivered until Phase 3 (US-5.6, PartnerLicenseDeal entity).

The spec says "All 5 must work for the flywheel to spin" and "monthly automated check against thresholds." If the tier worker runs in Phase 2 with MIN = null, you have three possible failure modes:

1. Worker crashes on missing data — runtime error.
2. Worker treats null as 0 — every agency fails MIN threshold and gets demoted or flagged incorrectly.
3. Code special-cases MIN absence — now you have two code paths for the same invariant, and Phase 3 silently activates the real one. Domain confusion guaranteed.

The tier aggregate's invariant is: tier assignment is only valid when all three KPI inputs are available for the evaluation period. Phase 2 breaks this invariant by design.

**Fix options:**
- Move US-5.6 (PartnerLicenseDeal entity, which is 1 commit) into Phase 2. It is listed as 1 commit and has no Phase 3 dependencies. The evaluation worker can then treat MIN as defined-but-zero rather than absent.
- Or: explicitly scope Phase 2 tier evaluation as "draft/informational only" in the domain, with a clear domain event `TierEvaluationPreliminary` vs `TierEvaluationFinal`, and gate PM approval workflows on the latter. This is more modeling work but preserves integrity.

The current plan does neither. It silently ships broken tier evaluation and calls it "PM can evaluate tiers."

---

### C2: WIP aggregation query is underspecified — wrong count in production

The KPI formula for WIP reads:

```
AND deal.created_at or deal.stage_changed_at IN month
```

This is ambiguous by design. A deal created in January and still active at SQL stage in February: does it count for January, February, or both? The formula does not answer this. The phase plan ships the WIP count widget (US-2.3) in Phase 1 and the KPI aggregation worker (US-5.1) in Phase 2 as separate commits. Two different implementations of the same count logic will be written at different times by potentially different contributors.

This is not a phasing problem alone — it is a domain rule underspecification that the phasing amplifies. The WIP count is used for tier evaluation (WF5). If the widget and the worker disagree on the count, tier decisions will be made on different numbers than what the BD sees on their dashboard. Trust in the system collapses.

**Fix:** Specify WIP count semantics precisely before Phase 1 ships the widget: "a deal contributes to WIP for the month in which it first reached SQL stage or above." One definition, referenced by both widget and worker. The formula in §1.4.2 must be corrected first.

---

### C3: Self-onboard workaround makes org assignment an uncontrolled side effect

Phase 1 replaces PM-controlled invitation (WF1) with self-registration via a shared link. The spec's identity model says PM assigns org scope to new users. With self-onboard, org assignment becomes implicit in the signup mechanism — there is no event like `AgencyAdminEnrolled(agencyId, invitedByPM)` in the domain.

This means:
- Any person with the link can create an account. The spec notes no link expiry or per-agency uniqueness.
- The system has no record of which PM "sponsored" which agency onboarding. Audit trail is broken from day one.
- Phase 4 adds invitation flow. The migration path from "self-onboard accounts" to "properly invited accounts" is not defined. Existing agencies onboarded in Phase 1 will have no invitation record. Tier history audit (§1.4.1: "all tier changes audited with reason and approver") starts with an incomplete lineage.

The workaround is not anti-corruption in the DDD sense — it is an absence of the enrollment event. Phase 4 cannot retrofit this event onto accounts that were created without it.

**Fix:** Either accept the audit gap explicitly (document it as a known limitation, not a workaround), or generate a synthetic `AgencyOnboardedViaLink(adminEmail, timestamp, linkId)` event on signup that Phase 4 can replace with a proper `AgencyInvitationAccepted` event. Do not pretend the workaround is transparent.

---

## WARNING

### W1: Grace period logic is not testable until Phase 3

The tier governance rule states: 1 calendar month grace period before downgrade proposal is generated. This logic lives in the KPI aggregation worker + tier threshold commit (Phase 2). But the full tier evaluation cannot be exercised end-to-end until Phase 3 when MIN exists. The grace period check specifically requires historical tier assignment data — it must compare current month's KPIs against last month's tier status.

Phase 2 has no test scenario where an agency has a previous tier to fall below. The grace period logic will be written but cannot be integration-tested until the system has been running for a month, or until test fixtures simulate prior-month tier assignments. This is not a blocking flaw, but grace period bugs are silent — they cause incorrect downgrade proposals that PM approves without realizing the grace period was miscalculated.

**Fix:** Require that the Phase 2 tier threshold commit includes explicit fixture data representing prior-month tier history, and a test that exercises the grace period boundary condition before Phase 3.

---

### W2: RFP response depends on case studies from Phase 1, but case study quality is unvalidated

Phase 3 ships RFP response (US-4.3, PartnerRfpResponse entity + USER_TASK form). PM comparison page (US-4.4) implies that case studies are a meaningful input to agency comparison. Case studies are seeded in Phase 1 as a custom entity with no required field validation beyond "min 1 case study."

The PM comparison page in Phase 3 will display case study data that was entered in Phase 1 with no quality bar. If the domain model for case studies (tech stack, industry, budget, duration) is not enforced at creation time in Phase 1, the comparison page becomes noise.

This is a cross-phase aggregate consistency problem: the PartnerRfpResponse aggregate in Phase 3 implicitly depends on CaseStudy aggregate invariants established in Phase 1. Those invariants are not documented anywhere in the spec.

**Fix:** Define the required fields for a CaseStudy entity before Phase 1 ships it. At minimum: at least one industry tag, at least one tech stack tag, budget range required. This does not require extra commits — it is seed configuration in setup.ts. But it must be decided now, not discovered in Phase 3.

---

### W3: Cron trigger is a cross-cutting infrastructure concern, not a Phase 2 story

The spec counts "Cron trigger" as 1 commit in Phase 2 as if it is a bounded context deliverable. It is not. It is shared infrastructure depended on by WF2 (WIP count worker), WF3 (WIC worker), and WF5 (tier evaluation worker) across Phases 1, 2, and 3.

The Phase 2 placement is pragmatic but misleading. WIP count widget (Phase 1, US-2.3) shows a number. Where does that number come from before the cron trigger exists? Either the worker runs synchronously on request (different behavior than Phase 2+), or the widget shows stale data, or the widget is blocked on Phase 2.

The phase plan says Phase 1 delivers "WIP count widget" but the mechanism to populate it (scheduled aggregation) arrives in Phase 2. This is an implicit cross-phase dependency that is not called out.

**Fix:** Either move cron trigger to Phase 1 (it is 1 commit), or redefine the Phase 1 WIP widget as "count computed on-demand from live query" and document the behavior change in Phase 2 when it switches to worker-aggregated values. The behavior change at Phase 2 boundary is a domain event: `WIPCountCalculationModeChanged`. If the widget behavior changes silently, BDs will report inconsistent numbers between phases.

---

### W4: Phase 4 automation cannot simply replace Phase 2 manual import without domain event migration

Phase 2 ships manual WIC import (US-3.2): PM imports via API. Phase 4 ships automated GitHub+LLM pipeline. The spec treats this as a clean replacement.

It is not. Manual import creates `WicScore` records attributed to `import_source: "manual"`. Automated pipeline creates records attributed to `import_source: "github_api"`. When Phase 4 activates, there will be months of history from manual import. The automated pipeline does not retroactively re-score those months.

This means:
- Tier history is a mix of manually-assessed and algorithmically-assessed WIC scores, with no boundary marker in the audit trail.
- If the automated algorithm disagrees with PM's manual assessment (likely — PM is approximating), tier evaluations for the transition period will be inconsistent.
- PM's ability to override (noted in §3) becomes ambiguous: is an override from manual-import era still valid?

**Fix:** Add a `WicAssessmentSource` enum to the domain model now (not Phase 4). Values: `manual_import`, `automated_pipeline`. Tier evaluation engine must log which source was used for each evaluation. This is metadata, not logic — it does not change Phase 2 behavior. But it is essential for Phase 4 audit continuity.

---

## OK

### Phase sequencing by business dependency is correct

WF2 (WIP) before WF5 (Tier) before WF4 (RFP) is the right dependency order. You cannot evaluate tiers without pipeline data. You cannot run meaningful RFP without tier data for filtering. The phase ordering respects this chain. No phase is blocked by a later phase's deliverables (modulo the MIN gap in C1 above).

### Commit count methodology is sound

Counting atomic commits per gap rather than per story is correct DDD practice. Infrastructure gaps (cron trigger) counted once rather than per workflow that needs them is the right level of abstraction. The 0-commit calls (covered by platform) are honest — they do not inflate the plan.

### Workaround scope is correctly bounded

Manual WIC import (Phase 2) is a narrow anti-corruption layer: PM imports scores, system stores them. It does not change how the tier evaluation engine consumes WIC scores. The automated pipeline (Phase 4) can replace the import mechanism without changing downstream consumption. This is structurally clean. The concern in W4 is about audit continuity, not structural correctness.

### Data ownership boundary is clean across phases

WIC is system-generated, WIP is agency-generated, MIN is PM-generated — and this ownership is preserved in the phasing. Phase 1 does not accidentally give agencies write access to MIN-adjacent entities. Phase 3 correctly ships MIN as PM-only CRUD. The permission model is consistent across all phases.

---

## Summary

| # | Severity | Issue |
|---|----------|-------|
| C1 | CRITICAL | Tier evaluation ships in Phase 2 without MIN — invariant violation |
| C2 | CRITICAL | WIP count semantics underspecified — widget and worker will diverge |
| C3 | CRITICAL | Self-onboard erases enrollment event — audit lineage broken from day one |
| W1 | WARNING | Grace period logic untestable until Phase 3 — silent bug risk |
| W2 | WARNING | CaseStudy invariants undefined — RFP comparison built on unvalidated data |
| W3 | WARNING | Cron trigger cross-phase dependency not explicit — Phase 1 widget behavior undefined |
| W4 | WARNING | Phase 4 automation creates unaudited WIC source boundary in history |

Three issues require action before implementation begins. The phasing is otherwise structurally sound in its dependency ordering and commit accounting.
