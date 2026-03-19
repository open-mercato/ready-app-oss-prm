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
| **WIP** | Work In Progress. Active prospect deals in CRM at "Sales Qualified Lead" stage or above. | CRM deals (customers module) | Monthly |
| **MIN** | Minimum Implementations Needed. Enterprise license deals sold and implemented by agency. | PM-maintained license deal records | Yearly |
| **Tier** | Partnership level determining agency visibility and lead priority. 4 levels. | Calculated from WIC + WIP + MIN thresholds | Evaluated monthly, valid 12 months |
| **RFP** | Request for Proposal. PM distributes leads to qualified agencies, agencies respond with structured proposals. | PM creates campaign, agencies respond | Per campaign |
| **Pipeline** | CRM deal stages: New -> Contacted -> Qualified -> SQL -> Proposal -> Won/Lost | customers module pipeline | Continuous |
| **Case Study** | Agency's past project documentation (tech stack, industry, budget, duration). Used for RFP matching. | Custom entity in entities module | Maintained by agency |
| **Bounty** | Tagged GitHub issues with bonus multiplier for WIC scoring. | GitHub issues with bounty label | Per bounty window |
| **Feature Key** | Grouping key for WIC: SPEC-xxx, #issue, or PR-id. Anti-double-counting: same feature key + same month + same person = one unit. | WIC algorithm | Monthly |
| **PM** | Partnership Manager. OM employee who runs the partner program. | — | — |
| **BD** | Business Developer. Agency salesperson who prospects clients and creates deals. | — | — |

#### Checklist
- [x] Every domain term defined once
- [x] Same word = same meaning across all specs
- [x] Source of data and period specified per term

### 1.4 Domain Model

#### 1.4.1 Tier Definitions

Source: Mat's business requirements (session 2026-03-19).

| Tier | WIC/month | WIP/month | MIN/year | Special Requirements | Benefit |
|------|-----------|-----------|----------|---------------------|---------|
| **OM Agency** | 1 (L1-2) | 1 | 1 | 2 devs familiar with project, approved for L3-4 within 3 months | Foundational partner status |
| **OM AI-native Agency** | 2 (L1-4) | 5 | 2 | — | Higher match score, visibility on website |
| **OM AI-native Expert** | 3 (L1-4) | 15 | 5 (3 in vertical) | Vertical dominance in specific industry niche | Highest match score in their vertical, #1 choice for niche clients |
| **OM AI-native Core** | 4 (L3-4) | 15 | 5 | Horizontal dominance, core OM expertise | Highest match score overall, #1 choice for demanding technical clients |

**Tier governance rules:**
- Evaluation: monthly automated check against thresholds
- Grace period: TBD (new agencies, boundary cases)
- Downgrade: PM approval required before tier change takes effect
- History: all tier changes audited with reason and approver

#### 1.4.2 KPI Formulas

**WIC Score per contribution unit:**
```
unit = person + month + feature_key  (anti-double-counting)
base_score = L4:1.0, L3:0.5, L2:1.0, L1:0.5/0.25, routine:0.0
impact_bonus = +0.25 (scope: >=40 files) + 0.25 (completeness: spec+impl+tests)
wic_pre_bounty = base_score + impact_bonus
wic_final = wic_pre_bounty * bounty_multiplier  (1.5x if linked to active bounty)
```
WIC/month per agency = sum of wic_final for all contributors in that org for that month.

Algorithm source: `/Users/maciejgren/Documents/SDRC/` (WIC Assessment Guide + scoring rules).
Requires LLM for: bounty auto-adjudication, ownership analysis, quality assessment.

**WIP count:**
```
WIP(org, month) = COUNT(DISTINCT deals)
  WHERE deal.organization_id = org
  AND deal.pipeline_stage IN ('sql', 'proposal', 'won')
  AND deal.created_at or deal.stage_changed_at IN month
```

**MIN count:**
```
MIN(org, year) = COUNT(DISTINCT license_deals)
  WHERE license_deal.attributed_agency_id = org
  AND license_deal.type = 'enterprise'
  AND license_deal.status = 'won'
  AND license_deal.is_renewal = false
  AND license_deal.closed_at IN year
```

#### 1.4.3 Business Rules

