# App Spec: B2B Partner Relationship Management (PRM)

> App Spec is a business architecture document that sits above technical specs.
> It captures domain knowledge, validates cross-spec consistency, and ensures
> the app solves a real business problem using the platform correctly.
>
> This document is the SINGLE SOURCE OF TRUTH for what PRM is, who it serves,
> and how it maps to Open Mercato. Technical specs (053, 053a, 053b, etc.)
> are generated from this document. If a spec contradicts this document, this document wins.
>
> Each section has a checklist with owner (Mat or Piotr). Section is done when all checks pass.

---

## 1. Business Context `Mat`

### 1.1 Business Model

**What Open Mercato is:** An open-source modular ERP/CRM platform for "Agentic Engineering" — AI-native business applications.

**How OM makes money:** Enterprise licenses sold to companies. OM doesn't sell directly to most clients — partner agencies do the selling and implementation.

**The flywheel:**
```
Agency joins program
  -> contributes code (WIC) -> OM product improves
  -> prospects clients (WIP) -> OM pipeline grows
  -> closes deals (MIN) -> OM revenue grows
  -> higher tier -> more visibility on OM website -> more leads from OM -> more sales
  -> agency earns more -> invests more in WIC/WIP -> flywheel accelerates
```

**Who pays:** OM pays for the PRM system (it's their tool to manage the partner program). Agencies use it for free as part of the partnership. End clients pay for OM enterprise licenses.

#### Checklist
- [x] Paying customer identified — OM pays, agencies use for free, end clients pay licenses
- [x] Flywheel articulated — agency contributes + sells -> higher tier -> more leads -> more sales

### 1.2 Business Goals

**Primary goal:** Give OM a tool to manage 15+ partner agencies, track their KPIs (WIC/WIP/MIN), govern tiers, and distribute leads fairly.

**Production ROI unlock:** The system is useful when PM can:
1. Onboard an agency (WF1)
2. See their pipeline activity — WIP (WF2)
3. See their code contributions — WIC (WF3)
4. Distribute leads to qualified agencies — RFP (WF4)
5. Evaluate and govern tiers — Tier (WF5)

All 5 must work for the flywheel to spin. Missing any one = broken loop.

**Secondary goal (example app):** This project is a reference implementation for OM. It teaches how to build on the platform correctly. Every piece of code is a pattern others will copy.

**What is NOT important:**
- Automated matching engine (v1+ scope, not POC)
- Commission settlement (v2)
- Sales handoff orchestration (v2)
- Advanced analytics/reporting beyond KPI dashboard
- Public-facing agency directory (website, not this app)

#### Checklist
- [x] Primary goal stated with measurable outcome — manage 15+ agencies, track KPIs, govern tiers, distribute leads
- [x] Scope exclusions listed — matching engine, commission, sales handoff, analytics, directory

### 1.3 Ubiquitous Language

| Term | Definition | Source of data | Period |
|------|-----------|----------------|--------|
| **WIC** | Wildly Important Contribution. Code contributions to OM codebase, scored by level (L1-L4) with impact bonus and bounty multiplier. | GitHub PRs, scored by algorithm (LLM-assisted) | Monthly |
| **WIP** | Work In Progress. Deals that first reached "Sales Qualified Lead" stage or above during a given month. Stamped at qualification moment via `wip_registered_at` custom field. Once stamped, immutable — deal stage changes don't affect the count. | CRM deals (customers module), stamped by API interceptor | Monthly |
| **MIN** | Minimum Implementations Needed. Enterprise license deals sold and attributed to an agency via CRM company lookup. PM searches across all agencies' CRMs to find which agency brought the company into pipeline, then creates attribution record. | PM-created PartnerLicenseDeal linked to CRM Company | Calendar year (Jan 1 – Dec 31 UTC) |
| **Tier** | Partnership level determining agency visibility and lead priority. 4 levels. Distinct from TierEligibility (computed) — Tier refers to the PM-approved TierAssignment. | Calculated from WIC + WIP + MIN thresholds | Evaluated monthly, valid 12 months |
| **TierEligibility** | Computed comparison of an agency's current KPIs (WIC+WIP+MIN) against tier thresholds. Ephemeral, recalculated each evaluation. Not the actual tier — just the recommendation. | KPI aggregation worker | Monthly |
| **TierAssignment** | The actual tier an agency holds. Durable, auditable, requires PM approval to change. Published via AgencyTierChanged event. | PM approval via workflow | Until next evaluation |
| **TierChangeProposal** | A proposal to upgrade or downgrade an agency's tier. States: Draft → PendingApproval → Approved | Rejected. Invariant: at most one open proposal per org per period. | Tier evaluation worker | Per evaluation period |
| **Program Scope** | PM-level visibility grant spanning all partner organizations. Distinct from org-level scope. Implementation: `organizationsJson: null` in auth module — but business rules reference Program Scope, not the implementation detail. | Auth module | — |
| **RFP** | Request for Proposal. PM distributes leads to qualified agencies, agencies respond with structured proposals. | PM creates campaign, agencies respond | Per campaign |
| **Pipeline** | CRM deal stages: New -> Contacted -> Qualified -> SQL -> Proposal -> Won/Lost | customers module pipeline | Continuous |
| **Case Study** | Agency's past project documentation (tech stack, industry, budget, duration). Used for RFP matching. | Custom entity in entities module | Maintained by agency |
| **Bounty** | Tagged GitHub issues with bonus multiplier for WIC scoring. | GitHub issues with bounty label | Per bounty window |
| **Feature Key** | Grouping key for WIC: SPEC-xxx, #issue, or PR-id. Anti-double-counting: same feature key + same month + same person = one unit. | WIC algorithm | Monthly |
| **PM** | Partnership Manager. OM employee who runs the partner program. | — | — |
| **BD** | Business Developer. Agency salesperson who prospects clients and creates deals. | — | — |
| **Contributor** | Agency team member whose primary contribution to the program is code (WIC). Has no sales or administrative responsibilities. Identified in the system to enable WIC attribution via GitHub username. | — | — |
| **ContributionUnit** | Aggregate representing one person's contribution to one feature in one month. Dedup key: person + month + feature_key (enforced as invariant at creation, not just grouping). `organization_id` set at PR merge time. | WIC scoring algorithm or manual import | Monthly |
| **WicAssessmentSource** | Enum tracking how WIC scores were produced: `manual_import` (PM uploads) or `automated_pipeline` (GitHub+LLM). Each import for a given org+month replaces the previous one; old version archived with timestamp. | WIC import/pipeline | Per import |
| **AgencyTierChanged** | Domain event published when PM approves a tier change. Payload: agencyId, previousTier, newTier, effectiveDate, approvedBy. Downstream consumers: RFP audience filtering, agency dashboard, future website visibility. | Tier approval workflow | Per tier change |
| **CampaignPublished** | Domain event: PM published an RFP campaign, agencies notified. | RFP workflow | Per campaign |
| **RfpAwarded** | Domain event: PM selected winning agency for an RFP. Payload: rfpId, winningAgencyId. | RFP workflow | Per campaign |

#### Checklist
- [x] Every domain term defined once
- [x] Same word = same meaning across all specs
- [x] Source of data and period specified per term

### 1.4 Domain Model

#### 1.4.1 Tier Definitions

Source: Mat's business requirements (session 2026-03-19).

| Tier | WIC/month | WIP/month | MIN/year | Special Requirements | Benefit |
|------|-----------|-----------|----------|---------------------|---------|
| **OM Agency** | 1 (L1-2) | 1 | 1 | 2 devs familiar with project, approved for L3-4 within 3 months (manual PM gate at onboarding — not automated monthly check) | Foundational partner status |
| **OM AI-native Agency** | 2 (L1-4) | 5 | 2 | — | Higher match score, visibility on website |
| **OM AI-native Expert** | 3 (L1-4) | 15 | 5 (3 in vertical) | Vertical dominance in specific industry niche | Highest match score in their vertical, #1 choice for niche clients |
| **OM AI-native Core** | 4 (L3-4) | 15 | 5 | Horizontal dominance, core OM expertise | Highest match score overall, #1 choice for demanding technical clients |

**Tier governance rules:**
- Evaluation: monthly automated check against thresholds (except Tier 1 admission which is a manual PM gate)
- Grace period: 1 month (agency falling below threshold gets 1 calendar month to recover before downgrade proposal is generated)
- Grace period state machine: `OK` → `GracePeriod` (first month below threshold, no proposal generated) → `ProposedDowngrade` (second consecutive month below, proposal created for PM). `GracePeriod` resets to `OK` if agency recovers within the month. Entity: `TierEvaluationState { agencyId, currentTier, evaluationMonth, gracePeriodStartedAt, status }`
- Downgrade: PM approval required before tier change takes effect. TierChangeProposal states: Draft → PendingApproval → Approved | Rejected. One open proposal per org per period.
- Upgrade: no grace period needed. System proposes, PM approves.
- History: all tier changes audited with reason and approver. Published via AgencyTierChanged domain event.

#### 1.4.2 KPI Formulas

**WIC Score per contribution unit:**
```
unit = person + month + feature_key  (anti-double-counting — enforced as invariant at ContributionUnit creation)
base_score = L4:1.0, L3:0.5, L2:1.0, L1:0.5/0.25, routine:0.0
impact_bonus = +0.25 (scope: >=40 files) + 0.25 (completeness: spec+impl+tests)
wic_pre_bounty = base_score + impact_bonus
wic_final = wic_pre_bounty * bounty_multiplier  (1.5x if linked to active bounty)
```
WIC/month per agency = sum of wic_final for all contributors in that org for that month.

**Note on WIC levels:** Levels are NOT ordinal difficulty. They measure different types of contribution:
- L1 (0.5) = complex fix, large refactor, high-impact accepted bug report
- L1 (0.25) = smaller fix/hardening, standard accepted bug report
- L2 (1.0) = substantial implementation work (high volume, moderate complexity)
- L3 (0.5) = design review, architecture guidance (lower volume, strategic value)
- L4 (1.0) = strategic/architectural contributions (highest impact)

Algorithm source: `/Users/maciejgren/Documents/SDRC/` (WIC Assessment Guide + scoring rules).
Requires LLM for: bounty auto-adjudication, ownership analysis, quality assessment.

**WIC import semantics:** One active WIC assessment per org per month. Re-importing for the same org+month replaces the previous version; old version archived with timestamp for audit trail. Source tracked via WicAssessmentSource enum (`manual_import` | `automated_pipeline`).

**WIC scoring contract (ACL interface):** External scoring results must conform to:
```
WicScoringResult {
  contributorGithubUsername: string,
  prId: string,
  month: YYYY-MM,
  featureKey: string,
  level: L1 | L2 | L3 | L4 | routine,
  impactBonus: boolean,
  bountyApplied: boolean
}
```
Import API validates against this schema. Non-conforming records rejected, not silently accepted.

**WIP count:**
```
WIP(org, month) = COUNT(DISTINCT deals)
  WHERE deal.organization_id = org
  AND deal.wip_registered_at IS NOT NULL
  AND deal.wip_registered_at IN month
```
**WIP registration:** When BD moves a deal to SQL stage (or above) for the first time, an API interceptor stamps `wip_registered_at` (custom field) with the current timestamp. This stamp is immutable — once set, deal stage changes (forward to Proposal/Won, or backward) don't affect it. First qualification only: recycling a deal back to Qualified and forward to SQL again does NOT re-stamp. "Won" deals are NOT in WIP — they graduated. MIN is a separate attribution.

**MIN count:**
```
MIN(org, year) = COUNT(DISTINCT license_deals)
  WHERE license_deal.attributed_agency_id = org
  AND license_deal.type = 'enterprise'
  AND license_deal.status = 'won'
  AND license_deal.is_renewal = false
  AND license_deal.closed_at IN year   -- calendar year: Jan 1 – Dec 31 UTC
```
**MIN attribution workflow:** PM has a license sale → opens "Create License Deal" → searches all companies across all agencies (cross-org search) → sees results with agency name + date created + deal count → clicks company → jumps to that agency's CRM (read-only) to verify deals, people, history → confirms → PartnerLicenseDeal created with agency attribution.

**MIN invariants:**
- No double-attribution: a PartnerLicenseDeal references exactly one CRM Company in one agency. Same company cannot be attributed to two agencies.
- No duplicate period counting: one PartnerLicenseDeal per license per year. Unique key: license identifier + year.
- Qualification: deal must be type=enterprise, status=won, is_renewal=false. PM sets these at creation; system enforces.

#### 1.4.3 Business Rules

**Permissions hierarchy:**
- Admin can do everything BD can (including RFP responses), but BD cannot do what Admin does (user management)
- Admin has full CRM write access within own org, including records created by BD users. BD has write access only to their own CRM records.
- BD and Admin both need to understand what qualifies as WIP — deal must reach SQL stage to trigger `wip_registered_at` stamp
- Contributor sees almost nothing — only WIC score and tier level

**Cross-org visibility:**
- PM has Program Scope — sees CRM data of ALL agencies (read-only) via org switcher
- Agency users see ONLY their own organization's data
- KPI data (WIC/WIP/MIN) visible to agency users for their own org only
- PM sees KPI dashboard across all agencies
- Org switcher scopes PM's reads. PM writes (tier approval, MIN attribution, RFP creation) are global actions attributed to specific agencies — not scoped by the currently selected org in switcher.

**Data ownership:**
- WIC: system-generated (external algorithm or manual import), PM can override. Override = re-import corrected data for that org+month; old version archived. WicAssessmentSource tracks provenance.
- WIP: agency-generated (BD creates deals in CRM), system stamps `wip_registered_at` at SQL stage
- MIN: PM-generated (PM creates PartnerLicenseDeal via cross-org company search + attribution)
- Agency users CANNOT create/modify MIN source records

**GitHub username attribution:**
- Contributor sets GH username on their profile (custom field via entities module)
- GH username is unique across all Contributors. System rejects duplicates.
- Once WIC has been recorded against a GH username, the username is immutable except by PM override with audit log. Changes do not retroactively alter past scores.
- ContributionUnit.organization_id is set at PR merge time based on contributor's org membership at that moment.

**Onboarding requirements:**
- Agency Admin must: fill company profile, add min 1 case study, invite min 1 BD, invite min 1 Contributor
- BD must: add first prospect company, create first deal, move deal to "Contacted"
- Both are sub-workflows tracked by the system

**Company Profile and Case Study field definitions:**

These are the canonical field definitions for PRM. setup.ts seeds them exactly as defined below.

**Company Profile** (`customers:customer_company_profile`) — 13 fields:
- `positioning_summary` (multiline), `services` (dictionary, multi), `industries` (dictionary, multi), `tech_capabilities` (dictionary, multi)
- `delivery_models` (select, multi), `compliance_tags` (dictionary, multi)
- `team_size_bucket` (select), `min_project_size_bucket` (select), `hourly_rate_bucket` (select, hidden)
- `regions` (dictionary, multi, hidden), `languages` (dictionary, multi, hidden)
- `clutch_url` (text, hidden), `profile_confidence` (integer, hidden)

**Case Study** (`user:case_study`) — 19 fields:
- `title` (text), `summary` (multiline), `provider_company` (relation to company), `provider_company_name` (text)
- `technologies` (dictionary, multi), `industry` (dictionary, multi), `project_type` (select)
- `duration_bucket` (select), `duration_weeks` (integer), `budget_known` (boolean), `budget_bucket` (select)
- `budget_min_usd` (float), `budget_max_usd` (float), `delivery_models` (select, multi)
- `compliance_tags` (dictionary, multi), `outcome_kpis` (multiline), `source_url` (text)
- `related_deals` (relation to deals), `confidence_score` (integer), `is_public_reference` (boolean), `completed_year` (integer)

**Dictionaries** (seeded in setup.ts): `services`, `industries`, `tech_capabilities`, `compliance_tags`, `regions`, `languages`

**Minimum required for creation:** `title`, at least one `industry`, at least one `technologies`, `budget_bucket`, `duration_bucket`. Other fields optional but improve RFP matching quality.

API contracts use standard OM entities module: `POST /api/entities/definitions.batch` for field definitions, `POST /api/entities/records` for records, `POST /api/dictionaries` for taxonomies.

#### Domain Model Checklist
- [x] Domain entities identified — PartnerAgency, tiers, KPIs, case studies, RFP, license deals, ContributionUnit, TierChangeProposal, TierEvaluationState
- [x] Domain rules documented — tier thresholds, KPI formulas, onboarding requirements, grace period state machine, MIN invariants
- [x] Tiers: all 4 real tiers with thresholds and benefits (was 3 in old spec, caught and fixed)
- [x] Tiers: governance rules complete — grace period state machine (OK → GracePeriod → ProposedDowngrade), TierChangeProposal with uniqueness invariant
- [x] KPIs: complete formulas with input source, period, anti-gaming (feature key dedup enforced as invariant at ContributionUnit creation)
- [x] KPIs: WIP = stamp-based (`wip_registered_at`), immutable, first qualification only. MIN = calendar year, cross-org attribution workflow.
- [x] Access control: permissions hierarchy (Admin > BD > Contributor), cross-org visibility (PM Program Scope), Admin full CRM write, BD own records only
- [x] Data ownership: WIC system-generated with versioned import, WIP stamp-based, MIN PM-generated via cross-org search
- [x] Domain events: AgencyTierChanged, CampaignPublished, RfpAwarded
- [x] Challenger review: 2026-03-20 — all CRITICAL findings addressed, 3 pushbacks documented

---

## 2. Identity Model `Mat`

> SINGLE SOURCE OF TRUTH. If any spec contradicts this, update the spec.

| Persona | Role key | Identity | Org scope | Sees | Does |
|---------|----------|----------|-----------|------|------|
| Partnership Manager | `partnership_manager` | User | Program Scope (all orgs) | All CRM read-only, all KPIs, all tiers, RFP campaigns, cross-org company search | Invites agencies, creates RFP, evaluates responses, approves tiers, attributes MIN via cross-org company search |
| Agency Admin | `partner_admin` | User | own org only | CRM (full write, including BD records), KPI (WIC/WIP/MIN), tier, team management, case studies, RFP responses | Fills profile, manages case studies, invites BD/Contributor, creates deals, responds to RFP |
| Business Developer | `partner_member` | User | own org only | CRM (own records write, others read), KPI (WIC/WIP/MIN), tier, RFP responses | Creates deals, edits profile + case studies, responds to RFP. NO user management. |
| Contributor | `partner_contributor` | User | own org only | WIC score, tier level only | Views WIC, configures own profile (e.g. GH username). Nothing else. |

**Non-app persona (distribution):**

| Persona | Identity | What they do |
|---------|----------|-------------|
| Developer | N/A (CLI user) | Bootstraps PRM via `create-mercato-app --example prm`. Reads code to learn OM patterns. Not an app user — a distribution consumer per SPEC-068. |

**Portal:** NOT USED. Zero portal pages. Zero CustomerUser accounts. Backend + RBAC + org scoping = sufficient for all personas.

**Decision log:**
- _Why User not CustomerUser?_ — BD needs CRM module (customers). CRM lives in backend. Portal doesn't expose CRM. Building CRM in portal = rebuilding what backend already has.
- _Why not portal for Contributor?_ — Contributor is minimal, but still a User with restricted role. One identity system, not two. Simplicity > convenience.
- _Could CustomerUser enable self-registration?_ — Yes, but at the cost of dual accounts or a promotion flow. Not worth the complexity for the example app.
- _Why Developer is not in the role table?_ — Developer doesn't use the running app. They bootstrap and read code. Their "user stories" are about distribution (SPEC-068), not about app workflows.

#### Checklist
- [x] Every persona has ONE identity type — all User, zero CustomerUser `Mat`
- [x] Identity decision justified per persona — BD needs CRM = backend = User `Mat`
- [x] No persona has two accounts — portal rejected, no promotion flows `Piotr`
- [x] Org scoping defined per role — PM all orgs null, others own org `Piotr`
- [x] Portal usage explicitly rejected — "NOT USED" with justification `Mat`

---

## 3. Workflows `Mat`

> Each workflow traces to ROI. If a workflow doesn't move a KPI or enable one that does, cut it.

### WF1: Agency Onboarding

**Journey:** PM invites Agency Admin (email+link) -> Admin sets password -> Admin onboarding sub-workflow (fill company profile -> add min 1 case study -> invite BD -> invite Contributor) -> BD onboarding sub-workflow (add prospect company -> create deal -> move deal to "Contacted") -> Agency is operational

**ROI:** Each new agency = 1-15 WIP/month + 1-5 MIN/year. Zero agencies = zero indirect pipeline. Target: 15+ active agencies.

**Key personas:** Partnership Manager (invites), Agency Admin (configures), BD (first deal)

**Boundaries:**
- Starts when: PM clicks "Invite Agency" and provides email
- Ends when: Admin completed onboarding, min 1 BD invited, BD completed onboarding, first deal logged
- NOT this workflow: BD adding subsequent deals (WF2), dev contributing code (WF3), tier evaluation (WF5)

**Edge cases:**
1. Admin doesn't accept invitation within 72h -> token expires -> PM sees "pending" -> can resend
2. Admin leaves agency after onboarding -> zombie org, nobody manages it
3. Admin fills profile but never invites BD -> onboarding "done" but no WIP generated
4. PM invites same email twice -> system must deduplicate

**OM readiness:**
- User creation + RBAC -> `auth` module ✅
- Org scoping -> platform ✅
- Company profile custom fields -> `entities` module ✅
- Case studies custom entity -> `entities` module ✅
- Pipeline stages for deals -> `customers` module ✅
- Sub-workflows (onboarding steps) -> `workflows` module ✅
- **Gap: Invitation flow** — auth module has no invite-by-email-link for User accounts

### WF2: Pipeline Building (WIP)

**Journey:** BD creates Company (prospect) in CRM -> creates Deal on that Company -> moves Deal through pipeline stages -> at "Sales Qualified Lead" stage, API interceptor stamps `wip_registered_at` on the deal -> BD sees WIP count on KPI dashboard

**ROI:** 15 agencies x 5 WIP/month = 75 prospects/month. Agency without WIP loses tier.

**Key personas:** BD (creates deals), System (stamps WIP on stage change)

**Boundaries:**
- Starts when: BD creates deal in CRM
- Ends when: Deal reaches SQL stage, `wip_registered_at` stamped, WIP visible on dashboard
- NOT this workflow: closing deal -> sale -> MIN attribution (WF5)

**Edge cases:**
1. BD creates deal without reaching SQL stage -> no stamp, doesn't count as WIP. BD sees "0 WIP" and understands deals must reach SQL.
2. BD creates fake deals and pushes them to SQL to inflate WIP -> PM must audit manually. Stamp is immutable so fake deals can be identified.
3. Same prospect in two agencies -> both count WIP -> known limitation for v1. Companies are per-org in CRM, so duplication is invisible to system. PM audits manually. (Documented as known domain model limitation, not just edge case.)
4. Period boundary: resolved. `wip_registered_at` timestamp determines the month. Deal stamped March 31 23:59 UTC = March WIP. No ambiguity.
5. BD moves deal back to Qualified then forward to SQL again -> no re-stamp. First qualification only.

**OM readiness:**
- CRM (companies, deals, activities) -> `customers` module ✅
- Pipeline + stages -> `customers` module ✅ (seed PRM pipeline in setup.ts)
- Deal CRUD + pipeline UI -> `customers` backend pages ✅
- WIP stamp on stage change -> API interceptor (UMES) ✅ — 1 commit
- **Gap: `wip_registered_at` custom field** — seed in setup.ts (bundled with pipeline stages)
- **Gap: KPI dashboard widget** — widget injection, uses live query in Phase 1 (count deals with `wip_registered_at` in period)

### WF3: Code Contribution (WIC)

**Journey:** Dev opens PR on OM GitHub repo -> core team reviews -> merge to develop -> Phase 1-3: PM imports WIC manually via import API. Phase 4: n8n workflow (daily schedule -> GitHub GraphQL -> group by person+month+feature key -> LLM scoring -> POST to import API via open-mercato/n8n-nodes) -> WIC score recorded as ContributionUnits -> Contributor/BD/Admin sees score

**ROI:** 15 agencies x 2 WIC/month = 30 contributions/month to OM codebase.

**Key personas:** Contributor (views score), System (scheduled job), PM (optional override)

**Boundaries:**
- Starts when: PM imports WIC assessment (Phase 1-3) or scheduled job triggers (Phase 4)
- Ends when: ContributionUnits created/updated for all contributors for current period
- NOT this workflow: PR review process (GitHub), tier calculation (WF5)

**Edge cases:**
1. Dev's GH profile not linked to User in OM -> import API rejects unmatched GH usernames, PM resolves
2. Dev changes agency -> ContributionUnit.organization_id set at PR merge time. Old WIC stays with old org. New contributions go to new org.
3. PR merged but WIC batch hasn't run yet -> dev doesn't see contribution (Phase 4 only; Phase 1-3 manual import is immediate)
4. Dev uses private GH account, different from registered username -> GH username is unique + immutable once scored. Dev must set correct username before first import.
5. PM re-imports WIC for same org+month -> old assessment archived, new one becomes primary. No duplicates.

**OM readiness:**
- Contributor sees WIC score -> backend page with RBAC ✅ (~50 lines widget)
- Scheduled daily run -> `scheduler` module ✅
- Human checkpoint -> `workflows` USER_TASK ✅
- Score storage -> partnerships entities (PartnerWicRun/ContributionUnit) ✅
- **Gap: GitHub API integration** — external, LLM scoring, complex pipeline
- **Gap: GH username -> User mapping** — custom field on User entity

### WF4: Lead Distribution (RFP)

**Journey:** OM receives lead -> PM creates RFP campaign (description, requirements, deadline, audience: all/selected/tier-filtered) -> system notifies agencies -> BD sees RFP and submits response (capabilities, pricing, timeline, case studies) -> PM evaluates responses -> selects agency -> handoff to sales

**ROI:** 10 RFP/month x 30% conversion = 3 MIN/month. Without RFP = PM sends emails manually.

**Key personas:** PM (creates RFP, evaluates), BD (responds), System (notifies)

**Boundaries:**
- Starts when: PM creates RFP campaign
- Ends when: PM selected agency, handoff complete
- NOT this workflow: agency implements OM at client (post-sale), MIN attribution (WF5)

**Edge cases:**
1. No agency responds -> deadline passes -> PM must search manually or reissue
2. Deadline passes while BD is writing response -> work lost
3. Two agencies score identically -> PM decides manually -> favoritism risk
4. Lead changes requirements after RFP published

**OM readiness:**
- RFP as workflow -> `workflows` module: START -> SEND_EMAIL -> WAIT_FOR_TIMER -> USER_TASK (PM only) -> END ✅
- Notification to BD -> workflows SEND_EMAIL activity ✅
- BD response -> PartnerRfpResponse CRUD API (submitted while workflow waits for timer — not a workflow step) ✅
- **Gap: RFP campaign data** — custom entity (PartnerRfpCampaign)
- **Gap: Response data** — custom entity (PartnerRfpResponse)
- **Gap: PM evaluation page** — comparison view (~100 lines)

### WF5: Tier Governance

**Journey:** System reads TierEvaluationState per org -> aggregates WIC+WIP+MIN for current period -> computes TierEligibility against 4 tier thresholds -> checks grace period state machine (OK → GracePeriod → ProposedDowngrade) -> generates TierChangeProposal if needed (one per org per period max) -> PM reviews + approves/rejects -> system publishes AgencyTierChanged event -> agency sees new status + progress to next level

**ROI:** Automated governance saves PM ~4h/week. Network quality maintained.

**Key personas:** System (aggregates, evaluates), PM (approves), all agency users (see tier)

**Boundaries:**
- Starts when: Scheduled job triggers (monthly)
- Ends when: PM approved/rejected tier change proposal, AgencyTierChanged event published (if approved), agency sees updated status
- NOT this workflow: KPI data collection (WF2, WF3), RFP matching based on tier (WF4). RFP audience filtering uses current TierAssignment — until AgencyTierChanged is published, old tier governs.

**Edge cases:**
1. Agency on tier boundary (4 WIC, needs 5) -> first month: TierEvaluationState moves to GracePeriod, no proposal generated. Second consecutive month: moves to ProposedDowngrade, TierChangeProposal created for PM. If agency recovers in grace month: resets to OK.
2. Great WIC but zero WIP -> contributes code but no pipeline -> tier thresholds are conjunctive (all 3 KPIs must meet), so agency doesn't qualify regardless of WIC
3. New agency, no data for full period -> grace period protects them for first month. After that, evaluated against thresholds like everyone else.
4. PM doesn't approve tier change for weeks -> old TierAssignment governs all dependent workflows (RFP filtering). TierChangeProposal stays in PendingApproval state. System can remind PM via notification.
5. Vertical dominance for Expert -> how does system know 3 MIN are "in vertical"? -> requires industry tag on PartnerLicenseDeal (same tag set as CaseStudy)

**MIN attribution sub-workflow:**
PM has license sale -> opens "Create License Deal" -> searches all companies across all agencies (cross-org search, Program Scope) -> sees results: agency name, company name, date created, deal count -> clicks company -> jumps to that agency's CRM (read-only) to verify deals + people -> confirms -> PartnerLicenseDeal created with agency attribution, industry tag.

**OM readiness:**
- PM approval -> `workflows` USER_TASK ✅
- Tier history / audit -> `audit_logs` module ✅
- TierChangeProposal state machine -> `workflows` module ✅
- AgencyTierChanged event -> platform event system ✅
- **Gap: KPI aggregation + TierEligibility computation** — worker (~50 lines)
- **Gap: Grace period state machine (TierEvaluationState entity)** — bundled with aggregation worker
- **Gap: Tier status widget** — widget injection on dashboard (~50 lines)
- **Gap: Cross-org company search for MIN attribution** — search API + attribution UI (~1 commit)

#### Checklist (per workflow)
- [x] End-to-end journey — all 5 workflows have full journey `Mat`
- [x] Measurable ROI — specific metrics per workflow `Mat`
- [x] Key personas identified per workflow `Mat`
- [x] Boundaries — start, end, NOT-this-workflow for all 5 `Mat`
- [x] 3-5 edge cases per workflow — production-realistic scenarios `Mat`
- [x] Every step mapped to OM module with gap identified `Piotr`
- [x] Domain events explicitly named — AgencyTierChanged, CampaignPublished, RfpAwarded `Mat`
- [x] Challenger review: 2026-03-20 — WIP formula fixed (stamp-based), MIN attribution workflow added, tier governance state machine added, 3 pushbacks documented

#### Checklist (overall)
- [x] 5 core workflows defined (3-7 range) `Mat`
- [ ] No workflow requires >200 lines — all under except WF3 full (deferred to Phase 4 with workaround) `Piotr`

---

## 4. Workflow Gap Analysis `Piotr`

> Gap analysis maps each workflow step to OM platform capability.
> Gap score = how much new code is needed. Lower = better.
> Piotr checkpoint: verify mapping is correct before proceeding.

### Gap Scoring — Atomic Commits (Ralph Loop)

Each gap is measured in **atomic commits** — one self-contained, testable increment that a single focused development loop can deliver (commit = entity + route + test, or widget + injection + i18n, etc.). This replaces lines-of-code which doesn't account for boilerplate, tests, or config.

| Score | Meaning | Example |
|-------|---------|---------|
| 0 | Platform does it, zero commits | RBAC role in setup.ts |
| 1 | 1 commit: config/seed only | Pipeline stages in seedDefaults |
| 2 | 1-2 commits: small gap | Widget injection + i18n |
| 3 | 2-3 commits: medium gap | Entity + CRUD route + backend page |
| 4 | 3-5 commits: large gap | Multi-entity + pages + workflow definition |
| 5 | 5+ commits or external dependency | External API integration + LLM pipeline |

### Per-Workflow Gap Matrix

#### WF1: Agency Onboarding — Total: 4 atomic commits (Phase 1: 2, Phase 4: 2)

| Step | OM Module | Gap | Commits | Scope | Notes |
|------|-----------|-----|---------|-------|-------|
| PM invites agency admin | auth module | No invite-by-email in auth | 0 (Ph1) / 2 (Ph4) | `app` (Ph1 zero commits) / `core-module` (Ph4 — FLAG: invitation flow requires auth module changes) | Phase 1: self-onboard workaround. Phase 4: invitation flow (email template + API route + UI) — upstream PR + core team approval required |
| Admin sets password | auth module | Covered | 0 | — | Standard password reset flow |
| Admin fills company profile | entities module (custom fields) | Covered | 1 | `app` | Seed custom field definitions in setup.ts |
| Admin adds case study | entities module (custom entity) | Covered | 0 | — | Bundled with profile seed above (same commit) |
| Admin invites BD/Contributor | auth module | Same as invite gap | 0 | — | Shared with PM invite mechanism |
| BD onboarding sub-workflow | workflows module | Covered (SUB_WORKFLOW) | 1 | `app` | Workflow JSON definition |
| Onboarding checklist tracking | workflows module | Covered (USER_TASK) | 0 | — | Bundled with workflow definition above |

#### WF2: Pipeline Building (WIP) — Total: 2 atomic commits

| Step | OM Module | Gap | Commits | Scope | Notes |
|------|-----------|-----|---------|-------|-------|
| BD creates Company | customers module | Covered | 0 | — | |
| BD creates Deal | customers module | Covered | 0 | — | |
| Pipeline stages + `wip_registered_at` field | customers module + entities | Covered | 1 | `app` | Seed PRM pipeline stages + WIP custom field in setup.ts |
| BD moves deal to SQL | customers module | Covered | 0 | — | Pipeline UI exists |
| WIP stamp on stage change | UMES API interceptor | Gap: interceptor | 1 | `app` | Stamps `wip_registered_at` when deal first reaches SQL+. Immutable, first qualification only. |
| WIP displayed on dashboard | partnerships widget | Covered | 0 | — | Bundled with interceptor commit. Phase 1: live query (`COUNT WHERE wip_registered_at IN month`). Phase 2+: same query, can also be used by aggregation worker. |

**Piotr note:** Spec said "scheduler module" — **no such module exists on upstream.** OM has `queue` package with workers, but no built-in cron trigger. Worker needs an external trigger: system crontab, Docker cron, or API endpoint called externally. This applies to all "scheduled job" gaps (WF3, WF5). WF2 no longer needs a scheduled worker — WIP is stamp-based with live query.

#### WF3: Code Contribution (WIC) — Total: 3 atomic commits (with workaround) / 5-6 (full, n8n)

| Step | OM Module | Gap | Commits | Scope | Notes |
|------|-----------|-----|---------|-------|-------|
| GitHub PR merged | external | N/A | — | `external` | Outside OM |
| Daily job fetches PRs | n8n workflow + open-mercato/n8n-nodes | Gap: n8n workflow definition | 2-3 (Ph4) | `n8n` | n8n Schedule → GitHub GraphQL → Code (scoring) → Open Mercato node (POST import API). Scoring logic from wic_assessment.mjs. |
| GH username -> User mapping | entities (custom field on User) | Gap: field definition | 1 | `app` | Custom field seed in setup.ts |
| Score recorded | partnerships entities | Covered | 0 | — | Entity already in spec |
| Score displayed | partnerships backend | Gap: widget | 1 | `app` | Widget injection on dashboard |
| PM override | workflows USER_TASK | Covered | 0 | — | Workflow step, bundled with tier workflow |
| **WORKAROUND: Manual import** | partnerships API | Gap: import route | 1 | `app` | Import API validates against WicScoringResult schema, enforces Feature Key dedup invariant, versioned import (re-import replaces + archives old). WicAssessmentSource = `manual_import`. |

**Workaround detail:** Instead of automated GitHub+LLM pipeline (5+ commits), PM runs external script and imports via API. Commits drop from 8+ to 3. Automated pipeline deferred to Phase 4. Phase 4 uses same ContributionUnit entities but with WicAssessmentSource = `automated_pipeline`.

#### WF4: Lead Distribution (RFP) — Total: 4 atomic commits

RFP lifecycle uses workflows module: START → SEND_EMAIL → WAIT_FOR_TIMER → USER_TASK (PM evaluation) → END. One workflow instance per campaign. BD responses are submitted via PartnerRfpResponse CRUD API while the workflow waits for the timer — not a workflow step.

| Step | OM Module | Gap | Commits | Scope | Notes |
|------|-----------|-----|---------|-------|-------|
| PM creates RFP campaign | partnerships entities + workflows | Gap: entity + workflow def | 2 | `app` | 1: PartnerRfpCampaign entity + CRUD route. 2: Workflow JSON definition + trigger |
| System notifies agencies | workflows SEND_EMAIL | Covered | 0 | — | Workflow activity — zero code |
| BD sees RFP + submits response | partnerships CRUD API | Gap: response entity | 1 | `app` | PartnerRfpResponse entity + CRUD route. BD submits via API while workflow waits for timer. Late submissions rejected by route (deadline check). |
| PM evaluates responses | partnerships backend | Gap: comparison page | 1 | `app` | Side-by-side backend page |
| PM selects winner | workflows USER_TASK | Covered | 0 | — | Workflow completes, status updated |

#### WF5: Tier Governance — Total: 5 atomic commits

| Step | OM Module | Gap | Commits | Scope | Notes |
|------|-----------|-----|---------|-------|-------|
| KPI aggregation (WIC+WIP+MIN) | queue worker + partnerships | Gap: worker + logic | 1 | `app` | Worker reads WIC (from ContributionUnits), WIP (from `wip_registered_at` stamps), MIN (from PartnerLicenseDeals). Computes TierEligibility per org. |
| Grace period check + TierChangeProposal | partnerships | Gap: state machine + entity | 1 | `app` | Reads TierEvaluationState, applies grace period state machine (OK → GracePeriod → ProposedDowngrade). Creates TierChangeProposal (one per org per period max). Bundled with aggregation. |
| PM approval | workflows USER_TASK | Covered | 0 | — | Workflow JSON definition (bundled with tier workflow) |
| Tier workflow definition | workflows | Gap: workflow JSON | 1 | `app` | Tier evaluation workflow: START → AUTOMATED (aggregate + grace check) → USER_TASK (PM approval) → END. Publishes AgencyTierChanged event on approval. |
| Tier updated + audit | partnerships | Gap: command | 0 | — | Bundled with workflow — UPDATE_ENTITY activity + audit log |
| Agency sees tier + progress | partnerships backend | Gap: widget | 1 | `app` | Widget injection on dashboard (with grace period warning, TierEligibility vs TierAssignment) |
| MIN attribution (cross-org search) | partnerships + search | Gap: search + attribution UI | 1 | `app` | Cross-org company search + CRM read-only jump + PartnerLicenseDeal creation. Moved from Phase 3 to Phase 2. |

### Gap Summary

| Workflow | Business Priority | Atomic Commits (raw) | Workaround? | Commits (effective) | Blocks ROI? | Scope flags |
|----------|------------------|---------------------|-------------|---------------------|-------------|-------------|
| WF2: Pipeline (WIP) | High | 2 | No | 2 | Yes — core flywheel | — |
| WF1: Onboarding | High | 4 | Partial (self-onboard Ph1) | 2 (Ph1) | Yes — enables all other WFs | FLAG `core-module`: Ph4 invitation flow requires auth module changes (upstream PR + core team approval) |
| WF5: Tier Governance | High | 5 | No | 5 | Yes — governance loop | — |
| WF4: RFP | Medium | 4 | No | 4 | Partial — PM can email manually | — |
| WF3: WIC | Medium | 5-6 | Yes (manual import Ph1-3, n8n Ph4) | 3 | Yes — but workaround unblocks | `external` (GitHub, not a blocker); `n8n` (Ph4 automation) |
| **Total** | | **20-21** | | **15 (Ph1-3)** | | **1 core-module flag (Ph4 only, not on critical path for Ph1-3)** |

**Piotr finding — no scheduler module:** "Scheduled job" gaps (WF3/WF5) reference a scheduler that doesn't exist on OM upstream. The `queue` package provides workers but no cron trigger. Solution: one shared commit adds a cron trigger mechanism (external crontab or API endpoint) that enqueues jobs. This is **1 additional commit** counted once. Note: WF2 no longer needs a scheduled worker — WIP is stamp-based with live query.

#### Checklist
- [x] Every workflow step scored in atomic commits `Mat`
- [x] Piotr checkpoint: workflow-to-OM mapping verified — all modules confirmed on upstream/develop, scheduler gap identified and documented `Piotr`

---

## 4.5 Module Architecture `Piotr`

> Consolidated view of which OM modules PRM uses, how it extends them, and what new modules it creates.

### OM Core modules used

| Module | Usage | Extension points used | Notes |
|--------|-------|----------------------|-------|
| `customers` | extend | Custom fields on company entity (profile data), custom entity (case studies) | Agencies ARE customers — no separate agency entity |
| `customer_accounts` | extend | `defaultCustomerRoleFeatures` in setup.ts | Portal auth for agency roles (partner_admin, partner_member, partner_contributor) |
| `entities` | extend | Custom entities via `ce.ts`, custom fields via setup.ts | Case studies, tier proposals, WIC snapshots |
| `workflows` | extend | Workflow JSON seed | SEND_EMAIL on stage transitions, tier review notifications |
| `auth` | as-is | — | User management for PM role. No customization. |

### Official modules (existing or proposed)

| Module | Status | Usage | Extension points | Rationale |
|--------|--------|-------|-----------------|-----------|
| — | — | — | — | No official modules needed for PRM. All gaps are app-specific domain logic or OM core extensions. |

### App modules

| Module | Responsibility | Entities owned | Notes |
|--------|---------------|----------------|-------|
| `partnerships` | All PRM domain logic: onboarding, WIP tracking, WIC assessment, tier management, RFP | case_study, tier_change_proposal, wic_snapshot, rfp, rfp_response | Single module — all entities share invariants (org scoping, tier rules, WIP/WIC calculations) |

#### Checklist
- [x] Every OM core module listed with explicit usage type and extension points `Piotr`
- [x] Every official module listed — none needed, all gaps are app-specific `Piotr`
- [x] Reusability check: PRM domain logic (tiers, WIP/WIC, RFP) is specific to partner relationship management — not reusable as official module `Piotr`
- [x] App module count justified — 1 module (`partnerships`). All entities share org-scoped invariants and tier calculation dependencies. Splitting would break transactional consistency. `Piotr`
- [x] No direct modification of core or official module code — all extensions via UMES (interceptors, widget injection, custom fields, defaultCustomerRoleFeatures) `Mat + Piotr`
- [x] Module boundaries align with bounded context boundaries — partnerships is one bounded context: agency lifecycle from onboarding through tier management `Vernon`

---

## 5. User Stories `Mat`

> Each story traces to a workflow step. Story = atomic action by one persona with measurable success.
> Format: As [persona], I [action], so that [business outcome]. Success: [testable criteria].

### WF1: Agency Onboarding

**US-1.1** (Phase 1) As PM, I share a signup link with an agency admin so that they can self-register and join the partner program.
Success: Admin opens link, creates account, sets password, sees scoped backend dashboard for their org.

**US-1.1b** (Phase 4) As PM, I invite an agency admin by email so that a new agency can join the partner program without manual link sharing.
Success: Admin receives email with signup link, clicks it, sets password, sees scoped backend dashboard.

**US-1.2** As Agency Admin, I fill my company profile (services, industries, tech stack) so that OM has data for lead matching.
Success: Profile saved, visible to PM via org switcher, fields match case study categories.

**US-1.3** As Agency Admin, I add at least one case study (project type, tech, budget, duration) so that PM has evidence for RFP scoring.
Success: Case study saved as custom entity, visible in agency profile, linked to company.

**US-1.4** As Agency Admin, I invite a BD by email so that someone can start building pipeline.
Success: BD receives email, sets password, sees CRM + KPI dashboard scoped to our org.

**US-1.5** As Agency Admin, I invite a Contributor by email so that their code contributions are tracked under our agency.
Success: Contributor receives email, sets password, sees WIC score dashboard scoped to our org. Nothing else visible.

**US-1.6** As BD, I add my first prospect and create a deal so that my onboarding is complete.
Success: Company + Deal created in CRM, onboarding workflow marks BD step as done.

**US-1.7** As Agency Admin, I see a checklist on my dashboard showing which onboarding steps I've completed and which remain so that I know what to do next without asking PM.
Success: Dashboard widget shows checklist: fill company profile (done/pending), add case study (done/pending), invite BD (done/pending), invite Contributor (done/pending). Each item links to the relevant page. Completed items show checkmark. Widget disappears when all items are done.

**US-1.8** As BD, I see a checklist on my dashboard showing my onboarding steps so that I know I need to create my first deal.
Success: Dashboard widget shows: add prospect company (done/pending), create first deal (done/pending). Links to CRM. Disappears when done.

### WF2: Pipeline Building (WIP)

**US-2.1** As BD, I create a deal in CRM on a prospect company so that it enters our pipeline.
Success: Deal appears in pipeline view, assigned to correct stage.

**US-2.2** As BD, I move a deal to "Sales Qualified Lead" stage so that it counts as WIP.
Success: Deal stage updated, API interceptor stamps `wip_registered_at` with current timestamp. WIP count visible on KPI dashboard immediately (live query). Stamp is immutable — moving deal backward and forward does not re-stamp.

**US-2.3** As PM, I audit pipeline activity per agency per month so that I can flag underperforming agencies before tier evaluation.
Success: Dashboard shows table of agencies with WIP count for selected period. PM can filter by period and sort by WIP count.

### WF3: Code Contribution (WIC)

**US-3.1** As Contributor, I link my GitHub username to my OM profile so that my contributions are tracked.
Success: GH username field saved on User, visible to WIC import process.

**US-3.2** As PM, I import WIC scores from external assessment so that contributor scores are up to date.
Success: Upload CSV/markdown for a given org+month, system validates against WicScoringResult schema, enforces Feature Key dedup invariant, maps GH profiles to users. If importing for an org+month that already has data, old assessment archived (with timestamp), new one becomes primary. WicAssessmentSource = `manual_import`.

**US-3.3** As Contributor, I verify my WIC score and level breakdown so that I can flag missing contributions to my Admin.
Success: Dashboard shows: total WIC this month, per-contribution breakdown (feature key, level, bonus). Contributor can identify if a merged PR is missing.

**US-3.4** (Phase 4) As PM, I rely on automated daily WIC scoring via n8n so that I don't need to manually import scores.
Success: n8n workflow runs daily (Schedule Trigger → GitHub GraphQL → scoring → POST to import API via open-mercato/n8n-nodes). Contributors see updated scores without PM intervention. PM sees n8n run history, can trigger manual re-run in n8n UI. WicAssessmentSource = `automated_pipeline`.

### WF4: Lead Distribution (RFP)

**US-4.1** As PM, I create an RFP campaign with requirements, deadline, and file attachments (lead brief, specs) so that agencies can bid with full context.
Success: Campaign created with attached files, workflow triggered, target agencies (all/selected/tier-filtered) notified.

**US-4.2** As BD, I receive notification of a new RFP so that I can decide whether to respond.
Success: BD sees notification (in-app or email via workflow SEND_EMAIL), clicks through to RFP details, attached files, and deadline.

**US-4.3** As BD/Admin, I submit a free-form response to an RFP (like an email — text + optional attachments) so that PM can evaluate our fit.
Success: Response saved via PartnerRfpResponse CRUD API (not a workflow step — BD submits while workflow waits for timer). Late submissions rejected (deadline check in route). PM sees it in campaign responses list. Agency's case studies automatically linked for PM context.

**US-4.4** As PM, I compare agency responses side-by-side and select a winner so that the lead is assigned to the best-fit agency.
Success: Comparison view shows all responses with agency case studies. PM reads responses, selects winner, workflow advances (RfpAwarded event), losing agencies notified of outcome.

**US-4.5** (Phase 4) As PM, I trigger AI-assisted scoring of RFP responses so that I have objective tech fit and domain fit scores before selecting a winner.
Success: PM clicks "Score responses" on comparison page → n8n webhook triggered → n8n reads RFP + responses + case studies via Open Mercato node → LLM scores each agency (tech fit /5 + domain fit /5 with reasoning, per lead-agency-matching rubric) → scores POSTed back to OM → displayed on comparison page. PM uses scores as guidance, makes final call.

### WF5: Tier Governance

**US-5.1** As PM, I trust that KPIs are aggregated monthly per agency so that tier proposals are based on current data.
Success: Scheduled job runs monthly, computes TierEligibility per org from WIC (ContributionUnits), WIP (`wip_registered_at` count), MIN (PartnerLicenseDeals). PM sees last-run timestamp.

**US-5.2a** As PM, I receive tier upgrade proposals so that I can reward agencies that have grown.
Success: System computes TierEligibility above current TierAssignment, generates TierChangeProposal (type: upgrade) with current KPI values vs next-tier thresholds. One proposal per org per period max.

**US-5.2b** As PM, I receive tier downgrade proposals only after grace period expires so that agencies get a fair chance to recover.
Success: First month below threshold: TierEvaluationState moves to GracePeriod, no proposal. Second consecutive month: moves to ProposedDowngrade, TierChangeProposal (type: downgrade) created. If agency recovers during grace month: state resets to OK, no proposal.

**US-5.3** As PM, I approve or reject a tier change with a reason so that governance is auditable.
Success: PM sees proposal (TierChangeProposal in PendingApproval state), approves/rejects with reason. On approval: TierAssignment updated, AgencyTierChanged event published, audit log created. On rejection: proposal moves to Rejected state with reason.

**US-5.4** As Agency Admin, I see my agency's current tier and progress toward next level so that I can motivate my team.
Success: Dashboard shows: current tier, KPI values vs thresholds, % progress to next tier, grace period warning if below threshold.

**US-5.5** As BD, I see my agency's tier status and my personal contribution to KPIs so that I know my impact.
Success: Dashboard shows: current tier, agency WIP count (with my deals highlighted), WIC score for my org.

**US-5.6** As PM, I attribute a license sale to the agency that brought the company into pipeline so that MIN is tracked for tier evaluation.
Success: PM opens "Create License Deal" -> searches all companies across all agencies (cross-org, Program Scope) -> sees results with agency name, company name, date created, deal count -> clicks company -> jumps to that agency's CRM (read-only) to verify deals, people, history -> confirms -> PartnerLicenseDeal created with: agency attribution, industry tag, license identifier. MIN count increments for that agency's calendar year. No double-attribution (unique: license identifier + year). Visible on KPI dashboard.

### Cross-workflow

**US-6.1** As PM, I switch between agency organizations so that I can review any agency's CRM, KPIs, and tier status.
Success: Org switcher shows all agencies, PM selects one, sees that agency's data read-only. PM's own actions (RFP, tier approval) remain in PM context.

### Distribution (SPEC-068)

**US-7.1** As a Developer, I run `create-mercato-app --example prm` and get a running PRM app so that I can see how OM solves partner relationship management.
Success: One command → app scaffolded with PRM modules in `src/modules/`. `yarn install && yarn initialize` → app starts with demo data. Developer sees working dashboards, CRM with deals, tier widgets — no manual setup needed.

**US-7.2** As a Developer, I run `yarn initialize` and can immediately log in as any persona so that I can test every role's experience without manual user/role setup.
Success:
- Each role from §2 Identity Model has at least one seeded user with a known password (logged to console at seed time)
- Demo user emails follow `{role}@demo.local` pattern (e.g. `partner-admin@demo.local`)
- Login with each demo user shows only the UI and data their role permits
- Seeding is idempotent — running `yarn initialize` twice does not create duplicates

**US-7.3** As a Developer, I run `yarn initialize` and see example data that exercises every workflow so that I understand what the app does without reading docs first.
Success: `seedExamples` populates:
- 3 demo agencies (different tiers: OM Agency, AI-native Agency, AI-native Expert) with company profiles and case studies
- Demo BD users per agency with deals at various pipeline stages (some with `wip_registered_at` stamps)
- Demo Contributor users with GH usernames linked
- Demo WIC scores (ContributionUnits for current and previous month)
- Demo PartnerLicenseDeals (MIN attribution for demo agencies)
- Demo tier history (TierAssignments showing progression)
- 1 demo RFP campaign (Published, with agency responses and a selected winner)
All data is clearly labeled as demo (e.g., company names like "Acme Agency (Demo)").

**US-7.4** As a Developer, I read any piece of PRM code and understand which OM pattern it uses so that I can apply the same pattern to my own app.
Success: Every file follows OM conventions (auto-discovery paths, UMES patterns, setup.ts hooks). Code comments reference the pattern name when non-obvious. README in `src/modules/partnerships/` explains the module structure and which OM capabilities each file demonstrates.

#### Checklist
- [x] Every story has: persona + action + measurable outcome + success criteria
- [x] Every story traces to a workflow step — US-x.y maps to WFx (US-7.x maps to SPEC-068)
- [x] Identity checkpoint per story — all app personas are User with specific role keys from §2. Developer is a CLI user, not an app user.
- [x] No weak stories — all have concrete actions with observable results

---

## 6. User Story Gap Analysis `Piotr`

> Map each story to OM capability. Piotr checkpoint: verify mapping.

| Story | Platform Match | Atomic Commits | Scope | Notes |
|-------|---------------|----------------|-------|-------|
| US-1.1 | auth module (self-onboard) | 0 | — | Standard signup flow, zero code. Known limitation: no enrollment event for audit trail (accepted for Phase 1). |
| US-1.1b | auth module (Phase 4: email invitation) | 2 | `core-module` FLAG — invitation flow requires auth module changes (upstream PR + core team approval) | Email template + invitation API route + UI |
| US-1.2 | entities module custom fields | 1 | `app` | Seed field definitions in setup.ts (includes CaseStudy minimum required fields) |
| US-1.3 | entities module custom entity | 0 | — | Bundled with US-1.2 seed commit |
| US-1.4 | auth module | 0 | — | Same mechanism as self-onboard / invitation |
| US-1.5 | auth module | 0 | — | Same mechanism |
| US-1.6 | customers module CRM | 0 | — | Zero code — CRM exists |
| US-1.7 + US-1.8 | partnerships widget injection | 1 | `app` | Onboarding checklist widget. Role-conditional (Admin sees 4 items, BD sees 2). Completion derived from live data queries (profile, case study, users, deals). Disappears when done. |
| US-2.1 | customers module CRM | 0 | — | Zero code |
| US-2.2 | UMES API interceptor + entities custom field | 1 | `app` | Interceptor stamps `wip_registered_at` on deal at SQL stage. Custom field seeded in setup.ts (bundled with US-1.2). Interceptor = 1 commit. |
| US-2.3 | partnerships widget injection | 1 | `app` | KPI dashboard widget. Live query: `COUNT WHERE wip_registered_at IN month`. No batch worker needed. |
| US-3.1 | entities custom field on User | 1 | `app` | GH username field seed in setup.ts. Unique, immutable once WIC recorded. |
| US-3.2 | partnerships import API | 1 | `app` | Import route validates WicScoringResult schema, enforces Feature Key dedup, versioned import (replace+archive). |
| US-3.3 | partnerships backend widget | 0 | — | Bundled with US-2.3 KPI dashboard (same widget, scoped data) |
| US-3.4 | n8n workflow (GitHub+LLM) → POST to import API — Phase 4 | 2-3 | `n8n` | n8n workflow definition + n8n-nodes enhancements + docs. WicAssessmentSource = `automated_pipeline`. |
| US-4.1 | partnerships entity + workflows | 2 | `app` | 1: PartnerRfpCampaign entity (with file attachments) + CRUD route. 2: RFP workflow JSON definition. CampaignPublished event. |
| US-4.2 | workflows SEND_EMAIL | 0 | — | Covered by workflow activity |
| US-4.3 | partnerships CRUD API | 1 | `app` | PartnerRfpResponse entity (free-form text + attachments) + CRUD route. BD submits via API while workflow waits for timer. Deadline enforced in route. Auto-links agency case studies. |
| US-4.4 | partnerships backend page | 1 | `app` | Comparison page (responses + case studies side-by-side) + workflow advance. RfpAwarded event. |
| US-4.5 | n8n webhook + LLM — Phase 4 | 1-2 | `n8n` | n8n workflow: webhook trigger → Open Mercato node (read data) → LLM node (score) → Open Mercato node (POST scores). Scoring rubric from lead-agency-matching skill. |
| US-5.1 | queue worker + partnerships | 1 | `app` | Aggregation worker: reads WIC (ContributionUnits), WIP (`wip_registered_at`), MIN (PartnerLicenseDeals). Computes TierEligibility. Cron trigger shared. |
| US-5.2a/b | partnerships + TierEvaluationState | 0 | — | Bundled with US-5.1 (grace period state machine + TierChangeProposal generation in same worker) |
| US-5.3 | workflows USER_TASK | 1 | `app` | Tier evaluation workflow JSON definition. Publishes AgencyTierChanged on approval. |
| US-5.4 | partnerships widget injection | 1 | `app` | Tier progress widget (TierEligibility vs TierAssignment, grace period warning) |
| US-5.5 | partnerships widget | 0 | — | Scoped view of US-5.4 widget |
| US-5.6 | partnerships entity + search + CRUD | 2 | `app` | 1: PartnerLicenseDeal entity + PM-only CRUD. 2: Cross-org company search + CRM read-only jump + attribution UI. |
| US-6.1 | auth org switcher (Program Scope) | 0 | — | Platform feature (`organizationsJson: null`) |
| — | Cron trigger mechanism (shared) | 1 | `app` | External crontab or API trigger for WF3/WF5 scheduled workers |
| US-7.1 | create-mercato-app + SPEC-068 | 0 | — | SPEC-068 provides the `--example` flag. PRM is the content, not the mechanism. |
| US-7.2 | setup.ts `seedExamples` | 1 per phase | `app` | Each phase adds demo data to `seedExamples`: Ph1 = agencies+deals, Ph2 = WIC+tiers+MIN, Ph3 = RFP campaign. Bundled with phase commits — not a separate commit. |
| US-7.3 | code conventions + README | 0 | `app` | No separate commit — conventions followed throughout. Module README written once at Phase 1. |
| **Total** | | **16 (Ph1-3) + 6-8 (Ph4) = 22-24** | | seedExamples bundled per phase, not additional commits |

#### Checklist
- [x] Every story mapped to specific OM module/mechanism with atomic commit estimate `Mat`
- [x] Piotr checkpoint: story-to-OM mapping verified — simplest solution per story, no overengineering, scheduler gap flagged `Piotr`
- [x] SPEC-068 distribution stories (US-7.x) mapped — seedExamples bundled per phase, zero extra commits

---

## 7. Phasing & Rollout Plan `Mat`

> Phasing logic:
> - High business priority + Low gap = ship first
> - High business priority + High gap + BLOCKER = find workaround, ship with workaround
> - High business priority + High gap + not blocker = defer
> - Low business priority + any gap = defer

### Phase 1: Core Loop (WF2 + WF1 foundation)

**Goal:** Agency can onboard and start building pipeline. PM can see activity.

**Why first:** WF2 (WIP) has lowest gap (2 commits) and is the core flywheel. WF1 (onboarding) enables it. Together they unlock "agencies generating pipeline."

| Story | What ships | Commits |
|-------|-----------|---------|
| US-1.1 | Self-onboard (PM shares signup link manually). Known limitation: no formal enrollment event for audit trail. | 0 |
| US-1.2 + US-1.3 | Company profile custom fields + case study custom entity + CaseStudy minimum required fields (seed in setup.ts) | 1 |
| US-1.4 | Admin invites BD (same self-onboard mechanism) | 0 |
| US-1.5 | Admin invites Contributor (same mechanism) | 0 |
| US-1.6 | BD creates first deal (CRM ready) | 0 |
| US-2.1 | Deal creation (CRM ready) | 0 |
| US-2.2 | WIP stamp interceptor (`wip_registered_at` on SQL stage) + pipeline stages + custom field (seeded in setup.ts) | 1 |
| US-2.3 | WIP count widget on PM dashboard (live query: `COUNT WHERE wip_registered_at IN month`) | 1 |
| US-1.7 + US-1.8 | Onboarding checklist widget — Admin sees profile/case study/invite steps, BD sees prospect/deal steps. Disappears when done. | 1 |
| US-6.1 | PM org switcher / Program Scope (cross-agency visibility) | 0 |

**Total: 4 atomic commits** (setup.ts seed + WIP interceptor + KPI dashboard widget + onboarding checklist widget)
**Workaround:** Invitation flow replaced by PM sharing signup link manually. Good enough for 15 agencies.

**Acceptance criteria:** `Vernon writes, Mat challenges`

**Domain criteria** `Vernon` (10 criteria — all accepted by Mat):
- [ ] `wip_registered_at` is never overwritten once set — moving a stamped deal backward and forward does not change the timestamp
- [ ] `wip_registered_at` is only stamped when deal transitions INTO SQL+ for the first time — not on creation, not on non-qualifying stage changes
- [ ] A deal without `wip_registered_at` does not appear in any WIP count regardless of pipeline stage
- [ ] `wip_registered_at` stored in UTC; WIP period attribution uses UTC month boundaries (stamped 2026-03-31T23:59:59Z = March)
- [ ] Every Deal has non-null `organization_id` matching BD's org at creation time
- [ ] Company records scoped to BD's org — no cross-org CRM data leaks
- [ ] BD cannot create or modify `wip_registered_at` directly — only the API interceptor writes it
- [ ] PM's org switcher reads are read-only — no write operations through switched-org context
- [ ] Case study requires minimum fields: `title`, at least one `industry`, at least one `technologies`, `budget_bucket`, `duration_bucket` — partial saves rejected at entity level
- [ ] WIP live-query widget scopes by authenticated user's org (or PM's switched org) — no unscoped cross-org counts
- [ ] Onboarding checklist widget visible only to users who have incomplete onboarding steps — not shown to PM, not shown after completion
- [ ] Checklist completion state derived from live data (profile fields non-empty, case study exists, users with BD/Contributor role exist in org, deal exists) — not from a separate flag that can drift

