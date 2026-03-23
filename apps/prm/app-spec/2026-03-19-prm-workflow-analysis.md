# PRM Workflow Analysis — Mat's Phase 0

> Generated from deep-dive session 2026-03-19. This document captures business workflows, OM platform mapping, gaps, edge cases, and open questions. Input for revised SPEC-053 family.

## Key Architectural Decisions (from this session)

### Identity Model — REVISED
- **SPEC-053c was wrong** making all agency users `CustomerUser` (portal)
- **Correct model:** Agency users are `User` (auth module, backend access)
- **Reason:** Agency BD needs CRM access to log deals (WIP). Portal blocks CRM.
- `CustomerUser` + portal reserved for **agency's end clients** (future scope, no user stories today)

| Persona | Role | Identity | Org scope | What they see |
|---------|------|----------|-----------|---------------|
| Partnership Manager | `partnership_manager` | User | all orgs (`organizationsJson: null`) | Everything, read-only on agency CRM, full on OM HQ |
| Agency Admin | `partner_admin` | User | own org only | CRM, KPI (WIC/WIP/MIN), tier, team management, case studies |
| Business Developer | `partner_member` | User | own org only | CRM, KPI, tier, RFP responses. No user management. |
| Contributor | `partner_contributor` | User | own org only | WIC score + tier level only |

### Portal is NOT used
- Zero portal pages needed
- Zero CustomerUser needed
- Backend + RBAC + org scoping = sufficient for all personas
- Existing code (~570 lines portal pages + routes) should be removed

### CRM is the core tool for agencies
- BD logs deals in `customers` module CRM → WIP counts automatically
- Company profiles with custom fields → agency capabilities for matching
- Case studies as custom entity → evidence for RFP scoring
- Pipeline stages seeded by PRM → define what counts as WIP

### PM cross-org visibility
- PM uses org switcher in topbar to view agency CRM data
- `organizationsJson: null` on PM role = sees all orgs
- `customers.*.view` features = read-only on agency data
- Zero custom code — platform RBAC handles it

---

## Business Workflows

### Workflow 1: Agency Onboarding

**Journey:** PM invites Agency Admin (email+link) → Admin sets password → logs into backend → **Admin onboarding sub-workflow starts** (fill company profile → add min. 1 case study → invite BD → invite Contributor) → BD gets account → **BD onboarding sub-workflow starts** (add prospect company → create deal → move deal to "Contacted") → Agency is operational

**ROI impact:** Each new agency = potentially 1-15 WIP/month (prospects) + 1-5 MIN/year (enterprise license sales). Zero agencies = zero indirect pipeline. Target: 15+ active agencies in network.

**Key personas:** Partnership Manager (invites), Agency Admin (configures), BD (first deal)

**OM readiness:**
- User creation + RBAC → `auth` module ✅
- Org scoping → platform ✅
- Company profile custom fields → `entities` module ✅
- Case studies custom entity → `entities` module ✅
- Pipeline stages for deals → `customers` module ✅
- Sub-workflows (onboarding steps) → `workflows` module ✅
- **Gap: Invitation flow** — auth module has no invite-by-email-link for User accounts

**Boundaries:**
- Starts when: PM clicks "Invite Agency" and provides email
- Ends when: Agency Admin completed onboarding, min. 1 BD invited, BD completed onboarding, first deal logged
- NOT this workflow: BD adding subsequent deals (→ WF2), dev contributing code (→ WF3), tier evaluation (→ WF5)

**Edge cases:**
1. **Admin doesn't accept invitation within 72h** → token expires → PM sees "pending" → can resend → risk: agency never joins
2. **Admin leaves agency after onboarding** → account stays active, nobody manages org → risk: zombie org
3. **PM invites same email twice** → system must deduplicate → risk: duplicate account or confusing error
4. **Admin fills profile but never invites BD** → onboarding "done" but no WIP generated → risk: inactive agency in program

---