**Permissions hierarchy:**
- Admin can do everything BD can, but BD cannot do what Admin does (user management)
- BD and Admin both need to understand what qualifies as WIP — deal must reach specific pipeline stage
- Contributor sees almost nothing — only WIC score and tier level

**Cross-org visibility:**
- PM sees CRM data of ALL agencies (read-only) via org switcher
- Agency users see ONLY their own organization's data
- KPI data (WIC/WIP/MIN) visible to agency users for their own org only
- PM sees KPI dashboard across all agencies

**Data ownership:**
- WIC: system-generated (external algorithm), PM can override
- WIP: agency-generated (BD creates deals in CRM), system counts
- MIN: PM-generated (PM creates PartnerLicenseDeal, assigns agency attribution)
- Agency users CANNOT create/modify MIN source records

**Onboarding requirements:**
- Agency Admin must: fill company profile, add min 1 case study, invite min 1 BD, invite min 1 Contributor
- BD must: add first prospect company, create first deal, move deal to "Contacted"
- Both are sub-workflows tracked by the system

#### Domain Model Checklist
- [x] Domain entities identified — PartnerAgency, tiers, KPIs, case studies, RFP, license deals
- [x] Domain rules documented — tier thresholds, KPI formulas, onboarding requirements
- [x] Tiers: all 4 real tiers with thresholds and benefits (was 3 in old spec, caught and fixed)
- [ ] Tiers: governance rules incomplete — grace period TBD
- [x] KPIs: complete formulas with input source, period, anti-gaming (feature key dedup for WIC)
- [x] Access control: permissions hierarchy (Admin > BD > Contributor), cross-org visibility (PM all orgs read-only)
- [x] Data ownership: WIC system-generated, WIP agency-generated, MIN PM-generated

---

## 2. Identity Model `Mat`

> SINGLE SOURCE OF TRUTH. If any spec contradicts this, update the spec.

| Persona | Role key | Identity | Org scope | Sees | Does |
|---------|----------|----------|-----------|------|------|
| Partnership Manager | `partnership_manager` | User | all orgs (`organizationsJson: null`) | All CRM read-only, all KPIs, all tiers, RFP campaigns | Invites agencies, creates RFP, evaluates responses, approves tiers, manages MIN |
| Agency Admin | `partner_admin` | User | own org only | CRM (full), KPI (WIC/WIP/MIN), tier, team management, case studies | Fills profile, manages case studies, invites BD/Contributor, creates deals |
| Business Developer | `partner_member` | User | own org only | CRM (full), KPI (WIC/WIP/MIN), tier, RFP responses | Creates deals, edits profile + case studies, responds to RFP. NO user management. |
| Contributor | `partner_contributor` | User | own org only | WIC score, tier level only | Views WIC, configures own profile (e.g. GH username). Nothing else. |

**Portal:** NOT USED. Zero portal pages. Zero CustomerUser accounts. Backend + RBAC + org scoping = sufficient for all personas.

**Decision log:**
- _Why User not CustomerUser?_ — BD needs CRM module (customers). CRM lives in backend. Portal doesn't expose CRM. Building CRM in portal = rebuilding what backend already has.
- _Why not portal for Contributor?_ — Contributor is minimal, but still a User with restricted role. One identity system, not two. Simplicity > convenience.
- _Could CustomerUser enable self-registration?_ — Yes, but at the cost of dual accounts or a promotion flow. Not worth the complexity for the example app.

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

**Journey:** BD creates Company (prospect) in CRM -> creates Deal on that Company -> moves Deal through pipeline stages -> at "Sales Qualified Lead" stage = 1 WIP -> BD sees WIP count on KPI dashboard

**ROI:** 15 agencies x 5 WIP/month = 75 prospects/month. Agency without WIP loses tier.

**Key personas:** BD (creates deals), System (counts WIP)

**Boundaries:**
- Starts when: BD creates deal in CRM
- Ends when: Deal saved with correct stage, WIP count updated
- NOT this workflow: closing deal -> sale -> MIN attribution (WF5)

**Edge cases:**
1. BD creates deal without reaching SQL stage -> doesn't count as WIP, BD confused
2. BD creates fake deals to inflate WIP -> PM must audit manually
3. Same prospect in two agencies -> both count WIP -> conflict at RFP
4. Period boundary: deal created March 31, counted in March or April?