**Business criteria** `Mat`:
- [ ] PM can onboard an agency (share link → Admin creates account → fills profile → adds case study → invites BD)
- [ ] BD can log a deal and move it to SQL → WIP count appears on dashboard immediately
- [ ] PM can switch between agencies and see each agency's CRM data (read-only) and WIP count
- [ ] Admin logs in for the first time and sees a checklist telling them exactly what to do: fill profile, add case study, invite BD, invite Contributor
- [ ] BD logs in for the first time and sees a checklist: add prospect company, create first deal
- [ ] Checklist items link to the right page. Completed items show checkmark. Widget disappears when all done.
- [ ] Scaffold boilerplate removed — no `example` module, no empty module directories in `src/modules/`

**Value delivered:**
- **Business value:** Pipeline visibility. PM knows which agencies are generating prospects. Without this, PM has zero data on agency activity.
- **ROI metric:** Number of active agencies with ≥1 WIP. Target: 3+ agencies onboarded and logging deals.

**Platform ROI** (example app patterns demonstrated):
- RBAC roles with org scoping — `partner_admin`, `partner_member`, `partner_contributor` via setup.ts
- CRM as core tool — agencies use `customers` module backend, not custom CRUD
- Custom fields + custom entities via `entities` module — company profile, case studies
- UMES API interceptor — `wip_registered_at` stamp on deal stage change
- Widget injection — KPI dashboard widget + onboarding checklist widget (role-conditional, data-driven)
- Org switcher for cross-org visibility — PM sees all agencies read-only
- Pipeline stages seeded via setup.ts — PRM-specific deal stages
- **Copy test:** Every piece of Phase 1 code shows "this is how you extend OM with RBAC + CRM + UMES"

