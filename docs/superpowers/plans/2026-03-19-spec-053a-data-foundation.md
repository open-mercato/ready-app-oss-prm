# SPEC-053a Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured partner profiles, case-study custom entity, and dictionary taxonomies to the PRM starter using existing platform mechanisms.

**Architecture:** `ce.ts` declares entity types and non-dictionary fields (auto-provisioned by `entities:install`). `seedDefaults()` creates dictionaries via ORM and upserts dictionary-backed `CustomFieldDef` rows that reference the seeded dictionary UUIDs. No new routes, pages, or migrations.

**Tech Stack:** MikroORM entities (Dictionary, DictionaryEntry, CustomFieldDef), ce.ts convention file, ModuleSetupConfig seedDefaults.

**Spec:** `docs/superpowers/specs/2026-03-19-spec-053a-data-foundation-design.md`

**Reference patterns:**
- ce.ts: `node_modules/@open-mercato/core/dist/modules/customers/ce.js` (entity declarations with `fields: []`)
- Dictionary seeding: upstream `packages/core/src/modules/catalog/lib/seeds.ts` (idempotent findOne + create pattern)
- CustomFieldDef entity: `node_modules/@open-mercato/core/dist/modules/entities/data/entities.js` (CustomFieldDef class)
- CustomFieldDefinition type: `node_modules/@open-mercato/shared/dist/modules/entities.js` (field kind, options, etc.)

---

### Task 1: Create taxonomy-v1.json

**Files:**
- Create: `src/modules/partnerships/data/taxonomy-v1.json`

- [ ] **Step 1: Create the taxonomy file**

This is the frozen source of truth for all bucket values and dictionary seed entries. The file has two sections: `buckets` (strict select options used in ce.ts) and `dictionaries` (catalog definitions with seed entries used in seedDefaults).

