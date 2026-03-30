# Running Integration Tests (PRM)

## Quick start

```bash
cd apps/prm
npx mercato test integration
```

## Prerequisites

1. **Docker running** — verify with `docker info`, start with `open -a Docker`
2. **Official OM packages installed** — this is the default. If you are testing unpublished OM changes, start Verdaccio with `docker compose up -d verdaccio` from the OM monorepo and point the app at that registry before reinstalling dependencies.
3. **Playwright Chromium installed** — `npx playwright install chromium`
4. **`test:integration` script** in `package.json` must point directly to Playwright:
   ```json
   "test:integration": "npx playwright test --config .ai/qa/tests/playwright.config.ts"
   ```
   Do NOT set it to `"mercato test integration"` — this creates an infinite loop
   (the CLI internally calls `yarn run test:integration`, which re-invokes itself).

## Other commands

```bash
npx mercato test ephemeral            # Start ephemeral app only (manual QA, no test run)
npx mercato test coverage             # View HTML test report after a run
```

## Verifying DB health

The ephemeral env runs `yarn initialize` silently by default. If tests fail with
unexpected 403s or missing data, run with `--verbose` to see the full init output:

```bash
npx mercato test integration --verbose
```

Key log lines to look for in a healthy init:

- `Seeded custom role ACLs (N roles)` — confirms PR #1049 fix ran, custom roles have features
- `[partnerships.seedExamples] Agency "Acme Digital (Demo)" seeded` — demo users created
- `Module defaults seeded` — all module seedDefaults completed

If `Seeded custom role ACLs` is missing, your installed `@open-mercato/cli` build may not include
the needed fix yet. If the fix is not in the current official release, switch the app to a local
OM build via Verdaccio and reinstall dependencies.

## RBAC gotcha: UserAcl overrides RoleAcl

The platform's RBAC is **exclusive**: if a `UserAcl` record exists for a user, `RoleAcl`
is completely skipped. This means:

- If you create a `UserAcl` for org restriction (`organizationsJson`), you **must** also
  populate `featuresJson` — otherwise the user gets zero features and 403 on everything.
- The `seedUser` function in `setup.ts` handles this by copying features from the role's
  `RoleAcl` into the `UserAcl` at seed time.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Infinite loop at "Ensuring Playwright Chromium" | Fix the `test:integration` script (see Prerequisites #4) |
| "Waiting for another process" hangs | `rm -rf .ai/qa/ephemeral-env.lock .ai/qa/ephemeral-env.json` |
| Stale ephemeral env on port 5001 | `lsof -ti:5001 \| xargs kill -9` then remove the json/lock files |
| Stale build cache (old DB init) | `rm -f .ai/qa/ephemeral-build-cache.json` |
| Docker daemon not running | `open -a Docker`, wait, verify with `docker info` |
| Using local OM build but Verdaccio not running | `cd open-mercato && docker compose up -d verdaccio` |
| All tests return 403 | Check RBAC gotcha above — UserAcl may have empty featuresJson |
| Unexpected 500s on API calls | Run with `--verbose` and check server logs for stack traces |

## Clean slate run

When in doubt, nuke all cached state and start fresh:

```bash
rm -rf .ai/qa/ephemeral-env.lock .ai/qa/ephemeral-env.json .ai/qa/ephemeral-build-cache.json
lsof -ti:5001 | xargs kill -9 2>/dev/null
npx mercato test integration
```

## Verifying the OM package version

To confirm you're running against the correct `@$OM_REPO/*` build:

```bash
cat node_modules/@open-mercato/cli/package.json | grep '"version"'
cat .npmrc   # Only when using Verdaccio; should show @open-mercato:registry=http://localhost:4873
```

If there is no project `.npmrc` override, you are most likely using the official npm releases.
