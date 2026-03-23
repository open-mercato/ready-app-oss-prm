# WF5 Tier Governance Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable monthly tier evaluation with grace period state machine, PM approval workflow, MIN attribution via cross-org company search, and tier progress dashboard widget.

**Architecture:** 7 atomic commits introducing ORM entities with migrations, a queue worker, workflow JSON definition, cron triggers, and dashboard widgets. Follows OM platform patterns: `makeCrudRoute` for CRUD, `registerCommand` for mutations, MikroORM decorators for entities, BullMQ for workers.

**Tech Stack:** TypeScript, MikroORM, Next.js, Zod, BullMQ, OM Workflows module

**Spec:** `apps/prm/docs/specs/2026-03-23-wf5-tier-governance-phase2-design.md`

---

## Reference Patterns

Before implementing each task, read these reference files:

| Pattern | Reference File |
|---------|---------------|
| ORM entity | `open-mercato/packages/core/src/modules/customers/data/entities.ts` |
| makeCrudRoute | `open-mercato/packages/core/src/modules/customers/api/people/route.ts` |
| Commands | `open-mercato/packages/core/src/modules/customers/commands/people.ts` |
| Worker | `open-mercato/packages/queue/AGENTS.md` |
| Workflow JSON | `open-mercato/packages/core/src/modules/workflows/examples/simple-approval-definition.json` |
| Migration | `open-mercato/packages/core/src/modules/customers/migrations/` |
| API route | `apps/prm/src/modules/partnerships/api/get/wip-count.ts` |
| Widget | `apps/prm/src/modules/partnerships/widgets/dashboard/wip-count/widget.ts` |
| Page | `apps/prm/src/modules/partnerships/backend/partnerships/agencies/page.tsx` |
| Interceptors | `apps/prm/src/modules/partnerships/api/interceptors.ts` |

---

## Task 1: PartnerLicenseDeal Entity + PM CRUD (Commit 1)

**Files:**
- Create: `src/modules/partnerships/data/entities.ts` — PartnerLicenseDeal MikroORM entity
- Create: `src/modules/partnerships/commands/partner-license-deal.ts` — create/update/delete commands
- Create: `src/modules/partnerships/api/partner-license-deals/route.ts` — makeCrudRoute
- Create: `src/modules/partnerships/api/openapi.ts` — createCrudOpenApiFactory (if not exists)
- Create: `src/modules/partnerships/backend/partnerships/license-deals/page.meta.ts`
- Create: `src/modules/partnerships/backend/partnerships/license-deals/page.tsx`
- Create: `src/modules/partnerships/backend/partnerships/license-deals/create/page.meta.ts`
- Create: `src/modules/partnerships/backend/partnerships/license-deals/create/page.tsx`

### Entity: PartnerLicenseDeal

```typescript
@Entity({ tableName: 'partner_license_deals' })
@Unique({ name: 'pld_license_year_unique', properties: ['licenseIdentifier', 'year'] })
@Index({ name: 'pld_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class PartnerLicenseDeal {
  [OptionalProps]?: 'createdAt' | 'type' | 'status' | 'isRenewal'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string  // attributed agency

  @Property({ name: 'company_id', type: 'uuid' })
  companyId!: string  // CRM company

  @Property({ name: 'license_identifier', type: 'text' })
  licenseIdentifier!: string

  @Property({ name: 'industry_tag', type: 'text' })
  industryTag!: string

  @Property({ type: 'text', default: 'enterprise' })
  type: string = 'enterprise'

  @Property({ type: 'text', default: 'won' })
  status: string = 'won'

  @Property({ name: 'is_renewal', type: 'boolean', default: false })
  isRenewal: boolean = false

  @Property({ name: 'closed_at', type: Date })
  closedAt!: Date

  @Property({ type: 'integer' })
  year!: number  // computed from closedAt UTC year

  @Property({ name: 'created_by', type: 'uuid' })
  createdBy!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
```

### Steps

- [ ] Read reference: `open-mercato/packages/core/src/modules/customers/data/entities.ts` for exact decorator patterns
- [ ] Create `data/entities.ts` with PartnerLicenseDeal entity
- [ ] Create `commands/partner-license-deal.ts` — register create/update/delete commands following customers/commands/people.ts pattern
- [ ] Create `api/partner-license-deals/route.ts` — makeCrudRoute with PM-only features, custom validation for (license_identifier, year) uniqueness, and company attribution uniqueness
- [ ] Create `api/openapi.ts` — createCrudOpenApiFactory if not already present
- [ ] Create backend pages: license-deals list + create form (CrudForm fallback)
- [ ] Run `yarn db:generate` to create migration
- [ ] Run `yarn db:migrate` to apply migration
- [ ] Run `yarn generate && yarn typecheck`
- [ ] Commit: `feat(partnerships): PartnerLicenseDeal entity + PM-only CRUD route`

