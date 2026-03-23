# Implementing Specs

After a spec is written and reviewed, implement it. Read `open-mercato/.ai/skills/implement-spec/SKILL.md` for the OM implementation workflow, then follow the per-commit loop below.

## Pre-Implementation Cleanup

Before the first domain commit of any new app scaffolded from `create-mercato-app`:
- Remove the `example` module from `src/modules/` (scaffold boilerplate)
- Remove empty module directories (e.g., `auth/` if not customized)
- Strip `modules.ts` to only modules listed in App Spec §4.5 Module Architecture
- Remove corresponding imports from `layout.tsx` (e.g., AiAssistant, third-party analytics scripts)
- If existing DB has migrations for removed modules, start with a fresh DB (`yarn reinstall`)
- Verify only domain modules from the App Spec remain in `src/modules/`
- Commit as: `chore(<app>): remove scaffold boilerplate`

This is a prerequisite, not a domain commit — it does not count toward the phase commit total.

## Per-Commit Loop

```
1.  Read the implementation spec
2.  Implement the code
3.  yarn generate                (if module files changed)
4.  yarn typecheck               (must pass)
5.  yarn build                   (must pass)
6.  Unit tests — for every new function/module with business logic:
    - Colocate with source: src/modules/<module>/**/*.test.ts
    - Test happy path + key edge cases + error paths
    - Mock external dependencies (DI services, data engine)
    - Run: yarn test
7.  If spec has Test Scenarios -> implement Playwright integration tests
    - Read open-mercato/.ai/skills/integration-tests/SKILL.md for conventions
    - Place tests in src/modules/<module>/__integration__/TC-*.spec.ts
    - Tests MUST be self-contained: create fixtures in setup, clean up in teardown
    - Tests MUST NOT rely on seeded/demo data
    - Run: yarn test:integration
    - See "Integration Test Infrastructure" below for pitfalls
8.  Check acceptance criteria from the spec
9.  Commit
```

## Integration Test Infrastructure

Do NOT create custom test helpers, fixture utilities, or playwright configs from scratch. The OM platform provides everything.

**Playwright config** — every app MUST have `.ai/qa/tests/playwright.config.ts`. The CLI hardcodes this path. Copy the pattern from OM monorepo but use canary imports:
- `discoverIntegrationSpecFiles` from `@open-mercato/cli/lib/testing/integration-discovery`
- Apps with `"type": "module"` need an ESM-compatible `__dirname` polyfill: `const __dirname = path.dirname(fileURLToPath(import.meta.url))` (import `fileURLToPath` from `node:url`)
- If `yarn test:integration` starts the server but never runs tests, this file is missing

**`test:integration` script** — the CLI internally runs `yarn test:integration` to execute Playwright. This script MUST point directly to Playwright, NOT back to `mercato test integration` (causes infinite recursion). Correct value:
```json
"test:integration": "npx playwright test --config .ai/qa/tests/playwright.config.ts"
```

**Test helpers** — import from `@open-mercato/core/helpers/integration/*`:
- `api` — `getAuthToken`, `apiRequest`
- `generalFixtures` — `readJsonSafe`, `expectId`, `getTokenContext`, `deleteGeneralEntityIfExists`
- `authFixtures` — `createUserFixture`, `deleteUserIfExists`
- `crmFixtures` — `createCompanyFixture`, `createDealFixture`, `deleteEntityIfExists`

**Test discovery** — place tests in `src/modules/<module>/__integration__/TC-*.spec.ts`. CLI discovers them automatically.

**Never** write custom `apiRequest`, `getAuthToken`, or fixture helpers. If a helper doesn't exist in the canary build, contribute it upstream.

## Commit Message Format

```
feat(<module>): {what this commit delivers}

Implements: {app-spec-ref} US-{X.Y}
Phase: {N}, Commit: {M}
Pattern: {OM pattern used}
```

## Phase Completion

After all commits in a phase are done:

1. Run `yarn initialize` to test full bootstrap (seedDefaults + seedExamples)
2. Run `yarn test:integration` — all integration tests for the phase must pass
3. Verify ALL acceptance criteria from App Spec §7 for this phase (both domain and business)
4. Use `code-review` skill for phase review
5. Update `apps/<app>/docs/specs/` with any learnings