```json
{
  "version": "v1",
  "buckets": {
    "team_size_bucket": [
      { "value": "unknown", "label": "Unknown" },
      { "value": "1_9", "label": "1–9" },
      { "value": "10_49", "label": "10–49" },
      { "value": "50_199", "label": "50–199" },
      { "value": "200_plus", "label": "200+" }
    ],
    "min_project_size_bucket": [
      { "value": "unknown", "label": "Unknown" },
      { "value": "lt_10k", "label": "< $10k" },
      { "value": "10k_50k", "label": "$10k–$50k" },
      { "value": "50k_200k", "label": "$50k–$200k" },
      { "value": "200k_plus", "label": "$200k+" }
    ],
    "hourly_rate_bucket": [
      { "value": "unknown", "label": "Unknown" },
      { "value": "lt_25", "label": "< $25/h" },
      { "value": "25_50", "label": "$25–$50/h" },
      { "value": "50_100", "label": "$50–$100/h" },
      { "value": "100_150", "label": "$100–$150/h" },
      { "value": "150_plus", "label": "$150+/h" }
    ],
    "project_type": [
      { "value": "unknown", "label": "Unknown" },
      { "value": "product_engineering", "label": "Product Engineering" },
      { "value": "staff_augmentation", "label": "Staff Augmentation" },
      { "value": "ai_automation", "label": "AI & Automation" },
      { "value": "integration", "label": "Integration" },
      { "value": "audit", "label": "Audit" }
    ],
    "duration_bucket": [
      { "value": "unknown", "label": "Unknown" },
      { "value": "lt_1m", "label": "< 1 month" },
      { "value": "1_3m", "label": "1–3 months" },
      { "value": "3_6m", "label": "3–6 months" },
      { "value": "6_12m", "label": "6–12 months" },
      { "value": "12m_plus", "label": "12+ months" }
    ],
    "budget_bucket": [
      { "value": "unknown", "label": "Unknown" },
      { "value": "lt_25k", "label": "< $25k" },
      { "value": "25k_100k", "label": "$25k–$100k" },
      { "value": "100k_250k", "label": "$100k–$250k" },
      { "value": "250k_1m", "label": "$250k–$1M" },
      { "value": "1m_plus", "label": "$1M+" }
    ],
    "delivery_models": [
      { "value": "hybrid", "label": "Hybrid" },
      { "value": "onsite", "label": "On-site" },
      { "value": "remote", "label": "Remote" },
      { "value": "nearshore", "label": "Nearshore" },
      { "value": "offshore", "label": "Offshore" }
    ]
  },
  "dictionaries": {
    "services": {
      "name": "Services",
      "description": "Partner service capabilities",
      "entries": [
        { "value": "web_development", "label": "Web Development" },
        { "value": "mobile_development", "label": "Mobile Development" },
        { "value": "cloud_infrastructure", "label": "Cloud Infrastructure" },
        { "value": "data_engineering", "label": "Data Engineering" },
        { "value": "ai_ml", "label": "AI & Machine Learning" },
        { "value": "ux_design", "label": "UX Design" },
        { "value": "devops", "label": "DevOps" },
        { "value": "security", "label": "Security" },
        { "value": "consulting", "label": "Consulting" },
        { "value": "qa_testing", "label": "QA & Testing" }
      ]
    },
    "industries": {
      "name": "Industries",
      "description": "Industry verticals",
      "entries": [
        { "value": "fintech", "label": "Fintech" },
        { "value": "healthcare", "label": "Healthcare" },
        { "value": "ecommerce", "label": "E-commerce" },
        { "value": "saas", "label": "SaaS" },
        { "value": "logistics", "label": "Logistics" },
        { "value": "media", "label": "Media & Entertainment" },
        { "value": "education", "label": "Education" },
        { "value": "real_estate", "label": "Real Estate" },
        { "value": "manufacturing", "label": "Manufacturing" },
        { "value": "government", "label": "Government" }
      ]
    },
    "tech_capabilities": {
      "name": "Tech Capabilities",
      "description": "Technology stack capabilities",
      "entries": [
        { "value": "react", "label": "React" },
        { "value": "nextjs", "label": "Next.js" },
        { "value": "nodejs", "label": "Node.js" },
        { "value": "python", "label": "Python" },
        { "value": "typescript", "label": "TypeScript" },
        { "value": "aws", "label": "AWS" },
        { "value": "gcp", "label": "Google Cloud" },
        { "value": "azure", "label": "Azure" },
        { "value": "kubernetes", "label": "Kubernetes" },
        { "value": "postgresql", "label": "PostgreSQL" },
        { "value": "graphql", "label": "GraphQL" },
        { "value": "rust", "label": "Rust" },
        { "value": "go", "label": "Go" },
        { "value": "java", "label": "Java" },
        { "value": "dotnet", "label": ".NET" }
      ]
    },
    "compliance_tags": {
      "name": "Compliance Tags",
      "description": "Regulatory and compliance certifications",
      "entries": [
        { "value": "gdpr", "label": "GDPR" },
        { "value": "soc2", "label": "SOC 2" },
        { "value": "iso27001", "label": "ISO 27001" },
        { "value": "hipaa", "label": "HIPAA" },
        { "value": "pci_dss", "label": "PCI DSS" }
      ]
    },
    "regions": {
      "name": "Regions",
      "description": "Geographic regions of operation",
      "entries": [
        { "value": "north_america", "label": "North America" },
        { "value": "europe", "label": "Europe" },
        { "value": "asia_pacific", "label": "Asia Pacific" },
        { "value": "latin_america", "label": "Latin America" },
        { "value": "middle_east", "label": "Middle East" },
        { "value": "africa", "label": "Africa" }
      ]
    },
    "languages": {
      "name": "Languages",
      "description": "Service delivery languages",
      "entries": [
        { "value": "en", "label": "English" },
        { "value": "es", "label": "Spanish" },
        { "value": "de", "label": "German" },
        { "value": "fr", "label": "French" },
        { "value": "pl", "label": "Polish" },
        { "value": "pt", "label": "Portuguese" },
        { "value": "zh", "label": "Chinese" },
        { "value": "ja", "label": "Japanese" }
      ]
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/partnerships/data/taxonomy-v1.json
git commit -m "feat(partnerships): add taxonomy v1 — dictionaries and bucket definitions"
```