**seedExamples for Phase 1** (SPEC-068, US-7.2):
- 3 demo agencies with company profiles + case studies (different verticals)
- 1 PM user, 1 Admin + 1 BD + 1 Contributor per agency
- Demo deals at various pipeline stages (some with `wip_registered_at` stamps, some not yet at SQL)
- All demo data labeled clearly (e.g., "Acme Digital (Demo)")

**Mat's challenges:** All 10 domain criteria accepted. Essential WIP integrity rules — no over-engineering.

### Phase 2: Governance + KPI Visibility + MIN (WF5 + WF3 workaround)

**Goal:** PM can evaluate tiers with all 3 KPIs. WIC scores visible via manual import. MIN attribution enabled.

**Why second:** Tier governance (WF5) makes the program meaningful — without tiers, agencies have no incentive. WIC (WF3) is a blocker for tier evaluation but the automated pipeline is too expensive. Workaround: PM imports WIC scores manually. MIN moved here so tier evaluation has all 3 KPI inputs (Vernon finding: tier eval without MIN = broken invariant).

| Story | What ships | Commits |
|-------|-----------|---------|
| US-3.1 | GH username field on User profile (unique, immutable once WIC recorded) | 1 |
| US-3.2 | WIC manual import API (validates WicScoringResult schema, Feature Key dedup, versioned replace+archive) | 1 |
| US-3.3 | WIC score display (bundled with KPI dashboard from Phase 1) | 0 |
| US-5.1 + US-5.2a/b | KPI aggregation worker + TierEligibility computation + grace period state machine + TierChangeProposal (bundled) | 1 |
| US-5.3 | Tier evaluation workflow JSON definition (publishes AgencyTierChanged) | 1 |
| US-5.4 + US-5.5 | Tier progress widget (Admin + BD scoped views, TierEligibility vs TierAssignment, grace period warning) | 1 |
| US-5.6 | PartnerLicenseDeal entity + PM-only CRUD + cross-org company search + attribution UI | 2 |
| Cron trigger | External trigger mechanism for scheduled workers (WF3 import trigger, WF5 tier evaluation) | 1 |

