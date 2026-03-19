# App Spec — Definition of Done

> Reusable checklist for any App Spec built on Open Mercato.
> Each check has an owner: **Mat** (product owner) or **Piotr** (CTO/architecture review).
> Score each item against your App Spec document. Use the Scoring Template at the bottom.

## How to use

Score each item: PASS / FAIL / N/A. An App Spec is ready for implementation when:
- Zero FAILs in "Foundation" (section 1-3)
- Zero FAILs in "Workflows" (section 4)
- Zero FAILs in "User Stories" (section 5)
- Zero FAILs in "Gap Analysis" (section 6)
- Max 2 FAILs in "Quality Gates" (section 7-10), with justification

If Foundation has any FAIL — stop. Fix it before touching workflows or specs.

---

## 1. Business Context — Mat

> Failure mode: specs written without knowing who pays and why. Result: features nobody needs.

- [ ] **1.1 Paying customer identified.** Not "users benefit" — who writes the check? What do they get? `Mat`

- [ ] **1.2 Flywheel articulated.** The reinforcing loop that makes the system more valuable over time. `Mat`

- [ ] **1.3 KPIs defined with full formulas.** Each KPI has: source data, calculation rule, period, who owns the input. Not just names — complete formulas with anti-gaming rules. `Mat`

- [ ] **1.4 Incentive/reward structure documented** (if applicable). What thresholds, what benefits per level, how levels are evaluated. `Mat`

- [ ] **1.5 Glossary with single definitions.** Every domain term defined once. Same word = same meaning across all specs and conversations. `Mat`

- [ ] **1.6 Business rules documented.** Permissions hierarchy, data ownership (who creates/reads/updates what), cross-org visibility rules. `Mat`

## 2. Identity Model — Mat + Piotr

> Failure mode: wrong identity type = entire codebase rebuilt. This is the single most expensive mistake.

- [ ] **2.1 Every persona has ONE identity type.** User (auth/backend) or CustomerUser (portal). No "maybe both". `Mat`

- [ ] **2.2 Identity decision justified per persona.** For each persona: what modules do they need? Does that require backend or portal? `Mat`

- [ ] **2.3 No persona has two accounts.** If someone would need both User and CustomerUser, the model is wrong. `Piotr`

- [ ] **2.4 Org scoping defined per role.** Who sees which organizations? What's read-only vs read-write? `Piotr`

- [ ] **2.5 Portal usage justified or explicitly rejected.** If no persona needs portal, say so. Don't build it "just in case". `Mat`

## 3. Cross-Spec Consistency — Mat

> Failure mode: specs written in isolation contradict each other. Nobody checks the seams.

- [ ] **3.1 All related specs listed.** Every spec that touches this app, with what it contributes. `Mat`

- [ ] **3.2 Identity model consistent across specs.** No spec says CustomerUser while another assumes User for the same persona. `Mat`

- [ ] **3.3 Terminology consistent.** Same word means same thing everywhere, matching the glossary. `Mat`

- [ ] **3.4 Shared entities owned by one spec.** If two specs reference the same entity, one is the owner, the other references it. `Mat`

## 4. Workflows — Mat

> Failure mode: user stories without business context are features without purpose.

- [ ] **4.1 3-7 core workflows defined.** Too few = missing something. Too many = decompose further. `Mat`

- [ ] **4.2 Each workflow has end-to-end journey.** First touchpoint to value delivery. No gaps where "someone does something". `Mat`

- [ ] **4.3 Each workflow has measurable ROI.** Not "users benefit" — specific metric that moves. `Mat`

- [ ] **4.4 Each workflow has boundaries.** Explicit start trigger, end condition, and what's NOT this workflow. `Mat`

- [ ] **4.5 Each workflow has 3-5 edge cases.** High probability production scenarios. Not exotic "what if earthquake". `Mat`

- [ ] **4.6 Each workflow step mapped to OM module.** Step-by-step: does platform handle it? If not, it's a gap. `Piotr`

- [ ] **4.7 No workflow requires more than ~200 lines of new code.** If it does, you missed a platform capability or the workflow is too complex for one app. `Piotr`

## 5. User Stories — Mat

> Failure mode: vague stories with no success criteria get "implemented" but nobody can verify they work.

- [ ] **5.1 Every story has: persona + action + measurable outcome + success criteria.** "As [who], I [what], so that [why]. Success: [testable]." `Mat`

- [ ] **5.2 Every story traces to a workflow step.** No orphan stories. If a story doesn't belong to a workflow, it's waste or a missing workflow. `Mat`

- [ ] **5.3 Identity checkpoint per story.** For every persona in a story: is this User or CustomerUser? What role key? Confirmed, not assumed. `Mat`

- [ ] **5.4 No weak stories.** Vague verbs killed: "manage", "track", "handle", "view data". Each story has a concrete action with observable result. `Mat`

## 6. Gap Analysis — Piotr

> Failure mode: wrong platform mapping = building what already exists, or missing what doesn't.

- [ ] **6.1 Workflow-level gap matrix complete.** Every workflow step scored 0-5 (0=platform does it, 5=major new code or external dependency). `Mat`

- [ ] **6.2 User story-level gap matrix complete.** Every story mapped to specific OM module/mechanism with line estimate. `Mat`

- [ ] **6.3 Piotr checkpoint: workflow mapping verified.** Piotr confirmed workflow-to-OM mapping is correct. No module missed, no overengineering. `Piotr`

