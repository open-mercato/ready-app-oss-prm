# Vaughn Vernon DDD Review — §5 User Stories + §6 Gap Analysis

Reviewer: Vaughn Vernon (role)
Date: 2026-03-20
Subject: PRM App Spec — §5 User Stories + §6 User Story Gap Analysis

---

## CRITICAL

### C1 — "WIP count" is an invariant without an Aggregate boundary

US-2.2: "WIP count increments on next aggregation."

WIP is defined as deals at SQL stage or above, counted monthly per agency. The success criterion says the count increments "on next aggregation" — meaning it is computed asynchronously, not enforced at the moment the deal is moved to SQL.

This is a silent invariant violation. The domain rule is: a deal at SQL or above IS a WIP contribution. But the model allows a state where the deal is SQL and the WIP count has not yet reflected it. There is no Aggregate enforcing the invariant in real time. The aggregation job becomes load-bearing infrastructure that must never fail, never duplicate, and must handle the boundary of the month correctly.

The flaw: WIP is treated as a derived projection, but it is also used as a governance input to Tier calculation (WF5). Two readings of the same fact — one eventual, one authoritative — will diverge under any failure. Which one is the source of truth for a tier proposal (US-5.2)?

Fix required: Designate a single authoritative WIP value per org per period. Either the count is computed on-write (transactional, inside an Aggregate) or the aggregation job output is the official record and US-2.2's success criterion must be rewritten to say "WIP will be reflected in the next period snapshot, not in real time." The current wording implies real-time feedback while deferring it to a batch job.

---

### C2 — Tier change approval has no state machine — "proposal" is unnamed aggregate state

US-5.2: system "generates proposal."
US-5.3: PM "approves or rejects" with reason.

A TierChangeProposal is an Aggregate with lifecycle: Generated -> Approved | Rejected. This is not made explicit anywhere. The success criteria for US-5.3 say "audit log created" but do not say what happens to the proposal entity itself after the PM acts. Is it deleted? Archived? Does the Aggregate transition to a terminal state?

More critically: what happens if two proposals exist for the same org in the same period? The stories do not guard against this. There is no invariant stated: "at most one open TierChangeProposal per org per period."

This will cause production bugs. Without an explicit state machine and uniqueness invariant on TierChangeProposal, concurrent month-end jobs will create duplicate proposals and the approval of one will not cancel the other.

Fix required: Name the Aggregate explicitly. Define its states. Add the uniqueness invariant as a domain rule, not an implementation detail.

---

### C3 — "MIN" has no Aggregate — US-5.6 creates a PartnerLicenseDeal with no domain guard

US-5.6: "PM creates a PartnerLicenseDeal and attributes it to an agency. MIN count increments."

MIN is defined as Enterprise license deals, counted yearly. US-5.6 creates a record and says the count increments. But:

1. There is no stated invariant preventing double-attribution (same deal attributed to two agencies).
2. There is no stated invariant preventing a deal from being counted twice in the same year.
3. There is no definition of what makes a deal qualify as a MIN contribution vs. a regular deal.

The qualification boundary is entirely absent. The PM is given free-form creation with no domain guard. This is a governance metric feeding into Tier calculation — if the count can be inflated by accident or intent, the Tier model is corrupt.

Fix required: Define what qualifies a deal as a MIN contribution (criteria, not just "enterprise license"). State the uniqueness and period-boundary invariants explicitly. The Aggregate must enforce them.

---

### C4 — US-3.1 stores GitHub username on User, but User is in the Identity context

US-3.1: "GH username field saved on User."

The Identity model defines User with role_key, org_scope. GitHub username is a domain concept belonging to the Contributor profile in the PRM context, not to the identity record.

Storing it on the User entity crosses a bounded context boundary without acknowledging it. The Identity context owns authentication and org membership. The PRM context owns contribution tracking. If GH username lives on User, then:

- PRM's WIC scoring logic has a direct dependency on the Identity Aggregate.
- Any change to the Identity model (e.g., multi-org membership for Contributors) must account for WIC attribution.
- A Contributor working across multiple orgs would have one GH username but potentially different WIC attributions per org — this is not modeled.

Fix required: Define a ContributorProfile entity within the PRM bounded context that holds domain-specific fields (GH username, WIC score, tier contribution). Reference the User identity by ID only. Do not pollute the Identity Aggregate with domain data.

---

## WARNING

### W1 — "RFP Campaign" domain events are implied but unnamed

US-4.1: "Campaign created, workflow triggered, agencies notified."
US-4.2: "BD sees notification."
US-4.4: "Losing agencies notified."

