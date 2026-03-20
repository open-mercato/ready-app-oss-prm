# Ready Apps — Agent Guidelines

Build Open Mercato applications from App Specs. Each app follows the same process: business spec first, implementation specs second, code third.

## Repo Structure

```
open-mercato/                    # OM monorepo (gitignored, local reference copy)
  .ai/skills/                    # OM platform skills (spec-writing, implement-spec, etc.)
  packages/core/src/modules/     # Reference module implementations (customers = reference CRUD)
  AGENTS.md                      # OM platform conventions and task router

app-specs/
  <app-name>/                    # Business analysis (App Spec + supporting docs)
    YYYY-MM-DD-app-spec-<app>.md # THE source of truth
    piotr-notes/commits-WF*.md   # Atomic commit plans per workflow
    mat-notes/                   # Challenger review findings
  skills/mat/SKILL.md            # Product owner skill (spec creation)
  skills/piotr/SKILL.md          # CTO review skill (platform verification)
  templates/app-spec-template.md # App Spec checklist template

apps/
  <app-name>/                    # Implementation (OM application code)
    src/modules/<module>/        # App modules following OM auto-discovery
    docs/specs/                  # Implementation specs (one per atomic commit)
    AGENTS.md                    # App-specific overrides
```

**Convention:** `app-specs/<app>/` is the business spec, `apps/<app>/` is the implementation. Same `<app>` name in both.

## OM Monorepo Reference

The OM monorepo lives at `open-mercato/` in this repo (gitignored — local reference copy, not committed). It provides:

1. **Platform skills** — at `open-mercato/.ai/skills/<skill>/SKILL.md`. These are NOT Skill tool skills — read the file directly with the Read tool and follow the process described inside.
2. **Reference implementations** — at `open-mercato/packages/core/src/modules/`. The `customers` module is the canonical CRUD reference. Search here when you need to understand how an OM pattern works.
3. **Platform conventions** — at `open-mercato/AGENTS.md`. The root AGENTS.md has the full task router and all OM rules (naming, security, BC contract, etc.).
4. **Review checklists** — at `open-mercato/.ai/skills/code-review/references/review-checklist.md`.

**Before any implementation work:** verify the monorepo is on the `develop` branch and up to date:
```bash
cd open-mercato && git checkout develop && git pull
```

**If `open-mercato/` does not exist:** clone it:
```bash
git clone <om-repo-url> open-mercato && cd open-mercato && git checkout develop
```

## Task Router

| Task | Where to work | What to use |
|------|---------------|-------------|
| Define a new app (business analysis) | `app-specs/<app>/` | Mat skill + Piotr skill + template |
| Convert App Spec to implementation specs | `apps/<app>/docs/specs/` | This guide §2 (full workflow below) |
| Implement a spec | `apps/<app>/src/modules/` | This guide §3 + OM `implement-spec` skill |
| Review implementation | `apps/<app>/` | OM `code-review` skill |
| Check platform capabilities | `app-specs/<app>/` | Piotr skill (fetches OM context on-demand) |

**How to access OM skills:** Read the skill file with the Read tool at `open-mercato/.ai/skills/<skill>/SKILL.md`. Do NOT use the Skill tool — OM skills are not registered there. Read the file, then follow the process it describes.

---

## §1. Reading the App Spec

Before writing any spec or code, read these files in order:

1. **App Spec** — `app-specs/<app>/YYYY-MM-DD-app-spec-<app>.md`
   - §1: Business Context + Domain Model (terms, rules, invariants, field definitions)
   - §2: Identity Model (User vs CustomerUser, roles, org scoping)
   - §3: Workflows (end-to-end journeys with boundaries and edge cases)
   - §7: Phasing (which commits per phase, acceptance criteria)

2. **Commit Plans** — `app-specs/<app>/piotr-notes/commits-WF*.md`
   - One file per workflow, atomic commit breakdown
   - Each commit has: scope, pattern, files, delivers, depends-on, phase

3. **Upstream Flags** — `app-specs/<app>/piotr-notes/upstream-flags.md`
   - Dependencies on OM core changes, workarounds, timelines

4. **App-specific overrides** — `apps/<app>/AGENTS.md`
   - Identity model corrections, domain rules, anti-patterns specific to this app

**The App Spec is the ceiling.** Do not invent features, entities, or workflows not in the App Spec. If something seems missing, check the App Spec again — it was likely decided and documented.

---

## §2. Writing Implementation Specs

