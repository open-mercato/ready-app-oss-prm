# WF4: RFP Lead Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build RFP workflow — PM creates campaigns, BD responds, PM evaluates and awards. Driven by 43 e2e tests (TC-PRM-025 through TC-PRM-031, all currently red).

**Architecture:** 2 new entities (PartnerRfpCampaign, PartnerRfpResponse), 1 settings entity (RfpSettings), notifications via OM `notifications` module, workflow via OM `workflows` module. All code in `apps/prm/src/modules/partnerships/`. Follow existing patterns (makeCrudRoute, apiCall, Page/PageBody/PageHeader).

**Tech Stack:** MikroORM entities, Zod validators, makeCrudRoute, React client pages, OM notifications + workflows modules.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `data/entities.ts` | Modify | Add PartnerRfpCampaign, PartnerRfpResponse, RfpSettings entities |
| `data/validators.ts` | Modify | Add rfpCampaign, rfpResponse, rfpSettings Zod schemas |
| `api/rfp-campaigns/route.ts` | Create | makeCrudRoute for campaigns (list, create, update, delete) |
| `api/post/rfp-campaigns-publish.ts` | Create | Publish campaign → emit CampaignPublished event |
| `api/post/rfp-campaigns-award.ts` | Create | Award campaign → send award/rejection notifications |
| `api/rfp-responses/route.ts` | Create | CRUD for responses (create/update with deadline check) |
| `api/get/rfp-settings.ts` | Create | Get RFP message templates |
| `api/post/rfp-settings.ts` | Create | Save RFP message templates |
| `backend/partnerships/rfp-campaigns/page.tsx` | Create | Campaign list page |
| `backend/partnerships/rfp-campaigns/page.meta.ts` | Create | Page metadata (nav, auth) |
| `backend/partnerships/rfp-campaigns/create/page.tsx` | Create | Create campaign form |
| `backend/partnerships/rfp-campaigns/create/page.meta.ts` | Create | Page metadata |
| `backend/partnerships/rfp-campaigns/[id]/page.tsx` | Create | Campaign detail + responses + award |
| `backend/partnerships/rfp-campaigns/[id]/page.meta.ts` | Create | Page metadata |
| `backend/partnerships/rfp-settings/page.tsx` | Create | RFP message templates settings |
| `backend/partnerships/rfp-settings/page.meta.ts` | Create | Page metadata |
| `notifications.ts` | Create | Notification type definitions for RFP |
| `notifications.client.ts` | Create | Client-side notification renderers |
| `subscribers/rfp-campaign-published.ts` | Create | On CampaignPublished → create notifications for BD |
| `subscribers/rfp-campaign-awarded.ts` | Create | On RfpAwarded → award + rejection notifications |
| `events.ts` | Modify | Add CampaignPublished, RfpAwarded events |
| `acl.ts` | Modify | Add rfp features |
| `setup.ts` | Modify | Add defaultRoleFeatures for RFP, seed default templates |
| `i18n/en.json` | Modify | Add all RFP translation keys |

---

## Task 1: PartnerRfpCampaign entity + CRUD + backend pages

**Unlocks:** TC-PRM-025 (T1-T5), TC-PRM-026 (T1-T4), TC-PRM-030 (T4)

**Files:**
- Modify: `data/entities.ts`
- Modify: `data/validators.ts`
- Create: `api/rfp-campaigns/route.ts`
- Create: `api/post/rfp-campaigns-publish.ts`
- Create: `backend/partnerships/rfp-campaigns/page.tsx`
- Create: `backend/partnerships/rfp-campaigns/page.meta.ts`
- Create: `backend/partnerships/rfp-campaigns/create/page.tsx`
- Create: `backend/partnerships/rfp-campaigns/create/page.meta.ts`
- Create: `backend/partnerships/rfp-campaigns/[id]/page.tsx`
- Create: `backend/partnerships/rfp-campaigns/[id]/page.meta.ts`
- Modify: `events.ts`
- Modify: `acl.ts`
- Modify: `setup.ts`
- Modify: `i18n/en.json`

- [ ] **Step 1: Add PartnerRfpCampaign entity**

In `data/entities.ts`, add:

```typescript
@Entity({ tableName: 'partner_rfp_campaigns' })
@Index({ name: 'rfp_camp_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class PartnerRfpCampaign {
  [OptionalProps]?: 'createdAt' | 'status' | 'audience'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ type: 'text' })
  title!: string

  @Property({ type: 'text' })
  description!: string

  @Property({ type: Date })
  deadline!: Date

  @Property({ type: 'text', default: 'all' })
  audience: string = 'all'

  @Property({ name: 'selected_agency_ids', type: 'jsonb', nullable: true })
  selectedAgencyIds?: string[] | null

  @Property({ type: 'text', default: 'draft' })
  status: string = 'draft'

  @Property({ name: 'winner_organization_id', type: 'uuid', nullable: true })
  winnerOrganizationId?: string | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_by', type: 'uuid' })
  createdBy!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
```

- [ ] **Step 2: Add Zod schemas**

In `data/validators.ts`, add:

```typescript
export const rfpCampaignCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required'),
  deadline: z.coerce.date().refine((d) => d > new Date(), 'Deadline must be in the future'),
  audience: z.enum(['all', 'selected']).default('all'),
  selectedAgencyIds: z.array(z.string().uuid()).optional(),
})

export type RfpCampaignCreateInput = z.infer<typeof rfpCampaignCreateSchema>

export const rfpCampaignUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  deadline: z.coerce.date().optional(),
  audience: z.enum(['all', 'selected']).optional(),
  selectedAgencyIds: z.array(z.string().uuid()).optional(),
})
```

- [ ] **Step 3: Add events**

In `events.ts`, add to the events array:

```typescript
{ id: 'partnerships.rfp_campaign.published', label: 'RFP Campaign Published', entity: 'rfp_campaign', category: 'lifecycle' },
{ id: 'partnerships.rfp_campaign.awarded', label: 'RFP Campaign Awarded', entity: 'rfp_campaign', category: 'lifecycle' },
```

- [ ] **Step 4: Add ACL features**

In `acl.ts`, add:

```typescript
{ id: 'partnerships.rfp.manage', title: 'Manage RFP campaigns (PM only)', module: 'partnerships' },
{ id: 'partnerships.rfp.respond', title: 'Respond to RFP campaigns', module: 'partnerships' },
```

- [ ] **Step 5: Add defaultRoleFeatures in setup.ts**

In `setup.ts` seedDefaults, add to partnership_manager role: `'partnerships.rfp.manage'`
Add to partner_admin and partner_member roles: `'partnerships.rfp.respond'`

- [ ] **Step 6: Create makeCrudRoute for campaigns**

Create `api/rfp-campaigns/route.ts` following the `partner-license-deals/route.ts` pattern:

```typescript
import { makeCrudRoute } from '@open-mercato/core/lib/crud/makeCrudRoute'
import { PartnerRfpCampaign } from '../../data/entities'
import { rfpCampaignCreateSchema, rfpCampaignUpdateSchema } from '../../data/validators'

const routeMetadata = {
  path: '/partnerships/rfp-campaigns',
  GET: { requireAuth: true, requireFeatures: ['partnerships.manage'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
}

// GET also allowed for partnerships.rfp.respond (BD can see campaigns)
```

Use makeCrudRoute with PartnerRfpCampaign entity. Actions: list (filterable by status), create (validates deadline in future, sets createdBy from auth), update (only draft campaigns), delete (only draft).

- [ ] **Step 7: Create publish endpoint**

Create `api/post/rfp-campaigns-publish.ts`:
- `POST /api/partnerships/rfp-campaigns/:id/publish`
- requireFeatures: `['partnerships.rfp.manage']`
- Validates campaign is in `draft` status
- Changes status to `open`
- Emits `partnerships.rfp_campaign.published` event
- Returns updated campaign

- [ ] **Step 8: Create campaign list page**

Create `backend/partnerships/rfp-campaigns/page.tsx` + `page.meta.ts`:
- meta: `{ pageTitle: 'RFP Campaigns', pageGroup: 'Partnerships', requireAuth: true, requireFeatures: ['partnerships.manage'] }`
- Page: table with columns: Title, Status (badge), Deadline, Audience, Winner, Created
- "Create Campaign" button in PageHeader actions
- Status badges: draft (gray), open (blue), awarded (green), closed (yellow)
- Use PageHeader, PageBody, LoadingMessage, EmptyState, Button from OM

- [ ] **Step 9: Create campaign create page**