**Total: 8 atomic commits** (GH field + import API + aggregation worker + tier workflow + tier widget + MIN entity + MIN attribution UI + cron trigger)
**Workaround:** WIC automated pipeline deferred. PM runs external `wic_assessment.mjs` script and imports via API.

**Acceptance criteria:** `Vernon writes, Mat challenges`

**Domain criteria** `Vernon` (18 accepted, 1 clarified by Mat):
- [ ] GH username unique across entire system — duplicate rejected with validation error
- [ ] GH username immutable for non-PM actors once ContributionUnit recorded against it
- [ ] At most one open TierChangeProposal per org per evaluation period — re-running worker is a no-op, not a duplicate
- [ ] TierEvaluationState transitions one-directional within period: OK → GracePeriod → ProposedDowngrade (no skipping)
- [ ] GracePeriod resets to OK only when ALL thresholds met (conjunctive) — partial recovery does not reset
- [ ] PartnerLicenseDeal references exactly one CRM Company (non-null, non-array)
- [ ] No double-attribution: unique key `(license_identifier, year)` enforced at database level
- [ ] MIN counted only if `type=enterprise, status=won, is_renewal=false` — all three enforced by aggregation query
- [ ] Every ContributionUnit has non-null `organization_id` from contributor's org membership at import time
- [ ] WIC import for org+month archives previous assessment and replaces — exactly one active assessment per org+month (clarified: dedup is at assessment level, not per-unit)
- [ ] `WicAssessmentSource` always set on import — no null or unrecognized source values
- [ ] TierAssignment only mutated via PM-approval path — no worker can directly update active tier
- [ ] Approved TierChangeProposal is immutable — cannot be re-approved or re-rejected
- [ ] `AgencyTierChanged` published on every PM approval with full payload (agencyId, previousTier, newTier, effectiveDate, approvedBy)
- [ ] `AgencyTierChanged` NOT published on rejection
- [ ] Agency users cannot create/update/delete PartnerLicenseDeal — PM-only routes
- [ ] WIC import rejects unmatched GH usernames with rejection list — no ghost users
- [ ] MIN calendar year boundary is UTC (Dec 31 23:59:59Z = current year, Jan 1 00:00:00Z = next year)
- [ ] WIC import API rejects non-conforming records (missing fields, unknown levels, bad month format) — 422 with field-level errors, no partial batch insertion

