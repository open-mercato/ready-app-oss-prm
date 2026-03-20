# App Spec: [App Name]

> App Spec is a business architecture document that sits above technical specs.
> It captures domain knowledge, validates cross-spec consistency, and ensures
> the app solves a real business problem using the platform correctly.
>
> This document is the SINGLE SOURCE OF TRUTH for what this app is, who it serves,
> and how it maps to Open Mercato. Technical specs are generated from this document.
> If a spec contradicts this document, this document wins.
>
> Each section has a checklist with owner (Mat or Piotr). Section is done when all checks pass.

---

## 1. Business Context `Mat`

### 1.1 Business Model

[Describe: what the app does, how the business makes money, who pays.]

**Flywheel:**
```
[Draw the reinforcing loop that makes the system more valuable over time]
```

#### Checklist
- [ ] Paying customer identified — who writes the check? What do they get?
- [ ] Flywheel articulated — the reinforcing loop, not just "users benefit"

### 1.2 Business Goals

**Primary goal:** [What problem does this app solve? For whom?]

**Secondary goal (example app):** [If applicable — what platform patterns does this app teach?]

**What is NOT important:** [Explicit scope exclusions. What this app will NOT do.]

#### Checklist
- [ ] Primary goal stated with measurable outcome
- [ ] Scope exclusions listed — what's out and why

### 1.3 Ubiquitous Language

> DDD: one term = one meaning everywhere. This glossary IS the ubiquitous language.

| Term | Definition | Source of data | Period |
|------|-----------|----------------|--------|
| | | | |

#### Checklist
- [ ] Every domain term defined once
- [ ] Same word = same meaning across all specs and conversations
- [ ] Source of data and period specified per term

### 1.4 Domain Model

> DDD: document the domain entities, rules, invariants, and value calculations specific to this app.
> Structure this section however the domain demands — there is no fixed format.
>
> Examples of what belongs here (depending on the domain):
> - Tier/level definitions with thresholds and governance rules
> - KPI formulas with anti-gaming rules
> - Business rules: permissions hierarchy, data ownership, cross-org visibility
> - Domain invariants: what must always be true
> - Value calculations: how scores, ratings, or statuses are derived

[Document your domain model here. Use subsections as needed.]

#### Checklist
- [ ] Domain entities identified with clear ownership
- [ ] Domain rules documented — invariants, constraints, calculations
- [ ] If there are levels/tiers: thresholds, benefits, governance rules (evaluation, grace period, downgrade, audit)
- [ ] If there are KPIs/scores: complete formulas with input source, period, anti-gaming rules
- [ ] Access control rules documented — who sees/does what, cross-org visibility
- [ ] Data ownership per entity — who creates, who reads, who updates, system vs user

---

## 2. Identity Model `Mat`

> SINGLE SOURCE OF TRUTH. If any spec contradicts this, update the spec.

| Persona | Role key | Identity | Org scope | Sees | Does |
|---------|----------|----------|-----------|------|------|
| | | User / CustomerUser | | | |

**Portal decision:** [USED / NOT USED. If not used, why. If used, which personas and why.]

**Decision log:**
[Per persona: why this identity type? What modules do they need? What was the alternative and why it was rejected?]

#### Checklist
- [ ] Every persona has ONE identity type — User or CustomerUser, no "maybe both" `Mat`
- [ ] Identity decision justified per persona — what modules they need drives the choice `Mat`
- [ ] No persona has two accounts — if someone needs both User and CustomerUser, the model is wrong `Piotr`
- [ ] Org scoping defined per role — who sees which orgs, read-only vs read-write `Piotr`
- [ ] Portal usage justified or explicitly rejected `Mat`

---

## 3. Workflows `Mat`

> Each workflow traces to ROI. If a workflow doesn't move a KPI or enable one that does, cut it.

### WF[N]: [Workflow Name]

**Journey:** [step1] -> [step2] -> ... -> [value delivered]

**ROI:** [Specific measurable business outcome]