- [ ] **6.4 Piotr checkpoint: story mapping verified.** Piotr confirmed story-to-OM mapping is correct. Simplest solution for each story. `Piotr`

- [ ] **6.5 No story requires >200 lines of new code.** If it does, re-map — you missed a platform capability or the story is too big to be atomic. `Piotr`

## 7. Phasing & Rollout — Mat

> Failure mode: shipping features in wrong order = dependencies broken, or half-done workflows frustrate users.

- [ ] **7.1 Phases ordered by: business priority x gap score x blocker status.** High priority + low gap = first. Not by "what's fun to build." `Mat`

- [ ] **7.2 Each phase delivers complete, usable increment.** No phase leaves a workflow half-done. User can do something real after each phase. `Mat`

- [ ] **7.3 Workarounds documented for high-gap blockers.** If a blocker has gap >3, there's a workaround that unblocks the phase. `Mat`

- [ ] **7.4 Total new code estimated per phase.** Not to the line, but order of magnitude. Sanity check: if total >1000 lines, you're probably building around the platform. `Piotr`

## 8. Open Questions — Mat

> Failure mode: unresolved questions become assumptions that become bugs.

- [ ] **8.1 Every open question has: options, impact, owner, status.** Not just "TBD" — what are the choices, who decides, and what breaks if we guess wrong? `Mat`

- [ ] **8.2 No BLOCKER question unresolved before its phase starts.** Questions can stay open for future phases, but not for the phase you're about to build. `Mat`

- [ ] **8.3 Decided questions have rationale recorded.** When a question is resolved, record why — not just the answer. Prevents reopening settled debates. `Mat`

## 9. Production Readiness — Mat

> Failure mode: demo that looks good in presentation but client can't actually use it.

- [ ] **9.1 Each workflow assessed: deployable or not.** Binary answer with specific blocker. `Mat`

- [ ] **9.2 "What would client say?" test.** For each gap: what's the client's actual complaint? `Mat`

- [ ] **9.3 No workflow stops midway.** If a workflow can start but can't complete end-to-end, it's worse than not existing — it creates frustration. `Mat`

## 10. Example App Quality — Piotr

> Failure mode: example app teaches bad patterns that get copied to dozens of projects.

- [ ] **10.1 Every piece of new code passes the "copy test".** "If someone copies this pattern, will they build ON the platform or AROUND it?" `Piotr`

- [ ] **10.2 Anti-patterns explicitly listed.** What we're NOT doing and why. `Piotr`

- [ ] **10.3 Platform features demonstrated.** The app showcases what the platform can do, not what custom code can do. `Piotr`

---

## Scoring Template

| # | Check | Owner | Status | Evidence/Notes |
|---|-------|-------|--------|----------------|
| 1.1 | Paying customer identified | Mat | | |
| 1.2 | Flywheel articulated | Mat | | |
| 1.3 | KPIs with full formulas | Mat | | |
| 1.4 | Incentive/reward structure | Mat | | |
| 1.5 | Glossary with single definitions | Mat | | |
| 1.6 | Business rules documented | Mat | | |
| 2.1 | One identity type per persona | Mat | | |
| 2.2 | Identity decisions justified | Mat | | |
| 2.3 | No dual accounts | Piotr | | |
| 2.4 | Org scoping per role | Piotr | | |
| 2.5 | Portal justified or rejected | Mat | | |
| 3.1 | All related specs listed | Mat | | |
| 3.2 | Identity model consistent | Mat | | |
| 3.3 | Terminology consistent | Mat | | |
| 3.4 | Shared entity ownership | Mat | | |
| 4.1 | 3-7 workflows | Mat | | |
| 4.2 | End-to-end journeys | Mat | | |
| 4.3 | Measurable ROI | Mat | | |
| 4.4 | Workflow boundaries | Mat | | |
| 4.5 | Edge cases | Mat | | |
| 4.6 | Steps mapped to OM | Piotr | | |
| 4.7 | <200 lines per workflow | Piotr | | |
| 5.1 | Persona + action + outcome + success | Mat | | |
| 5.2 | Every story traces to workflow | Mat | | |
| 5.3 | Identity checkpoint per story | Mat | | |
| 5.4 | No weak stories | Mat | | |
| 6.1 | Workflow gap matrix complete | Mat | | |
| 6.2 | Story gap matrix complete | Mat | | |
| 6.3 | Piotr checkpoint: workflow mapping | Piotr | | |
| 6.4 | Piotr checkpoint: story mapping | Piotr | | |
| 6.5 | No story >200 lines | Piotr | | |
| 7.1 | Phases ordered by priority x gap x blocker | Mat | | |
| 7.2 | Each phase = complete increment | Mat | | |
| 7.3 | Workarounds for high-gap blockers | Mat | | |
| 7.4 | Code estimate per phase | Piotr | | |
| 8.1 | Questions have options/impact/owner/status | Mat | | |
| 8.2 | No blocker open for current phase | Mat | | |
| 8.3 | Decided questions have rationale | Mat | | |
| 9.1 | Deployable assessment | Mat | | |
| 9.2 | Client complaint test | Mat | | |
| 9.3 | No midway stops | Mat | | |
| 10.1 | Copy test | Piotr | | |
| 10.2 | Anti-patterns listed | Piotr | | |
| 10.3 | Platform features demonstrated | Piotr | | |