**Business criteria** `Mat`:
- [ ] Contributor can link GH username to profile
- [ ] PM can import WIC scores (upload → system validates → replaces previous import for same org+month)
- [ ] PM can attribute a license sale to an agency (cross-org company search → verify in CRM → create PartnerLicenseDeal)
- [ ] System evaluates tiers monthly: computes TierEligibility, applies grace period, generates TierChangeProposal
- [ ] PM can approve/reject tier changes with reason. AgencyTierChanged event published on approval.
- [ ] Agency Admin sees current tier, KPI values vs thresholds, progress %, grace period warning

**Value delivered:**
- **Business value:** Governance active. The partner program has meaning — agencies with strong KPIs get higher tiers, underperformers get grace period then downgrade. PM saves ~4h/week of manual spreadsheet work.
- **ROI metric:** Number of agencies with evaluated tiers. PM approval turnaround < 1 week. Grace period correctly applied for agencies below threshold.

**Platform ROI** (example app patterns demonstrated):
- Queue workers — KPI aggregation worker with idempotent processing
- Workflow JSON definitions — tier evaluation workflow (START → AUTOMATED → USER_TASK → END)
- Import API with validation — WicScoringResult schema enforcement, versioned replace+archive
- Custom entities with business invariants — ContributionUnit, TierChangeProposal, PartnerLicenseDeal
- Cross-org search — PM searches all agencies' CRM for MIN attribution
- Cron trigger mechanism — external trigger for scheduled workers
- **Copy test:** Phase 2 shows "this is how you build governance with workers + workflows + validated imports"

