# App Specs — Business Analysis Zone

This folder is for defining what to build, not how to build it.

## Skills

- **Mat** (`skills/mat/SKILL.md`) — Product owner flow: business context -> workflows -> user stories -> platform mapping
- **Piotr** (`skills/piotr/SKILL.md`) — CTO review: challenge assumptions, verify OM platform capabilities on-demand

## Context Rules

- Do NOT load OM monorepo AGENTS.md — Piotr fetches OM context on-demand when verifying capabilities
- App Spec checklist in `templates/` defines when an App Spec is ready

## Workflow

1. Create App Spec with domain knowledge and business context
2. Define workflows with ROI, boundaries, edge cases
3. Piotr checkpoint: verify workflow gap analysis against OM platform
4. Define user stories with success criteria
5. Piotr checkpoint: verify user story gap analysis
6. Phase rollout based on business priority x gap score x blocker status
7. Generate technical specs from completed App Spec

## Structure

```
app-specs/
  skills/mat/        Mat skill (product owner)
  skills/piotr/      Piotr skill (CTO review)
  templates/         App Spec checklist template
  prm/               PRM app spec and supporting docs
  [future-app]/      Next app spec
```
