# Phase 1, Commit 1: Foundation Seed — Roles, Dictionaries, Pipeline, Company Profile, Case Study

## Source
- App Spec sections: §1.3, §1.4, §2, §7 (Phase 1)
- User stories: US-1.1, US-1.2, US-1.3, US-1.4, US-1.5, US-1.6, US-2.1, US-2.2, US-6.1
- Commit plan: commits-WF1.md (Commits 1, 2), commits-WF2.md (Commits 1, 2, 3)

## What This Delivers
After this commit, the PRM module exists with all foundational data: four partner roles with correct feature grants, six business dictionaries, a PRM-specific deal pipeline (7 stages), 13 company profile custom fields, a `wip_registered_at` custom field on deals, and a case study custom entity with 19 fields and minimum required validation. Agency users can log in, see scoped CRM, and fill their company profile. No business logic yet — purely declarative seeds.

## Acceptance Criteria
**Domain (Vernon):**
- [ ] Every Deal has non-null `organization_id` matching BD's org at creation time (platform default — verified by CRM scoping)
- [ ] Company records scoped to BD's org — no cross-org CRM data leaks (platform default — verified by org scoping)
- [ ] Case study requires minimum fields: `title`, at least one `industry`, at least one `technologies`, `budget_bucket`, `duration_bucket` — partial saves rejected at entity level

**Business (Mat):**
- [ ] PM can onboard an agency (Admin creates account → sees scoped backend dashboard)
- [ ] Admin can fill company profile with services, industries, tech stack fields
- [ ] Agency Admin can add the first case study with required fields enforced
- [ ] BD can create deals in CRM pipeline with PRM-specific stages
- [ ] BD can manage agency case studies in the same org scope after account creation

## Files
| File | Action | Purpose |
|------|--------|---------|
| `src/modules/partnerships/index.ts` | Create | Module metadata (name, title, version, description) |
| `src/modules/partnerships/acl.ts` | Create | Feature declarations: `partnerships.manage`, `partnerships.widgets.wip-count`, `partnerships.widgets.onboarding-checklist` + customers module feature grants per role |
| `src/modules/partnerships/setup.ts` | Create | `seedDefaults`: seed roles (partner_admin, partner_member, partner_contributor, partnership_manager), 6 dictionaries (services, industries, technologies, budget_buckets, duration_buckets, verticals), PRM pipeline (7 stages: New→Contacted→Qualified→SQL→Proposal→Won→Lost), 13 company profile custom fields, `wip_registered_at` datetime CF on `customers.deal`, case study custom entity (19 fields). `defaultRoleFeatures`: map roles to features. |
| `src/modules/partnerships/data/custom-fields.ts` | Create | Constants: company profile field definitions (13 fields), `wip_registered_at` deal field definition, case study entity field definitions (19 fields with required flags). Exported for use by setup.ts and interceptor (SQL stage threshold constant). |
| `src/modules/partnerships/events.ts` | Create | Events config via `createModuleEvents({ moduleId: 'partnerships', events: [] as const })`. No domain events in Phase 1 — Phase 2 adds `AgencyTierChanged`. Must follow the `as const` + `createModuleEvents` pattern for auto-discovery. |
| `src/modules/partnerships/ce.ts` | Create | Custom entity declaration for `partnerships:case_study` with labelField, showInSidebar config |

## OM Patterns Used
- **setup.ts seed** — Reference: `$OM_REPO/packages/core/src/modules/customers/setup.ts` (seedDefaults, defaultRoleFeatures structure)
- **acl.ts features** — Reference: `$OM_REPO/packages/core/src/modules/customers/acl.ts` (feature declaration array)
- **Custom fields DSL** — Reference: `$OM_REPO/packages/shared/src/modules/dsl/` (`cf.text`, `cf.select`, `cf.dateTime` helpers)
- **Custom entity declaration** — Reference: `$OM_REPO/packages/core/src/modules/customers/ce.ts` (entity array with id, label, fields)
- **Pipeline seeding** — Reference: `$OM_REPO/packages/core/src/modules/customers/cli.ts` (`seedDefaultPipeline` pattern — POST to pipelines + pipeline-stages APIs)

