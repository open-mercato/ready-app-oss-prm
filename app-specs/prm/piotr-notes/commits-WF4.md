# Commit Plan: WF4 — Lead Distribution (RFP)

> Generated: 2026-03-20
> Based on: App Spec §3 (WF4), §4 (gap matrix), §6 (Phase 3 + Phase 4 rollout)
> Verified against: upstream/main workflows module AGENTS.md

## Summary

WF4 needs 4 Phase 3 commits + 2 Phase 4 commits. Zero core-module flags. Zero official-module flags.
The workflow engine, SEND_EMAIL activity, USER_TASK, WAIT_FOR_TIMER, and EMIT_EVENT all exist on upstream.
Every gap is app-scope — entities, workflow JSON, one backend page, one n8n workflow.

---

## Commit 1: PartnerRfpCampaign entity + CRUD route

- **Scope:** app
- **Phase:** 3
- **Pattern:** entity + CRUD route (makeCrudRoute, customers module pattern)
- **Files:**
  - `src/modules/partnerships/data/entities/partner-rfp-campaign.entity.ts` — ORM entity: `id`, `title`, `requirements` (text), `deadline` (datetime), `audience_type` (enum: `all` | `selected` | `tier_filtered`), `audience_tier_min` (nullable int), `audience_agency_ids` (json array, nullable), `status` (enum: `draft` | `published` | `awarded`), `winning_agency_id` (nullable FK), `organization_id` (tenant scope — PM org), `created_by` (FK to User)
  - `src/modules/partnerships/data/validators/partner-rfp-campaign.validator.ts` — Zod schema: `title` required, `deadline` must be future, `audience_type` required
  - `src/modules/partnerships/api/partner-rfp-campaigns.route.ts` — `makeCrudRoute` with PM-only write guard, agency read guard for own audience; exports `openApi`
  - `src/modules/partnerships/setup.ts` — register PartnerRfpCampaign entity; seed default RBAC features (`rfp_campaigns.view`, `rfp_campaigns.manage`)
  - `src/modules/partnerships/acl.ts` — add `rfp_campaigns.view` (partner_admin, partner_member), `rfp_campaigns.manage` (partnership_manager)
  - `src/modules/partnerships/migrations/YYYYMMDD_add_partner_rfp_campaign.ts` — CREATE TABLE migration
- **Delivers:** `GET/POST/PATCH/DELETE /api/partnerships/rfp-campaigns` exists. PM can create draft campaigns with title, requirements, deadline, audience type. Attachments live via the platform Attachments module — no custom code needed (attach via standard `POST /api/attachments` referencing this entity ID). Route scoped by tenant. Unit tests pass.
- **Depends on:** none (partnerships module already exists from WF1/WF2 work)

---

## Commit 2: RFP workflow JSON definition + CampaignPublished trigger

- **Scope:** app
- **Phase:** 3
- **Pattern:** workflow JSON definition (examples/ seed pattern, workflows module)
- **Files:**
  - `src/modules/partnerships/workflows/rfp-campaign.workflow.json` — workflow definition:
    ```
    START
      -> AUTOMATED (EMIT_EVENT: CampaignPublished, payload: { rfpCampaignId, audienceType, audienceAgencyIds })
      -> AUTOMATED (SEND_EMAIL to audience agencies: "New RFP: {{context.title}} — deadline {{context.deadline}}")
      -> WAIT_FOR_TIMER (duration: derived from deadline — {{context.deadline}})
      [BD responses submitted via PartnerRfpResponse CRUD API while timer waits — not a workflow step]
      -> USER_TASK (assignedToRoles: [partnership_manager], title: "Evaluate RFP Responses + Select Winner")
      -> AUTOMATED (EMIT_EVENT: RfpAwarded, payload: { rfpId: {{workflow.id}}, winningAgencyId: {{context.winnerAgencyId}} })
      -> END
    ```
  - `src/modules/partnerships/workflows/rfp-campaign.trigger.ts` — WorkflowEventTrigger: fires on `CampaignPublished` event; `contextMapping` extracts `rfpCampaignId`, `title`, `deadline`, audience fields into workflow context
  - `src/modules/partnerships/events.ts` — declare `CampaignPublished` and `RfpAwarded` events `as const`
  - `src/modules/partnerships/setup.ts` — `seedExamples`: seed 1 demo RFP campaign (Published state) + register workflow trigger
- **Delivers:** PM publishes a draft campaign via `PATCH /api/partnerships/rfp-campaigns/:id` (status: published) → `CampaignPublished` event emitted → workflow auto-starts → SEND_EMAIL fires to notified agencies → timer waits for deadline → [BD responses submitted via PartnerRfpResponse API during this wait] → deadline passes → USER_TASK opens for PM evaluation → `RfpAwarded` emitted on winner selection. One workflow instance per campaign. Testable: publish a campaign, confirm workflow instance created, confirm email activity in workflow event log.
- **Depends on:** Commit 1