Create `backend/partnerships/rfp-campaigns/create/page.tsx` + `page.meta.ts`:
- meta: `{ pageTitle: 'Create RFP Campaign', navHidden: true, requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] }`
- Form fields: title (text), description (textarea), deadline (date), audience (select: all/selected)
- If audience=selected: show agency checkboxes (fetch from `/api/partnerships/agencies`)
- Submit: POST to `/api/partnerships/rfp-campaigns` → flash success → redirect to list
- Use PageHeader, PageBody, Button, flash from OM

- [ ] **Step 10: Create campaign detail page**

Create `backend/partnerships/rfp-campaigns/[id]/page.tsx` + `page.meta.ts`:
- meta: `{ pageTitle: 'RFP Campaign', navHidden: true, requireAuth: true, requireFeatures: ['partnerships.manage'] }`
- Shows campaign details (title, description, deadline, status, audience)
- If draft: "Publish" button
- If open: shows responses (to be populated in Task 4)
- If open + has responses: "Award" button per response (to be populated in Task 5)
- Use PageHeader, PageBody, Button, LoadingMessage from OM

- [ ] **Step 11: Add i18n keys**

In `i18n/en.json` add keys for: rfp campaigns nav, page titles, form labels, status labels, empty states, flash messages.

- [ ] **Step 12: Run `yarn generate` to update auto-discovery**

```bash
cd apps/prm && yarn generate
```

- [ ] **Step 13: Generate migration**

```bash
cd apps/prm && yarn db:generate
```

Review generated migration — should create `partner_rfp_campaigns` table.

- [ ] **Step 14: Run migration**

```bash
cd apps/prm && yarn db:migrate
```

- [ ] **Step 15: Run TC-PRM-025 and TC-PRM-026 tests**

```bash
cd apps/prm && yarn test:integration --grep "TC-PRM-025|TC-PRM-026"
```

Expected: Most tests pass (T1-T5 in 025, T1-T4 in 026).

- [ ] **Step 16: Commit**

```bash
git add -A && git commit -m "feat(prm): add PartnerRfpCampaign entity + CRUD + backend pages (WF4 commit 1)"
```

---

## Task 2: RFP Message Templates Settings

**Unlocks:** TC-PRM-031 (T1-T4)

**Files:**
- Modify: `data/entities.ts` (add RfpSettings entity)
- Modify: `data/validators.ts` (add rfpSettings schema)
- Create: `api/get/rfp-settings.ts`
- Create: `api/post/rfp-settings.ts`
- Create: `backend/partnerships/rfp-settings/page.tsx`
- Create: `backend/partnerships/rfp-settings/page.meta.ts`
- Modify: `setup.ts` (seed default templates)
- Modify: `i18n/en.json`

- [ ] **Step 1: Add RfpSettings entity**

```typescript
@Entity({ tableName: 'rfp_settings' })
@Unique({ name: 'rfp_settings_tenant_idx', properties: ['tenantId'] })
export class RfpSettings {
  [OptionalProps]?: 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'campaign_template', type: 'text' })
  campaignTemplate!: string

  @Property({ name: 'award_template', type: 'text' })
  awardTemplate!: string

  @Property({ name: 'rejection_template', type: 'text' })
  rejectionTemplate!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date(), onCreate: () => new Date() })
  updatedAt: Date = new Date()
}
```

- [ ] **Step 2: Seed default templates in setup.ts**

In seedDefaults, create RfpSettings with default templates:
- Campaign: `"New RFP: [campaign-title]\n\nHi [first-name],\n\nWe have a new opportunity that may match your agency's capabilities. Please review the requirements and submit your response before the deadline.\n\nBest regards,\nOpen Mercato Partner Program"`
- Award: `"Congratulations [first-name]!\n\nYour agency [agency-name] has been selected for \"[campaign-title]\". We will be in touch with next steps.\n\nBest regards,\nOpen Mercato Partner Program"`
- Rejection: `"Hi [first-name],\n\nThank you for your response to \"[campaign-title]\". After careful evaluation, we have selected another agency for this opportunity. We appreciate your interest and look forward to future collaborations.\n\nBest regards,\nOpen Mercato Partner Program"`

- [ ] **Step 3: Create GET/POST endpoints for settings**

GET: requireFeatures `['partnerships.rfp.manage']`, returns templates.
POST: requireFeatures `['partnerships.rfp.manage']`, validates + upserts.