---

## Task 2: Cross-Org Company Search + Attribution UI (Commit 2)

**Files:**
- Create: `src/modules/partnerships/api/get/company-search.ts`
- Create: `src/modules/partnerships/backend/partnerships/license-deals/attribute/page.meta.ts`
- Create: `src/modules/partnerships/backend/partnerships/license-deals/attribute/page.tsx`
- Modify: `src/modules/partnerships/i18n/en.json`

### GET `/api/partnerships/company-search`

- Query param `q` — search term
- Program Scope: `organizationsJson: null` (cross-org)
- PM only: `partnerships.manage`
- Queries CustomerEntity (kind='company') across all orgs
- Returns: `{ companyId, companyName, organizationId, agencyName, createdAt, dealCount }`

### Attribution Page

- Search box → company-search API
- Result list → click → CRM link
- "Confirm attribution" form → POST to partner-license-deals route

### Steps

- [ ] Read reference: `api/get/wip-count.ts` for route pattern
- [ ] Create `api/get/company-search.ts` — cross-org search with Program Scope
- [ ] Create attribution page (page.meta.ts + page.tsx)
- [ ] Add i18n keys for partnerLicenseDeals.* and companySearch.*
- [ ] Run `yarn generate && yarn typecheck`
- [ ] Commit: `feat(partnerships): cross-org company search + MIN attribution UI`

---

## Task 3: KPI Aggregation Worker + Grace Period State Machine (Commit 3)

**Files:**
- Modify: `src/modules/partnerships/data/entities.ts` — add TierEvaluationState, TierChangeProposal, TierAssignment
- Create: `src/modules/partnerships/workers/tier-evaluation.ts`
- Create: `src/modules/partnerships/data/tier-thresholds.ts` — threshold constants

### New Entities

**TierEvaluationState:** organizationId, currentTier, evaluationMonth (YYYY-MM), gracePeriodStartedAt (nullable), status (OK/GracePeriod/ProposedDowngrade), tenantId, timestamps.

**TierChangeProposal:** organizationId, evaluationMonth, currentTier, proposedTier, type (upgrade/downgrade), status (Draft/PendingApproval/Approved/Rejected), rejectionReason (nullable), wicSnapshot, wipSnapshot, minSnapshot, resolvedAt (nullable), tenantId, timestamps. Unique: one open per org+period.

**TierAssignment:** organizationId, tier, effectiveDate, approvedBy (userId), reason (nullable), tenantId, timestamps.

### Worker Logic

1. Idempotency check: skip if evaluationMonth already processed
2. Read KPIs: WIC from ContributionUnit CFVs, WIP from wip_registered_at CFVs, MIN from PartnerLicenseDeal
3. Compute TierEligibility against tier thresholds (conjunctive)
4. Grace period state machine: OK→GracePeriod→ProposedDowngrade
5. Create TierChangeProposal if upgrade or second-month downgrade
6. OM Agency tier is manual PM gate — worker evaluates tiers 2-4 only

### Tier Thresholds (data/tier-thresholds.ts)

```typescript
export const TIER_THRESHOLDS = [
  { tier: 'OM Agency', wic: 1, wip: 1, min: 1, order: 1 },
  { tier: 'OM AI-native Agency', wic: 2, wip: 5, min: 2, order: 2 },
  { tier: 'OM AI-native Expert', wic: 3, wip: 15, min: 5, order: 3 },
  { tier: 'OM AI-native Core', wic: 4, wip: 15, min: 5, order: 4 },
] as const
```

### Steps

- [ ] Add 3 new ORM entities to `data/entities.ts`
- [ ] Create `data/tier-thresholds.ts` with threshold constants
- [ ] Create `workers/tier-evaluation.ts` with idempotent handler
- [ ] Run `yarn db:generate` to create migration for new tables
- [ ] Run `yarn db:migrate`
- [ ] Run `yarn generate && yarn typecheck`
- [ ] Commit: `feat(partnerships): KPI aggregation worker + grace period state machine`

---

## Task 4: Tier Evaluation Workflow + AgencyTierChanged Event (Commit 4)