## Implementation Notes

### Roles and Feature Grants
Four roles with feature mappings:
- `partner_admin`: `customers.*` (full CRM), `partnerships.case-studies.manage`, `partnerships.manage`, `partnerships.widgets.onboarding-checklist`
- `partner_member` (BD): `customers.*` (full CRM), `partnerships.case-studies.manage`, `partnerships.widgets.wip-count`, `partnerships.widgets.onboarding-checklist`
- `partner_contributor`: minimal — only WIC-related features (Phase 2), `partnerships.widgets.onboarding-checklist` (not used in Phase 1 but declared)
- `partnership_manager` (PM): `customers.*.view` (read-only CRM), `partnerships.manage`, `partnerships.widgets.wip-count`

### Pipeline Stages
Seed "PRM Pipeline" with 7 stages in order: New (0), Contacted (1), Qualified (2), SQL (3), Proposal (4), Won (5), Lost (6). The SQL stage must use value key `sql` — the interceptor (Commit 2) matches on this key. Guard: skip if pipeline with name "PRM Pipeline" already exists (idempotent).

### Company Profile Custom Fields (13 fields on `customers:customer_company_profile`)
services (multi-select from dictionary), industries (multi-select), technologies (multi-select), verticals (multi-select), team_size (select: 1-5, 6-20, 21-50, 51-200, 200+), founded_year (number), website (text), headquarters_city (text), headquarters_country (text), partnership_start_date (date), primary_contact_name (text), primary_contact_email (text), description (text/long).

### Case Study Entity Fields (19 fields on `partnerships:case_study`)
Required: `title` (text), `industry` (multi-select from dictionary), `technologies` (multi-select from dictionary), `budget_bucket` (select from dictionary), `duration_bucket` (select from dictionary).
Optional: `client_name` (text), `client_industry` (text), `project_type` (select), `team_size` (number), `start_date` (date), `end_date` (date), `description` (text/long), `challenges` (text/long), `solution` (text/long), `results` (text/long), `testimonial` (text/long), `is_public` (boolean), `attachments_count` (number, read-only), `organization_id` (auto-set from context).

### wip_registered_at Custom Field
Type: datetime, nullable, hidden from default CRM form. Seeded on `customers.deal` entity via entities batch API. Not directly editable by any user — only the interceptor (Commit 2) writes it.

### SQL Stage Threshold
Export `PRM_SQL_STAGE_ORDER = 3` as a module constant in `data/custom-fields.ts`. The interceptor and any future aggregation worker reference this constant. Tied to the seed definition — if pipeline order changes, constant must change.

### Dictionary Values
Dictionaries seeded via `POST /api/dictionaries` (or direct em insert following customers module pattern):
- `services`: Software Development, Consulting, Implementation, Training, Support, Integration
- `industries`: Finance, Healthcare, Retail, Manufacturing, Technology, Education, Government, Energy, Logistics
- `technologies`: React, Node.js, Python, TypeScript, PostgreSQL, Docker, Kubernetes, AWS, Azure, GCP
- `budget_buckets`: <10k, 10k-50k, 50k-200k, 200k-500k, 500k+
- `duration_buckets`: <1 month, 1-3 months, 3-6 months, 6-12 months, 12+ months
- `verticals`: FinTech, HealthTech, RetailTech, EdTech, GovTech, CleanTech

## Verification
```bash
yarn generate                    # Regenerate module files after adding partnerships module
yarn typecheck                   # Must pass — no type errors
yarn build                       # Must pass
yarn initialize                  # Run seedDefaults — verify roles, dictionaries, pipeline, custom fields, case study entity created
# Manual check: log in as Admin and BD, verify company profile fields visible for Admin and case study create/edit is available to both roles in the same org scope
```
