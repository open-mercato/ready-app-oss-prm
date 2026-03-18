# Phase 0 — SPEC-062 Framework Validation Gaps

Date: 2026-03-18
Branch: `validate/spec-062-starter-framework` (PR #1003 `feat/official-modules`)

## Summary

**SPEC-062 framework is validated with workarounds.** The core flow works:
`create-mercato-app` → copy module → register → generate → initialize → module works.

4 gaps found, 1 blocker (workaround applied).

---

## Gap #1: Docker container name conflicts (inconvenience)

**Expected:** `docker compose up -d` in standalone app starts its own containers.
**Actual:** Container names (`mercato-postgres`, `mercato-redis`, `mercato-meilisearch`) conflict with any existing OM monorepo containers.
**Impact:** Developer running both monorepo and standalone app on same machine gets conflicts.
**Workaround:** Reuse existing containers (they share the same DB, which works for dev but not for isolation).
**Suggested fix:** Use project-name-scoped container names in standalone app template, or document that standalone app shares infra with monorepo.

## Gap #2: Registry not configured for Verdaccio (inconvenience)

**Expected:** `create-mercato-app` scaffolded app should be installable from the registry used to scaffold.
**Actual:** `.yarnrc.yml` only has `nodeLinker: node-modules`. No `npmScopes` config for `@open-mercato`. `yarn install` tries public npm and fails if packages aren't published there.
**Impact:** Local testing with Verdaccio requires manual `.yarnrc.yml` configuration.
**Workaround:** Manually add `npmScopes.open-mercato.npmRegistryServer` to `.yarnrc.yml`.
**Suggested fix:** `create-mercato-app` should detect if it was fetched from a custom registry and propagate that config to the scaffolded app's `.yarnrc.yml`.

## Gap #3: Corepack downloads Yarn 1.x instead of 4.x (inconvenience)

**Expected:** Standalone app uses Yarn 4 (Berry) matching monorepo.
**Actual:** Corepack downloaded Yarn 1.22.22 (Classic). Install succeeded but lockfile format differs.
**Impact:** Different Yarn behavior, potential lockfile inconsistencies.
**Workaround:** Install worked anyway with Yarn Classic.
**Suggested fix:** Add `"packageManager": "yarn@4.x.x"` to standalone app template `package.json`.

## Gap #4: `yarn generate` doesn't create `module-package-sources.css` (blocker)

**Expected:** `yarn generate` (or `yarn initialize`) creates `.mercato/generated/module-package-sources.css`.
**Actual:** `yarn generate` runs all generators but skips `generateModulePackageSources`. The file is only created during `mercato init` (initialize), but even then it wasn't generated. Template's `globals.css` imports this file via `@import`, causing Tailwind/PostCSS compilation failure and HTTP 500 on all pages.
**Impact:** Standalone app cannot render ANY page until this is fixed.
**Workaround:** Comment out the `@import` line in `src/app/globals.css`.
**Suggested fix:** Either:
  1. Include `generateModulePackageSources` in the `generate:all` command output, OR
  2. Ship an empty `module-package-sources.css` in the template, OR
  3. Make the `@import` conditional/optional

## Gap #5: `yarn initialize` refuses re-init without `--reinstall` (inconvenience)

**Expected:** Adding a new module and running `yarn initialize` should apply new setup hooks.
**Actual:** `yarn initialize` aborts with "found 3 existing user(s)" if DB was already initialized.
**Impact:** After copying a module with `setup.ts`, developer must run `yarn mercato init --reinstall` which drops and recreates all data.
**Workaround:** Use `--reinstall` flag.
**Suggested fix:** Provide an incremental setup mode that applies new module setup hooks without wiping existing data. Or document this clearly in starter README.

---

## Verified Working

- `create-mercato-app` scaffolds correctly from Verdaccio
- Module auto-discovery via `yarn generate` works for `@app` modules
- Backend page routing (`/backend/hello`) works
- Sidebar navigation group and page link appear
- `page.meta.ts` features (`requireAuth`, `requireFeatures`) enforced
- `setup.ts` `defaultRoleFeatures` applied during initialize
- ACL feature `hello.view` registered

## Conclusion

**SPEC-062 framework is validated.** The template repo model works. Gaps are real but non-blocking for Phase 1 (PRM domain code). Gap #4 should be reported to PR #1003 as a bug.