- [ ] **Step 4: Create settings page**

`backend/partnerships/rfp-settings/page.tsx` — 3 textarea fields (campaign, award, rejection), placeholder hints shown, Save button. PageHeader + PageBody.

- [ ] **Step 5: Generate migration + run**

```bash
yarn db:generate && yarn db:migrate
```

- [ ] **Step 6: Run TC-PRM-031 tests**

Expected: T1-T4 pass.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(prm): add RFP message templates settings (WF4 commit 2)"
```

---

## Task 3: RFP Notifications

**Unlocks:** TC-PRM-027 (T1-T5)

**Files:**
- Create: `notifications.ts`
- Create: `notifications.client.ts`
- Create: `subscribers/rfp-campaign-published.ts`
- Modify: `i18n/en.json`

- [ ] **Step 1: Create notification types**

`notifications.ts`:
```typescript
import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications'

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'partnerships.rfp.campaign_published',
    label: 'New RFP Campaign',
    description: 'A new RFP campaign has been published',
    defaultEnabled: true,
  },
  {
    type: 'partnerships.rfp.awarded',
    label: 'RFP Awarded',
    description: 'Your agency has been selected for an RFP',
    defaultEnabled: true,
  },
  {
    type: 'partnerships.rfp.rejected',
    label: 'RFP Not Selected',
    description: 'Another agency was selected for an RFP',
    defaultEnabled: true,
  },
]
```

- [ ] **Step 2: Create subscriber for CampaignPublished**

`subscribers/rfp-campaign-published.ts`:
- Listens to `partnerships.rfp_campaign.published`
- Reads campaign audience (all or selectedAgencyIds)
- Finds all BD users (partner_member + partner_admin roles) in target agencies
- Reads RFP message template from RfpSettings
- Resolves placeholders (`[first-name]`, `[last-name]`, `[agency-name]`, `[campaign-title]`)
- Creates Notification per BD user via `em.create(Notification, ...)`
- OM auto-delivers email for each notification

- [ ] **Step 3: Create client-side renderer**

`notifications.client.ts` — renders notification in bell panel with campaign title and link to campaign detail.

- [ ] **Step 4: Run `yarn generate`**

- [ ] **Step 5: Run TC-PRM-027 tests**

Expected: T1-T5 pass.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(prm): add RFP notifications (in-app + auto email) (WF4 commit 3)"
```

---

## Task 4: PartnerRfpResponse entity + CRUD

**Unlocks:** TC-PRM-028 (T1-T9), TC-PRM-030 (T3, T6)

**Files:**
- Modify: `data/entities.ts` (add PartnerRfpResponse)
- Modify: `data/validators.ts` (add response schemas)
- Create: `api/rfp-responses/route.ts`
- Modify: `backend/partnerships/rfp-campaigns/[id]/page.tsx` (show responses)
- Modify: `i18n/en.json`

- [ ] **Step 1: Add PartnerRfpResponse entity**

```typescript
@Entity({ tableName: 'partner_rfp_responses' })
@Unique({ name: 'rfp_resp_camp_org_idx', properties: ['campaignId', 'organizationId'] })
@Index({ name: 'rfp_resp_tenant_idx', properties: ['tenantId'] })
export class PartnerRfpResponse {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'campaign_id', type: 'uuid' })
  campaignId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'response_text', type: 'text' })
  responseText!: string

  @Property({ name: 'submitted_by', type: 'uuid' })
  submittedBy!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date(), onCreate: () => new Date() })
  updatedAt: Date = new Date()
}
```

Unique constraint: one response per agency per campaign. PUT overwrites.

- [ ] **Step 2: Add validators**

```typescript
export const rfpResponseCreateSchema = z.object({
  campaignId: z.string().uuid(),
  responseText: z.string().min(1, 'Response text is required'),
})

export const rfpResponseUpdateSchema = z.object({
  campaignId: z.string().uuid(),
  responseText: z.string().min(1, 'Response text is required'),
})
```

- [ ] **Step 3: Create response CRUD route**