**Key personas:** [Who's involved at each step]

**Boundaries:**
- Starts when: [trigger]
- Ends when: [completion criteria]
- NOT this workflow: [what's explicitly out of scope]

**Edge cases:**
1. [scenario] -> [what should happen] -> [risk if unhandled]
2. ...

**OM readiness (per step):**

| Step | OM Module | Gap? | Notes |
|------|-----------|------|-------|
| | | | |

[Repeat per workflow]

#### Checklist (per workflow)
- [ ] End-to-end journey — first touchpoint to value delivery, no gaps `Mat`
- [ ] Measurable ROI — specific metric that moves, not "users benefit" `Mat`
- [ ] Boundaries — explicit start, end, and NOT-this-workflow `Mat`
- [ ] 3-5 edge cases — high probability production scenarios `Mat`
- [ ] Every step mapped to OM module `Piotr`

#### Checklist (overall)
- [ ] 3-7 core workflows defined `Mat`
- [ ] No workflow requires >200 lines of new code — if it does, you missed a platform capability `Piotr`

---

## 4. Workflow Gap Analysis `Piotr`

> Gap analysis maps each workflow step to OM platform capability.

### Gap Scoring — Atomic Commits (Ralph Loop)

Each gap is measured in **atomic commits** — one self-contained, testable increment that a single focused development loop can deliver. See Piotr skill for commit estimation methodology.

| Score | Meaning | Example |
|-------|---------|---------|
| 0 | Platform does it, zero commits | RBAC role in setup.ts |
| 1 | 1 commit: config/seed only | Pipeline stages in seedDefaults |
| 2 | 1-2 commits: small gap | Widget injection + i18n |
| 3 | 2-3 commits: medium gap | Entity + CRUD route + backend page |
| 4 | 3-5 commits: large gap | Multi-entity + pages + workflow definition |
| 5 | 5+ commits or external dependency | External API + LLM pipeline |

### Per-Workflow Gap Matrix

#### WF[N]: [Name] — Total: [N] atomic commits

| Step | OM Module | Gap | Commits | Notes |
|------|-----------|-----|---------|-------|
| | | | | |

[Repeat per workflow]

### Gap Summary

| Workflow | Business Priority | Atomic Commits (raw) | Workaround? | Commits (effective) | Blocks ROI? |
|----------|------------------|---------------------|-------------|---------------------|-------------|
| | | | | | |

Piotr saves detailed commit plans to `app-specs/<app>/piotr-notes/commits-WF<N>.md`.

#### Checklist
- [ ] Every workflow step scored in atomic commits `Mat`
- [ ] Piotr checkpoint: workflow-to-OM mapping verified — no module missed, no overengineering, commit plans saved `Piotr`

---

## 5. User Stories `Mat`

> Each story traces to a workflow step. Story = atomic action by one persona with measurable success.

### WF[N]: [Workflow Name]

**US-[N.M]** As [persona], I [action] so that [business outcome].
Success: [concrete, testable criteria]

[Repeat per story, grouped by workflow]

#### Checklist
- [ ] Every story has: persona + action + measurable outcome + success criteria
- [ ] Every story traces to a workflow step — no orphan stories
- [ ] Identity checkpoint per story — User or CustomerUser? What role key?
- [ ] No weak stories — vague verbs killed: "manage", "track", "handle", "view data"

---

## 6. User Story Gap Analysis `Piotr`

> Map each story to OM capability. Measure in atomic commits.

| Story | Platform Match | Atomic Commits | Notes |
|-------|---------------|----------------|-------|
| | | | |

Piotr saves detailed commit plans to `app-specs/<app>/piotr-notes/commits-US-<N>.md`.

#### Checklist
- [ ] Every story mapped to specific OM module/mechanism with atomic commit estimate `Mat`
- [ ] Piotr checkpoint: story-to-OM mapping verified — simplest solution for each story, commit plans saved `Piotr`

---

## 7. Phasing & Rollout `Mat`

> Phasing logic: High business priority + Low gap = ship first.

### Phase [N]: [Name]

**Goal:** [What the user can do after this phase]

**Why this order:** [Business justification]

| Story | What ships | Commits |
|-------|-----------|---------|
| | | |

**Total: [N] atomic commits**
**Workaround:** [if any high-gap blocker is worked around]

**After this phase, client can say:** "[quote]"

[Repeat per phase]

### Rollout Summary

```
Phase 1: [name]    [N] commits    [which workflows]
Phase 2: [name]    [N] commits    [which workflows]
...
                   ---------
                   [N] atomic commits total
                   [M] commits for production-ready (Phases 1-N)
```

#### Checklist
- [ ] Phases ordered by: business priority x gap score x blocker status
- [ ] Each phase delivers complete, usable increment — no half-done workflows
- [ ] Workarounds documented for high-gap blockers (gap >3)
- [ ] Total atomic commits estimated per phase `Piotr`

---

## 8. Cross-Spec Conflicts `Mat`

| Conflict | Specs involved | Resolution |
|----------|---------------|------------|
| | | |

#### Checklist
- [ ] All related specs listed with what each contributes
- [ ] Identity model consistent across specs
- [ ] Terminology consistent — matches glossary
- [ ] Shared entities owned by one spec — if two specs reference the same entity, one is the owner
- [ ] Every conflict has a resolution, not "TBD"

---

## 9. Example App Quality Gate `Piotr`

> Only if this project is an example/reference app. N/A otherwise.

**Platform patterns to demonstrate:**
- [list of OM features this app showcases]

**Anti-patterns to avoid:**
- [list of what we're NOT building and why]

#### Checklist
- [ ] Every piece of new code passes the "copy test" — if someone copies this, do they build ON the platform or AROUND it?
- [ ] Anti-patterns explicitly listed
- [ ] Platform features demonstrated — the app showcases what the platform can do

---

## 10. Open Questions `Mat`

| # | Question | Options | Impact | Owner | Status |
|---|----------|---------|--------|-------|--------|
| | | | | | |

#### Checklist
- [ ] Every question has: options, impact, owner, status
- [ ] No BLOCKER question unresolved before its phase starts
- [ ] Decided questions have rationale recorded

---

## Production Readiness `Mat`

> Assessed per implementation phase. Updated as phases ship.

| Workflow | Deployable | Blocker | What client would say |
|----------|-----------|---------|----------------------|
| | | | |

#### Checklist
- [ ] Each workflow assessed: deployable or not — binary, with specific blocker
- [ ] "What would client say?" test — the complaint, not the technical gap
- [ ] No workflow stops midway — if it can start but can't complete, it's worse than not existing

---

## Changelog

### [date]
- [what changed and why]