For each phase, generate implementation specs from the App Spec. One spec per atomic commit (or tightly coupled group of commits from the same commit plan entry).

### Process

Follow these steps in order. Do NOT skip the review step.

1. **Load OM context** — Read `open-mercato/.ai/skills/spec-writing/SKILL.md` for the OM spec-writing standards. Read `open-mercato/AGENTS.md` for platform conventions. Read reference module patterns from `open-mercato/packages/core/src/modules/customers/` as needed.
2. **Read the App Spec** — Follow §1 above (App Spec → commit plans → upstream flags).
3. **Reconcile commit plans** — Multiple workflow commit plans may overlap (e.g., both WF1 and WF2 seed roles). Merge overlapping commits and document the rationale.
4. **Write specs** — For each atomic commit, write one implementation spec using the format below.
5. **Review specs** — Read `open-mercato/.ai/skills/pre-implement-spec/SKILL.md` and apply its review process (adapted for app-level specs — BC audit is N/A for new apps). At minimum check: AGENTS.md compliance, spec completeness, gap analysis, risk assessment, cross-spec consistency.
6. **Fix findings** — Address all Critical and High findings before proceeding. Update specs in place.
7. **Commit specs** — Commit all specs for the phase together before starting implementation.

### Spec Format

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

## Verification
[Exact commands to run, what to check, expected output]
```

### Rules

- **One spec = one atomic commit** from the commit plans. Not bigger.
- **Acceptance criteria come from the App Spec** — copy the relevant domain + business criteria from §7, don't invent new ones.
- **Files section is exhaustive** — every file created or modified, with exact path under `src/modules/`.
- **OM patterns reference source code** — point to `open-mercato/packages/core/src/modules/` for reference implementations.
- **No spec without a commit plan entry** — if it's not in `commits-WF*.md`, it shouldn't exist.

---

## §3. Implementing Specs

After a spec is written and reviewed (§2 steps 5-6), implement it. Read `open-mercato/.ai/skills/implement-spec/SKILL.md` for the OM implementation workflow, then follow the per-commit loop below.

### Per-Commit Loop

```
1. Read the implementation spec
2. Implement the code
3. yarn generate          (if module files changed)
4. yarn typecheck          (must pass)
5. yarn build              (must pass)
6. Check acceptance criteria from the spec
7. Commit
```

### Commit Message Format

```
feat(partnerships): {what this commit delivers}