**OM readiness:**
- CRM (companies, deals, activities) -> `customers` module ✅
- Pipeline + stages -> `customers` module ✅ (seed PRM pipeline in setup.ts)
- Deal CRUD + pipeline UI -> `customers` backend pages ✅
- **Gap: WIP count aggregation** — scheduled job (~30 lines)
- **Gap: KPI dashboard widget** — widget injection (~50 lines)

### WF3: Code Contribution (WIC)

**Journey:** Dev opens PR on OM GitHub repo -> core team reviews -> merge to develop -> daily scheduled job -> GitHub API fetch PRs per contributor -> group by (person, month, feature key) -> LLM scoring (L1-L4, impact bonus, bounty) -> optional PM override -> WIC score recorded -> Contributor/BD/Admin sees score

**ROI:** 15 agencies x 2 WIC/month = 30 contributions/month to OM codebase.

**Key personas:** Contributor (views score), System (scheduled job), PM (optional override)

**Boundaries:**
- Starts when: Scheduled job triggers (daily)
- Ends when: WIC scores recorded for all contributors for current period
- NOT this workflow: PR review process (GitHub), tier calculation (WF5)

**Edge cases:**
1. Dev's GH profile not linked to User in OM -> contributions not counted
2. Dev changes agency -> old WIC stays with old org? follows them?
3. PR merged but WIC batch hasn't run yet -> dev doesn't see contribution
4. Dev uses private GH account, different from registered username

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
- RFP as workflow -> `workflows` module: START -> SEND_EMAIL -> WAIT_FOR_TIMER -> USER_TASK -> END ✅
- Notification to BD -> workflows SEND_EMAIL activity ✅
- BD response -> workflows USER_TASK with structured form ✅
- **Gap: RFP campaign data** — custom entity (PartnerRfpCampaign)
- **Gap: Response data** — custom entity (PartnerRfpResponse)
- **Gap: PM evaluation page** — comparison view (~100 lines)

### WF5: Tier Governance

**Journey:** System aggregates WIC+WIP+MIN per org per period -> compares with 4 tier thresholds -> generates upgrade/downgrade proposal -> PM reviews + approves -> system updates tier -> agency sees new status + progress to next level

**ROI:** Automated governance saves PM ~4h/week. Network quality maintained.

**Key personas:** System (aggregates), PM (approves), all agency users (see tier)

**Boundaries:**
- Starts when: Scheduled job triggers (monthly)
- Ends when: PM approved tier change, agency sees updated status
- NOT this workflow: KPI data collection (WF2, WF3), RFP matching based on tier (WF4)

**Edge cases:**
1. Agency on tier boundary (4 WIC, needs 5) -> downgrade? grace period?
2. Great WIC but zero WIP -> contributes code but no pipeline
3. New agency, no data for full period -> how to evaluate?
4. PM doesn't approve tier change for weeks -> agency doesn't know tier
5. Vertical dominance for Expert -> how does system know 3 MIN are "in vertical"?

**OM readiness:**
- PM approval -> `workflows` USER_TASK ✅
- Tier history -> `audit_logs` module ✅
- **Gap: KPI aggregation** — scheduled job (~50 lines)
- **Gap: Tier comparison** — threshold logic (~30 lines)
- **Gap: Tier status widget** — widget injection on dashboard (~50 lines)

#### Checklist (per workflow)
- [x] End-to-end journey — all 5 workflows have full journey `Mat`
- [x] Measurable ROI — specific metrics per workflow `Mat`
- [x] Key personas identified per workflow `Mat`
- [x] Boundaries — start, end, NOT-this-workflow for all 5 `Mat`
- [x] 3-5 edge cases per workflow — production-realistic scenarios `Mat`
- [x] Every step mapped to OM module with gap identified `Piotr`

#### Checklist (overall)
- [x] 5 core workflows defined (3-7 range) `Mat`
- [ ] No workflow requires >200 lines — all under except WF3 full (deferred to Phase 4 with workaround) `Piotr`

---

## 4. Workflow Gap Analysis `Piotr`

> Gap analysis maps each workflow step to OM platform capability.
> Gap score = how much new code is needed. Lower = better.
> Piotr checkpoint: verify mapping is correct before proceeding.

### Gap Scoring

