# Ready Apps — Agent Guidelines

Build Open Mercato applications from App Specs. Each app follows the same process: business spec first, implementation specs second, code third.

## Repo Structure

```
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

## Task Router

| Task | Where to work | What to use |
|------|---------------|-------------|
| Define a new app (business analysis) | `app-specs/<app>/` | Mat skill + Piotr skill + template |
| Convert App Spec to implementation specs | `apps/<app>/docs/specs/` | This guide §2 + OM `spec-writing` skill |
| Implement a spec | `apps/<app>/src/modules/` | This guide §3 + OM `implement-spec` skill |
| Review implementation | `apps/<app>/` | OM `code-review` skill |
| Check platform capabilities | `app-specs/<app>/` | Piotr skill (fetches OM context on-demand) |

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

1. Pick the next phase from App Spec §7
2. Read the commit plans for that phase's workflows (`commits-WF*.md`)
3. For each atomic commit, write one implementation spec
4. Use the OM `spec-writing` skill (invoke via Skill tool) — adapt its output for app context

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
- **OM patterns reference compiled code** — point to `node_modules/@open-mercato/` for reference implementations.
- **No spec without a commit plan entry** — if it's not in `commits-WF*.md`, it shouldn't exist.

---

## §3. Implementing Specs

After a spec is written, implement it. Use the OM `implement-spec` skill (invoke via Skill tool).

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

When implementing, reference these patterns from the OM monorepo (`node_modules/@open-mercato/`):

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

**When you need to understand an OM pattern:** search `node_modules/@open-mercato/` for the compiled implementation. The `customers` module is the reference CRUD module.

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

Invoke these via the Skill tool at the appropriate moment:

| Task | Skill | When to invoke |
|------|-------|----------------|
| Writing implementation specs | `spec-writing` | Before coding each commit |
| Pre-implementation analysis | `pre-implement-spec` | Before complex commits (workers, workflows, multi-entity) |
| Implementing a spec | `implement-spec` | When coding each commit |
| Code review | `code-review` | After completing each phase |
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
