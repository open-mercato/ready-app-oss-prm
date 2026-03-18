# Phase 1b Verification Results

**Date:** 2026-03-18
**Environment:** test-prm (standalone OM app, Next.js 16.1.5 / Turbopack)

## Summary

Phase 1b implementation verified in test-prm. All API endpoints functional after fixing organization scope resolution. Backend pages render correctly.

## Bugs Found & Fixed

### 1. Organization scope resolution for superadmin (all routes)

**Root cause:** `resolveOrganizationScopeForRequest()` returns `selectedId: null` for superadmin users because they have access to all organizations. The command runtime context was built with `selectedOrganizationId: scope.selectedId`, which passed `null` to commands, causing `CrudHttpError(403)`.

**Fix:** All custom POST/PUT/PATCH routes now compute `effectiveOrgId = scope.selectedId ?? ctx.auth?.orgId ?? null` and use that in `runtimeCtx`.

**Files affected:** 8 route files under `api/` (agencies, tiers, tier-assignments, tier-downgrade, kpi/snapshots/import, kpi/wic-runs/import, min/license-deals x2).

## Verification Checklist

| Check | Status | Notes |
|-------|--------|-------|
| `yarn generate` discovers entities, commands, routes, pages | PASS | 9 backend pages, 14 API routes registered |
| `yarn db:migrate` creates 3 new tables | PASS | partner_license_deals, partner_wic_runs, partner_wic_contribution_units |
| `yarn mercato init --reinstall` seeds tiers and role features | PASS | 3 tier defs (bronze/silver/gold), role features applied. Init fails at example module reindex (unrelated) |
| `yarn dev` starts without partnerships errors | PASS | |
| Agency self-onboard API (POST /api/partnerships/agencies) | PASS | Returns 201 with agency id |
| Agency list API (GET /api/partnerships/agencies) | PASS | |
| Tier CRUD (GET/POST /api/partnerships/tiers) | PASS | |
| Tier assign (POST /api/partnerships/agencies/{id}/tier-assignments) | PASS | |
| Tier status + eligibility (GET /api/partnerships/agencies/{id}/tier-status) | PASS | Shows all tiers with eligibility |
| Tier history (GET /api/partnerships/agencies/{id}/tier-history) | PASS | |
| KPI import (POST /api/partnerships/kpi/snapshots/import) | PASS | |
| KPI dashboard (GET /api/partnerships/kpi/dashboard) | PASS | Returns per-agency metrics with current tier |
| KPI self-view (GET /api/partnerships/kpi/me) | PASS | |
| MIN license deals CRUD (GET/POST /api/partnerships/min/license-deals) | PASS | |
| MIN summary (GET /api/partnerships/kpi/min) | PASS | |
| Backend dashboard page (/backend/partnerships) | PASS | 4 cards linking to sub-pages |
| Backend agencies page (/backend/agencies) | PASS | |
| Backend tiers page (/backend/tiers) | PASS | |
| Backend tiers create page (/backend/tiers/create) | PASS | |
| Backend KPI page (/backend/kpi) | PASS | |
| Backend MIN page (/backend/min) | PASS | |
| i18n keys (en, pl) | PASS | Registered in generated modules |
| OpenAPI exported on routes | PASS | Included in openapi.generated.json |

## Known Limitations

- Backend sub-pages are at `/backend/agencies`, `/backend/tiers` etc., not `/backend/partnerships/agencies`. This is the OM framework convention — child pages of a module are not auto-prefixed with the module name.
- `yarn mercato init --reinstall` fails at the end during example module search reindex (`example_customer_priorities` table missing). This is unrelated to partnerships and is a pre-existing issue in the test-prm example module.
- Vault/KMS warnings appear during runtime (no Vault configured in dev) — uses fallback encryption key.

## Database State After Verification

- 9 partner_* tables created
- 3 tier definitions seeded (bronze, silver, gold)
- Role features applied for superadmin and admin roles