| Score | Meaning | Example |
|-------|---------|---------|
| 0 | Platform does it, zero code | RBAC role in setup.ts |
| 1 | Config/seed only | Pipeline stages in seedDefaults |
| 2 | Small gap (<50 lines) | Scheduled job for WIP count |
| 3 | Medium gap (50-150 lines) | KPI dashboard widget |
| 4 | Large gap (150-300 lines) | RFP comparison page |
| 5 | Major gap (>300 lines or external dependency) | WIC scoring pipeline (LLM + GitHub API) |

### Per-Workflow Gap Matrix

#### WF1: Agency Onboarding — Total gap: 7

| Step | OM Module | Gap | Score | Notes |
|------|-----------|-----|-------|-------|
| PM invites agency admin | auth module | No invite-by-email in auth | 3 | Self-onboard exists as alternative |
| Admin sets password | auth module | Covered | 0 | Password reset flow |
| Admin fills company profile | entities module (custom fields) | Covered | 1 | Seed custom field definitions |
| Admin adds case study | entities module (custom entity) | Covered | 1 | Seed custom entity definition |
| Admin invites BD | auth module | Same gap as step 1 | 0 | Counted once above |
| BD onboarding sub-workflow | workflows module | Covered (SUB_WORKFLOW) | 1 | Workflow definition JSON |
| Onboarding checklist tracking | workflows module | Covered (USER_TASK) | 1 | Per-step completion |

#### WF2: Pipeline Building (WIP) — Total gap: 4

| Step | OM Module | Gap | Score | Notes |
|------|-----------|-----|-------|-------|
| BD creates Company | customers module | Covered | 0 | |
| BD creates Deal | customers module | Covered | 0 | |
| Pipeline stages | customers module | Covered | 1 | Seed PRM pipeline in setup.ts |
| BD moves deal through stages | customers module | Covered | 0 | Pipeline UI exists |
| WIP count aggregation | scheduler + partnerships | Gap: scheduled job | 2 | ~30 lines: query deals in SQL+ stage per org |
| WIP displayed on dashboard | partnerships | Gap: widget | 1 | Widget injection |

#### WF3: Code Contribution (WIC) — Total gap: 8 (with workaround: 3)

| Step | OM Module | Gap | Score | Notes |
|------|-----------|-----|-------|-------|
| GitHub PR merged | external | N/A | — | Outside OM |
| Daily job fetches PRs | scheduler + GitHub API | Gap: external integration | 5 | LLM scoring, complex pipeline |
| GH username -> User mapping | auth (custom field) | Gap: field + lookup | 1 | Custom field on User entity |
| Score recorded | partnerships entities | Covered | 0 | PartnerWicRun + PartnerMetricSnapshot |
| Score displayed | partnerships backend | Gap: widget | 1 | Widget injection on dashboard |
| PM override | workflows USER_TASK | Covered | 1 | Workflow step |
| **WORKAROUND: Manual import** | partnerships API | Covered | 0 | `/kpi/wic-runs/import` API exists in spec |

**Workaround detail:** Instead of automated GitHub+LLM pipeline (gap score 5), PM runs external script manually and imports results via API. Score drops from 8 to 3. Automated pipeline deferred to Phase 4.

#### WF4: Lead Distribution (RFP) — Total gap: 7

| Step | OM Module | Gap | Score | Notes |
|------|-----------|-----|-------|-------|
| PM creates RFP campaign | partnerships entities | Gap: entity + CRUD | 2 | PartnerRfpCampaign |
| System notifies agencies | workflows SEND_EMAIL | Covered | 1 | Workflow activity |
| BD sees RFP | partnerships backend | Gap: list page | 1 | Backend page |
| BD submits response | partnerships entities | Gap: entity + form | 2 | PartnerRfpResponse + form |
| PM evaluates responses | partnerships backend | Gap: comparison page | 3 | Side-by-side view, ~100 lines |
| PM selects winner | partnerships | Gap: status transition | 1 | Command |
| **Alternative: workflows module** | workflows | TBD | ? | May reduce total gap if RFP lifecycle uses workflow steps |

#### WF5: Tier Governance — Total gap: 6