---

### Task 2: Create ce.ts with entity declarations and non-dictionary fields

**Files:**
- Create: `src/modules/partnerships/ce.ts`

**Reference:** `node_modules/@open-mercato/core/dist/modules/customers/ce.js` for entity declaration format. Type `CustomEntitySpec` and `CustomFieldDefinition` from `@open-mercato/shared/modules/entities`.

- [ ] **Step 1: Create ce.ts**

Import the bucket options from taxonomy-v1.json to keep ce.ts DRY. The `fields` array uses `CustomFieldDefinition` shape. Select fields use `options` with `{ value, label }` pairs from the taxonomy. Non-dictionary fields only — dictionary-backed fields are handled in seedDefaults.

```typescript
import type { CustomEntitySpec } from '@open-mercato/shared/modules/entities'
import taxonomy from './data/taxonomy-v1.json'

const buckets = taxonomy.buckets

const caseStudyEntity: CustomEntitySpec = {
  id: 'user:case_study',
  label: 'Case Studies',
  description: 'Structured project evidence for partner matching and RFP scoring.',
  labelField: 'title',
  showInSidebar: true,
  fields: [
    { key: 'title', kind: 'text', label: 'Title', required: true, listVisible: true, formEditable: true },
    { key: 'summary', kind: 'multiline', label: 'Summary', formEditable: true },
    { key: 'provider_company_name', kind: 'text', label: 'Provider Company', listVisible: true, formEditable: true },
    { key: 'project_type', kind: 'select', label: 'Project Type', options: buckets.project_type, defaultValue: 'unknown', listVisible: true, formEditable: true },
    { key: 'duration_bucket', kind: 'select', label: 'Duration', options: buckets.duration_bucket, defaultValue: 'unknown', listVisible: true, formEditable: true },
    { key: 'duration_weeks', kind: 'integer', label: 'Duration (weeks)', formEditable: true },
    { key: 'budget_known', kind: 'boolean', label: 'Budget Known', defaultValue: false, listVisible: true, formEditable: true },
    { key: 'budget_bucket', kind: 'select', label: 'Budget Range', options: buckets.budget_bucket, defaultValue: 'unknown', listVisible: true, formEditable: true },
    { key: 'budget_min_usd', kind: 'float', label: 'Budget Min (USD)', formEditable: true },
    { key: 'budget_max_usd', kind: 'float', label: 'Budget Max (USD)', formEditable: true },
    { key: 'delivery_models', kind: 'select', label: 'Delivery Models', options: buckets.delivery_models, multi: true, formEditable: true, listVisible: true },
    { key: 'outcome_kpis', kind: 'multiline', label: 'Outcome KPIs', formEditable: true },
    { key: 'source_url', kind: 'text', label: 'Source URL', formEditable: true },
    { key: 'confidence_score', kind: 'integer', label: 'Confidence Score', defaultValue: 3, listVisible: true, formEditable: true },
    { key: 'is_public_reference', kind: 'boolean', label: 'Public Reference', defaultValue: false, listVisible: true, formEditable: true },
    { key: 'completed_year', kind: 'integer', label: 'Completed Year', listVisible: true, formEditable: true },
  ],
}

// Extension fields only — entity metadata (label, showInSidebar) owned by customers module
const companyProfileFields: CustomEntitySpec = {
  id: 'customers:customer_company_profile',
  fields: [
    { key: 'positioning_summary', kind: 'multiline', label: 'Positioning Summary', formEditable: true },
    { key: 'delivery_models', kind: 'select', label: 'Delivery Models', options: buckets.delivery_models, multi: true, defaultValue: 'hybrid', formEditable: true, listVisible: true },
    { key: 'team_size_bucket', kind: 'select', label: 'Team Size', options: buckets.team_size_bucket, defaultValue: 'unknown', formEditable: true, listVisible: true },
    { key: 'min_project_size_bucket', kind: 'select', label: 'Min Project Size', options: buckets.min_project_size_bucket, defaultValue: 'unknown', formEditable: true, listVisible: true },
    { key: 'hourly_rate_bucket', kind: 'select', label: 'Hourly Rate', options: buckets.hourly_rate_bucket, defaultValue: 'unknown', formEditable: true },
    { key: 'clutch_url', kind: 'text', label: 'Clutch URL', formEditable: true },
    { key: 'profile_confidence', kind: 'integer', label: 'Profile Confidence', defaultValue: 3, formEditable: true },
  ],
}

export const entities = [caseStudyEntity, companyProfileFields]
export default entities
```

