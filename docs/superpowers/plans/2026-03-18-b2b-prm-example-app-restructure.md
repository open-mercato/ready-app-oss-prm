# B2B PRM Example App Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape `starter-b2b-prm` from a module-source-only repo into a complete, runnable Open Mercato example app aligned with SPEC-068.

**Architecture:** Copy the verified scaffold from test-prm into starter-b2b-prm, remove demo modules and irrelevant dependencies, wire seed env vars into setup.ts, and update documentation to reflect example app identity.

**Tech Stack:** Next.js 16, Open Mercato 0.4.8, MikroORM, PostgreSQL (pgvector), Redis, Meilisearch, Docker Compose

**Spec:** `docs/superpowers/specs/2026-03-18-b2b-prm-example-app-restructure-design.md`

---

### Task 1: Clean starter-b2b-prm — remove dev artifacts and hello module

**Files:**
- Delete: `PHASE0-GAPS.md`
- Delete: `PHASE1B-RESULTS.md`
- Delete: `modules.ts.snippet`
- Delete: `src/modules/hello/`

- [ ] **Step 1: Delete dev artifact files**

```bash
cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm
rm PHASE0-GAPS.md PHASE1B-RESULTS.md modules.ts.snippet
rm -rf src/modules/hello
```

- [ ] **Step 2: Verify only partnerships module and docs remain**

```bash
ls -la
ls -la src/modules/
```

Expected: root has only `README.md`, `src/`, `docs/`, `.git/`. `src/modules/` has only `partnerships/`.

- [ ] **Step 3: Commit**

```bash
git rm PHASE0-GAPS.md PHASE1B-RESULTS.md modules.ts.snippet
git rm -rf src/modules/hello
git commit -m "chore: remove dev artifacts and hello module"
```

---

### Task 2: Copy scaffold root files from test-prm

**Files:**
- Copy from test-prm: `package.json`, `yarn.lock`, `.yarnrc.yml`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `components.json`, `.dockerignore`, `.gitignore`

- [ ] **Step 1: Copy root config files**

```bash
cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm
cp /Users/maciejgren/Documents/OM-PRM/test-prm/package.json .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/yarn.lock .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/.yarnrc.yml .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/next.config.ts .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/tsconfig.json .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/postcss.config.mjs .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/components.json .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/.dockerignore .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/.gitignore .
```

- [ ] **Step 2: Clean package.json — update name, remove irrelevant deps**

Edit `package.json`:
- Change `"name"` from `"test-prm"` to `"b2b-prm-example"`
- Remove from `dependencies`:
  - `"newrelic": "^13.7.0"`
  - `"pdf2pic": "^3.2.0"`
  - `"react-big-calendar": "^1.19.4"`
  - `"@stripe/react-stripe-js": "^3.9.0"`
  - `"@stripe/stripe-js": "^7.8.0"`
  - `"@open-mercato/gateway-stripe": "0.4.8"`
- In `scripts.start`, change `"NODE_OPTIONS='-r newrelic' mercato server start"` to `"mercato server start"`

