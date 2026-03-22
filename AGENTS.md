# Ready Apps — Agent Guidelines

Build Open Mercato applications from App Specs. Each app follows the same process: business spec first, implementation specs second, code third.

## Repo Structure

```
open-mercato/                    # OM monorepo (gitignored, local reference copy)
app-specs/<app-name>/            # Business analysis (App Spec + supporting docs)
apps/<app-name>/                 # Implementation (OM application code)
```

`app-specs/<app>/` is the business spec, `apps/<app>/` is the implementation. Same `<app>` name in both.

## OM Monorepo Reference

The OM monorepo lives at `open-mercato/` (gitignored — local reference copy). It provides:

1. **Platform skills** — `open-mercato/.ai/skills/<skill>/SKILL.md`. Read the file with Read tool, NOT the Skill tool.
2. **Reference implementations** — `open-mercato/packages/core/src/modules/`. The `customers` module is the canonical CRUD reference.
3. **Platform conventions** — `open-mercato/AGENTS.md`.

**Before any implementation work:** verify the monorepo is on `develop` and up to date:
```bash
cd open-mercato && git checkout develop && git pull
```

## Task Router

| Task | Where to work | What to read |
|------|---------------|--------------|
| Define a new app | `app-specs/<app>/` | Mat skill + Piotr skill + template |
| Write implementation specs | `apps/<app>/docs/specs/` | [docs/agent-guides/writing-specs.md](docs/agent-guides/writing-specs.md) |
| Implement a spec | `apps/<app>/src/modules/` | [docs/agent-guides/implementing.md](docs/agent-guides/implementing.md) + OM `implement-spec` skill |
| Review implementation | `apps/<app>/` | OM `code-review` skill |

---

## §1. Reading the App Spec

Before writing any spec or code, read these files in order:

1. **App Spec** — `app-specs/<app>/YYYY-MM-DD-app-spec-<app>.md`
   - §1: Business Context + Domain Model
   - §2: Identity Model
   - §3: Workflows
   - §7: Phasing + acceptance criteria

2. **Commit Plans** — `app-specs/<app>/piotr-notes/commits-WF*.md`

3. **Upstream Flags** — `app-specs/<app>/piotr-notes/upstream-flags.md`

4. **App-specific overrides** — `apps/<app>/AGENTS.md`

**The App Spec is the ceiling.** Do not invent features, entities, or workflows not in the App Spec.

---

## §2. OM Package Strategy

At the start of each session, determine how the app consumes `@open-mercato/*` packages:

1. **Check for open upstream PRs:** `gh pr list -R open-mercato/open-mercato --author matgren --state open`
2. **If no open PRs** -> use latest canary from npm:
   ```bash
   npm view @open-mercato/core versions --json | grep develop | tail -1
   ```
3. **If open PRs exist** -> use Verdaccio local build from the fix branch:
   - **Open, no review comments** -> build + publish to Verdaccio
   - **Open, has review comments** -> flag to user BEFORE starting any other work
   - **Merged but no canary yet** -> keep Verdaccio until canary is published
4. **Report to user:** "We're on [canary X / Verdaccio local 0.4.8]. PRs: [status]."

**Verdaccio workflow (local build):**
```bash
cd open-mercato && git checkout <fix-branch>
yarn build:packages && bash scripts/registry/publish.sh
# App:
yarn cache clean && rm -rf node_modules yarn.lock && yarn install
yarn generate && yarn reinstall
```

**Iteration loop (changed OM code):**
```bash
cd open-mercato && yarn build:packages && bash scripts/registry/publish.sh
cd ../apps/<app> && rm -rf node_modules/@open-mercato && yarn install --force && yarn reinstall
```

**Never patch `node_modules` manually.** Use Verdaccio.

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