Three notification side effects are buried in success criteria without being named as Domain Events. The coupling is hidden: Campaign creation triggers agency notification, winner selection triggers loser notification. These are causally significant events that will drive integrations (email, in-app, audit).

If these are not modeled as explicit Domain Events — CampaignPublished, RFPResponseSubmitted, CampaignWinnerSelected — the notification logic will be implemented as direct calls inside command handlers, making the model fragile and the events invisible to future consumers.

Fix required: Name the Domain Events. List them explicitly in the App Spec alongside the stories that produce them.

---

### W2 — "Tier upgrade/downgrade proposal" conflates two distinct events

US-5.2 describes a single story for both upgrades and downgrades. In the domain these are different because they have different business consequences and different stakeholder responses:

- An upgrade proposal is good news; the PM approves to reward the agency.
- A downgrade proposal is negative; it may trigger a grace period (referenced in US-5.4 "grace period warning") and the PM must approve to penalize.

The grace period mentioned in US-5.4 is not modeled anywhere in §5. There is no story for "PM grants grace period," no story for "grace period expires," no invariant stating what happens to the agency's tier during a grace period. It is referenced in a dashboard label but has no lifecycle.

Fix required: Split US-5.2 into separate stories for upgrade and downgrade. Add stories for grace period lifecycle: grant, expire, cancel. Define what tier is shown during a grace period.

---

### W3 — US-3.2 WIC CSV import has no idempotency contract

US-3.2: "Upload CSV/markdown, system parses and maps GH profiles to users."

There is no success criterion addressing what happens when the same CSV is uploaded twice, or when a score for a GH profile already exists for the current period. WIC scores feed directly into Tier calculation. A double-import would corrupt the aggregation.

The story treats import as a write operation with no guard. At minimum the success criteria must state: "importing the same period data twice produces the same result" (idempotency) or "system rejects duplicate period imports" (guard).

Fix required: Add idempotency or duplicate-rejection to US-3.2's success criteria.

---

### W4 — US-6.1 org switcher is modeled as "read-only" but §5 does not state the access invariant

US-6.1: "PM sees that agency's data read-only."

This is a cross-cutting access rule, not a single story. Every PM-facing story in WF2, WF3, WF4, WF5 implies the PM is operating in a multi-org context. But the read/write boundary is only stated in US-6.1 and only for browsing.

US-5.3 (PM approves tier change) and US-5.6 (PM creates PartnerLicenseDeal) both involve the PM writing data that belongs to or is attributed to a specific agency. Are these write operations scoped to the currently selected org in the switcher? Or does the PM act globally?

If the org switcher is purely a read context and PM writes are global, US-6.1's "read-only" description is misleading and will cause confusion in implementation.

Fix required: Clarify the invariant. Either: (a) the org switcher scopes all PM reads and writes, or (b) PM writes are global and the org switcher only scopes the view. State this explicitly as a domain rule.

---

## OK

### OK-1 — Persona-to-role-key mapping is consistent

Every user story assigns intent to exactly one persona (PM, Agency Admin, BD, Contributor). Each persona maps 1:1 to a role_key in the Identity Model. There are no stories where a persona acts outside their stated org scope. This is clean and will not cause authorization ambiguity.

### OK-2 — US-1.1 / US-1.1b phase split is correct

Separating self-signup (Phase 1) from email invite (Phase 4) is a sound incremental delivery decision. These are genuinely different capabilities and the domain boundary between them is clear. The success criteria are distinct and non-overlapping.

### OK-3 — US-5.4 and US-5.5 correctly scope dashboard visibility by persona

Agency Admin sees tier + KPI vs thresholds + grace period warning. BD sees tier + agency WIP with own deals highlighted + WIC score. The information visible to each persona is appropriately scoped to their domain concern and does not leak cross-persona data. No cross-context read violation is present here.

### OK-4 — US-4.3 / US-4.4 RFP response and winner selection are correctly sequenced

Response submission (BD) precedes comparison and selection (PM). The causal ordering is correct. There is no story that allows PM to select a winner before responses exist. This ordering is implicit but not broken.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 4 | C1, C2, C3, C4 |
| WARNING | 4 | W1, W2, W3, W4 |
| OK | 4 | OK-1 through OK-4 |

The most dangerous flaws are C2 (TierChangeProposal has no state machine or uniqueness invariant) and C1 (WIP aggregation temporal ambiguity feeding governance). These will produce incorrect tier calculations in production. C4 is an architectural boundary violation that will compound over time. Address all four CRITICAL items before moving to technical spec generation.