---

## Commit 3: PartnerRfpResponse entity + CRUD route (BD submits via API, not workflow step)

- **Scope:** app
- **Phase:** 3
- **Pattern:** entity + CRUD route (makeCrudRoute)
- **Files:**
  - `src/modules/partnerships/data/entities/partner-rfp-response.entity.ts` — ORM entity: `id`, `rfp_campaign_id` (FK, non-null), `responding_agency_id` (FK, non-null), `response_text` (text — free-form, like an email body), `submitted_at` (datetime), `status` (enum: `draft` | `submitted`), `organization_id` (tenant-scoped to responding agency)
  - `src/modules/partnerships/data/validators/partner-rfp-response.validator.ts` — `response_text` required, `rfp_campaign_id` required, validate agency is in campaign audience at submission time (audience membership check), enforce one response per agency per campaign (unique constraint: `rfp_campaign_id + responding_agency_id`)
  - `src/modules/partnerships/api/partner-rfp-responses.route.ts` — `makeCrudRoute`; write access: `partner_admin` + `partner_member` scoped to own org; read access: `partnership_manager` (all responses for a campaign). Rejects submissions after deadline. Exports `openApi`.
  - `src/modules/partnerships/migrations/YYYYMMDD_add_partner_rfp_response.ts` — CREATE TABLE with unique constraint on `(rfp_campaign_id, responding_agency_id)`
  - `src/modules/partnerships/acl.ts` — add `rfp_responses.submit` (partner_admin, partner_member), `rfp_responses.view_all` (partnership_manager). `partner_contributor` gets neither.
  - `src/modules/partnerships/setup.ts` — `seedExamples`: 2 demo responses (text + case studies auto-linked) for the demo campaign
- **Delivers:** BD navigates to RFP campaign page → sees requirements + deadline → submits `response_text` + optional file attachments (via Attachments module, no custom code) → `PartnerRfpResponse` record created via CRUD API (not a workflow step — submitted while workflow waits for timer) → agency's case studies auto-linked in response view (query: `SELECT * FROM case_studies WHERE organization_id = responding_agency_id`). Audience membership validated at submission. Late submission rejected by route (deadline check). One response per agency enforced by DB constraint.
- **Depends on:** Commit 1, Commit 2

---

## Commit 4: PM comparison page + winner selection (RfpAwarded)

- **Scope:** app
- **Phase:** 3
- **Pattern:** backend page (list + detail pattern from customers module)
- **Files:**
  - `src/modules/partnerships/backend/rfp-campaigns/rfp-campaign-detail.page.tsx` — server component: fetches campaign + all responses + case studies per responding agency. Renders side-by-side layout: left rail = agency list, main panel = selected agency's `response_text` + attached files + case study cards (title, tech stack, industry, budget bucket, duration). PM selects winner via button → `PATCH /api/partnerships/rfp-campaigns/:id` with `{ winningAgencyId, status: awarded }` → workflow USER_TASK completed → `RfpAwarded` emitted.
  - `src/modules/partnerships/backend/rfp-campaigns/rfp-campaigns-list.page.tsx` — server component: list of all campaigns with status badge (Draft / Published / Awarded), deadline, response count. PM clicks into detail page.
  - `src/modules/partnerships/backend/rfp-campaigns/index.ts` — auto-discovery registration (backend page route)
  - `src/modules/partnerships/i18n/en.json` — labels: "RFP Campaigns", "Responses", "Select Winner", "Campaign Awarded", "No responses received", "Deadline passed"
- **Delivers:** PM navigates to RFP Campaigns in backend sidebar → sees list of campaigns → clicks Published campaign → sees all agency responses side-by-side with their case studies → selects winner → workflow advances → `RfpAwarded` event published → campaign status flips to Awarded. Losing agencies can be notified via a subsequent SEND_EMAIL activity already in the workflow definition (can be added to the workflow JSON in Commit 2 with a conditional branch on winner selection). Testable: end-to-end RFP lifecycle runs in demo data.
- **Depends on:** Commit 2, Commit 3

---

## Commit 5: n8n RFP scoring workflow (AI-assisted evaluation)

