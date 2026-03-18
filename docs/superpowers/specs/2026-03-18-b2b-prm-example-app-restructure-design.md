# B2B PRM Example App Restructure

## Context

The B2B PRM implementation currently exists as two separate artifacts:
- **starter-b2b-prm** (`matgren/starter-b2b-prm`) — module source only (partnerships module + dev artifact docs)
- **test-prm** — full standalone Open Mercato app used for verification, containing the partnerships module plus demo modules (`example`, `hello`)

Merged PRs #825 (SPEC-062) and #1006 (SPEC-068 + SPEC-053 alignment) established that use-case examples must be **complete, runnable apps** distributed via `open-mercato/examples`. The bootstrap flow is `create-mercato-app --example b2b-prm`.

This design reshapes `starter-b2b-prm` from a module-source repo into a complete example app, ready to be moved into `open-mercato/examples/b2b-prm/` when that repo is created.

**Note:** SPEC-068 mentions a `.template` file convention with placeholders (`{{APP_NAME}}`, etc.) for `create-mercato-app --example` integration. That convention will be applied when the `open-mercato/examples` repo is created and the `--example` CLI flag is implemented — it is out of scope for this restructuring.

## Approach

**Copy-and-Clean**: copy test-prm's verified scaffold into starter-b2b-prm, keep the existing partnerships module (already in sync), remove demo modules and dev artifacts.

## What Gets Copied from test-prm

### Root scaffold files
- `package.json`, `yarn.lock`, `.yarnrc.yml`
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `components.json`
- `Dockerfile`, `docker-compose.yml`, `docker-compose.fullapp.yml`, `docker-compose.fullapp.dev.yml`, `docker/`
- `.env.example`, `.dockerignore`, `.gitignore`
- `public/`, `types/`

### App source (`src/`)
- `src/app/` — layout, pages, API catch-all route, globals
- `src/components/` — AppProviders, ClientBootstrap, etc.
- `src/lib/`, `src/i18n/`
- `src/bootstrap.ts`, `src/di.ts`, `src/proxy.ts`
- `src/modules.ts` — cleaned version (see below)
- `src/modules/.gitkeep`

### Excluded (runtime/generated)
- `node_modules/`, `.mercato/`, `storage/`, `data/`
- `tsconfig.tsbuildinfo`, `.env`, `next-env.d.ts`

## What Gets Removed

### From starter-b2b-prm (dev artifacts + demo modules)
- `PHASE0-GAPS.md` — framework validation notes
- `PHASE1B-RESULTS.md` — API verification checklist
- `modules.ts.snippet` — replaced by real `modules.ts`
- `src/modules/hello/` — already exists in starter-b2b-prm, must be deleted

### From copied test-prm content (demo modules)
- `src/modules/example/` — full demo module (todos, blogs, products)
- `src/modules/hello/` — minimal SPEC-062 validation module (do not copy)
- `src/modules/auth/` — empty directory, not needed (do not copy)

## modules.ts

17 core/infrastructure modules + 1 app module (partnerships). No demo modules.

```typescript
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
```

Enterprise env-gated modules (record_locks, system_status_overlays, sso) are preserved.

## Seed Config (SPEC-053 Alignment)

Per merged SPEC-053 changes, seed configuration uses env vars:

| Env Var | Purpose | Default |
|---------|---------|---------|
| `OM_PRM_SEED_PROFILE` | Controls which demo fixtures are seeded (e.g. `demo_agency`) | `demo_agency` |
| `OM_SEED_EXAMPLES` | Whether to seed demo data during `yarn initialize` | `true` |

These are added to `.env.example`. The `partnerships/setup.ts` currently only has `seedDefaults` — wiring these env vars into a `seedExamples` hook is part of this restructuring scope. The `seedDefaults` hook will check `OM_SEED_EXAMPLES` before seeding demo data, and `OM_PRM_SEED_PROFILE` to select fixture sets.

## Identity & Documentation

### README.md
Rewritten as example app README:
- What it is (B2B PRM example for Open Mercato)
- Prerequisites (Node 24+, Docker)
- Quick start (`yarn install`, `docker compose up -d`, `yarn initialize`, `yarn dev`)
- What it demonstrates (partnerships module capabilities)
- Link to SPEC-053 family for full context

### AGENTS.md
Based on test-prm's version (correct standalone app guide), updated to:
- Remove references to demo modules
- Identify as B2B PRM example app
- Reference SPEC-068 examples framework

### CLAUDE.md
Keep as-is (points to AGENTS.md).

### package.json name
Changed to `b2b-prm-example`.

## File Manifest

| Action | Path | Source |
|--------|------|--------|
| Copy | `package.json` | test-prm (update name, remove irrelevant deps: `@open-mercato/gateway-stripe`, `@stripe/*`, `pdf2pic`, `newrelic`, `react-big-calendar`; remove `-r newrelic` from start script) |
| Copy | `yarn.lock`, `.yarnrc.yml` | test-prm |
| Copy | `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `components.json` | test-prm |
| Copy | `Dockerfile`, `docker-compose*.yml`, `docker/` | test-prm |
| Copy | `.env.example` | test-prm (add seed env vars, remove irrelevant sections: Stripe, Akeneo, InboxOps, OCR) |
| Copy | `.dockerignore`, `.gitignore` | test-prm |
| Copy | `public/`, `types/` | test-prm |
| Copy | `src/app/`, `src/components/`, `src/lib/`, `src/i18n/` | test-prm |
| Copy | `src/bootstrap.ts`, `src/di.ts`, `src/proxy.ts` | test-prm |
| Create | `src/modules.ts` | New (cleaned, no demo modules) |
| Keep | `src/modules/partnerships/` | Already in starter-b2b-prm (verified identical to test-prm except auto-generated `.snapshot-open-mercato.json` which is excluded via `.gitignore`) |
| Delete | `src/modules/hello/` | Pre-existing in starter-b2b-prm, must be removed |
| Rewrite | `README.md` | New |
| Update | `AGENTS.md` | Based on test-prm, updated |
| Copy | `CLAUDE.md` | test-prm |
| Delete | `PHASE0-GAPS.md` | Dev artifact |
| Delete | `PHASE1B-RESULTS.md` | Dev artifact |
| Delete | `modules.ts.snippet` | Replaced by real modules.ts |

## Verification

After restructuring, the example app should:
1. `yarn install` succeeds
2. `yarn generate` produces `.mercato/generated/` files
3. `docker compose up -d` starts postgres, redis, meilisearch
4. `yarn initialize` runs migrations and seeds (including PRM tiers)
5. `yarn dev` starts the app
6. Partnerships API smoke tests:
   - `GET /api/partnerships/agencies` — returns agency list
   - `GET /api/partnerships/tiers` — returns tier definitions (Bronze/Silver/Gold)
   - `GET /api/partnerships/kpi/dashboard` — returns KPI dashboard data
7. Backend admin pages render (`/backend/partnerships/agencies`, `/backend/partnerships/tiers`)
8. Partner portal pages render (`/[orgSlug]/portal/partnerships`)
