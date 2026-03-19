# SPEC-053a Data Foundation — Implementation Design

## Summary

Implement the SPEC-053a data foundation for the PRM starter. This adds structured partner profiles, case-study custom entity, and dictionary taxonomies — all using existing platform mechanisms (ce.ts, seedDefaults, dictionaries module). No new routes, pages, or migrations.

## Architecture

### ce.ts — Declarative Entity & Field Registration

The partnerships module declares a `ce.ts` that the generator picks up. On `yarn initialize`, `installCustomEntitiesFromModules` auto-upserts `CustomEntity` rows and `CustomFieldDef` rows.

**Entities declared:**

1. **`user:case_study`** — new custom entity with `showInSidebar: true`, `labelField: 'title'`
2. **`customers:customer_company_profile`** — existing entity (declared in customers/ce.ts), partnerships adds extension fields

**Field split — ce.ts vs seedDefaults:**

- **ce.ts fields**: non-dictionary fields only (text, multiline, integer, float, boolean, select). These get auto-provisioned by the platform's `entities:install` command.
- **seedDefaults fields**: dictionary-backed fields (`kind: 'dictionary'`). These require `dictionaryId` UUIDs which are only available after dictionaries are seeded. Created as `CustomFieldDef` rows via ORM.

### seedDefaults — Dictionary Provisioning

Following the upstream pattern (catalog/lib/seeds.ts), `seedDefaults()` calls a helper that:

1. Creates 6 dictionaries idempotently (findOne by key, create if missing)
2. Seeds initial entries for each dictionary
3. Upserts dictionary-backed `CustomFieldDef` rows with correct `dictionaryId` references

### Data Flow

```
yarn initialize
  → entities:install (reads ce.ts → upserts CustomEntity + non-dictionary CustomFieldDef)
  → setup modules (seedDefaults → creates dictionaries + dictionary-backed CustomFieldDef)
```

## Files

| File | Purpose |
|------|---------|
| `src/modules/partnerships/ce.ts` | Declare `user:case_study` entity + non-dictionary fields for both entities |
| `src/modules/partnerships/data/taxonomy-v1.json` | Static taxonomy: 6 dictionary catalogs with seed entries, 6 strict select bucket definitions |
| `src/modules/partnerships/lib/seed-data-foundation.ts` | Helper: seed dictionaries + entries + dictionary-backed field defs |
| `src/modules/partnerships/setup.ts` | Extended: call seed helper in seedDefaults |

## ce.ts Entity Declarations

### user:case_study (non-dictionary fields)

| Key | Kind | Multi | Default |
|-----|------|-------|---------|
| title | text | no | "" |
| summary | multiline | no | "" |
| provider_company_name | text | no | "" |
| project_type | select | no | "unknown" |
| duration_bucket | select | no | "unknown" |
| duration_weeks | integer | no | null |
| budget_known | boolean | no | false |
| budget_bucket | select | no | "unknown" |
| budget_min_usd | float | no | null |
| budget_max_usd | float | no | null |
| outcome_kpis | multiline | no | "" |
| source_url | text | no | "" |
| confidence_score | integer | no | 3 |
| is_public_reference | boolean | no | false |
| completed_year | integer | no | null |

### customers:customer_company_profile (non-dictionary fields)

| Key | Kind | Multi | Default |
|-----|------|-------|---------|
| positioning_summary | multiline | no | "" |
| delivery_models | select | yes | ["hybrid"] |
| team_size_bucket | select | no | "unknown" |
| min_project_size_bucket | select | no | "unknown" |
| hourly_rate_bucket | select | no | "unknown" |
| clutch_url | text | no | "" |
| profile_confidence | integer | no | 3 |

## seedDefaults — Dictionary-Backed Fields

### Dictionaries to create (6)

services, industries, tech_capabilities, compliance_tags, regions, languages

### Dictionary-backed CustomFieldDef rows

**On customers:customer_company_profile:**
services, industries, tech_capabilities, compliance_tags, regions, languages

**On user:case_study:**
technologies (→ tech_capabilities dict), industry (→ industries dict), compliance_tags, delivery_models (select, not dict — already in ce.ts)

Note: `provider_company` (relation) and `related_deals` (relation) from SPEC-053a are deferred — relation fields require the target entity IDs to exist and are complex. These can be added later.

## Select Bucket Options (in ce.ts)

Source of truth: `data/taxonomy-v1.json`

- team_size_bucket: unknown, 1_9, 10_49, 50_199, 200_plus
- min_project_size_bucket: unknown, lt_10k, 10k_50k, 50k_200k, 200k_plus
- hourly_rate_bucket: unknown, lt_25, 25_50, 50_100, 100_150, 150_plus
- project_type: unknown, product_engineering, staff_augmentation, ai_automation, integration, audit
- duration_bucket: unknown, lt_1m, 1_3m, 3_6m, 6_12m, 12m_plus
- budget_bucket: unknown, lt_25k, 25k_100k, 100k_250k, 250k_1m, 1m_plus

## What We Don't Build

- No new API routes
- No new backend/portal pages
- No new migrations (uses existing custom_field_defs, custom_entities, dictionaries tables)
- No backfill scripts (seed only)
- No relation fields (provider_company, related_deals — deferred)

## Verification

After implementation:
1. `yarn generate` — ce.ts picked up by generator
2. `yarn initialize` — entities + fields provisioned, dictionaries seeded
3. Admin UI → Entities → Case Studies visible in sidebar
4. Admin UI → Companies → custom fields (services, industries, etc.) visible in form
5. Admin UI → Dictionaries → 6 new dictionaries with entries