- [ ] **Step 3: Verify package.json is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add package.json yarn.lock .yarnrc.yml next.config.ts tsconfig.json postcss.config.mjs components.json .dockerignore .gitignore
git commit -m "feat: add scaffold root files from test-prm, clean dependencies"
```

---

### Task 3: Copy Docker infrastructure from test-prm

**Files:**
- Copy from test-prm: `Dockerfile`, `docker-compose.yml`, `docker-compose.fullapp.yml`, `docker-compose.fullapp.dev.yml`, `docker/scripts/dev-entrypoint.sh`

- [ ] **Step 1: Copy Docker files**

```bash
cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm
cp /Users/maciejgren/Documents/OM-PRM/test-prm/Dockerfile .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/docker-compose.yml .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/docker-compose.fullapp.yml .
cp /Users/maciejgren/Documents/OM-PRM/test-prm/docker-compose.fullapp.dev.yml .
mkdir -p docker/scripts
cp /Users/maciejgren/Documents/OM-PRM/test-prm/docker/scripts/dev-entrypoint.sh docker/scripts/
```

- [ ] **Step 2: Verify docker-compose.yml parses**

```bash
docker compose config --quiet 2>&1 && echo "OK" || echo "FAIL"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml docker-compose.fullapp.yml docker-compose.fullapp.dev.yml docker/
git commit -m "feat: add Docker infrastructure from test-prm"
```

---

### Task 4: Copy app source from test-prm (excluding modules)

**Files:**
- Copy from test-prm: `src/app/`, `src/components/`, `src/lib/`, `src/i18n/`, `src/bootstrap.ts`, `src/di.ts`, `src/proxy.ts`, `public/`, `types/`

- [ ] **Step 1: Copy src directories (excluding modules)**

```bash
cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm
cp -R /Users/maciejgren/Documents/OM-PRM/test-prm/src/app src/
cp -R /Users/maciejgren/Documents/OM-PRM/test-prm/src/components src/
cp -R /Users/maciejgren/Documents/OM-PRM/test-prm/src/lib src/
cp -R /Users/maciejgren/Documents/OM-PRM/test-prm/src/i18n src/
cp /Users/maciejgren/Documents/OM-PRM/test-prm/src/bootstrap.ts src/
cp /Users/maciejgren/Documents/OM-PRM/test-prm/src/di.ts src/
cp /Users/maciejgren/Documents/OM-PRM/test-prm/src/proxy.ts src/
```

- [ ] **Step 2: Copy public and types directories**

```bash
cp -R /Users/maciejgren/Documents/OM-PRM/test-prm/public .
cp -R /Users/maciejgren/Documents/OM-PRM/test-prm/types .
```

- [ ] **Step 3: Remove react-big-calendar type declaration** (dependency was removed)

```bash
rm types/react-big-calendar/index.d.ts
rmdir types/react-big-calendar 2>/dev/null || true
```

- [ ] **Step 4: Verify src structure**

```bash
find src -maxdepth 2 -type f | sort
```

Expected: `src/app/`, `src/components/`, `src/lib/`, `src/i18n/`, `src/bootstrap.ts`, `src/di.ts`, `src/proxy.ts` present. No `src/modules.ts` yet (next task). `src/modules/partnerships/` already present from before.

- [ ] **Step 5: Commit**

```bash
git add src/app src/components src/lib src/i18n src/bootstrap.ts src/di.ts src/proxy.ts public types
git commit -m "feat: add app source, public assets, and type declarations from test-prm"
```

---

### Task 5: Create cleaned modules.ts

**Files:**
- Create: `src/modules.ts`
- Create: `src/modules/.gitkeep`

- [ ] **Step 1: Write modules.ts**

Create `src/modules.ts` with the following content:

```typescript
// Central place to enable modules and their source.
// - id: module id (plural snake_case; special cases: 'auth')
// - from: '@open-mercato/core' | '@app' | custom alias/path in future
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

export type ModuleEntry = { id: string; from?: '@open-mercato/core' | '@app' | string }

export const enabledModules: ModuleEntry[] = [
  // Core infrastructure
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'auth', from: '@open-mercato/core' },
  { id: 'entities', from: '@open-mercato/core' },
  { id: 'configs', from: '@open-mercato/core' },
  { id: 'query_index', from: '@open-mercato/core' },
  // Customer identity & portal
  { id: 'customer_accounts', from: '@open-mercato/core' },
  { id: 'portal', from: '@open-mercato/core' },
  { id: 'customers', from: '@open-mercato/core' },
  { id: 'notifications', from: '@open-mercato/core' },
  // Operations support
  { id: 'dashboards', from: '@open-mercato/core' },
  { id: 'workflows', from: '@open-mercato/core' },
  { id: 'attachments', from: '@open-mercato/core' },
  { id: 'audit_logs', from: '@open-mercato/core' },
  { id: 'dictionaries', from: '@open-mercato/core' },
  { id: 'feature_toggles', from: '@open-mercato/core' },
  { id: 'business_rules', from: '@open-mercato/core' },
  { id: 'events', from: '@open-mercato/events' },
  { id: 'scheduler', from: '@open-mercato/scheduler' },
  // PRM domain
  { id: 'partnerships', from: '@app' },
]

const enterpriseModulesEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES, false)
const enterpriseSsoEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SSO, false)

if (enterpriseModulesEnabled) {
  enabledModules.push(
    { id: 'record_locks', from: '@open-mercato/enterprise' },
    { id: 'system_status_overlays', from: '@open-mercato/enterprise' },
  )
}