| Step | OM Module | Gap | Score | Notes |
|------|-----------|-----|-------|-------|
| KPI aggregation | scheduler + partnerships | Gap: scheduled job | 2 | ~50 lines: aggregate WIC+WIP+MIN per org |
| Tier comparison | partnerships | Gap: threshold logic | 1 | ~30 lines: compare 3 numbers with 4 tiers |
| Generate proposal | partnerships | Gap: entity write | 1 | PartnerTierAssignment draft |
| PM approval | workflows USER_TASK | Covered | 0 | |
| Tier updated | partnerships | Gap: command | 1 | Status change + audit |
| Agency sees tier + progress | partnerships backend | Gap: widget | 1 | Widget injection on dashboard |

### Gap Summary

| Workflow | Business Priority | Gap Score (raw) | Workaround? | Gap Score (effective) | Blocks ROI? |
|----------|------------------|-----------------|-------------|----------------------|-------------|
| WF2: Pipeline (WIP) | High | 4 | No | 4 | Yes — core flywheel |
| WF1: Onboarding | High | 7 | Partial (self-onboard instead of invite) | 5 | Yes — enables all other WFs |
| WF5: Tier Governance | High | 6 | No | 6 | Yes — governance loop |
| WF4: RFP | Medium | 7 | No | 7 | Partial — PM can email manually |
| WF3: WIC | Medium | 8 | Yes (manual import) | 3 | Yes — but workaround unblocks |

#### Checklist
- [x] Every workflow step scored 0-5 `Mat`
- [ ] Piotr checkpoint: workflow-to-OM mapping verified `Piotr`

---

## 5. User Stories `Mat`

> Each story traces to a workflow step. Story = atomic action by one persona with measurable success.
> Format: As [persona], I [action], so that [business outcome]. Success: [testable criteria].

### WF1: Agency Onboarding

**US-1.1** As PM, I invite an agency admin by email so that a new agency can join the partner program.
Success: Admin receives email with signup link, clicks it, sets password, sees scoped backend dashboard.

**US-1.2** As Agency Admin, I fill my company profile (services, industries, tech stack) so that OM has data for lead matching.
Success: Profile saved, visible to PM via org switcher, fields match case study categories.

**US-1.3** As Agency Admin, I add at least one case study (project type, tech, budget, duration) so that PM has evidence for RFP scoring.
Success: Case study saved as custom entity, visible in agency profile, linked to company.

**US-1.4** As Agency Admin, I invite a BD by email so that someone can start building pipeline.
Success: BD receives email, sets password, sees CRM + KPI dashboard scoped to our org.

**US-1.5** As BD, I add my first prospect and create a deal so that my onboarding is complete.
Success: Company + Deal created in CRM, onboarding workflow marks BD step as done.

### WF2: Pipeline Building (WIP)

**US-2.1** As BD, I create a deal in CRM on a prospect company so that it enters our pipeline.
Success: Deal appears in pipeline view, assigned to correct stage.

**US-2.2** As BD, I move a deal to "Sales Qualified Lead" stage so that it counts as WIP.
Success: Deal stage updated, WIP count increments on next aggregation, visible on KPI dashboard.

**US-2.3** As PM, I see WIP counts per agency per month so that I can assess pipeline health.
Success: Dashboard shows table of agencies with WIP count for selected period.

### WF3: Code Contribution (WIC)

**US-3.1** As Contributor, I link my GitHub username to my OM profile so that my contributions are tracked.
Success: GH username field saved on User, visible to WIC import process.

**US-3.2** As PM, I import WIC scores from external assessment so that contributor scores are up to date.
Success: Upload CSV/markdown, system parses and maps GH profiles to users, scores recorded.

**US-3.3** As Contributor, I see my WIC score and level breakdown so that I know my contribution status.
Success: Dashboard shows: total WIC this month, per-contribution breakdown (feature key, level, bonus).

**US-3.4** (Phase 4) As System, I automatically fetch and score GitHub PRs daily so that WIC is always current.
Success: Daily job runs, new PRs scored, contributors see updated scores without PM intervention.

### WF4: Lead Distribution (RFP)

**US-4.1** As PM, I create an RFP campaign with requirements and deadline so that agencies can bid.
Success: Campaign created, target agencies (all/selected) see it in their RFP list.