- [ ] **Step 2: Verify generator picks up ce.ts**

Run: `yarn generate`

Expected: no errors. The generated `modules.generated.ts` should include `customEntities` for the partnerships module.

- [ ] **Step 3: Commit**

```bash
git add src/modules/partnerships/ce.ts
git commit -m "feat(partnerships): add ce.ts — case_study entity + company profile fields"
```

---

### Task 3: Create seed-data-foundation.ts — dictionary seeding + dictionary-backed field defs

**Files:**
- Create: `src/modules/partnerships/lib/seed-data-foundation.ts`

**Reference pattern:** upstream `packages/core/src/modules/catalog/lib/seeds.ts` lines 56–105 for idempotent dictionary + entry creation.

**Entity imports:** Dictionary and DictionaryEntry from `@open-mercato/core/modules/dictionaries/data/entities`, CustomFieldDef from `@open-mercato/core/modules/entities/data/entities`.

- [ ] **Step 1: Create the seed helper**

```typescript
import type { EntityManager } from '@mikro-orm/postgresql'
import { Dictionary, DictionaryEntry, type DictionaryManagerVisibility } from '@open-mercato/core/modules/dictionaries/data/entities'
import { CustomFieldDef } from '@open-mercato/core/modules/entities/data/entities'
import taxonomy from '../data/taxonomy-v1.json'

type SeedScope = { tenantId: string; organizationId: string }

async function seedDictionary(
  em: EntityManager,
  scope: SeedScope,
  key: string,
  config: { name: string; description: string; entries: Array<{ value: string; label: string }> },
): Promise<Dictionary> {
  let dictionary = await em.findOne(Dictionary, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    key,
    deletedAt: null,
  })
  if (!dictionary) {
    dictionary = em.create(Dictionary, {
      key,
      name: config.name,
      description: config.description,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      isSystem: true,
      isActive: true,
      managerVisibility: 'default' satisfies DictionaryManagerVisibility,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(dictionary)
    await em.flush()
  }

  const existingEntries = await em.find(DictionaryEntry, {
    dictionary,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  const existingMap = new Map(existingEntries.map((e) => [e.value.toLowerCase(), e]))
  for (const entry of config.entries) {
    const normalized = entry.value.toLowerCase()
    if (existingMap.has(normalized)) continue
    em.persist(em.create(DictionaryEntry, {
      dictionary,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      value: entry.value,
      normalizedValue: normalized,
      label: entry.label,
      color: null,
      icon: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  }
  await em.flush()

  return dictionary
}

async function upsertDictionaryFieldDef(
  em: EntityManager,
  scope: SeedScope,
  entityId: string,
  key: string,
  label: string,
  dictionaryId: string,
  opts: { multi?: boolean; listVisible?: boolean; formEditable?: boolean } = {},
) {
  const existing = await em.findOne(CustomFieldDef, {
    entityId,
    key,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  })
  if (existing) {
    // Update dictionaryId if it changed (e.g. DB was recreated)
    const config = existing.configJson ?? {}
    if (config.dictionaryId !== dictionaryId) {
      existing.configJson = { ...config, dictionaryId, dictionaryInlineCreate: true }
      existing.updatedAt = new Date()
    }
    return
  }

  em.persist(em.create(CustomFieldDef, {
    entityId,
    key,
    kind: 'dictionary',
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    configJson: {
      label,
      multi: opts.multi ?? true,
      dictionaryId,
      dictionaryInlineCreate: true,
      formEditable: opts.formEditable ?? true,
      listVisible: opts.listVisible ?? true,
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
}

export async function seedPrmDataFoundation(em: EntityManager, scope: SeedScope) {
  // Step 1: Seed all dictionaries with entries
  const dicts: Record<string, Dictionary> = {}
  for (const [key, config] of Object.entries(taxonomy.dictionaries)) {
    dicts[key] = await seedDictionary(em, scope, key, config)
  }

  // Step 2: Dictionary-backed fields on customers:customer_company_profile
  const companyEntity = 'customers:customer_company_profile'
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'services', 'Services', dicts.services.id)
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'industries', 'Industries', dicts.industries.id)
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'tech_capabilities', 'Tech Capabilities', dicts.tech_capabilities.id)
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'compliance_tags', 'Compliance Tags', dicts.compliance_tags.id)
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'regions', 'Regions', dicts.regions.id, { listVisible: false })
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'languages', 'Languages', dicts.languages.id, { listVisible: false })

  // Step 3: Dictionary-backed fields on user:case_study
  const caseStudyEntity = 'user:case_study'
  await upsertDictionaryFieldDef(em, scope, caseStudyEntity, 'technologies', 'Technologies', dicts.tech_capabilities.id)
  await upsertDictionaryFieldDef(em, scope, caseStudyEntity, 'industry', 'Industry', dicts.industries.id)
  await upsertDictionaryFieldDef(em, scope, caseStudyEntity, 'compliance_tags', 'Compliance Tags', dicts.compliance_tags.id)

  await em.flush()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/partnerships/lib/seed-data-foundation.ts
git commit -m "feat(partnerships): add dictionary seeding + dictionary-backed field definitions"
```