`api/rfp-responses/route.ts`:
- GET: requireFeatures `['partnerships.manage']` (PM sees all) or `['partnerships.rfp.respond']` (BD sees own org)
- POST: requireFeatures `['partnerships.rfp.respond']`. Validates: campaign exists, campaign status is `open`, deadline not passed, no existing response from this org. Creates response with `organizationId` from auth.
- PUT: requireFeatures `['partnerships.rfp.respond']`. Same deadline validation. Upserts (update existing response for this org+campaign).
- POST/PUT reject with 422 if deadline passed or campaign not open/awarded.

- [ ] **Step 4: Update campaign detail page to show responses**

In `backend/partnerships/rfp-campaigns/[id]/page.tsx`, add a responses section:
- Fetch responses via `/api/partnerships/rfp-responses?campaignId={id}`
- Show list of responses with: agency name, response text, submitted date
- If no responses: empty state "No responses yet"
- BD view: show own response with edit capability (textarea + save button) if deadline not passed

- [ ] **Step 5: Generate migration + run**

- [ ] **Step 6: Run TC-PRM-028 tests**

Expected: T1-T9 pass.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(prm): add PartnerRfpResponse entity + CRUD with deadline enforcement (WF4 commit 4)"
```

---

## Task 5: Comparison page + Award + Reject notifications

**Unlocks:** TC-PRM-029 (T1-T9), TC-PRM-030 (T1-T2, T5)

**Files:**
- Create: `api/post/rfp-campaigns-award.ts`
- Create: `subscribers/rfp-campaign-awarded.ts`
- Modify: `backend/partnerships/rfp-campaigns/[id]/page.tsx` (add comparison + award UI)
- Modify: `i18n/en.json`

- [ ] **Step 1: Create award endpoint**

`api/post/rfp-campaigns-award.ts`:
- `POST /api/partnerships/rfp-campaigns/:id/award`
- requireFeatures: `['partnerships.rfp.manage']`
- Validates: campaign status is `open`, at least 1 response exists, winnerOrganizationId is a valid responder
- Updates campaign: status → `awarded`, winnerOrganizationId set
- Emits `partnerships.rfp_campaign.awarded` event with campaignId, winnerOrganizationId
- Returns 422 if already awarded, 422 if no responses

- [ ] **Step 2: Create awarded subscriber**

`subscribers/rfp-campaign-awarded.ts`:
- Listens to `partnerships.rfp_campaign.awarded`
- Reads award + rejection templates from RfpSettings
- Resolves placeholders
- Creates award notification for winner BD users
- Creates rejection notification for all other responding BD users
- Non-responding agencies get nothing

- [ ] **Step 3: Update campaign detail page with comparison + award**

In `[id]/page.tsx`:
- PM view (when campaign is open + has responses): show responses side-by-side
- Each response card: agency name, tier badge, response text, case studies (fetched from entities)
- "Award" button per response (only for PM, only when status=open)
- Award confirmation dialog
- After award: page shows "Awarded to {agency}" banner, Award buttons hidden

- [ ] **Step 4: Run TC-PRM-029 and TC-PRM-030 tests**

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(prm): add RFP comparison page + award with auto notifications (WF4 commit 5)"
```

---

## Task 6: seedExamples + final wiring

**Files:**
- Modify: `setup.ts` (seedExamples)
- Run: `yarn generate`

- [ ] **Step 1: Add RFP demo data to seedExamples**

In setup.ts seedExamples, add:
- 1 demo RFP campaign (status: open, deadline: future, audience: all)
- 2 demo responses (from Acme and Nordic)
- 1 awarded campaign (from past) with winner

- [ ] **Step 2: Run `yarn generate`**

- [ ] **Step 3: Run full test suite**

```bash
yarn test:integration --grep "TC-PRM-02[5-9]|TC-PRM-03[0-1]"
```

Expected: All 43 tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(prm): add RFP demo data in seedExamples (WF4 commit 6)"
```

---

## Summary

| Task | Commit | Tests unlocked | Files |
|------|--------|---------------|-------|
| 1 | Campaign entity + CRUD + pages | TC-025, TC-026, TC-030 partial | 14 files |
| 2 | Message templates settings | TC-031 | 8 files |
| 3 | Notifications | TC-027 | 4 files |
| 4 | Response entity + CRUD | TC-028, TC-030 partial | 5 files |
| 5 | Comparison + award + reject notifs | TC-029, TC-030 remaining | 4 files |
| 6 | seedExamples | — | 1 file |
| **Total** | **6 commits** | **43 tests** | |