if (enterpriseModulesEnabled && enterpriseSsoEnabled) {
  enabledModules.push({ id: 'sso', from: '@open-mercato/enterprise' })
}
```

- [ ] **Step 2: Ensure .gitkeep exists**

```bash
touch src/modules/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add src/modules.ts src/modules/.gitkeep
git commit -m "feat: add cleaned modules.ts — 18 core + partnerships, no demo modules"
```

---

### Task 6: Create cleaned .env.example with PRM seed config

**Files:**
- Create: `.env.example` (based on test-prm, sections removed, seed vars added)

- [ ] **Step 1: Copy .env.example from test-prm**

```bash
cp /Users/maciejgren/Documents/OM-PRM/test-prm/.env.example .
```

- [ ] **Step 2: Remove irrelevant sections**

Remove these sections from `.env.example`:
- Lines 184-197: OCR Configuration section (entire block)
- Lines 199-225: Stripe Integration section (entire block)
- Lines 227-278: Akeneo Sync section (entire block)
- Lines 301-320: InboxOps Configuration section (entire block)

Also remove:
- Line 64: `NODE_EXTRA_CA_CERTS=./certs/geotrust-ev-rsa-ca-g2.pem` (Raiffeisen-specific)

- [ ] **Step 3: Add PRM seed config section**

Add the following section at the end of `.env.example`, before the Meilisearch section:

```env
# ============================================================================
# PRM Example Seed Configuration
# ============================================================================
# Seed profile controls which demo fixtures are created during yarn initialize.
# Profiles: demo_agency (default — seeds sample agencies, tiers, KPIs)
OM_PRM_SEED_PROFILE=demo_agency

# Set to false to skip demo data during yarn initialize (structural defaults only)
OM_SEED_EXAMPLES=true
```

- [ ] **Step 4: Verify .env.example has no Stripe/Akeneo/OCR/InboxOps references**

```bash
grep -c -i -E 'stripe|akeneo|inbox_ops|ocr_model' .env.example
```

Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "feat: add cleaned .env.example with PRM seed config vars"
```

---

### Task 7: Wire seed env vars into partnerships/setup.ts

**Files:**
- Modify: `src/modules/partnerships/setup.ts`

- [ ] **Step 1: Update setup.ts to read OM_SEED_EXAMPLES**

In `src/modules/partnerships/setup.ts`, wrap the `seedDefaults` body with the env var check. The `seedDefaults` function should become:

```typescript
seedDefaults: async (ctx) => {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  // Structural defaults always seed (tiers + roles are required for PRM to function)
  await seedTierDefaults(ctx.em, scope)
  await seedPartnerRoles(ctx.em, scope)

  // Example data only seeds when OM_SEED_EXAMPLES is not explicitly false
  const seedExamples = process.env.OM_SEED_EXAMPLES !== 'false'
  if (seedExamples) {
    await seedExampleAgencies(ctx.em, scope)
  }
},
```

- [ ] **Step 2: Add seedExampleAgencies function**

Add above the `export const setup` block in `setup.ts`:

```typescript
async function seedExampleAgencies(em: EntityManager, scope: SeedScope) {
  const profile = process.env.OM_PRM_SEED_PROFILE || 'demo_agency'
  if (profile !== 'demo_agency') return

  const existing = await em.count(PartnerAgency, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  if (existing > 0) return

  // PartnerAgency requires agencyOrganizationId (UUID referencing a CRM organization).
  // For demo seeding, we create a deterministic UUID from the org scope so re-runs are idempotent.
  const { randomUUID } = await import('node:crypto')
  const demoAgencyOrgId = randomUUID()

  const demoAgency = em.create(PartnerAgency, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    agencyOrganizationId: demoAgencyOrgId,
    name: 'Demo Agency',
    status: 'active',
  })
  em.persist(demoAgency)
  await em.flush()
}
```

Also add `PartnerAgency` to the existing import at the top of the file (line 3):

```typescript
import { PartnerTierDefinition, PartnerAgency } from './data/entities'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
yarn typecheck 2>&1 | head -30
```

Expected: no errors related to `setup.ts`. Errors about missing `.mercato/generated/` imports are expected if `yarn generate` has not run yet — those are safe to ignore.

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/setup.ts
git commit -m "feat: wire OM_SEED_EXAMPLES and OM_PRM_SEED_PROFILE into setup.ts"
```

---

### Task 8: Update documentation — README.md, AGENTS.md, CLAUDE.md

**Files:**
- Rewrite: `README.md`
- Copy + Update: `AGENTS.md` (from test-prm)
- Copy: `CLAUDE.md` (from test-prm)

- [ ] **Step 1: Write new README.md**

```markdown
# B2B PRM Example — Open Mercato

A complete, runnable B2B Partner Relationship Management application built on the Open Mercato platform. This example demonstrates how to build a vertical PRM solution using UMES (Universal Mercato Extension System).