---

### Task 4: Wire seedDefaults to call the data foundation helper

**Files:**
- Modify: `src/modules/partnerships/setup.ts:162-173`

- [ ] **Step 1: Add import and call in seedDefaults**

Add at the top of `setup.ts`:

```typescript
import { seedPrmDataFoundation } from './lib/seed-data-foundation'
```

Modify `seedDefaults` to call the new helper after tier and role seeding but before example agencies:

```typescript
  seedDefaults: async (ctx) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    // Structural defaults always seed (tiers + roles are required for PRM to function)
    await seedTierDefaults(ctx.em, scope)
    await seedPartnerRoles(ctx.em, scope)

    // SPEC-053a: dictionaries, custom entity fields, and taxonomy
    await seedPrmDataFoundation(ctx.em, scope)

    // Example data only seeds when OM_SEED_EXAMPLES is not explicitly false
    const seedExamples = process.env.OM_SEED_EXAMPLES !== 'false'
    if (seedExamples) {
      await seedExampleAgencies(ctx.em, scope)
    }
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `yarn typecheck`

Expected: no errors related to partnerships module.

- [ ] **Step 3: Commit**

```bash
git add src/modules/partnerships/setup.ts
git commit -m "feat(partnerships): wire SPEC-053a data foundation into seedDefaults"
```

---

### Task 5: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Run generator**

Run: `yarn generate`

Expected: no errors. Partnerships module should appear in generated output with `customEntities` entry.

- [ ] **Step 2: Verify JSON import works**

Run: `yarn typecheck`

Expected: no errors. Project has `resolveJsonModule: true` so plain JSON imports work.

- [ ] **Step 3: Push**

```bash
git push origin master
```
