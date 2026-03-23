# Writing Implementation Specs

For each phase, generate implementation specs from the App Spec. One spec per atomic commit (or tightly coupled group of commits from the same commit plan entry).

## Process

Follow these steps in order. Do NOT skip the review step.

1. **Load OM context** — Read `open-mercato/.ai/skills/spec-writing/SKILL.md` for OM spec-writing standards. Read `open-mercato/AGENTS.md` for platform conventions. Read reference module patterns from `open-mercato/packages/core/src/modules/customers/` as needed.
2. **Read the App Spec** — Follow AGENTS.md §1 (App Spec -> commit plans -> upstream flags).
3. **Reconcile commit plans** — Multiple workflow commit plans may overlap (e.g., both WF1 and WF2 seed roles). Merge overlapping commits and document the rationale.
4. **Plan (if 5+ commits)** — If the phase has 5 or more commits, coordinate the work before writing individual specs.
5. **Write specs** — For each atomic commit, write one implementation spec using the format below.
6. **Review specs** — Read `open-mercato/.ai/skills/pre-implement-spec/SKILL.md` and apply its review process (adapted for app-level specs — BC audit is N/A for new apps). At minimum check: AGENTS.md compliance, spec completeness, gap analysis, risk assessment, cross-spec consistency.
7. **Fix findings** — Address all Critical and High findings before proceeding. Update specs in place.
8. **Commit specs** — Commit all specs for the phase together before starting implementation.

## Spec Format

Location: `apps/<app>/docs/specs/`
Filename: `{date}-ph{N}-{commit-id}-{description}.md`

Each spec must include:

```markdown
# {Title}

## Source
- App Spec sections: §X.Y, §Z
- User stories: US-A.B, US-C.D
- Commit plan: commits-WF{N}.md, Commit {M}

## What This Delivers
[One paragraph: what the user can do after this commit that they couldn't before]

## Acceptance Criteria
[Copy from App Spec §7 — both domain criteria (Vernon) and business criteria (Mat) that this commit satisfies]

## Files
| File | Action | Purpose |
|------|--------|---------|
| src/modules/<module>/... | Create/Modify | ... |

## OM Patterns Used
[Which auto-discovery path, UMES mechanism, or module convention applies]
- Pattern: [name] — Reference: [where to find it in node_modules/@open-mercato/]

## Implementation Notes
[Any non-obvious decisions, edge cases from App Spec §3, ordering constraints]

## Testing
[Required for commits with custom business logic (interceptors, workers, custom API routes, validators).
 Skip for purely declarative commits (setup.ts seeds, ce.ts, seedExamples).]

### Unit Tests
[List functions/modules that need unit tests. Colocated as *.test.ts files.]
- `functionName` — test: [what to verify]

### Integration Test Scenarios
[Each scenario becomes a Playwright test during implementation. Self-contained, no demo data dependency.]

| ID | Type | Scenario | Expected Result |
|----|------|----------|-----------------|
| T1 | API  | [action] | [result]        |

## Verification
[Exact commands to run, what to check, expected output]
```

## Rules

- **One spec = one atomic commit** from the commit plans. Not bigger.
- **Acceptance criteria come from the App Spec** — copy the relevant domain + business criteria from §7, don't invent new ones.
- **Files section is exhaustive** — every file created or modified, with exact path under `src/modules/`.
- **OM patterns reference source code** — point to `open-mercato/packages/core/src/modules/` for reference implementations.
- **No spec without a commit plan entry** — if it's not in `commits-WF*.md`, it shouldn't exist.
- **Test Scenarios required for custom logic** — if the commit introduces custom business logic (API interceptors, custom API routes, workers, validators with domain rules), the spec MUST include a Test Scenarios section. Skip for purely declarative commits (setup.ts seeds, ce.ts, seedExamples). Read `open-mercato/.ai/skills/integration-tests/SKILL.md` for Playwright test conventions.