### Workflow 2: Pipeline Building (WIP)

**Journey:** BD logs into backend → creates Company (prospect) in CRM → creates Deal on that Company → moves Deal through pipeline stages → when Deal reaches "Sales Qualified Lead" stage → counts as 1 WIP → BD sees WIP count on KPI dashboard

**ROI impact:** Each WIP = prospect in OM pipeline. 15 agencies × 5 WIP/month = 75 prospects/month. Without WIP tracking = OM has no visibility into whether agencies generate pipeline. Agency without WIP loses tier.

**Key personas:** BD (User, creates deals), system (counts WIP)

**OM readiness:**
- CRM (companies, deals, activities) → `customers` module ✅
- Pipeline + stages → `customers` module ✅ (need to seed PRM-specific pipeline in setup.ts)
- Deal CRUD + pipeline UI → `customers` backend pages ✅
- WIP count aggregation → **Gap: scheduled job** (~30 lines)
- KPI dashboard widget → **Gap: widget injection** on partnerships dashboard (~50 lines)

**Boundaries:**
- Starts when: BD creates deal in CRM
- Ends when: Deal saved with correct stage, WIP count updated
- NOT this workflow: closing deal → sale → MIN attribution (→ WF5)

**Edge cases:**
1. **BD creates deal without proper stage** → deal exists but doesn't count as WIP → BD confused → risk: frustration, gaming by putting everything in SQL
2. **BD creates 15 fake deals to inflate WIP** → system doesn't validate quality → PM must audit manually → risk: gaming, trust erosion
3. **Same prospect is deal in two agencies** → both count WIP → conflict at RFP/MIN → risk: attribution disputes
4. **BD deletes deal accidentally** → WIP drops → agency may lose tier → risk: unfair downgrade
5. **Period boundary** — deal created March 31, counted in March or April? → risk: inconsistent counts

---

### Workflow 3: Code Contribution (WIC)

**Journey:** Developer opens PR on OM GitHub repo → core team reviews → merge to develop → **daily scheduled job** runs → fetches PRs from GitHub API per registered contributor → groups by (person, month, feature key) → LLM scoring (level 1-4, impact bonus, bounty matching) → optional human checkpoint (PM override) → WIC score recorded → Contributor/BD/Admin sees score in backend

**ROI impact:** Each WIC = improvement to OM codebase. 15 agencies × 2 WIC/month = 30 contributions/month. Without WIC = agencies don't contribute, OM core team does everything. WIC L3-L4 = senior contributions = highest value.

**Key personas:** Contributor (User, read-only backend), System Operator (scheduled job), PM (optional override)

**OM readiness:**
- Contributor sees WIC score → backend page with RBAC ✅ (simple dashboard, ~50 lines)
- Scheduled daily run → `scheduler` module ✅
- GitHub API integration → **Gap: custom integration**
- GH username → User → org mapping → **Gap: custom field on User** (GH profile link)
- LLM scoring → **Gap: requires external LLM call**
- Human checkpoint → `workflows` USER_TASK ✅
- Score storage → partnerships entity (PartnerWicRun/ContributionUnit) or custom entity

