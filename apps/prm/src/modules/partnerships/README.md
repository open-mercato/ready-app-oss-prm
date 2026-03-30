# Partnerships Module

PRM (Partner Relationship Management) domain logic for managing partner agencies, tracking KPIs, and distributing leads.

This module demonstrates key Open Mercato extension patterns. Each file is a learning reference.

## What This Module Does

- Extends the `customers` module to treat agencies as CRM companies with partner-specific custom fields
- Tracks WIP (Work In Progress) — deals that reach Sales Qualified Lead stage
- Provides dashboard widgets for KPI visibility and onboarding guidance
- Seeds 3 demo partner agencies with realistic CRM data

## File Guide

### Core Module Files

| File | OM Pattern | What It Demonstrates |
|------|-----------|---------------------|
| `index.ts` | Module metadata | Auto-discovered by the platform via `src/modules/` convention |
| `setup.ts` | `seedDefaults` + `seedExamples` | Roles, pipeline stages, custom fields, dictionaries, demo data. Idempotent — safe to run multiple times. |
| `acl.ts` | Feature-based permissions | Declares 14 features: `*.manage` (PM write), `*.view` (read access), `*.respond` (RFP action), `*.widgets.*` (dashboard cards). |
| `ce.ts` | Custom entities | Declares `case_study` entity type via the entities module |
| `events.ts` | Typed events | Event declarations (placeholder for Phase 2+) |

### API Extensions

| File | OM Pattern | What It Demonstrates |
|------|-----------|---------------------|
| `api/interceptors.ts` | API interceptors | **Key pattern.** Before-hook strips `wip_registered_at` from client writes (immutability). After-hook stamps the field on SQL+ stage transition (business rule enforcement). |
| `api/get/wip-count.ts` | Custom API route | GET route with `openApi` export. Counts WIP deals for the current month per org. |
| `api/get/onboarding-status.ts` | Custom API route | GET route returning checklist completion data for the current user's role. |

### Dashboard Widgets

| File | OM Pattern | What It Demonstrates |
|------|-----------|---------------------|
| `widgets/injection-table.ts` | Widget injection | Maps widgets to the `dashboards.main` slot |
| `widgets/dashboard/wip-count/` | Dashboard widget | Lazy-loaded, feature-gated (`partnerships.wip-count`). Shows monthly WIP count. |
| `widgets/dashboard/onboarding-checklist/` | Dashboard widget | Role-conditional (Admin sees 4 items, BD sees 2). Auto-dismisses when all items complete. |

### Data

| File | OM Pattern | What It Demonstrates |
|------|-----------|---------------------|
| `data/custom-fields.ts` | Custom fields DSL | `defineFields()` with `cf.*` helpers for partner profile fields on CRM company entity |
| `i18n/en.json` | Internationalization | All user-facing strings — no hardcoded text in code |

### Tests

| File | What It Tests |
|------|--------------|
| `api/interceptors.test.ts` | WIP stamp logic — immutability guard + stage transition stamping |
| `api/get/wip-count.test.ts` | WIP count aggregation per org per month |
| `api/get/onboarding-status.test.ts` | Checklist data for different roles |
| `__integration__/TC-PRM-001.spec.ts` | Foundation seed verification |
| `__integration__/TC-PRM-002.spec.ts` | WIP interceptor end-to-end |
| `__integration__/TC-PRM-003.spec.ts` | Dashboard widgets API |

## OM Patterns Demonstrated

1. **RBAC with custom roles** — `setup.ts` seeds `partnership_manager`, `partner_admin`, `partner_member` with `defaultRoleFeatures`
2. **CRM extension** — agencies are `customers` companies with custom fields (tier, WIC score, WIP count)
3. **API interceptors** — before/after hooks on CRM deal CRUD to enforce WIP immutability
4. **Widget injection** — dashboard widgets injected into `dashboards.main` slot
5. **Custom entities** — `case_study` declared via `ce.ts`
6. **Custom API routes** — GET routes with `openApi` export
7. **Org scoping** — agency roles scoped to their org via `UserAcl.organizationsJson`, PM has program-wide access (`null`)
8. **i18n** — all strings in locale files
9. **Colocated tests** — unit tests next to source, integration tests in `__integration__/`