**US-4.2** As BD, I submit a structured response to an RFP (capabilities, pricing, timeline, case studies) so that PM can evaluate our fit.
Success: Response saved, PM sees it in campaign responses list, linked to our case studies.

**US-4.3** As PM, I compare agency responses side-by-side so that I can select the best fit.
Success: Comparison view shows all responses for a campaign with key fields aligned.

### WF5: Tier Governance

**US-5.1** As System, I aggregate WIC+WIP+MIN per agency monthly so that tier evaluation has data.
Success: Metric snapshots recorded per org per period.

**US-5.2** As System, I compare aggregated KPIs against tier thresholds so that upgrade/downgrade proposals are generated.
Success: Proposal record created with current vs required values, recommended tier change.

**US-5.3** As PM, I review and approve tier changes so that governance is auditable.
Success: PM sees proposal, approves/rejects with reason, tier updated on approval, audit log created.

**US-5.4** As Agency Admin/BD, I see my current tier and progress toward next level so that I know where we stand.
Success: Dashboard shows: current tier, KPI values vs thresholds, % progress to next tier.

#### Checklist
- [x] Every story has: persona + action + measurable outcome + success criteria
- [x] Every story traces to a workflow step — US-x.y maps to WFx
- [x] Identity checkpoint per story — all personas are User with specific role keys from §2
- [x] No weak stories — all have concrete actions with observable results

---

## 6. User Story Gap Analysis `Piotr`

> Map each story to OM capability. Piotr checkpoint: verify mapping.

| Story | Platform Match | New Code? | Gap Score |
|-------|---------------|-----------|-----------|
| US-1.1 | auth module (gap: no invite flow) | ~80 lines or self-onboard workaround | 3 |
| US-1.2 | entities module custom fields | Seed definitions only | 1 |
| US-1.3 | entities module custom entity | Seed entity definition | 1 |
| US-1.4 | auth module (same gap as 1.1) | Shared with US-1.1 | 0 (counted above) |
| US-1.5 | customers module CRM | Zero | 0 |
| US-2.1 | customers module CRM | Zero | 0 |
| US-2.2 | customers module pipeline | Zero (stages seeded) | 0 |
| US-2.3 | partnerships widget injection | ~50 lines widget | 2 |
| US-3.1 | auth custom field on User | ~10 lines | 1 |
| US-3.2 | partnerships import API | Spec has API defined | 1 |
| US-3.3 | partnerships backend page | ~50 lines widget | 2 |
| US-3.4 | external (GitHub+LLM) | Major — deferred Phase 4 | 5 |
| US-4.1 | partnerships entity + CRUD | ~80 lines entity+route | 2 |
| US-4.2 | partnerships entity + form | ~80 lines entity+form | 2 |
| US-4.3 | partnerships backend page | ~100 lines comparison | 3 |
| US-5.1 | partnerships scheduled job | ~50 lines | 2 |
| US-5.2 | partnerships threshold logic | ~30 lines | 1 |
| US-5.3 | workflows USER_TASK | Workflow JSON definition | 1 |
| US-5.4 | partnerships widget injection | ~50 lines widget | 2 |

#### Checklist
- [x] Every story mapped to specific OM module/mechanism with code estimate `Mat`
- [ ] Piotr checkpoint: story-to-OM mapping verified `Piotr`

---

## 7. Phasing & Rollout Plan `Mat`

> Phasing logic:
> - High business priority + Low gap = ship first
> - High business priority + High gap + BLOCKER = find workaround, ship with workaround
> - High business priority + High gap + not blocker = defer
> - Low business priority + any gap = defer

### Phase 1: Core Loop (WF2 + WF1 foundation)

**Goal:** Agency can onboard and start building pipeline. PM can see activity.

**Why first:** WF2 (WIP) has lowest gap (4) and is the core flywheel. WF1 (onboarding) enables it. Together they unlock "agencies generating pipeline."

| Story | What ships | Gap |
|-------|-----------|-----|
| US-1.1 | Self-onboard (workaround: PM sends link manually, no email invitation yet) | 0 (workaround) |
| US-1.2 | Company profile custom fields | 1 |
| US-1.3 | Case study custom entity | 1 |
| US-1.5 | BD creates first deal (CRM ready) | 0 |
| US-2.1 | Deal creation in CRM | 0 |
| US-2.2 | Pipeline stages seeded, deal moves through stages | 0 |
| US-2.3 | WIP count widget on dashboard | 2 |

