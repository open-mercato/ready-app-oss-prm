# PRM Playwright Functional Tests

## Context

The B2B PRM example app (`starter-b2b-prm`) is heading toward production. It needs Playwright e2e tests covering the critical PRM workflows to validate the app works end-to-end after setup.

This is the first phase (functional baseline). A full test suite (Approach 1 — all PRM workflows including KPI import, WIC runs, MIN attribution, RFP lifecycle, partner portal CRUD) will follow once features are polished.

## Test Infrastructure

### Standalone Playwright Config

Since this app lives outside the OM monorepo, we cannot use the monorepo's `discoverIntegrationSpecFiles()` or shared helpers from `@open-mercato/core`. We need a standalone config.

> **Note:** When this example is moved to the `open-mercato/examples` repository, the Playwright config and helpers should be refactored to integrate with the monorepo's shared QA infrastructure (`.ai/qa/tests/playwright.config.ts`, `@open-mercato/core/modules/core/__integration__/helpers/*`). The standalone setup here is a temporary bridge.

**Files:**
- `playwright.config.ts` — root config
- `src/modules/partnerships/__integration__/helpers/auth.ts` — login helper (based on `create-app` template pattern)
- `src/modules/partnerships/__integration__/helpers/api.ts` — API auth + request helper

**Config settings** (aligned with OM monorepo policy):
- `testDir`: `src/modules/partnerships/__integration__`
- `baseURL`: `process.env.BASE_URL || 'http://localhost:3000'`
- `timeout`: 20,000ms
- `expect.timeout`: 20,000ms
- `retries`: 1
- `workers`: 1 (sequential)
- `headless`: true
- Reports: list + HTML to `test-results/`

**package.json additions:**
- `@playwright/test` as devDependency
- Script: `"test:e2e": "npx playwright test"`

### Auth Helper

Based on `packages/create-app/template/src/modules/auth/__integration__/helpers/auth.ts`:
- `login(page, email?, password?)` — navigates to `/login`, fills credentials, waits for `/backend`
- Default credentials: `admin@acme.com` / `secret`

### API Helper

Based on monorepo's `.ai/qa/tests/helpers/api.ts`:
- `getAuthToken(request, role?)` — POST to `/api/auth/login`, return JWT
- `apiRequest(request, method, path, options?)` — authenticated API call

## Test Cases

| Test ID | Title | Type | Priority | What it proves |
|---------|-------|------|----------|----------------|
| TC-PRM-001 | Seed validation | API | High | Tiers (Bronze/Silver/Gold), partner roles, and demo agency seeded correctly after `yarn initialize` |
| TC-PRM-002 | Tier CRUD | API | High | Create, read, update, delete tier definitions via API |
| TC-PRM-003 | Agency listing | API | High | List agencies endpoint works, demo agency present |
| TC-PRM-004 | KPI dashboard | API | High | Dashboard endpoint returns expected data structure |
| TC-PRM-005 | Admin navigation | UI | High | Login as admin, navigate to partnerships pages (agencies, tiers, KPI) |
| TC-PRM-006 | Tier management UI | UI | High | Create a tier via backend UI, verify in list, clean up |
| TC-PRM-007 | Partner portal access | UI | High | Portal pages load (dashboard, KPI, RFP, case studies) |

### Test Rules (aligned with OM AGENTS.md)

- One `.spec.ts` file per test case
- Use Playwright locators: `getByRole`, `getByLabel`, `getByText` — avoid CSS selectors
- Tests are independent — each handles its own login
- Tests are data-independent — create fixtures via API, clean up in `finally`/teardown
- Exception: TC-PRM-001 validates seeded data (by design — it tests the seed)
- Deterministic across retries and run order

## File Manifest

| Action | Path |
|--------|------|
| Create | `playwright.config.ts` |
| Create | `src/modules/partnerships/__integration__/helpers/auth.ts` |
| Create | `src/modules/partnerships/__integration__/helpers/api.ts` |
| Create | `src/modules/partnerships/__integration__/TC-PRM-001-seed-validation.spec.ts` |
| Create | `src/modules/partnerships/__integration__/TC-PRM-002-tier-crud.spec.ts` |
| Create | `src/modules/partnerships/__integration__/TC-PRM-003-agency-listing.spec.ts` |
| Create | `src/modules/partnerships/__integration__/TC-PRM-004-kpi-dashboard.spec.ts` |
| Create | `src/modules/partnerships/__integration__/TC-PRM-005-admin-navigation.spec.ts` |
| Create | `src/modules/partnerships/__integration__/TC-PRM-006-tier-management-ui.spec.ts` |
| Create | `src/modules/partnerships/__integration__/TC-PRM-007-partner-portal-access.spec.ts` |
| Modify | `package.json` (add `@playwright/test`, `test:e2e` script) |
| Modify | `.gitignore` (add `test-results/`) |
| Modify | `README.md` (add testing section with migration note) |

## Verification

After implementation:
1. `yarn install` installs Playwright
2. `npx playwright install chromium` installs browser
3. App running on localhost:3000 (or `BASE_URL`)
4. `yarn test:e2e` runs all 7 tests
5. All pass with seeded demo data