- **Scope:** n8n
- **Phase:** 4
- **Pattern:** n8n workflow definition (webhook trigger → Open Mercato nodes → LLM → POST scores)
- **Files:**
  - `n8n-workflows/rfp-ai-scoring.workflow.json` — n8n workflow:
    ```
    Webhook (POST /rfp-score, payload: { rfpCampaignId, responseIds[] })
      -> Open Mercato node: GET /api/partnerships/rfp-campaigns/:id (fetch requirements)
      -> Open Mercato node: GET /api/partnerships/rfp-responses?campaignId=:id (fetch all responses + case studies)
      -> Code node: build LLM prompt (rubric: tech fit /5 + domain fit /5 per agency, per lead-agency-matching rubric from spec)
      -> LLM node: score each agency (reasoning + scores)
      -> Open Mercato node: POST /api/partnerships/rfp-campaigns/:id/scores (write scores back)
    ```
  - `src/modules/partnerships/api/rfp-scores.route.ts` (app-scope stub) — `POST /api/partnerships/rfp-campaigns/:id/scores`, accepts `{ agencyId, techFit: number, domainFit: number, reasoning: string }[]`, writes to `rfp_response.ai_score_*` fields. PM-only write (n8n uses service token). Exports `openApi`.
  - `src/modules/partnerships/data/entities/partner-rfp-response.entity.ts` (amend) — add `ai_tech_fit` (float, nullable), `ai_domain_fit` (float, nullable), `ai_reasoning` (text, nullable), `ai_scored_at` (datetime, nullable)
  - `src/modules/partnerships/backend/rfp-campaigns/rfp-campaign-detail.page.tsx` (amend) — render AI scores inline on comparison page when present. "Score responses" button → `POST /api/n8n/rfp-score` proxy or direct n8n webhook call with campaign ID.
  - `n8n-workflows/README.md` — documents webhook URL, required env vars (`OM_BASE_URL`, `OM_API_TOKEN`, `OPENAI_API_KEY`), how to import into n8n instance
- **Delivers:** PM clicks "Score responses" on comparison page → n8n webhook fires → LLM scores all responses (tech fit + domain fit with reasoning) → scores written back to `PartnerRfpResponse` fields → comparison page shows AI scores alongside free-form text. PM uses scores as guidance, makes final selection. Zero LLM code in the OM app itself.
- **Depends on:** Commit 4

---

## Commit 6: seedExamples for WF4 (SPEC-068 demo data)

- **Scope:** app
- **Phase:** 3
- **Pattern:** setup.ts seedExamples (SPEC-068 pattern)
- **Files:**
  - `src/modules/partnerships/setup.ts` — `seedExamples()` additions:
    - 1 demo RFP campaign: title "Enterprise CRM Implementation Lead (Demo)", status `awarded`, past deadline, file attachment stub
    - 2 demo `PartnerRfpResponse` records: Agency 1 (winner, full text), Agency 2 (full text)
    - Demo case studies linked to each responding agency (from Phase 1 seed — no new entities needed)
    - 1 demo campaign in `published` state with future deadline (so developer can test the BD submission flow live)
- **Delivers:** `yarn initialize` populates a complete RFP lifecycle in demo data. Developer sees: one Awarded campaign (full history end-to-end), one Published campaign (can submit a response to test the workflow). Satisfies US-7.2.
- **Depends on:** Commit 3, Commit 4

---

## Dependency Graph

```
Commit 1 (entity + CRUD)
    └─> Commit 2 (workflow JSON + trigger)
            └─> Commit 3 (response entity + USER_TASK)
                    └─> Commit 4 (comparison page + winner)
                            ├─> Commit 6 (seedExamples — Phase 3 close)
                            └─> Commit 5 (n8n AI scoring — Phase 4)
```

---

## Scope Summary

| Commit | Scope | Flag? |
|--------|-------|-------|
| 1: PartnerRfpCampaign entity + CRUD | `app` | No |
| 2: RFP workflow JSON + trigger | `app` | No |
| 3: PartnerRfpResponse entity + USER_TASK | `app` | No |
| 4: PM comparison page + winner selection | `app` | No |
| 5: n8n AI scoring workflow | `n8n` | No |
| 6: seedExamples WF4 | `app` | No |

No `core-module` flags. No `official-module` flags. WF4 is fully self-contained in app scope (Phase 3) with an optional n8n layer (Phase 4).

---

## Platform coverage confirmed

| Capability needed | OM upstream status |
|-------------------|--------------------|
| SEND_EMAIL activity (notify agencies) | Confirmed — workflows module activity type |
| WAIT_FOR_TIMER step (deadline gate) | Confirmed — workflows module step type |
| USER_TASK step (BD submission + PM evaluation) | Confirmed — workflows module step type |
| EMIT_EVENT activity (CampaignPublished, RfpAwarded) | Confirmed — workflows module activity type |
| makeCrudRoute pattern | Confirmed — customers module reference |
| File attachments on entities | Confirmed — Attachments module, no custom code |
| WorkflowEventTrigger (auto-start on event) | Confirmed — subscribers/event-trigger.ts |
| RBAC feature gates | Confirmed — acl.ts + setup.ts |
| Backend pages (server components) | Confirmed — backend/ pattern |
| Auto-discovery for backend pages | Confirmed — put file in backend/, platform finds it |
