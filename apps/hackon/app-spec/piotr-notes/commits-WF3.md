# WF3: Hacking & Project Submission — Atomic Commit Plan

Module path shorthand: `apps/mercato/src/modules/hackon/`

Assumes WF1 (`competitions` module: Competition, Stage entities + events `hackon.stage.advanced`)
and WF2 (`teams` module: Team entity, portal team management pages) are merged.

---

## Commit 1: Project entity + validators + migration

- Scope: app
- Pattern: entity + validators
- Files:
  - `apps/mercato/src/modules/hackon/data/entities.ts` — add `HackonProject` entity (fields: `id`, `competition_id`, `team_id`, `track_id` nullable, `title`, `tagline`, `description` text nullable, `tech_stack` JSONB nullable, `repo_url` nullable, `demo_url` nullable, `video_url` nullable, `status` enum `draft|published|under_review|scored`, `originality_statement` text nullable, `uses_existing_code` boolean default false, `existing_code_url` nullable, `final_score` numeric nullable, `peer_vote_count` int default 0, `rank` int nullable, `is_flagged` boolean default false, `flag_reason` text nullable, `organization_id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)
  - `apps/mercato/src/modules/hackon/data/validators.ts` — `projectCreateSchema`, `projectUpdateSchema`, `projectSubmitSchema` (status → `published`), `projectFlagSchema`
  - Run `yarn db:generate` → produces `apps/mercato/src/modules/hackon/migrations/Migration<timestamp>.ts`
- Delivers: `hackon_projects` table in DB; typed entity class; zod validators importable by API and commands
- Depends on: none (WF1+WF2 entities exist independently)

---

## Commit 2: Project events declaration

- Scope: app
- Pattern: events
- Files:
  - `apps/mercato/src/modules/hackon/events.ts` — extend existing hackon `eventsConfig` (or create if absent) with events:
    - `hackon.project.created`
    - `hackon.project.updated`
    - `hackon.project.submitted` (status → published)
    - `hackon.project.scored`
    - `hackon.project.flagged`
    - `hackon.project.deleted`
- Delivers: typed event IDs; `emitHackonEvent` callable from API commands; events visible in workflow trigger discovery
- Depends on: Commit 1

---

## Commit 3: Project ACL features + setup defaults

- Scope: app
- Pattern: acl + setup
- Files:
  - `apps/mercato/src/modules/hackon/acl.ts` — add features:
    - `hackon.projects.view`
    - `hackon.projects.manage` (own project — portal)
    - `hackon.projects.admin` (all projects — backend)
    - `hackon.projects.score`
    - `hackon.projects.flag`
  - `apps/mercato/src/modules/hackon/setup.ts` — add features to `defaultRoleFeatures`: admin gets `hackon.projects.*`; employee/participant gets `hackon.projects.view` and `hackon.projects.manage`
- Delivers: RBAC guards usable in API route metadata and page metadata
- Depends on: Commit 1

---

## Commit 4: Project CRUD API route + OpenAPI

- Scope: app
- Pattern: entity + CRUD
- Files:
  - `apps/mercato/src/modules/hackon/api/openapi.ts` — `buildHackonCrudOpenApi` factory via `createCrudOpenApiFactory`; shared response schemas (`projectListItemSchema`, `projectCreatedSchema`, `projectOkSchema`)
  - `apps/mercato/src/modules/hackon/api/projects/route.ts` — `makeCrudRoute` with:
    - `orm`: entity `HackonProject`, `orgField: 'organizationId'`, `tenantField: 'tenantId'`, `softDeleteField: 'deletedAt'`
    - `metadata`: GET/POST/PUT/DELETE guarded by `hackon.projects.*` features
    - `indexer: { entityType: E.hackon.project }`
    - `list.schema`: query by `competitionId`, `teamId`, `trackId`, `status`, `isFlagged`, `page`, `pageSize`, `sortField`, `sortDir`
    - `list.buildFilters`: filters for all query params above
    - `list.transformItem`: maps raw DB row to `ProjectListItem`
    - `actions.create`: commandId `hackon.projects.create`; maps `projectCreateSchema`
    - `actions.update`: commandId `hackon.projects.update`; maps `projectUpdateSchema`
    - `actions.delete`: commandId `hackon.projects.delete`
    - `export const openApi` using `buildHackonCrudOpenApi`
  - `apps/mercato/src/modules/hackon/api/projects/submit/route.ts` — POST only; validates body with `projectSubmitSchema`; sets status to `published`, emits `hackon.project.submitted`; guards `hackon.projects.manage`; `export const openApi`
- Delivers: `GET/POST/PUT/DELETE /api/hackon/projects` + `POST /api/hackon/projects/submit` fully functional with auth guards and OpenAPI docs
- Depends on: Commits 1, 2, 3

---

## Commit 5: Auto-create draft projects subscriber (stage → HACKING)

- Scope: app
- Pattern: subscriber
- Files:
  - `apps/mercato/src/modules/hackon/subscribers/stage-hacking-create-projects.ts`:
    - `export const metadata = { event: 'hackon.stage.advanced', persistent: true, id: 'hackon-stage-hacking-create-projects' }`
    - Handler: if `payload.stageName !== 'HACKING'` → return early
    - Resolve `em` from `ctx`; fetch all teams for the competition; for each team that does not yet have a project record for this competition, create a `HackonProject` with `status: 'draft'` and `title` seeded from team name
    - Batch `em.persistAndFlush`
    - Emit `hackon.project.created` for each created project
- Delivers: on stage transition to HACKING, every team automatically gets a draft project — editors open to an empty canvas
- Depends on: Commits 1, 2, 4

---

## Commit 6: Auto-publish remaining drafts subscriber (stage → DEMOS)

- Scope: app
- Pattern: subscriber
- Files:
  - `apps/mercato/src/modules/hackon/subscribers/stage-demos-publish-projects.ts`:
    - `export const metadata = { event: 'hackon.stage.advanced', persistent: true, id: 'hackon-stage-demos-publish-projects' }`
    - Handler: if `payload.stageName !== 'DEMOS'` → return early
    - Resolve `em`; find all `HackonProject` where `competitionId = payload.competitionId` and `status = 'draft'`
    - Set each to `status: 'published'`; `em.flush()`
    - Emit `hackon.project.submitted` for each
- Delivers: deadline enforcement — no draft survives the transition to demo day
- Depends on: Commits 1, 2, 4

---

## Commit 7: Portal — My Project page (editor + auto-save + submission)

- Scope: app
- Pattern: portal page
- Files:
  - `apps/mercato/src/modules/hackon/frontend/[orgSlug]/portal/project/page.tsx` — `"use client"` page:
    - Load current team's project via `GET /api/hackon/projects?teamId=<teamId>&competitionId=<competitionId>`
    - Render `PortalPageHeader` with title and deadline countdown (computes remaining time from active stage's `endsAt`)
    - Form fields: `title` (text), `tagline` (text), `description` (textarea/markdown), `techStack` (tag-input, stored as JSONB array), `repoUrl`, `demoUrl`, `videoUrl`, `originalityStatement` (textarea), `usesExistingCode` (checkbox), `existingCodeUrl` (conditional text)
    - Auto-save: `useEffect` debounce 1500 ms → `PUT /api/hackon/projects` with partial payload; show inline save indicator
    - Submit button: calls `POST /api/hackon/projects/submit`; confirms with `useConfirmDialog`; disables form on `status !== 'draft'`
    - Status banner: `PortalCard` variant showing current status with icon; read-only overlay when `status !== 'draft'`
    - `PortalEmptyState` when no project found (before HACKING stage or team not yet created)
  - `apps/mercato/src/modules/hackon/frontend/[orgSlug]/portal/project/page.meta.ts` — `requireAuth: true`
- Delivers: participants can author and submit their project entirely from the portal; auto-save prevents lost work
- Depends on: Commits 4, 5

---

## Commit 8: Portal — Project attachment upload

- Scope: app
- Pattern: portal page (attachment panel added to existing page)
- Files:
  - `apps/mercato/src/modules/hackon/frontend/[orgSlug]/portal/project/page.tsx` — add `AttachmentsPanel` component section below the main form:
    - Calls `GET /api/attachments?entityId=hackon:project&recordId=<projectId>`
    - Upload via `POST /api/attachments` multipart with `entityId=hackon:project`, `recordId=<projectId>`
    - Renders file list with name, size, delete button (`DELETE /api/attachments?id=<attachmentId>`)
    - Disabled when project `status !== 'draft'`
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add attachment section keys: `hackon.portal.project.attachments.*`
- Delivers: teams can upload supporting materials (pitch deck, screenshots, design files) directly in the portal
- Depends on: Commit 7

---

## Commit 9: Admin — Project management DataTable backend page

- Scope: app
- Pattern: backend page
- Files:
  - `apps/mercato/src/modules/hackon/components/ProjectsTable.tsx` — `"use client"` `DataTable` component:
    - Columns: `title`, `team name` (joined display), `track`, `status` (`EnumBadge`), `finalScore`, `peerVoteCount`, `rank`, `isFlagged` (`BooleanIcon`)
    - Filters: `status` enum select, `isFlagged` checkbox, `competitionId` select
    - Row actions via `RowActions`: Edit (`/backend/hackon/projects/<id>/edit`), Flag/Unflag (inline PUT), Delete (confirm dialog)
    - `perspective: { tableId: 'hackon.projects.list' }`
    - Pagination, sorting, `fetchCrudList('hackon/projects', ...)`
  - `apps/mercato/src/modules/hackon/backend/hackon/projects/page.tsx` — wraps `ProjectsTable` in `<Page><PageBody>`
  - `apps/mercato/src/modules/hackon/backend/hackon/projects/page.meta.ts` — `requireAuth: true`, `requireFeatures: ['hackon.projects.admin']`
- Delivers: admins can view all project submissions across teams, sorted/filtered by status, score, and flag state
- Depends on: Commits 3, 4

---

## Commit 10: Admin — Project detail / edit + flag/unflag backend page

- Scope: app
- Pattern: backend page (CrudForm)
- Files:
  - `apps/mercato/src/modules/hackon/backend/hackon/projects/[id]/edit/page.tsx` — `"use client"` `CrudForm`:
    - Loads project via `fetchCrudList('hackon/projects', { id })`
    - Groups: `details` (title, tagline, description), `links` (repoUrl, demoUrl, videoUrl), `scoring` (finalScore, rank), `originality` (originalityStatement, usesExistingCode, existingCodeUrl), `moderation` (isFlagged checkbox, flagReason text)
    - Submit → `updateCrud('hackon/projects', vals)`
    - Delete → `deleteCrud` + redirect with flash
    - Flag shortcut action button: sets `isFlagged: true` + prompts for `flagReason` via inline dialog; emits via PUT
  - `apps/mercato/src/modules/hackon/backend/hackon/projects/[id]/edit/page.meta.ts` — `requireFeatures: ['hackon.projects.admin']`
  - `apps/mercato/src/modules/hackon/api/projects/flag/route.ts` — POST; body `{ id, isFlagged, flagReason? }`; guards `hackon.projects.flag`; emits `hackon.project.flagged`; `export const openApi`
- Delivers: admins can score, rank, and flag submissions for code-reuse violations from a single form
- Depends on: Commits 4, 9

---

## Commit 11: i18n strings + module index registration

- Scope: app
- Pattern: i18n + module wiring
- Files:
  - `apps/mercato/src/modules/hackon/i18n/en.json` — all `hackon.projects.*` and `hackon.portal.project.*` keys (table column headers, form labels, flash messages, status labels, error messages, deadline countdown format)
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish equivalents
  - `apps/mercato/src/modules/hackon/index.ts` — ensure module `metadata` references updated `version`
  - `apps/mercato/src/modules.ts` — verify `hackon` module is registered (no-op if WF1 already added it)
  - Run `npm run modules:prepare` to regenerate `apps/mercato/.mercato/generated/`
- Delivers: fully localized UI; generated manifest includes all WF3 routes, subscribers, and API handlers; `yarn build` passes
- Depends on: Commits 1–10

---

## Dependency Graph

```
C1 (entity)
├── C2 (events)
│   ├── C4 (API) ──────── C5 (subscriber: HACKING)
│   │                ├──── C6 (subscriber: DEMOS)
│   │                ├──── C7 (portal editor)
│   │                │     └── C8 (attachments)
│   │                ├──── C9 (admin table)
│   │                │     └── C10 (admin detail + flag API)
│   └── (used by C5, C6, C10)
└── C3 (acl/setup)
    └── (used by C4, C9, C10)

C11 (i18n + wiring) ← all of the above
```

## Integration test coverage (implement alongside C11)

| Path | Method | Scenario |
|------|--------|----------|
| `/api/hackon/projects` | GET | list projects filtered by competitionId + status |
| `/api/hackon/projects` | POST | create draft project; assert DB row |
| `/api/hackon/projects` | PUT | update title; assert updated_at changes |
| `/api/hackon/projects/submit` | POST | status transitions draft → published; rejects if already published |
| `/api/hackon/projects/flag` | POST | sets isFlagged + flagReason; emits event |
| subscriber: stage HACKING | — | creating HACKING stage for competition with 3 teams → 3 draft projects created |
| subscriber: stage DEMOS | — | advancing to DEMOS with 1 draft + 1 published → draft becomes published |