**seedExamples for Phase 2** (SPEC-068, US-7.2):
- Demo WIC scores (ContributionUnits for 2 months — current and previous)
- Demo PartnerLicenseDeals (MIN attribution for 2 agencies)
- Demo TierAssignments: Agency 1 = OM Agency, Agency 2 = AI-native Agency, Agency 3 = AI-native Expert
- Demo TierChangeProposal (one approved upgrade, one in GracePeriod)
- GH usernames linked on demo Contributor users

**Mat's challenges:** 18 accepted. 1 clarified: "ContributionUnit dedup" — Vernon said per-unit replacement; Mat corrected to assessment-level (org+month) versioned replace, which is the actual import model. No criteria deferred.

### Phase 3: Lead Distribution (WF4)

**Goal:** PM can distribute leads via RFP.

**Why third:** RFP (WF4) needs agencies with profiles and case studies (Phase 1) and tier data (Phase 2) to be useful for audience filtering.

| Story | What ships | Commits |
|-------|-----------|---------|
| US-4.1 | RFP campaign entity + CRUD route (CampaignPublished event) | 1 |
| US-4.1 | RFP workflow JSON definition + trigger | 1 |
| US-4.2 | BD notification (covered by workflow SEND_EMAIL) | 0 |
| US-4.3 | PartnerRfpResponse entity + CRUD route (BD submits via API, not workflow step) | 1 |
| US-4.4 | PM comparison page + winner selection (RfpAwarded event) | 1 |

**Total: 4 atomic commits** (RFP entity with file attachments + RFP workflow + response entity with free-form text + comparison page)

**Acceptance criteria:** `Vernon writes, Mat challenges`

**Domain criteria** `Vernon` (11 accepted, 1 deferred by Mat):
- [ ] RFP campaign has exactly one lifecycle state at any point — states do not overlap
- [ ] No submissions after deadline — PartnerRfpResponse CRUD route rejects submissions when `campaign.deadline < now()`, late submissions return 422
- [ ] Exactly one winning agency per campaign — second winner-selection on Awarded campaign rejected
- [ ] One response per agency per campaign — duplicate submissions replaced or rejected
- [ ] Every PartnerRfpResponse has non-null `rfp_campaign_id` and `responding_agency_id`
- [ ] `CampaignPublished` payload includes audience definition — consumers can derive exact notified agencies from event alone
- [ ] `RfpAwarded` payload includes `{ rfpId, winningAgencyId }` both non-null
- [ ] Audience filtering by tier uses current TierAssignment (approved), NOT TierEligibility
- [ ] `CampaignPublished` published on explicit publish action, not at draft creation
- [ ] Contributor cannot view, create, or respond to RFP — inaccessible for `partner_contributor` role
- [ ] Agency not in campaign audience cannot submit response — audience membership validated at submission time
- ~~Case studies auto-linked are read-only snapshots~~ — **DEFERRED by Mat** (see challenges below)

**Business criteria** `Mat`:
- [ ] PM can create RFP campaign with requirements, deadline, and file attachments (lead brief, specs)
- [ ] Agencies receive notification, BD/Admin can view RFP details and attached files
- [ ] BD/Admin submits free-form response (text + optional attachments), agency case studies auto-linked
- [ ] PM sees all responses side-by-side on comparison page, selects winner
- [ ] Winning agency notified (RfpAwarded), losing agencies notified of outcome

**Value delivered:**
- **Business value:** Lead distribution is fair and scalable. PM no longer sends emails manually. Agencies compete on evidence. Full flywheel loop complete: onboard → pipeline → contribute → bid on leads → tier evaluation reflects all 3 KPIs.
- **ROI metric:** RFP campaigns created per month. Agency response rate. Lead-to-selection conversion rate. Target: 3+ RFPs/month, >50% response rate.