**Total new code:** ~80 lines (seed definitions + WIP widget)
**Workaround:** Invitation flow replaced by PM sharing signup link manually. Good enough for 15 agencies.

**After Phase 1, client can say:** "I onboarded 3 agencies, they're logging deals, I see their WIP counts."

### Phase 2: Governance + KPI Visibility (WF5 + WF3 workaround)

**Goal:** PM can evaluate tiers. WIC scores visible via manual import.

**Why second:** Tier governance (WF5) makes the program meaningful — without tiers, agencies have no incentive. WIC (WF3) is a blocker for tier evaluation but the automated pipeline is too expensive. Workaround: PM imports WIC scores manually.

| Story | What ships | Gap |
|-------|-----------|-----|
| US-3.1 | GH username field on User profile | 1 |
| US-3.2 | WIC manual import API | 1 |
| US-3.3 | WIC score display widget | 2 |
| US-5.1 | KPI aggregation job (WIC+WIP+MIN) | 2 |
| US-5.2 | Tier threshold comparison | 1 |
| US-5.3 | PM approval workflow for tier changes | 1 |
| US-5.4 | Tier progress widget | 2 |

**Total new code:** ~200 lines (aggregation + threshold logic + widgets)
**Workaround:** WIC scoring automated pipeline deferred. PM runs external `wic_assessment.mjs` script and imports results via API.

**After Phase 2, client can say:** "Agencies have tiers, I can see who's contributing code and building pipeline, I can promote/demote based on data."

### Phase 3: Lead Distribution + MIN (WF4 + MIN attribution)

**Goal:** PM can distribute leads via RFP. MIN tracking enables full tier evaluation.

**Why third:** RFP (WF4) needs agencies with profiles and case studies (Phase 1) and tier data (Phase 2) to be useful. MIN needs the pipeline to be working.

| Story | What ships | Gap |
|-------|-----------|-----|
| US-4.1 | RFP campaign creation | 2 |
| US-4.2 | BD response form | 2 |
| US-4.3 | PM comparison page | 3 |
| MIN entity | PartnerLicenseDeal CRUD (PM-only) | 2 |
| MIN display | MIN count on KPI dashboard | 1 |

**Total new code:** ~300 lines (RFP entities + pages + MIN entity)

**After Phase 3, client can say:** "Full loop works. Agencies onboard, build pipeline, contribute code, respond to RFPs, get evaluated on all 3 KPIs, tiers reflect reality."

### Phase 4: Automation (WF3 full + enhancements)

**Goal:** Remove manual workarounds. Full automation.

| Story | What ships | Gap |
|-------|-----------|-----|
| US-3.4 | Automated WIC pipeline (GitHub+LLM) | 5 |
| US-1.1 (full) | Email invitation flow | 3 |
| Onboarding sub-workflows | Tracked onboarding steps via workflows module | 2 |

**After Phase 4:** "System runs itself. WIC scores automatically, agencies get invited by email, onboarding is guided."

### Rollout Summary

```
Phase 1: Core Loop          ~80 lines    WF1 (partial) + WF2
Phase 2: Governance + WIC   ~200 lines   WF5 + WF3 (manual)
Phase 3: RFP + MIN          ~300 lines   WF4 + MIN tracking
Phase 4: Automation          ~400 lines   WF3 (full) + WF1 (full)
                             --------
                             ~980 lines total new code
```

Each phase delivers a complete, usable increment. No phase leaves a workflow half-done.

#### Checklist
- [x] Phases ordered by: business priority x gap score x blocker status
- [x] Each phase delivers complete, usable increment
- [x] Workarounds documented for high-gap blockers — WIC manual import, self-onboard
- [x] Total new code estimated per phase `Piotr`

---

## 8. Cross-Spec Conflicts `Mat`

### Conflicts

| Conflict | Specs involved | Resolution |
|----------|---------------|------------|
| Agency identity: CustomerUser vs User | SPEC-053c vs SPEC-053b | **User wins.** BD needs CRM. Portal deleted. |
| Tier levels: 3 (bronze/silver/gold) vs 4 real | SPEC-053c vs business requirements | **4 real tiers.** Spec was wrong. |
| WIP definition: "conversations" vs "deals in SQL stage" | SPEC-053 vs SPEC-053b | **Deals in SQL stage.** CRM best practice. |
| RFP: custom API routes vs workflows module | SPEC-053c (code) vs SPEC-053b (spec) | **TBD — needs Piotr review.** Workflows module likely simpler. |

