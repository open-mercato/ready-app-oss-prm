# Vaughn Vernon DDD Review — §1 Business Context & Domain Model

Reviewer: Vaughn Vernon (DDD practitioner persona)
Date: 2026-03-20
Scope: §1 Business Context & Domain Model (UL §1.3, Domain Model §1.4)

---

## CRITICAL

### 1. WIC base_score table contains a scoring inversion (L2 > L4)

The formula as written:

```
base_score = L4:1.0, L3:0.5, L2:1.0, L1:0.5/0.25, routine:0.0
```

L2 and L4 both score 1.0. L3 scores 0.5 — lower than L2. This means a routine L2 change (e.g., minor UI fix) earns the same base score as the highest-impact L4 contribution, and a mid-level L3 earns less than L2. Either the levels are not ordinal (and the spec never says that), or this is a typo and the table is wrong. A domain expert would not agree this is intentional without explicit justification. If scores are not ordinal, the spec must say so and explain the business rationale. If they are ordinal, the table must be corrected. **This is a domain invariant: WIC score must reflect contribution significance. The current formula violates it silently.**

Action required: Confirm the scoring table with the algorithm source (`/SDRC/`) and reconcile. Add a note if L2 intentionally outscores L3 and explain why.

---

### 2. WIP formula uses an ambiguous temporal predicate — will produce wrong counts in production

```
AND deal.created_at or deal.stage_changed_at IN month
```

This is not a valid predicate. It is underspecified. Two interpretations exist:
- (a) Deal was created in month OR any stage change happened in that month.
- (b) Deal was created in month OR the stage change that pushed it to SQL/Proposal/Won happened in that month.

Interpretation (a) counts a deal every month it has any activity, even if it dropped out of the qualifying stages. Interpretation (b) is the likely intent but requires a stage_change event typed to qualifying stages. This ambiguity will cause double-counting (deal active across two months), undercounting (deal entered SQL before month started with no activity that month), or both depending on implementation.

**WIP is a KPI used for tier governance. An incorrect WIP count could unjustly trigger a grace period or block a deserved upgrade. That is a production business bug, not a data quality issue.**

Action required: Replace the pseudo-SQL with an unambiguous definition. Likely correct semantics: "COUNT(DISTINCT deals) where deal.pipeline_stage IN ('sql', 'proposal', 'won') AT ANY POINT during the month" — i.e., a snapshot-based or event-sourced count, not a point-in-time count. Specify whether a deal that enters and exits SQL in the same month counts.

---

### 3. Tier threshold "WIP/month" is ambiguous — snapshot vs. cumulative

The tier table specifies WIC/month, WIP/month, MIN/year. WIC is explicitly summed (all contributors, all units in the month). MIN is a yearly count of new closed deals. WIP is undefined as to whether it means:

- A snapshot: how many qualifying deals are open at end-of-month.
- A cumulative: how many qualifying deals had activity during the month.
- A peak: the maximum number of simultaneous qualifying deals in the month.

This matters for tier evaluation. An agency that runs one deal at a time (serial sales motion) never reaches WIP=5 on a snapshot basis, but might easily reach WIP=5 cumulatively over the month. The domain semantics of "WIP" as "Work In Progress" suggests snapshot (things in flight right now), but the formula suggests cumulative.

**This ambiguity means two valid implementations produce different tier outcomes for the same agency.**

Action required: Add an explicit sentence: "WIP(org, month) = peak concurrent qualifying deals during the month" OR "...qualifying deals that were in SQL/Proposal/Won stage at any point during the month." Pick one, document it, make it the invariant.

---

## WARNING

### 4. "Tier" aggregate boundary is not explicit — snapshot vs. assignment are conflated

The spec describes Tier as "Calculated from WIC + WIP + MIN thresholds" and also as something that "requires PM approval before a tier change takes effect." These are two different things:

- A **TierEligibility** (computed, read-only, derived from KPI snapshots) — can be recalculated anytime.
- A **TierAssignment** (durable, audited, requires PM action) — the actual tier an agency holds.

Currently the spec conflates them under the single term "Tier." This creates a hidden aggregate boundary problem: if Tier is the assignment, who owns the computed eligibility? If Tier is the calculation, what entity holds the approval history and grace period state? The grace period especially suggests a stateful process that is neither pure computation nor a simple assignment — it is a time-windowed state machine on the delta between TierEligibility and TierAssignment.

Action required: Name the two concepts explicitly. Suggest: **TierEligibility** (computed, ephemeral, derived from KPI snapshot) and **TierAssignment** (durable, auditable, PM-approved). The grace period belongs to the process that bridges them — that process needs a name and an explicit aggregate owner.

---