Aligned with [SPEC-053](https://github.com/open-mercato/open-mercato/blob/main/.ai/specs/SPEC-053-2026-03-02-b2b-prm-starter.md) and the [Use-Case Examples Framework (SPEC-068)](https://github.com/open-mercato/open-mercato/blob/main/.ai/specs/SPEC-068-2026-03-02-use-case-examples-framework.md).

## What's Included

- **Partnerships module** (`src/modules/partnerships/`) — agencies, tier governance, KPIs (WIC/WIP/MIN), RFP campaigns, partner portal
- **18 core modules** from `@open-mercato/core` and ecosystem packages
- **Docker Compose** setup for PostgreSQL, Redis, and Meilisearch
- **Seed data** for demo agencies, tier definitions, and partner roles

## Prerequisites

- Node.js >= 24 (via [corepack](https://nodejs.org/api/corepack.html))
- Docker & Docker Compose

## Quick Start

```bash
# Start infrastructure services
docker compose up -d

# Install dependencies
yarn install

# Initialize database (migrations + seed data)
yarn initialize

# Start development server
yarn dev
```

Open http://localhost:3000

## Seed Configuration

| Env Var | Purpose | Default |
|---------|---------|---------|
| `OM_PRM_SEED_PROFILE` | Which demo fixtures to seed (`demo_agency`) | `demo_agency` |
| `OM_SEED_EXAMPLES` | Seed demo data during `yarn initialize` | `true` |

Set `OM_SEED_EXAMPLES=false` in `.env` to skip demo data and seed only structural defaults (tier definitions, partner roles).

## Development

```bash
yarn dev          # Start dev server
yarn generate     # Regenerate .mercato/generated/ files
yarn db:generate  # Generate new migration
yarn db:migrate   # Run pending migrations
yarn typecheck    # Type check
yarn lint         # Lint
yarn test         # Run tests
```

## Docker (Full App)

Run the entire stack (app + services) in Docker:

```bash
docker compose -f docker-compose.fullapp.yml up
```

## License

See the Open Mercato license terms.
```

- [ ] **Step 2: Copy and update AGENTS.md**

```bash
cp /Users/maciejgren/Documents/OM-PRM/test-prm/AGENTS.md .
```

Then edit `AGENTS.md`:
- Change the title from "Standalone Open Mercato Application" to "B2B PRM Example — Open Mercato Application"
- In the Architecture section, add after "This is a Next.js 16 application...":
  `This example app demonstrates the B2B Partner Relationship Management use case per SPEC-053/SPEC-068.`
- In Module Development section, remove any references to `example` or `hello` modules

- [ ] **Step 3: Copy CLAUDE.md**

```bash
cp /Users/maciejgren/Documents/OM-PRM/test-prm/CLAUDE.md .
```

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md CLAUDE.md
git commit -m "docs: rewrite README, update AGENTS.md for PRM example app identity"
```

---

### Task 9: Verification — install, generate, and smoke test

**Files:** None (verification only)

**Prerequisites:** Docker must be running.

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/maciejgren/Documents/OM-PRM/starter-b2b-prm
yarn install
```

Expected: completes without errors

- [ ] **Step 2: Start infrastructure**

```bash
docker compose up -d
```

Expected: postgres, redis, meilisearch containers start and become healthy

- [ ] **Step 3: Generate module registry**

```bash
yarn generate
```

Expected: `.mercato/generated/` directory created with module registry files

- [ ] **Step 4: Initialize database**

```bash
yarn initialize
```

Expected: migrations run, tier definitions seeded (Bronze/Silver/Gold), partner roles created

- [ ] **Step 5: Start dev server**

```bash
yarn dev &
sleep 10
```

Wait for "Ready" message in output before proceeding.

- [ ] **Step 6: Smoke test API routes**

These routes require authentication. First obtain a token by logging in as the superadmin created during `yarn initialize`, then test:

```bash
# Test tier definitions endpoint (adjust AUTH_TOKEN)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/partnerships/tiers
# Expected: 200 or 401 (401 confirms route exists and auth is enforced)

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/partnerships/agencies
# Expected: 200 or 401

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/partnerships/kpi/dashboard
# Expected: 200 or 401
```

- [ ] **Step 7: Verify backend admin pages respond**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/backend/partnerships/agencies
# Expected: 200 (or 302 redirect to login)

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/backend/partnerships/tiers
# Expected: 200 (or 302 redirect to login)
```

- [ ] **Step 8: Verify partner portal route exists**

```bash
# Portal routes require an orgSlug — test that the route pattern is registered
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/demo/portal/partnerships
# Expected: 200 or 302 (confirms route is wired, even if org doesn't exist)
```

- [ ] **Step 9: Stop dev server, commit any final fixes**

```bash
kill %1 2>/dev/null || true
```

If any fixes were needed during verification, commit them:
```bash
git add -A
git commit -m "fix: verification fixes for example app"
```