### Shared Entity Ownership

| Entity | Owner | Referenced by |
|--------|-------|---------------|
| PartnerAgency (org + tier + profile) | partnerships module | all specs |
| PartnerTierAssignment | partnerships module | SPEC-053b (tier governance) |
| PartnerMetricSnapshot (WIC/WIP/MIN per period) | partnerships module | SPEC-053b (KPIs), SPEC-060 (WIC) |
| PartnerWicRun / ContributionUnit | partnerships module | SPEC-060 (WIC scoring) |
| PartnerRfpCampaign | partnerships module | SPEC-053b (RFP) |
| PartnerRfpResponse | partnerships module | SPEC-053b (RFP) |
| PartnerLicenseDeal (MIN source) | partnerships module | SPEC-053b (MIN) |
| PartnerCaseStudy | entities module (custom entity) | SPEC-053b (RFP matching) |
| Pipeline stages (PRM-specific) | customers module (seeded) | SPEC-053b (WIP) |

#### Checklist
- [x] All related specs listed — SPEC-053, 053a, 053b, 053c, 060, 068
- [x] Identity model consistent — conflict resolved, User wins
- [x] Terminology consistent — glossary §1.3 is source of truth
- [x] Shared entities owned by one spec — partnerships module owns all PRM entities
- [ ] Every conflict resolved — RFP mechanism still TBD

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

#### Checklist
- [x] Every piece of new code passes the "copy test"
- [x] Anti-patterns explicitly listed
- [x] Platform features demonstrated

---

## 10. Open Questions `Mat`

| # | Question | Options | Impact | Owner | Status |
|---|----------|---------|--------|-------|--------|
| 1 | WIC implementation | a) n8n b) OM scheduler c) standalone cron | Phase 4 architecture | Piotr | Open |
| 2 | RFP mechanism | a) custom code b) workflows module | Phase 3 code volume | Mat + Piotr | Open |
| 3 | Invitation flow | a) self-onboard b) email invitation | Phase 1 vs Phase 4 | Mat | Decided: self-onboard Phase 1, email Phase 4 |
| 4 | Existing portal code | a) delete b) refactor | All phases | Mat | Decided: delete. Zero personas need CustomerUser. |
| 5 | Tier grace period | a) none b) 1 month c) pro-rata | Phase 2 edge cases | Mat | Open |
| 6 | RFP lead source | a) website form b) email c) PM enters manually | Phase 3 scope | Mat | Open |
| 7 | RFP matching criteria | a) automated (case study data) b) manual (PM judgment) | Phase 3 complexity | Mat + Piotr | Open |
| 8 | MIN attribution | a) PM creates record b) deal in CRM with license tag c) both | Phase 3 data model | Mat | Open |

#### Checklist
- [x] Every question has: options, impact, owner, status
- [x] No BLOCKER question unresolved for Phase 1 — invitation flow decided (self-onboard)
- [x] Decided questions have rationale recorded

---

## Production Readiness `Mat`

| Workflow | Deployable | Blocker | What client would say |
|----------|-----------|---------|----------------------|
| WF1: Agency Onboarding | **No** | No invitation flow in auth module | "How do I invite an agency?" |
| WF2: Pipeline Building (WIP) | **Almost** | CRM ready, missing WIP count job | "I see CRM but not my WIP count" |
| WF3: Code Contribution (WIC) | **No** | No GitHub integration, no LLM scoring | "How does my PR become WIC score?" |
| WF4: Lead Distribution (RFP) | **No** | No RFP workflow definition, open questions | "How do I send a lead to agencies?" |
| WF5: Tier Governance | **No** | No KPI aggregation, no tier logic | "What tier am I? How far to next?" |

#### Checklist
- [x] Each workflow assessed: deployable or not — binary with specific blocker
- [x] "What would client say?" test — client complaint, not technical gap
- [x] No workflow stops midway — workarounds ensure complete increments per phase

---

## Changelog

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