### 5. "OM Agency" tier has qualitative requirements that the system cannot evaluate

The tier table lists for Tier 1 (OM Agency): "2 devs familiar with project, approved for L3-4 within 3 months." This is a human judgment call — familiarity cannot be algorithmically verified. But the spec says "Evaluation: monthly automated check against thresholds." These two statements are in direct contradiction for Tier 1 admission.

Additionally, "approved for L3-4 within 3 months" implies a PM manually certifies developer skill level. Where is this approval stored? Who creates it? What entity captures it? There is no domain concept in the ubiquitous language for "developer certification" or "L3/L4 approval."

Action required: Either (a) add a new domain concept (e.g., **DeveloperCertification** — PM-issued, links contributor to tier-eligible skill level) or (b) explicitly state that Tier 1 admission is entirely manual (PM-approved onboarding) and remove the implication that it is automated. Either is fine — but the current state leaves an unnamed concept and a false invariant.

---

### 6. WIC "L1: 0.5/0.25" — two values, no discriminator

The formula lists `L1:0.5/0.25` without specifying what determines whether an L1 unit scores 0.5 or 0.25. This is either a conditional score (based on something — what?) or a range (which to use when?). Every other level has a single value. L1 alone has two. This is an unnamed sub-distinction within the L1 level.

Action required: Name the discriminator. If it is based on a quality signal (e.g., whether the PR has tests), say so and map it to the existing impact_bonus logic. If it is a separate dimension, add it to the formula explicitly.

---

### 7. "PM can override" WIC — override semantics undefined

The data ownership section states "WIC: system-generated (external algorithm), PM can override." This creates an anti-corruption problem: the external algorithm produces a score, PM overrides it, but the next algorithm run would presumably overwrite the override.

The spec does not define: Does PM override create a separate entity (a **WICOverride** record) that takes precedence over algorithmic scores? Does the override expire or persist across re-scoring runs? Can an override be audited and reversed?

This is not a cosmetic issue — if a PM overrides an unfairly scored contribution that later re-scores correctly, the override should be reversible. If overrides are lost on re-score, that is a data integrity violation.

Action required: Define the override as a first-class domain concept. Suggest: **WICScoreOverride** — links to a specific WIC unit (person + month + feature_key), stores PM-provided score, reason, timestamp. Algorithm output is stored separately. Final score = override if present, else algorithm score.

---

### 8. MIN temporal scope creates fiscal year ambiguity

MIN is defined as yearly with `license_deal.closed_at IN year`. "Year" is not defined. Is this a calendar year (Jan-Dec), a fiscal year (variable by OM's accounting), or a rolling 12-month window? For tier evaluation purposes, a deal closed on Dec 31 vs. Jan 1 of the following year could mean the difference between retaining or losing a tier.

Action required: Specify. If calendar year, state "January 1 through December 31 UTC." If rolling 12-month, state that explicitly. This must be unambiguous because MIN determines the yearly component of tier evaluation.

---

## OK

### Flywheel (§1.1)

The flywheel diagram is correct and complete. WIC -> WIP -> MIN -> Tier -> Leads -> Revenue is a coherent causal chain. The system boundary (PRM is OM's tool, agencies use free, clients pay licenses) is clear and non-contradictory. No terminology overloading found here.

### Cross-org visibility rules (§1.4.3)

The rule that PM sees all orgs read-only via org switcher, while agency users are scoped to their own org, is explicit and consistent with the identity model in §2. The distinction between "PM sees KPI dashboard across all agencies" and "agency sees own KPI only" maps cleanly to two different views of the same data — no aggregate boundary violation.

### Data ownership separation (§1.4.3)

WIC (external algorithm), WIP (agency CRM activity), MIN (PM-created) being owned by three different actors is correct DDD practice — each KPI has one authoritative source and one mutation path. The rule "agency users CANNOT create/modify MIN source records" is an explicit invariant, which is exactly what belongs here.

### Onboarding sub-workflows (§1.4.3)

Separating Admin onboarding and BD onboarding as distinct tracked sub-workflows is correct. They have different actors, different completion criteria, and different failure modes. They are correctly not merged into a single workflow.

### RFP as a named concept

RFP is defined with clear source (PM creates campaign), response mechanism (agencies respond), and period (per campaign). It is not overloaded with matching logic (correctly deferred to v1+). The boundary is appropriate.

---

## Summary

Two formula errors (WIC scoring inversion, WIP predicate ambiguity) are production-quality bugs — they will produce incorrect KPI values that feed directly into tier governance decisions. These must be resolved before any implementation work on WF3 or WF5. The remaining warnings are naming gaps and undefined semantics that will cause implementation inconsistency if left unresolved.