**Platform ROI** (example app patterns demonstrated):
- Workflows module for multi-step processes — RFP lifecycle (START → SEND_EMAIL → WAIT_FOR_TIMER → USER_TASK (PM) → END)
- SEND_EMAIL activity — agency notification without custom notification code
- CRUD API for parallel submissions — BD responses collected via PartnerRfpResponse route while workflow waits, not via USER_TASK (cleaner model for multi-party workflows)
- Domain events — CampaignPublished, RfpAwarded as explicit facts
- File attachments on custom entities — RFP campaigns and responses
- **Copy test:** Phase 3 shows "this is how you build a multi-party workflow with the workflows module"

**seedExamples for Phase 3** (SPEC-068, US-7.2):
- 1 demo RFP campaign (Published state, past deadline) with file attachment
- 2 agency responses (free-form text + linked case studies)
- 1 winner selected (Awarded state) — demonstrates full RFP lifecycle end-to-end

**Mat's challenges:** 11 accepted. 1 deferred: "Case study snapshots at link time" — Vernon wants to copy case study data at submission to prevent post-submission edits from changing what PM evaluates. For 15 agencies where RFP evaluation takes days (not months), this adds a snapshot mechanism for a low-probability scenario. If an agency edits a case study mid-evaluation, PM will notice. **Defer to Phase 5+ if proven needed.**

### Phase 4: n8n Automation Layer + Enhancements

**Goal:** Remove manual workarounds. n8n becomes the automation and AI layer for all LLM-powered features.

| Story | What ships | Commits |
|-------|-----------|---------|
| US-3.4 | Automated WIC pipeline via n8n (GitHub API + LLM scoring → POST to import API) | 2-3 |
| US-4.5 | AI-assisted RFP scoring via n8n (webhook trigger → read data → LLM scoring → POST scores) | 1-2 |
| US-1.1b | Email invitation flow (replaces self-onboard) | 2 |
| Onboarding sub-workflows | Tracked onboarding steps via workflows module | 1 |

**Total: 6-8 atomic commits**

**n8n as unified automation + AI layer (decided):**

All LLM work lives in n8n. PRM app has zero LLM dependencies. One integration point, one set of API keys, one place to update when scoring rules change.

**WIC automation (scheduled):**
- n8n Schedule Trigger (daily) → GitHub GraphQL node (fetch PRs) → Code node (group + score) → IF node (bounty → AI reviewer) → Open Mercato node (POST to WIC import API)
- Import API (Phase 2) remains the anti-corruption layer — validates WicScoringResult schema, enforces dedup, versioned replace+archive
- Scoring logic extracted from existing `wic_assessment.mjs` (SDRC) into n8n Code node steps
- WicAssessmentSource = `automated_pipeline` distinguishes from Phase 2 manual imports

**RFP scoring (ad-hoc, PM-triggered):**
- PM clicks "Score responses" on comparison page → OM POSTs to n8n webhook: `{ rfpCampaignId, responseIds[] }`
- n8n workflow: Open Mercato node (GET RFP + responses + case studies) → LLM node (score with lead-agency-matching rubric: tech fit /5 + domain fit /5) → Open Mercato node (POST scores back)
- PM sees scores appear on comparison page (polling or SSE). Scores are guidance — PM makes final call.
- Scoring rubric from `lead-agency-matching` skill: tech fit (systems, platforms, infrastructure match) + domain fit (industry, segment, operational experience)

**Why n8n for both:**
- _One LLM integration point:_ All AI work in n8n. No LLM dependencies in OM app code. When scoring rules change, update n8n workflow — no OM redeployment.
- _Not ai-assistant:_ OM's ai-assistant is a conversational agent (Cmd+K, OpenCode, MCP). Using a full agent stack for a single scoring call is overkill. n8n is an orchestration engine — right tool for the job.
- _Not standalone scripts:_ n8n gives visible orchestration, run history, failure alerts. PM can inspect and re-trigger.
- _n8n node exists:_ `open-mercato/n8n-nodes` (generic REST node, pushed 2026-03-07) already speaks OM's API.

**Acceptance criteria:** `Vernon writes, Mat challenges`

**Domain criteria** `Vernon` (12 criteria — all accepted by Mat):
- [ ] n8n automated pipeline uses the same WIC import API as Phase 2 manual import — no direct DB writes bypassing validation
- [ ] `WicAssessmentSource = automated_pipeline` set by n8n on every automated import — never set by manual path; mutually exclusive per import run
- [ ] Re-running n8n daily pipeline for same org+month follows same versioned replace+archive semantics — no duplicate ContributionUnits
- [ ] Invitation flow produces exactly one User per email — second invite before acceptance resends token, no duplicate accounts
- [ ] AI-generated RFP scores stored as attributes on PartnerRfpResponse — do not affect workflow state, are not approval records
- [ ] RFP score re-scoring is idempotent — overwrites prior scores, not appends
- [ ] Invitation token is single-use — accepted token invalidated, second click = error
- [ ] If n8n WIC pipeline fails mid-run, no partial batch committed — full batch or nothing
- [ ] AI scores marked as `source: ai_assisted` — PM cannot mistake AI score for PM decision
- [ ] n8n service account has write access limited to WIC import endpoint and RFP score endpoint only — cannot approve tiers, create MIN, modify TierAssignment
- [ ] AI scores validated for range (tech_fit and domain_fit: numeric, 0–5 inclusive) — out-of-range rejected with 422
- [ ] n8n reads OM data via access-controlled API (Open Mercato node) — no raw DB exports or unstructured dumps

**Business criteria** `Mat`:
- [ ] WIC scores arrive daily without PM intervention. Contributors see updated scores. PM can see n8n run history.
- [ ] PM clicks "Score responses" on any RFP → tech fit + domain fit scores appear within 1 minute
- [ ] PM can invite agencies by email (replaces manual link sharing)
- [ ] Onboarding has guided steps tracked by the system

**Value delivered:**
- **Business value:** PM time reclaimed. WIC import goes from manual monthly task to automated daily. RFP evaluation goes from reading every response manually to AI-assisted scoring. Invitation flow is professional, not "here's a link."
- **ROI metric:** PM hours saved per week (target: 6+ hours). WIC import delay (target: <24h from PR merge to score visible). RFP scoring time (target: <2 min from click to scores).

**Platform ROI** (example app patterns demonstrated):
- n8n integration via `open-mercato/n8n-nodes` — first production use of the n8n community node
- Anti-corruption boundary — external automation (n8n) talks to OM only through validated API, never direct DB
- Service account scoping — n8n has narrowly scoped write permissions (WIC import + RFP scores only)
- SPEC-038 invitation flow — demonstrates auth module extension pattern (if merged upstream)
- Onboarding sub-workflows — guided multi-step processes via workflows module
- **Copy test:** Phase 4 shows "this is how you integrate n8n + LLM with OM without coupling your app to external services"

**Mat's challenges:** All 12 accepted. These are anti-corruption boundary rules that prevent n8n from bypassing the domain. Essential for trust in automated scoring.

### Rollout Summary

```
Phase 1: Core Loop              4 commits    WF1 (partial + onboarding checklist) + WF2 (stamp-based WIP)
Phase 2: Governance + KPI + MIN 8 commits    WF5 + WF3 (manual) + MIN attribution + cron
Phase 3: RFP (manual scoring)   4 commits    WF4 (workflows, comparison page)
Phase 4: n8n Automation + AI    6-8 commits  WIC (n8n) + RFP scoring (n8n) + WF1 (full)
                                ---------
                                21-23 atomic commits total
                                15 commits for Phases 1-3 (production-ready loop)
```

Each phase delivers a complete, usable increment. No phase leaves a workflow half-done. Phase 2 now includes MIN so tier evaluation has all 3 KPI inputs.

#### Checklist
- [x] Phases ordered by: business priority x gap score x blocker status
- [x] Each phase delivers complete, usable increment
- [x] Workarounds documented for high-gap blockers — WIC manual import, self-onboard
- [x] Total atomic commits estimated per phase — 3/8/4/6-8 `Piotr`
- [x] Challenger review: MIN moved to Phase 2 (Vernon finding: tier eval needs all 3 KPIs). Phase 1 WIP uses live query (no batch dependency).
- [x] Acceptance criteria per phase — business value + ROI metric defined for each phase
- [x] No artificial phases — every phase delivers measurable business value

---

## 8. Cross-Spec Conflicts `Mat`

### Conflicts (resolved)

| Conflict | What was wrong | Resolution |
|----------|---------------|------------|
| Agency identity: CustomerUser vs User | Earlier design made agency users CustomerUser (portal) | **User wins.** BD needs CRM. Portal deleted. |
| Tier levels: 3 (bronze/silver/gold) vs 4 real | Earlier design had 3 generic tiers | **4 real tiers** matching business requirements. |
| WIP definition: "conversations" vs "deals in SQL stage" | Earlier design counted vague "conversations" | **Deals at SQL stage** with `wip_registered_at` stamp. CRM best practice. |
| RFP: custom API routes vs workflows module | Earlier code built custom RFP routes | **Workflows module wins.** RFP lifecycle maps to: START → SEND_EMAIL → WAIT_FOR_TIMER → USER_TASK → END. Reduces custom code. |

### Shared Entity Ownership

| Entity | Owner | Used by |
|--------|-------|---------|
| PartnerAgency (org + tier + profile) | partnerships module | all workflows |
| PartnerTierAssignment | partnerships module | tier governance (WF5) |
| TierChangeProposal | partnerships module | tier governance (WF5) |
| TierEvaluationState | partnerships module | tier governance (WF5) |
| PartnerMetricSnapshot (WIC/WIP/MIN per period) | partnerships module | KPI aggregation, tier evaluation |
| ContributionUnit | partnerships module | WIC scoring (WF3) |
| PartnerRfpCampaign | partnerships module | RFP (WF4) |
| PartnerRfpResponse | partnerships module | RFP (WF4) |
| PartnerLicenseDeal (MIN source) | partnerships module | MIN attribution (WF5) |
| Case Study (`user:case_study`, 19 fields) | entities module (custom entity) | RFP matching, company profile |
| Company Profile (13 custom fields on `customers:customer_company_profile`) | entities module (custom fields) | agency profile, RFP matching |
| Dictionaries (services, industries, tech_capabilities, compliance_tags, regions, languages) | dictionaries module (seeded) | company profile, case studies |
| Pipeline stages (PRM-specific) | customers module (seeded) | WIP tracking (WF2) |

#### Checklist
- [x] Identity model consistent — conflict resolved, User wins
- [x] Terminology consistent — glossary §1.3 is source of truth
- [x] Shared entities owned by one module — partnerships module owns all PRM entities, entities module owns profile/case study schema
- [x] Every conflict resolved — all four resolved with clear rationale
- [x] Field definitions self-contained — company profile (13 fields) + case study (19 fields) + 6 dictionaries defined in §1.4.3

---

## 9. Example App Quality Gate `Piotr`

**This app has two ROIs:**
1. **Business ROI** — PRM works, agencies generate pipeline for OM
2. **Platform ROI** — Example app teaches how to build on OM correctly

**Platform patterns to demonstrate:**
- RBAC roles (not custom access control pages)
- CRM as core tool (customers module, not custom CRUD)
- Workflows module for multi-step processes (RFP, onboarding)
- Widget injection for KPI dashboards (UMES)
- Org switcher for cross-org visibility
- Pipeline stages for deal tracking
- Custom entities for case studies
- Scheduled jobs for KPI aggregation
- Minimal new code — only genuine gaps

**Anti-patterns to avoid:**
- Portal pages for users who need backend CRM
- Custom API routes duplicating module CRUD
- Custom notification subscribers (use workflows SEND_EMAIL)
- Hardcoded state machines (use workflows module)
- Two identity systems in one app
- Building user management UI (auth module has it)
- Leaving scaffold boilerplate modules (`example/`, empty dirs) from `create-mercato-app` in the app
- Copying or re-implementing OM platform helpers locally (integration test helpers, auth utilities, fixture builders) — import from `@open-mercato/core/testing/integration` instead. Local copies drift and teach the wrong pattern.
- Creating app-local Playwright config — use `mercato test` CLI which handles ephemeral environments and test discovery across `__integration__/` dirs