Implements: {app-spec-ref} US-{X.Y}
Phase: {N}, Commit: {M}
Pattern: {OM pattern used}
```

### Phase Completion

After all commits in a phase are done:

1. Run `yarn initialize` to test full bootstrap (seedDefaults + seedExamples)
2. Verify ALL acceptance criteria from App Spec §7 for this phase (both domain and business)
3. Use `code-review` skill for phase review
4. Update `apps/<app>/docs/specs/` with any learnings

---

## §4. OM Platform Patterns

When implementing, reference these patterns from the OM monorepo at `open-mercato/packages/core/src/modules/`:

| Pattern | Where to find reference | Used for |
|---------|------------------------|----------|
| **setup.ts** (roles, seeds) | `@open-mercato/core/modules/customers/` | Seeding roles, dictionaries, pipeline stages, custom fields |
| **API interceptors** | `@open-mercato/core/modules/*/api/interceptors.ts` | Before/after hooks on CRUD operations |
| **Dashboard widgets** | `@open-mercato/shared/modules/dashboard/widgets` | Dashboard tiles and cards |
| **Widget injection** | search `injection-table.ts` in `@open-mercato/core` | Injecting UI into existing pages |
| **Custom fields/entities** | `@open-mercato/core/modules/entities/` | Dynamic field definitions, custom entity types |
| **Queue workers** | `@open-mercato/queue/` | Background job processing |
| **Workflow JSON** | `@open-mercato/core/modules/workflows/` | Multi-step processes with activities and user tasks |
| **CRUD routes** | `@open-mercato/core/modules/customers/api/` | Standard CRUD with openApi exports |
| **Events** | `@open-mercato/core/modules/*/events.ts` | Typed domain events |
| **acl.ts** | `@open-mercato/core/modules/*/acl.ts` | Feature-based permissions |
| **ce.ts** | `@open-mercato/core/modules/*/ce.ts` | Custom entity declarations |

**When you need to understand an OM pattern:** search `open-mercato/packages/core/src/modules/` for the source implementation. The `customers` module is the reference CRUD module. Use Explore subagents for broad pattern research.

---

## §5. Module File Conventions

All app code goes in `src/modules/<module>/`. Follow OM auto-discovery:

```
src/modules/<module>/
  index.ts              # metadata
  setup.ts              # seedDefaults, seedExamples, defaultRoleFeatures
  acl.ts                # feature declarations
  events.ts             # typed event declarations (createModuleEvents, as const)
  ce.ts                 # custom entities
  search.ts             # search config
  data/
    entities.ts         # MikroORM entities
    validators.ts       # Zod schemas
  api/
    interceptors.ts     # API interceptors (before/after hooks)
    get/*.ts            # GET routes (export handler + openApi)
    post/*.ts           # POST routes
    patch/*.ts          # PATCH routes
    delete/*.ts         # DELETE routes
  backend/
    <module>/           # backend pages (auto-discovered as /backend/<module>)
  frontend/
    <path>/             # frontend pages (auto-discovered as /<path>)
  widgets/
    injection-table.ts  # widget-to-slot mappings
    injection/          # injected UI widgets
    dashboard/          # dashboard widget components
  workers/              # queue workers (export default handler + metadata)
  workflows/            # workflow JSON definitions
  subscribers/          # event subscribers (export default handler + metadata)
  commands/             # command implementations
```

---

## §6. Skills Reference

Two types of skills are available. Use the right access method:

### OM Platform Skills (read the file, follow the process)
Access via Read tool at `open-mercato/.ai/skills/<skill>/SKILL.md`. Do NOT use the Skill tool.

| Task | Skill file | When to use |
|------|-----------|-------------|
| Writing implementation specs | `spec-writing/SKILL.md` | Step 1 of §2 — read for OM spec standards before writing |
| Pre-implementation analysis | `pre-implement-spec/SKILL.md` | Step 5 of §2 — review specs after writing, fix findings before implementing |
| Implementing a spec | `implement-spec/SKILL.md` | Step 1 of §3 — read before coding each commit |
| Code review | `code-review/SKILL.md` | After completing each phase — full review with CI gates |

### Superpowers Skills (invoke via Skill tool)
Access via the Skill tool as usual.

| Task | Skill | When to invoke |
|------|-------|----------------|
| Brainstorming | `superpowers:brainstorming` | When facing design decisions not covered by App Spec |
| TDD | `superpowers:test-driven-development` | When implementing entities, validators, workers |
| Debugging | `superpowers:systematic-debugging` | When tests fail |
| Verification | `superpowers:verification-before-completion` | Before claiming a commit is done |
| Parallel agents | `superpowers:dispatching-parallel-agents` | When multiple independent commits can be worked on simultaneously |
| Plan mode | `superpowers:writing-plans` | When a phase has 5+ commits and needs coordination |

---

## §7. Conventions

- **Module folders:** plural, snake_case (`partnerships`, `logistics`)
- **Event IDs:** `module.entity.action` (singular entity, past tense: `partnerships.partner_agency.self_onboarded`)
- **Feature IDs:** `module.action` (`partnerships.manage`, `prm.widgets.wip-count`)
- **JS identifiers:** camelCase
- **DB columns:** snake_case
- **PKs:** UUID, explicit FKs, junction tables for M:N
- **API routes:** must export `openApi`
- **Validation:** all inputs with Zod in `data/validators.ts`
- **i18n:** no hardcoded user-facing strings — use `src/i18n/{locale}.json`
- **Types:** no `any` — use Zod schemas with `z.infer`
- **Cross-module:** FK IDs only, fetch separately. No direct ORM relationships between modules.
- **Pagination:** `pageSize <= 100` on all list routes

---

## §8. Development Commands

```bash
yarn dev              # Start dev server
yarn build            # Build
yarn typecheck        # Type check
yarn generate         # Regenerate module files (after adding/modifying module files)
yarn db:generate      # Generate database migrations
yarn db:migrate       # Apply migrations
yarn initialize       # Full initialization (seedDefaults + seedExamples)
yarn test             # Run tests
```

---

## §9. Anti-Patterns

Stop and re-evaluate if you find yourself:

- Building portal pages for users who need backend CRM access
- Writing custom notification subscribers instead of using workflows SEND_EMAIL
- Building custom state machines instead of using workflows module
- Writing CRUD routes that duplicate what `makeCrudRoute` already provides
- Adding features not in the App Spec
- Creating cross-module ORM relationships
- Hardcoding user-facing strings
- Writing more than 5 files for a single atomic commit (you probably missed a platform capability)