**Files:**
- Modify: `src/modules/partnerships/events.ts` — add AgencyTierChanged
- Create: `src/modules/partnerships/examples/tier-evaluation-workflow.json`
- Modify: `src/modules/partnerships/setup.ts` — seed workflow definition
- Create: `src/modules/partnerships/api/post/enqueue-tier-evaluation.ts`
- Modify: `src/modules/partnerships/acl.ts` — add partnerships.tier.approve
- Modify: `src/modules/partnerships/setup.ts` — add tier.approve to PM role

### Workflow Definition

Follow `open-mercato/packages/core/src/modules/workflows/examples/simple-approval-definition.json` pattern.

Steps: START → AUTOMATED (enqueue worker) → USER_TASK (PM review) → AUTOMATED (approve: update proposal + assignment + emit event + audit log) | AUTOMATED (reject: update proposal) → END

### Steps

- [ ] Read reference: workflow examples JSON for exact schema
- [ ] Add AgencyTierChanged event to events.ts
- [ ] Create workflow JSON definition
- [ ] Create `api/post/enqueue-tier-evaluation.ts`
- [ ] Add `partnerships.tier.approve` to acl.ts + setup.ts (PM role)
- [ ] Add workflow seeding to setup.ts seedDefaults
- [ ] Run `yarn generate && yarn typecheck`
- [ ] Commit: `feat(partnerships): tier evaluation workflow + AgencyTierChanged event`

---

## Task 5: Cron Trigger API (Commit 5)

**Files:**
- Create: `src/modules/partnerships/api/post/trigger-monthly-evaluation.ts`
- Create: `src/modules/partnerships/api/post/trigger-wic-import.ts`
- Create: `crontab.example` (at app root)
- Modify: `.env.example`

### Auth Pattern

API key auth via `x-api-key` header checked against `process.env.CRON_SECRET`.

### Steps

- [ ] Create `trigger-monthly-evaluation.ts` — enqueues tier eval for all orgs
- [ ] Create `trigger-wic-import.ts` — same pattern for WIC
- [ ] Create `crontab.example` with documented cron entries
- [ ] Add `CRON_SECRET=` to `.env.example`
- [ ] Run `yarn generate && yarn typecheck`
- [ ] Commit: `feat(partnerships): cron trigger API for monthly tier evaluation`

---

## Task 6: Tier Progress Dashboard Widget (Commit 6)

**Files:**
- Create: `src/modules/partnerships/api/get/tier-status.ts`
- Create: `src/modules/partnerships/widgets/dashboard/tier-status/widget.ts`
- Create: `src/modules/partnerships/widgets/dashboard/tier-status/widget.client.tsx`
- Modify: `src/modules/partnerships/widgets/injection-table.ts`
- Modify: `src/modules/partnerships/acl.ts`
- Modify: `src/modules/partnerships/setup.ts`
- Modify: `src/modules/partnerships/i18n/en.json`

### Widget Display

- Current tier badge
- KPI progress bars (WIC/WIP/MIN vs thresholds)
- Grace period warning banner
- "Pending approval" notice
- Role-scoped: Admin+BD full view, Contributor tier badge only, PM list view

### Steps

- [ ] Read reference: wip-count widget for exact pattern
- [ ] Create `api/get/tier-status.ts` — reads TierAssignment + TierEvaluationState + live KPIs
- [ ] Create widget.ts + widget.client.tsx
- [ ] Register in injection-table.ts
- [ ] Add `partnerships.widgets.tier-status` to acl.ts + partner_admin/partner_member roles
- [ ] Add widget to AGENCY_WIDGETS in setup.ts
- [ ] Add i18n keys
- [ ] Run `yarn generate && yarn typecheck`
- [ ] Commit: `feat(partnerships): tier progress dashboard widget`

---

## Task 7: seedExamples Phase 2 (Commit 7)

**Files:**
- Modify: `src/modules/partnerships/setup.ts`

### Demo Data

- TierAssignment history for 3 demo agencies (2-3 entries each + current)
- PartnerLicenseDeals: 1-5 per agency (enterprise, won, non-renewal)
- ContributionUnits for current + previous month (via WIC import or direct CFV seed)
- TierEvaluationState: one GracePeriod (Nordic), one OK (Acme)
- TierChangeProposal: one PendingApproval (upgrade for Acme)
- GH usernames linked on demo Contributor users

### Steps

- [ ] Read existing seedExamples in setup.ts for patterns
- [ ] Add Phase 2 demo data to seedPrmExamples
- [ ] Run `yarn initialize` to verify seeding
- [ ] Run `yarn typecheck`
- [ ] Commit: `feat(partnerships): seedExamples Phase 2 — tiers, MIN attribution, demo data`
