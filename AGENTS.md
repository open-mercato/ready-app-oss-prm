# Ready Apps — Agent Guidelines

Build Open Mercato applications from App Specs. Each app follows the same process: business spec first, implementation specs second, code third.

## Repo Structure

```
skills/                          # Shared AI skills (Mat, Piotr, Krug) + templates
$OM_REPO/                        # OM monorepo (resolved: env var → ./open-mercato/ → .cache/)
apps/<app-name>/                 # Ready app (code + app-spec + docs)
  app-spec/                      # Business analysis (forkable, drives AI-assisted dev)
  src/modules/                   # Application code
  docs/specs/                    # Implementation specs
```

Each app is self-contained: code, spec, and docs live together in `apps/<app>/`.

## OM Monorepo Reference

The OM monorepo is referenced as `$OM_REPO` throughout this repo. It provides:

1. **Platform skills** — `$OM_REPO/.ai/skills/<skill>/SKILL.md`. Read the file with Read tool, NOT the Skill tool.
2. **Reference implementations** — `$OM_REPO/packages/core/src/modules/`. The `customers` module is the canonical CRUD reference.
3. **Platform conventions** — `$OM_REPO/AGENTS.md`.

**`$OM_REPO` resolution** — check in order, use the first that exists:
1. `$OM_REPO` env var (if set)
2. `./open-mercato/` in repo root (if exists)
3. `.cache/open-mercato/` (clone from GitHub if neither above exists)

**Before any implementation work:** verify `$OM_REPO` is on `develop` and up to date:
```bash
cd "$OM_REPO" && git checkout develop && git pull
```

## Task Router

| Task | Where to work | What to read |
|------|---------------|--------------|
| Define a new app | `apps/<app>/app-spec/` | `skills/` (Mat + Piotr + Krug) + template |
| Write implementation specs | `apps/<app>/docs/specs/` | [docs/agent-guides/writing-specs.md](docs/agent-guides/writing-specs.md) |
| Implement a spec | `apps/<app>/src/modules/` | [docs/agent-guides/implementing.md](docs/agent-guides/implementing.md) + OM `implement-spec` skill |
| Review implementation | `apps/<app>/` | OM `code-review` skill |

---

## §1. Reading the App Spec

Before writing any spec or code, read these files in order:

1. **App Spec** — `apps/<app>/app-spec/app-spec.md`
   - §1: Business Context + Domain Model
   - §2: Identity Model
   - §3: Workflows
   - §7: Phasing + acceptance criteria

2. **Commit Plans** — `apps/<app>/app-spec/piotr-notes/commits-WF*.md`

3. **Upstream Flags** — `apps/<app>/app-spec/piotr-notes/upstream-flags.md`

4. **App-specific overrides** — `apps/<app>/AGENTS.md`

**The App Spec is the ceiling.** Do not invent features, entities, or workflows not in the App Spec.

---

## §2. OM Package Strategy

The OM monorepo is at `$OM_REPO` (see resolution order in §OM Monorepo Reference above).

Default to official `@open-mercato/*` npm releases for app development. Use Verdaccio only when you explicitly need unpublished OM changes from a branch or open PR.

1. **If your task depends on unpublished upstream changes, check for open PRs:** `gh pr list -R open-mercato/open-mercato --author matgren --state open`
2. **If any PR has review comments** -> flag to user BEFORE starting any other work
3. **Report to user:** "We're on [official npm release / branch X via Verdaccio]. PRs: [status]."

**Default app install (official npm releases):**
```bash
cd apps/<app> && yarn install && yarn reinstall
```

**Verdaccio exception (local OM build):**
```bash
cd "$OM_REPO" && git checkout <branch-with-changes> && git pull
yarn build:packages && bash scripts/registry/publish.sh
```

**App install (after Verdaccio publish):**
```bash
cd apps/<app> && rm -rf node_modules/@open-mercato && yarn install --force && yarn reinstall
```

**Never patch `node_modules` manually.** If you need unpublished platform changes, publish them to Verdaccio. Otherwise stay on official releases.

---

## §3. Conventions

- **Module folders:** plural, snake_case (e.g., `partnerships`). Acronyms OK (e.g., `prm`).
- **Event IDs:** `module.entity.action` (singular entity, past tense: `catalog.product.created`)
- **Feature IDs:** `module.action` (e.g., `catalog.manage`)
- **JS identifiers:** camelCase
- **DB columns:** snake_case
- **PKs:** UUID, explicit FKs, junction tables for M:N
- **API routes:** must export `openApi`
- **Validation:** all inputs with Zod in `data/validators.ts`
- **i18n:** no hardcoded user-facing strings — use `src/i18n/{locale}.json`
- **Types:** no `any` — use Zod schemas with `z.infer`
- **Cross-module:** FK IDs only, fetch separately. No direct ORM relationships between modules.
- **Pagination:** `pageSize <= 100` on all list routes
- **App Spec naming:** always `app-spec.md` inside `apps/<app>/app-spec/`. No dates in filenames — use git history for versioning. One main spec per app.

---

## §4. Development Commands

```bash
yarn dev                              # Start dev server
yarn build                            # Build
yarn typecheck                        # Type check
yarn generate                         # Regenerate module files (after adding/modifying module files)
yarn db:generate                      # Generate database migrations
yarn db:migrate                       # Apply migrations
yarn initialize                       # Full initialization (seedDefaults + seedExamples)
yarn test                             # Run unit tests
yarn test:integration                 # Run Playwright integration tests (fresh ephemeral app + DB)
yarn test:integration:ephemeral       # Start ephemeral app only (QA exploration, no test run)
yarn test:integration:report          # View HTML test report
```

---

## §5. Anti-Patterns

Stop and re-evaluate if you find yourself:

- Building portal pages for users who need backend CRM access
- Writing custom notification subscribers instead of using workflows SEND_EMAIL
- Building custom state machines instead of using workflows module
- Writing CRUD routes that duplicate what `makeCrudRoute` already provides
- Adding features not in the App Spec
- Creating cross-module ORM relationships
- Hardcoding user-facing strings
- Writing more than 5 files for a single atomic commit (you probably missed a platform capability)