**WIC Algorithm (from SDRC docs):**
- Groups contributions by: person + month + feature key (SPEC-xxx, #issue, PR-id)
- Scoring: L4=1.0, L3=0.5, L2=1.0, L1=0.5/0.25, 0.0=routine
- Impact bonus: +0.25 for scope (≥40 files), +0.25 for completeness (spec+impl+tests)
- Bounty multiplier: 1.5x if linked to bounty issue in active window
- Anti-double-counting: same feature key in same month = one unit
- Requires LLM for: bounty auto-adjudication, ownership analysis, quality assessment

**Open question: Implementation approach**
- Option A: n8n workflow (open-mercato/n8n-nodes project exists) — external orchestration
- Option B: OM workflows module + queue worker — internal, but needs LLM integration
- Option C: Standalone script on cron — simplest but not integrated
- **Needs Piotr's input on n8n vs native**

**Boundaries:**
- Starts when: Scheduled job triggers (daily)
- Ends when: WIC scores recorded for all contributors for current period
- NOT this workflow: PR review process (GitHub). Tier calculation based on WIC (→ WF5).

**Edge cases:**
1. **Developer has GH profile not linked to User in OM** → WIC import can't attribute → risk: contributions not counted
2. **Developer changes agency** → old WIC stays with old org or follows them? → risk: unfair scoring
3. **PR merged but WIC batch hasn't run yet** → developer doesn't see contribution for days → risk: "system doesn't work"
4. **Developer uses private GH account** → different username than registered → risk: WIC not matched

---

### Workflow 4: Lead Distribution (RFP)

**Journey:** OM receives lead → PM creates RFP campaign (description, requirements, deadline, audience: all/selected/tier-filtered) → system notifies matching agencies → BD sees RFP and submits structured response (capabilities, pricing, timeline, relevant case studies) → PM evaluates responses → selects agency → handoff to sales

**ROI impact:** Each matched lead = potential enterprise license sale (MIN). 10 RFP/month × 30% conversion = 3 MIN/month. Without RFP = PM sends emails manually, no fair process. With RFP = transparent, scalable matching.

**Key personas:** PM (creates RFP, evaluates), BD (responds), system (notifies, matches)

**OM readiness:**
- RFP as workflow → `workflows` module: START → create campaign → SEND_EMAIL to agencies → WAIT_FOR_TIMER (deadline) → USER_TASK (evaluate) → END ✅
- Notification to BD → workflows SEND_EMAIL activity OR messages module ✅
- BD response → workflows USER_TASK with structured form ✅
- PM evaluation → backend page (comparison view) → **Gap: custom page** (~100 lines)
- RFP campaign data → **Gap: custom entity** (PartnerRfpCampaign) or custom entity via entities module
- Response data → **Gap: custom entity** (PartnerRfpResponse) or workflow step data

**Open questions:**
- Where does the lead come from? (website form? email? PM enters manually?)
- What matching criteria? (tier + vertical match from case studies + availability?)
- What does "handoff" mean? (Deal created in CRM? Intro email to client? Both?)
- Should matching score be automated (based on case study data) or manual (PM judgment)?

**Boundaries:**
- Starts when: PM creates RFP campaign
- Ends when: PM selected agency and handoff to sales is complete
- NOT this workflow: Agency implements OM at client (post-sale). MIN attribution (→ WF5).

**Edge cases:**
1. **No agency responds to RFP** → deadline passes → PM must search manually or reissue → risk: lead gets cold
2. **Deadline passes while BD is writing response** → system closes → BD loses work → risk: agencies learn to not wait
3. **Two agencies score identically** → PM decides manually → risk: favoritism accusations
4. **Lead changes requirements after RFP published** → PM must update → agencies that responded need to update → risk: chaos
5. **Agency responds but doesn't meet tier requirement** → filter by tier or allow all? → risk: low-quality responses

---

### Workflow 5: Tier Governance

**Journey:** System aggregates WIC+WIP+MIN per org per period → compares with 4 tier thresholds → generates upgrade/downgrade proposal → PM reviews + approves → system updates tier → Agency Admin/BD/Contributor see new status + progress to next level

**ROI impact:** Tier governance = network quality. Without governance = agencies join and do nothing. With governance = only active agencies maintain visibility. Higher tier = higher match score = more RFP invitations = more sales. PM saves ~4h/week of manual spreadsheet review.

**Key personas:** System (aggregates), PM (approves), all agency users (see tier)

**Tier definitions (from business requirements):**

| Tier | WIC/month | WIP/month | MIN/year | Special |
|------|-----------|-----------|----------|---------|
| OM Agency | 1 (L1-2) | 1 | 1 | 2 devs familiar with project |
| OM AI-native Agency | 2 (L1-4) | 5 | 2 | Higher match score |
| OM AI-native Expert | 3 (L1-4) | 15 | 5 (3 in vertical) | Vertical dominance |
| OM AI-native Core | 4 (L3-4) | 15 | 5 | Horizontal dominance, core expertise |

**OM readiness:**
- KPI aggregation → **Gap: scheduled job** (~50 lines)
- Tier comparison → **Gap: custom logic** (compare 3 numbers with thresholds, ~30 lines)
- PM approval → `workflows` USER_TASK ✅
- Tier status widget → **Gap: widget injection** on dashboard (~50 lines)
- Tier history → `audit_logs` module ✅ (log tier changes as audit events)

**Open questions — MIN:**
- Who registers enterprise license sale? PM? BD? System?
- How does system know license is "enterprise"?
- How does attribution to agency work? (deal in CRM → license type tag → agency org?)

**Boundaries:**
- Starts when: Scheduled job triggers tier evaluation (monthly)
- Ends when: PM approved tier change, agency sees updated status
- NOT this workflow: KPI data collection (→ WF2, WF3). RFP matching based on tier (→ WF4).

**Edge cases:**
1. **Agency on tier boundary** — has 4 WIC but needs 5 → downgrade? grace period? → risk: agencies constantly bouncing
2. **Great WIC but zero WIP** — contributes code but no pipeline → which tier? → risk: contributors without business value get visibility
3. **New agency — no data for full period** — how to evaluate? Pro-rata? Grace period? → risk: new agencies immediately lose tier
4. **PM doesn't approve tier change** — proposal sits for weeks → agency doesn't know their tier → risk: governance bottleneck
5. **Vertical dominance for Expert tier** — how does system know 3 MIN are "in given vertical"? → requires tagging deals by industry → risk: no tags = nobody qualifies

---

## Production Readiness

| Workflow | Deployable | Blocker | What client would say |
|----------|-----------|---------|----------------------|
| Agency Onboarding | **No** | No invitation flow in auth module | "How do I invite an agency?" |
| Pipeline Building (WIP) | **Almost** | CRM ready, missing WIP count job | "I see CRM but not my WIP count" |
| Code Contribution (WIC) | **No** | No GitHub integration, no LLM scoring | "How does my PR become WIC score?" |
| Lead Distribution (RFP) | **No** | No RFP workflow definition, open questions | "How do I send a lead to agencies?" |
| Tier Governance | **No** | No KPI aggregation, no tier logic | "What tier am I? How far to next?" |

## Example App Quality Assessment

**Current code is an anti-pattern for example app:**
- Portal pages for users who need backend CRM access
- Custom RFP API routes instead of workflows module
- Custom notification subscriber instead of workflow SEND_EMAIL
- CustomerUser for people who need User accounts
- 3 tier levels (bronze/silver/gold) instead of 4 real ones

**Target: example app should demonstrate:**
- RBAC roles instead of portal identity separation
- Workflows module for RFP lifecycle
- CRM (customers module) as the core agency tool
- Widget injection for KPI dashboards
- Org switcher for PM cross-org visibility
- Pipeline stages for WIP tracking
- Custom entities for case studies
- Minimal new code — only genuine gaps

## Open Questions for Next Session

1. **WIC implementation:** n8n vs native OM? Piotr needs to weigh in.
2. **RFP source:** Where do leads come from?
3. **RFP matching:** Automated scoring or PM judgment?
4. **MIN attribution:** Who registers license sale? How?
5. **Invitation flow:** Build in partnerships module or propose upstream to auth module?
6. **Existing code:** Delete portal code and start fresh, or refactor incrementally?

## Changelog

### 2026-03-19
- Initial workflow analysis from Mat's Phase 0 session
- Identified identity model error in SPEC-053c (CustomerUser → should be User)
- Mapped 5 workflows with boundaries, edge cases, ROI
- Identified platform gaps and open questions
- Assessed production readiness and example app quality