**SPEC-068 alignment:**
- This app IS `prm` for `create-mercato-app --example prm` — the first official example
- Distribution: `open-mercato/examples/prm/` (or partner repo per SPEC-068 community model)
- App structure: domain modules in `src/modules/partnerships/` following OM auto-discovery conventions
- Bootstrap: `yarn initialize` runs `seedDefaults` (roles, fields, pipelines) + `seedExamples` (demo agencies, deals, tiers, RFPs)
- Developer can run the app, see every workflow working with demo data, and read the code to learn patterns
- `.env.example` included, `@open-mercato/*` versions pinned in `package.json`
- Module README explains structure and which OM capabilities each file demonstrates

#### Checklist
- [x] Every piece of new code passes the "copy test"
- [x] Anti-patterns explicitly listed
- [x] Platform features demonstrated
- [x] SPEC-068 distribution model acknowledged — `prm` is the first official example
- [x] seedExamples defined per phase — demo data exercises every workflow
- [x] Developer persona and user stories (US-7.x) documented in §5

---

## 10. Open Questions `Mat`

| # | Question | Options | Impact | Owner | Status |
|---|----------|---------|--------|-------|--------|
| 1 | WIC implementation | n8n workflow using open-mercato/n8n-nodes | Phase 4 architecture | Piotr | Decided: n8n. Existing n8n-nodes package speaks OM API. n8n gives PM visible orchestration + run history. Scoring logic extracted from wic_assessment.mjs into n8n Code nodes. Import API (Phase 2) is the anti-corruption layer. |
| 2 | RFP mechanism | a) custom code b) workflows module | Phase 3 code volume | Mat + Piotr | Decided: workflows module. Lifecycle maps to workflow steps, reduces custom code. |
| 3 | Invitation flow | a) self-onboard b) email invitation | Phase 1 vs Phase 4 | Mat | Decided: self-onboard Phase 1, email Phase 4. Known limitation: no formal enrollment event in Phase 1 (accepted). |
| 4 | Existing portal code | a) delete b) refactor | All phases | Mat | Decided: delete. Zero personas need CustomerUser. |
| 5 | Tier grace period | a) none b) 1 month c) pro-rata | Phase 2 edge cases | Mat | Decided: 1 month. State machine: OK → GracePeriod → ProposedDowngrade. |
| 6 | RFP lead source | PM enters manually (creates campaign with requirements + file attachments). Future: webhook from website form. | Phase 3 scope | Mat | Decided: manual entry v1. PM creates campaign, attaches lead brief/specs. |
| 7 | RFP matching criteria | Phase 3: manual (PM reads responses, decides). Phase 4: AI-assisted via n8n (LLM scores tech fit /5 + domain fit /5 per lead-agency-matching rubric). PM always makes final call. | Phase 3/4 complexity | Mat + Piotr | Decided: manual Phase 3, n8n LLM Phase 4. One LLM integration point (n8n) for both WIC and RFP. |
| 8 | MIN attribution | PM searches all companies across all agencies, verifies in CRM, creates PartnerLicenseDeal with attribution | Phase 2 data model | Mat | Decided: cross-org company search + CRM read-only jump + attribution. Moved from Phase 3 to Phase 2 (tier eval needs MIN). |
| 9 | WIC L1 score discriminator | L1 0.5 = complex fix/large refactor/high-impact bug report. L1 0.25 = smaller fix/hardening/standard bug report. | WIC scoring accuracy | Mat | Decided: impact level of the fix. Verified against SDRC WIC Assessment Learnings + Monthly Workflow docs. |

#### Checklist
- [x] Every question has: options, impact, owner, status
- [x] No BLOCKER question unresolved for Phase 1 — invitation flow decided (self-onboard)
- [x] Decided questions have rationale recorded

---

## Production Readiness `Mat`

| Workflow | Deployable | Blocker | What client would say |
|----------|-----------|---------|----------------------|
| WF1: Agency Onboarding | **No** | No invitation flow in auth module | "How do I invite an agency?" (Phase 1 workaround: self-onboard link) |
| WF2: Pipeline Building (WIP) | **Almost** | CRM ready, missing WIP stamp interceptor + dashboard widget | "I see CRM but not my WIP count" |
| WF3: Code Contribution (WIC) | **No** | No GitHub integration, no LLM scoring | "How does my PR become WIC score?" (Phase 2 workaround: manual import) |
| WF4: Lead Distribution (RFP) | **No** | No RFP workflow definition, open questions | "How do I send a lead to agencies?" |
| WF5: Tier Governance | **No** | No KPI aggregation, no tier logic, no grace period state machine | "What tier am I? How far to next?" |

#### Checklist
- [x] Each workflow assessed: deployable or not — binary with specific blocker
- [x] "What would client say?" test — client complaint, not technical gap
- [x] No workflow stops midway — workarounds ensure complete increments per phase

---

## Challenger Pushbacks `Mat`

Vernon raised these findings. Mat disagrees with good business reason:

1. **GH username on User crosses Identity context** (Stories C4) — In OM, custom fields via the `entities` module IS the standard extension pattern. GH username is stored as a custom field on User, not a modification to the User aggregate. Creating a separate ContributorProfile entity is overengineering for 15 agencies. The dependency from WIC scoring to the custom field is read-only and uses the platform's standard field access API.

2. **WF1 should split into two workflows** (Workflows W1) — Onboarding IS one business workflow from the PM's perspective. The platform's workflows module handles sub-workflows (SUB_WORKFLOW step type). Admin onboarding and BD onboarding are tracked as sub-workflows within WF1, not independent workflows. The completion gate ("agency is operational = both halves done") is intentional business logic.

3. **Self-onboard erases enrollment event** (Phasing C3) — In Phase 1, PM shares link manually and knows who they invited. The audit gap is real but acceptable for 15 agencies. Documented as known limitation in US-1.1 and Open Question #3. Phase 4 adds formal invitation flow. Not worth engineering a synthetic event for a workaround that serves < 20 agencies.

---

## Changelog

### 2026-03-20 (update 6) — Onboarding Checklist Widget

- Added US-1.7 (Admin checklist) and US-1.8 (BD checklist) to WF1 user stories
- Added onboarding checklist widget to Phase 1 (+1 commit, Phase 1 now 4 commits)
- Checklist is role-conditional (Admin 4 items, BD 2 items), data-driven (live queries, no separate flag), auto-dismissing
- Added domain criteria: widget visibility scoped to incomplete users, completion state from live data
- Added business criteria: first-login guided experience for Admin and BD
- Updated gap analysis table and rollout summary totals (16 Ph1-3, 22-24 total)
- Updated commits-WF1.md: new Commit 5 (checklist widget), renumbered Commits 6-8

### 2026-03-20 (update 5) — Vaughn Vernon Challenger Reviews

5 challenger reviews completed (Business Context, Identity Model, Workflows, User Stories, Phasing).

**CRITICAL fixes applied:**
- WIP formula rewritten: stamp-based (`wip_registered_at` custom field, immutable, first SQL qualification only). Removes snapshot/cumulative ambiguity. "Won" removed from WIP stages — deals graduate to MIN, not both.
- TierEligibility vs TierAssignment: two distinct concepts named. TierChangeProposal aggregate with states (Draft → PendingApproval → Approved | Rejected) and uniqueness invariant (one per org per period).
- Grace period state machine: OK → GracePeriod → ProposedDowngrade. TierEvaluationState entity tracks state.
- AgencyTierChanged domain event: published on PM approval. RFP audience filtering uses current TierAssignment.
- MIN attribution workflow: PM searches all companies cross-org → verifies in CRM → creates PartnerLicenseDeal. Moved from Phase 3 to Phase 2 (tier eval needs all 3 KPIs).
- ContributionUnit aggregate: org_id set at PR merge time. Feature Key dedup enforced as invariant at creation.
- WIC import: versioned (re-import for same org+month replaces + archives old). WicAssessmentSource enum added.

**Glossary additions:**
- Contributor, Program Scope, TierEligibility, TierAssignment, TierChangeProposal, ContributionUnit, WicAssessmentSource, AgencyTierChanged, CampaignPublished, RfpAwarded

**Business rules clarified:**
- Admin full CRM write (including BD records), BD own records only
- Admin can respond to RFP (superset rule)
- GH username: unique, immutable once WIC recorded
- PM write context: global actions, not scoped by org switcher
- MIN: calendar year, no double-attribution, qualification criteria defined
- CaseStudy minimum fields: industry tag, tech stack, budget range, duration

**Phasing changes:**
- Phase 1: 2 → 3 commits (added WIP interceptor)
- Phase 2: 6 → 8 commits (added MIN entity + attribution UI, moved from Phase 3)
- Phase 3: 5 → 4 commits (MIN moved out)
- Total: 21+ → 23+ commits, 15 for Phases 1-3

**3 pushbacks documented** (GH username on User, WF1 split, self-onboard event)
**1 new open question** (#9: WIC L1 score discriminator)

### 2026-03-20 (update 4) — Piotr Checkpoints
- Switched gap scoring from lines-of-code to **atomic commits** (Ralph loop methodology)
- Piotr checkpoint #1 (§4): workflow-to-OM mapping verified against upstream/develop
  - All modules confirmed: auth (organizationsJson, RBAC), customers (CRM, pipeline, setup.ts seeding), workflows (all step/activity types), entities (custom fields/entities), queue (workers)
  - **Finding: no scheduler/cron module on OM upstream** — queue package has workers but no time trigger. Added shared "cron trigger" commit for external mechanism
  - RFP workflow mapping validated: all step types exist (START, SEND_EMAIL, WAIT_FOR_TIMER, USER_TASK, END)
- Piotr checkpoint #2 (§6): story-to-OM mapping verified — simplest solution per story confirmed
- Updated all gap matrices, story gap table, and phasing from lines to atomic commits
- Rollout summary: 13 commits for Phases 1-3 (production-ready), 21+ total

### 2026-03-20 (update 3)
- User stories reviewed against Mat quality bar — 8 issues fixed, 7 stories added
- Killed 3 "As System" stories (US-5.1, US-5.2, US-3.4) — rewritten as PM stories
- Killed 2 "I see/view" weak verbs (US-2.3, US-3.3) — rewritten with actionable outcomes
- Split dual-persona US-5.4 into US-5.4 (Admin) and US-5.5 (BD)
- Added Phase 1 self-onboard story US-1.1, moved email invitation to US-1.1b (Phase 4)
- Added missing stories: US-1.5 (invite Contributor), US-4.2 (RFP notification), US-4.4 (select winner), US-5.5 (BD contribution view), US-5.6 (MIN attribution), US-6.1 (PM org switcher)
- Renumbered US-1.5 (BD first deal) to US-1.6
- Updated §6 gap analysis and §7 phasing tables to match new story numbers
- Total story count: 18 → 25

### 2026-03-20 (update 2)
- Decided: tier grace period = 1 month (agency gets 1 calendar month to recover before downgrade)
- Decided: RFP uses workflows module (lifecycle maps to workflow steps, reduces custom code)
- RFP conflict resolved in §8
- WF4 gap score reduced from 7 to 5 (workflows handles notification, response collection, winner selection)
- Phase 3 estimate reduced from ~300 to ~230 lines
- Total estimate reduced from ~980 to ~910 lines
- Open questions #2 and #5 resolved

### 2026-03-20
- App Spec restructured to match template (`templates/app-spec-template.md`)
- DDD alignment: §1.3 Glossary -> Ubiquitous Language, §1.4-1.6 merged into Domain Model
- Added checklists per section with Mat/Piotr ownership
- Added "Key personas" and "OM readiness" per workflow (was only in workflow-analysis)
- Added Production Readiness section (was only in workflow-analysis)
- Added Shared Entity Ownership table to Cross-Spec Conflicts
- Added 3 open questions from workflow-analysis: RFP lead source, RFP matching, MIN attribution
- Fixed US-3.4 phase reference: Phase 3 -> Phase 4

### 2026-03-19
- Initial App Spec created from Phase 0 session transcript
- Domain knowledge extracted from Mat's business requirements
- Identity model established (User for all, portal rejected)
- 5 workflows defined with boundaries and edge cases
- Workflow gap analysis with scoring
- User stories with success criteria per workflow
- User story gap analysis with platform mapping
- Phasing based on business priority x gap score x blocker status
- Workarounds identified for high-gap blockers (WIC manual import, self-onboard)
- Rollout plan: 4 phases, ~980 lines total new code
- Cross-spec conflicts documented and resolved
