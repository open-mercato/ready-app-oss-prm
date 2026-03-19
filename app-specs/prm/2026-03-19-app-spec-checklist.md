# App Spec Checklist — PRM

> Scored instance of `templates/app-spec-checklist.md` for the B2B Partner Relationship Management app.
> Source: `app-specs/prm/2026-03-19-app-spec-prm.md`

## Scoring

| # | Check | Status | Evidence/Notes |
|---|-------|--------|----------------|
| 1.1 | Paying customer identified | PASS | OM pays for PRM. Agencies use for free as part of partnership. §1.1 |
| 1.2 | Flywheel articulated | PASS | Agency contributes (WIC) + sells (WIP/MIN) -> higher tier -> more leads -> more sales. §1.1 |
| 1.3 | KPIs with full formulas | PASS | WIC (LLM scoring with L1-L4, impact bonus, bounty multiplier), WIP (deals in SQL+ stage), MIN (enterprise license deals). §1.5 |
| 1.4 | Incentive/reward structure | PASS | 4 tiers with WIC/WIP/MIN thresholds and benefits per level. §1.4 |
| 1.5 | Glossary with single definitions | PASS | §1.3 glossary: WIC, WIP, MIN, Tier, RFP, Pipeline, Case Study, Bounty, Feature Key, PM, BD |
| 1.6 | Business rules documented | PASS | §1.6: permissions hierarchy, cross-org visibility, data ownership per KPI |
| 2.1 | One identity type per persona | PASS | All 4 personas are User. Zero CustomerUser. §2 |
| 2.2 | Identity decisions justified | PASS | §2 decision log: BD needs CRM = backend = User. Contributor minimal but still User for single identity system. |
| 2.3 | No dual accounts | PASS | Portal explicitly rejected. No promotion flows. §2 |
| 2.4 | Org scoping per role | PASS | PM: all orgs (organizationsJson: null). Agency roles: own org only. §2 table |
| 2.5 | Portal justified or rejected | PASS | "NOT USED. Zero portal pages. Zero CustomerUser accounts." §2 |
| 3.1 | All related specs listed | PASS | SPEC-053, 053a, 053b, 053c, 060, 068 listed. §8 |
| 3.2 | Identity model consistent | PASS | Conflict SPEC-053c (CustomerUser) vs SPEC-053b (User) resolved: User wins. §8 |
| 3.3 | Terminology consistent | PASS | Glossary §1.3 is single source. "staff user" banned. WIP = deals in SQL stage everywhere. |
| 3.4 | Shared entity ownership | FAIL | Not documented. Which spec owns PartnerAgency, PartnerRfpCampaign, PartnerMetricSnapshot? Needs explicit ownership table. |
| 4.1 | 3-7 workflows | PASS | 5 workflows: Onboarding, WIP, WIC, RFP, Tier Governance. §3 |
| 4.2 | End-to-end journeys | PASS | Each WF has full journey with sub-workflows (e.g., WF1 has admin + BD onboarding sub-flows). §3 |
| 4.3 | Measurable ROI | PASS | WF1: each agency = 1-15 WIP/month. WF2: 15 agencies x 5 WIP = 75 prospects/month. WF5: saves PM ~4h/week. §3 |
| 4.4 | Workflow boundaries | PASS | Each WF has start trigger, end condition, NOT list. E.g., WF1 ends at first deal, WF2 starts at subsequent deals. §3 |
| 4.5 | Edge cases | PASS | 4-5 per workflow. Real scenarios: fake deals, admin leaves, period boundaries, GH username mismatch. §3 |
| 4.6 | Steps mapped to OM | PASS | §4 gap matrix per workflow, every step scored. |
| 4.7 | <200 lines per workflow | PASS | All under 200 except WF3 full (deferred to Phase 4 with manual workaround). §4 |
| 5.1 | Persona + action + outcome + success | PASS | All 18 stories follow format. E.g., US-2.2: "As BD, I move deal to SQL so that it counts as WIP. Success: WIP count increments on dashboard." §5 |
| 5.2 | Every story traces to workflow | PASS | US-x.y maps to WFx. No orphan stories. §5 |
| 5.3 | Identity checkpoint per story | PASS | §2 table defines role key per persona. All stories reference personas from that table. |
| 5.4 | No weak stories | PASS | No "manage" or "track" verbs. Each story has concrete action + observable result. §5 |
| 6.1 | Workflow gap matrix complete | PASS | §4: WF1=7, WF2=4, WF3=8(3 with workaround), WF4=7, WF5=6. Every step scored 0-5. |
| 6.2 | Story gap matrix complete | PASS | §6: all 18 stories mapped with platform match, new code estimate, gap score. |
| 6.3 | Architecture review: workflow mapping | FAIL | Piotr checkpoint not yet run. Workflow mapping needs verification against actual OM codebase. |
| 6.4 | Architecture review: story mapping | FAIL | Piotr checkpoint not yet run. Story mapping needs verification. |
| 6.5 | No story >200 lines | PASS | Largest: US-4.3 ~100 lines (comparison page). US-3.4 deferred. §6 |
| 7.1 | Phases ordered by priority x gap x blocker | PASS | Phase 1: WIP (lowest gap, core flywheel). Phase 4: automation (highest gap, not blocker). §7 |
| 7.2 | Each phase = complete increment | PASS | Phase 1: "I onboarded 3 agencies, they log deals, I see WIP." Phase 2: "Tiers work, WIC visible." §7 |
| 7.3 | Workarounds for high-gap blockers | PASS | WIC automated (gap 5): manual import workaround. Invitation (gap 3): self-onboard workaround. §7 |
| 7.4 | Code estimate per phase | PASS | P1:~80, P2:~200, P3:~300, P4:~400. Total ~980 lines. §7 |
| 8.1 | Questions have options/impact/owner/status | PASS | §10: 5 questions, each with options, impact, owner, status. |
| 8.2 | No blocker open for current phase | PASS | Phase 1 blockers resolved: invitation → self-onboard workaround. Open questions target Phase 3-4. §10 |
| 8.3 | Decided questions have rationale | PASS | Q3: "self-onboard Phase 1, email Phase 4." Q4: "delete portal — zero personas need CustomerUser." §10 |
| 9.1 | Deployable assessment | FAIL | Production readiness table exists in workflow-analysis.md but not in app-spec-prm.md. Should be in main doc. |
| 9.2 | Client complaint test | FAIL | Same — "What would client say?" column exists in workflow-analysis.md, not in app-spec. |
| 9.3 | No midway stops | PASS | Each phase delivers complete workflows. Workarounds prevent half-done states. §7 |
| 10.1 | Copy test | PASS | §9: RBAC not custom access, CRM not custom CRUD, workflows not hardcoded state. |
| 10.2 | Anti-patterns listed | PASS | §9: no portal pages, no custom notification subscribers, no custom state machines, no two identity systems. |
| 10.3 | Platform features demonstrated | PASS | §9: RBAC, CRM, workflows, widget injection, org switcher, pipeline stages, custom entities, scheduled jobs. |

## Summary

**Foundation (1-3):** 1 FAIL (3.4 shared entity ownership)
**Workflows (4):** 0 FAILs
**User Stories (5):** 0 FAILs
**Gap Analysis (6):** 2 FAILs (6.3, 6.4 — Piotr checkpoints pending)
**Quality Gates (7-10):** 2 FAILs (9.1, 9.2 — production readiness not in main doc)

**Verdict: NOT READY — 5 FAILs, 3 in non-Quality-Gate sections.**

### To fix:
1. **3.4** — Add entity ownership table to app-spec-prm.md
2. **6.3 + 6.4** — Run Piotr checkpoints (architecture review)
3. **9.1 + 9.2** — Move production readiness table from workflow-analysis.md into app-spec-prm.md
