# App Specs — Business Analysis Zone

This folder is for defining what to build, not how to build it.

## Skills

- **Mat** (`skills/mat/SKILL.md`) — Product owner flow: business context -> workflows -> user stories -> platform mapping
- **Piotr** (`skills/piotr/SKILL.md`) — CTO review: challenge assumptions, verify OM platform capabilities on-demand
- **Krug** (`skills/krug/SKILL.md`) — UI architecture review: navigation, pages, widgets, user flows. Works within OM UI framework.

## Challenger Reviews

| Section | Reviewer | What they check |
|---------|----------|----------------|
| §1 Domain Model | Vernon (DDD subagent) | Bounded contexts, aggregates, invariants, domain events |
| §2 Identity Model | Vernon | Persona boundaries, role conflicts |
| §3 Workflows | Vernon | Workflow boundaries, missing events |
| §3.5 UI Architecture | Krug | Navigation clarity, task completion, empty states, click counts |
| §4 Gap Analysis | Piotr | OM module mapping, atomic commits, overengineering |
| §7 Phasing | Vernon + Mat | Acceptance criteria (Vernon writes, Mat challenges) |

## Context Rules

- Do NOT load OM monorepo AGENTS.md — Piotr fetches OM context on-demand when verifying capabilities
- Krug reads OM UI references on-demand (packages/ui/AGENTS.md, backend-ui-design skill)
- App Spec checklist in `templates/` defines when an App Spec is ready

## Workflow

1. Create App Spec with domain knowledge and business context
2. Define workflows with ROI, boundaries, edge cases
3. Piotr checkpoint: verify workflow gap analysis against OM platform
4. Define user stories with success criteria
5. Piotr checkpoint: verify user story gap analysis
6. Define UI architecture (§3.5) — Mat drafts, Krug reviews
7. Phase rollout based on business priority x gap score x blocker status
8. Generate technical specs from completed App Spec

## Structure

```
app-specs/
  skills/mat/        Mat skill (product owner)
  skills/piotr/      Piotr skill (CTO review)
  skills/krug/       Krug skill (UI architecture review)
  templates/         App Spec checklist template
  prm/               PRM app spec and supporting docs
  cfp/               CFP app spec and supporting docs
  [future-app]/      Next app spec
```
