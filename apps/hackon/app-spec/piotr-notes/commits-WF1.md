# WF1: Competition Setup — Atomic Commit Plan

Module path root: `apps/mercato/src/modules/hackon/`
All backend pages auto-discovered from `backend/<path>/page.tsx`.
All API routes auto-discovered from `api/<method>/<path>.ts`.
Run `npm run modules:prepare` after each commit that adds new module files.

---

## Commit 1: Module scaffold — acl, events, index, i18n skeleton

- **Scope:** app
- **Pattern:** module scaffold
- **Files:**
  - `apps/mercato/src/modules/hackon/index.ts`
  - `apps/mercato/src/modules/hackon/acl.ts`
  - `apps/mercato/src/modules/hackon/events.ts`
  - `apps/mercato/src/modules/hackon/i18n/en.json`
- **Delivers:**
  Module is registered. `acl.ts` declares the full feature set:
  `hackon.competitions.view`, `hackon.competitions.manage`,
  `hackon.tracks.manage`, `hackon.criteria.manage`,
  `hackon.sponsors.manage`, `hackon.participants.manage`,
  `hackon.participants.import`.
  `events.ts` declares all CRUD + lifecycle events with `createModuleEvents()` as const:
  `hackon.competition.created/updated/deleted`,
  `hackon.track.created/updated/deleted`,
  `hackon.criterion.created/updated/deleted`,
  `hackon.sponsor.created/updated/deleted`,
  `hackon.participant.imported`,
  `hackon.competition.stage.advanced`.
  i18n skeleton with key stubs. Nothing breaks.
- **Depends on:** none

---

## Commit 2: setup.ts — roles, defaultRoleFeatures, seedDefaults, seedExamples

- **Scope:** app
- **Pattern:** setup.ts seed
- **Files:**
  - `apps/mercato/src/modules/hackon/setup.ts`
  - `apps/mercato/src/modules/hackon/lib/seeds.ts`
- **Delivers:**
  On tenant init, three portal customer roles are seeded into the `customer_roles` table:
  `hackon-participant`, `hackon-mentor`, `hackon-judge`.
  `defaultRoleFeatures` maps:
  - `admin` → `hackon.*`
  - `employee` → `hackon.competitions.view`, `hackon.tracks.manage`, `hackon.participants.manage`

  `seedDefaults` calls `seeds.ts` which inserts the three customer roles (idempotent via
  upsert on `(tenant_id, name)`). No demo data yet — `seedExamples` is a no-op stub.
- **Depends on:** Commit 1

---

## Commit 3: Competition entity + migration

- **Scope:** app
- **Pattern:** entity + migration
- **Files:**
  - `apps/mercato/src/modules/hackon/data/entities.ts` (Competition entity only)
  - `apps/mercato/src/modules/hackon/data/validators.ts` (competitionCreateSchema, competitionUpdateSchema)
- **Delivers:**
  MikroORM entity `HackonCompetition` → table `hackon_competitions`.
  Columns: `id` (uuid PK), `organization_id`, `tenant_id`, `name` (text),
  `description` (text nullable), `stage` (text, enum: draft/open/judging/closed, default draft),
  `stage_config` (jsonb nullable — holds allowed stage transitions),
  `starts_at` (timestamptz nullable), `ends_at` (timestamptz nullable),
  `submission_deadline` (timestamptz nullable), `is_active` (bool default true),
  `created_at`, `updated_at`, `deleted_at`.
  Composite index on `(tenant_id, organization_id)`.
  Zod validators in `data/validators.ts` derived with `z.infer`.
  Run `yarn db:generate` to emit migration.
- **Depends on:** Commit 1

---

## Commit 4: Competition CRUD API route

- **Scope:** app
- **Pattern:** entity + CRUD (makeCrudRoute)
- **Files:**
  - `apps/mercato/src/modules/hackon/api/openapi.ts`
  - `apps/mercato/src/modules/hackon/api/get/competitions/route.ts`
  - `apps/mercato/src/modules/hackon/api/post/competitions/route.ts`
  - `apps/mercato/src/modules/hackon/api/put/competitions/route.ts`
  - `apps/mercato/src/modules/hackon/api/delete/competitions/route.ts`

  > Note: per OM convention, one route file per HTTP method under `api/<method>/<path>.ts`.
  > Alternatively, if the generator supports a combined export file, use
  > `api/competitions/route.ts` exporting `{ GET, POST, PUT, DELETE, openApi, metadata }`.
  > Follow whichever pattern matches `_example/api/todos/route.ts` (single combined file).

  - `apps/mercato/src/modules/hackon/api/competitions/route.ts` (single file, combined)
  - `apps/mercato/src/modules/hackon/api/openapi.ts`
- **Delivers:**
  `GET /api/hackon/competitions` — paginated list, filters: `search`, `stage`, `isActive`.
  `POST /api/hackon/competitions` — create, guarded by `hackon.competitions.manage`.
  `PUT /api/hackon/competitions` — update by id.
  `DELETE /api/hackon/competitions` — soft delete.
  `makeCrudRoute` with `indexer: { entityType: 'hackon:competition' }`.
  `openApi` export with full schema docs. Commands wired via `commandId` strings.
- **Depends on:** Commit 3

---

## Commit 5: Competition commands (undoable create/update/delete)

- **Scope:** app
- **Pattern:** undoable commands
- **Files:**
  - `apps/mercato/src/modules/hackon/commands/competitions.ts`
  - `apps/mercato/src/modules/hackon/commands/index.ts`
- **Delivers:**
  `hackon.competitions.create`, `hackon.competitions.update`, `hackon.competitions.delete`
  registered as undoable commands with `emitCrudSideEffects` / `emitCrudUndoSideEffects`
  and `indexer: { entityType: 'hackon:competition' }`.
  Emit `hackon.competition.created/updated/deleted` events via `emitHackonEvent`.
  Pattern mirrors `_example/commands/todos.ts`.
- **Depends on:** Commit 4

---

## Commit 6: Admin backend — Competitions list page

- **Scope:** app
- **Pattern:** backend page
- **Files:**
  - `apps/mercato/src/modules/hackon/backend/hackon/page.tsx` (auto-discovers as `/backend/hackon`)
  - `apps/mercato/src/modules/hackon/backend/hackon/page.meta.ts`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/page.meta.ts`
- **Delivers:**
  `/backend/hackon` → module landing redirect to `/backend/hackon/competitions`.
  `/backend/hackon/competitions` → `DataTable` listing competitions with columns: name, stage
  badge, dates, actions (edit, delete). Sidebar nav entry "HackOn" group, item "Competitions",
  guarded by `hackon.competitions.view`. `page.meta.ts` sets `pageGroup`, `pageGroupKey`,
  `requireFeatures`.
- **Depends on:** Commit 4

---

## Commit 7: Admin backend — Competition create + edit pages

- **Scope:** app
- **Pattern:** backend page (CRUD form)
- **Files:**
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/create/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/create/page.meta.ts`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/page.meta.ts`
- **Delivers:**
  `/backend/hackon/competitions/create` — `CrudForm` with fields: name, description, starts_at,
  ends_at, submission_deadline, stage (select, default draft). Uses `createCrud`.
  `/backend/hackon/competitions/[id]` — detail/edit page using `updateCrud`. Displays current
  stage, all editable fields. `Cmd+Enter` submits, `Escape` cancels.
  Both guarded by `hackon.competitions.manage`.
- **Depends on:** Commit 6

---

## Commit 8: Track entity + CRUD API

- **Scope:** app
- **Pattern:** entity + CRUD (makeCrudRoute)
- **Files:**
  - `apps/mercato/src/modules/hackon/data/entities.ts` (add HackonTrack)
  - `apps/mercato/src/modules/hackon/data/validators.ts` (add trackCreateSchema, trackUpdateSchema)
  - `apps/mercato/src/modules/hackon/api/tracks/route.ts`
  - `apps/mercato/src/modules/hackon/commands/tracks.ts`
- **Delivers:**
  `HackonTrack` entity → table `hackon_tracks`.
  Columns: `id`, `organization_id`, `tenant_id`, `competition_id` (uuid FK),
  `name` (text), `description` (text nullable), `category` (text nullable),
  `is_active` (bool), `created_at`, `updated_at`, `deleted_at`.
  Index on `(competition_id, tenant_id, organization_id)`.
  `GET/POST/PUT/DELETE /api/hackon/tracks` — filter by `competitionId`.
  Undoable commands with `indexer: { entityType: 'hackon:track' }`.
  Emit `hackon.track.created/updated/deleted`.
- **Depends on:** Commit 5

---

## Commit 9: Admin backend — Tracks management pages

- **Scope:** app
- **Pattern:** backend page
- **Files:**
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/tracks/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/tracks/page.meta.ts`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/tracks/create/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/tracks/[trackId]/page.tsx`
- **Delivers:**
  `/backend/hackon/competitions/[id]/tracks` — `DataTable` of tracks scoped to the competition.
  Columns: name, category, active toggle, actions.
  Create and edit forms with `CrudForm` (name, description, category fields).
  Guarded by `hackon.tracks.manage`.
- **Depends on:** Commit 8, Commit 7

---

## Commit 10: JudgingCriterion entity + CRUD API

- **Scope:** app
- **Pattern:** entity + CRUD (makeCrudRoute)
- **Files:**
  - `apps/mercato/src/modules/hackon/data/entities.ts` (add HackonJudgingCriterion)
  - `apps/mercato/src/modules/hackon/data/validators.ts` (add criterionCreateSchema, criterionUpdateSchema)
  - `apps/mercato/src/modules/hackon/api/criteria/route.ts`
  - `apps/mercato/src/modules/hackon/commands/criteria.ts`
- **Delivers:**
  `HackonJudgingCriterion` → table `hackon_judging_criteria`.
  Columns: `id`, `organization_id`, `tenant_id`, `competition_id` (uuid),
  `name` (text), `description` (text nullable), `weight` (numeric 5,2, default 1.00),
  `max_score` (integer default 10), `sort_order` (integer default 0),
  `created_at`, `updated_at`, `deleted_at`.
  `GET/POST/PUT/DELETE /api/hackon/criteria` — filter by `competitionId`.
  Weight validation: all criteria per competition must sum to 100 (enforced in command, not DB).
  Undoable commands, emit `hackon.criterion.created/updated/deleted`.
- **Depends on:** Commit 5

---

## Commit 11: Admin backend — Judging Criteria pages

- **Scope:** app
- **Pattern:** backend page
- **Files:**
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/criteria/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/criteria/page.meta.ts`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/criteria/create/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/criteria/[criterionId]/page.tsx`
- **Delivers:**
  `/backend/hackon/competitions/[id]/criteria` — `DataTable` with columns: name, weight, max
  score, sort order. Inline weight-sum indicator in page header (sum must equal 100).
  Create/edit forms with `CrudForm`. Guarded by `hackon.criteria.manage`.
- **Depends on:** Commit 10, Commit 7

---

## Commit 12: Sponsor + Prize entities + CRUD API

- **Scope:** app
- **Pattern:** entity + CRUD (makeCrudRoute)
- **Files:**
  - `apps/mercato/src/modules/hackon/data/entities.ts` (add HackonSponsor, HackonPrize)
  - `apps/mercato/src/modules/hackon/data/validators.ts` (sponsorCreateSchema, prizeCreateSchema + updates)
  - `apps/mercato/src/modules/hackon/api/sponsors/route.ts`
  - `apps/mercato/src/modules/hackon/api/prizes/route.ts`
  - `apps/mercato/src/modules/hackon/commands/sponsors.ts`
- **Delivers:**
  `HackonSponsor` → table `hackon_sponsors`.
  Columns: `id`, `organization_id`, `tenant_id`, `competition_id`, `name`, `tier`
  (text: gold/silver/bronze/partner), `logo_url` (text nullable), `website_url` (text nullable),
  `created_at`, `updated_at`, `deleted_at`.

  `HackonPrize` → table `hackon_prizes`.
  Columns: `id`, `organization_id`, `tenant_id`, `competition_id`, `track_id` (uuid nullable,
  FK to hackon_tracks), `title`, `description` (text nullable), `value_amount` (numeric 18,4
  nullable), `value_currency` (text nullable), `sort_order` (int default 0),
  `created_at`, `updated_at`, `deleted_at`.

  `GET/POST/PUT/DELETE /api/hackon/sponsors` and `/api/hackon/prizes`.
  Emit `hackon.sponsor.created/updated/deleted`. Undoable commands.
- **Depends on:** Commit 5, Commit 8

---

## Commit 13: Admin backend — Sponsors + Prizes pages

- **Scope:** app
- **Pattern:** backend page
- **Files:**
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/sponsors/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/sponsors/page.meta.ts`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/sponsors/create/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/sponsors/[sponsorId]/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/prizes/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/prizes/page.meta.ts`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/prizes/create/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/prizes/[prizeId]/page.tsx`
- **Delivers:**
  Sponsors list: name, tier badge, logo preview, actions.
  Prizes list: title, track assignment, value, sort order.
  Create/edit forms for both. Guarded by `hackon.sponsors.manage`.
- **Depends on:** Commit 12, Commit 7

---

## Commit 14: Participant import — CSV bulk API + worker

- **Scope:** app
- **Pattern:** worker + subscriber
- **Files:**
  - `apps/mercato/src/modules/hackon/api/participants/import/route.ts`
  - `apps/mercato/src/modules/hackon/workers/participant-import.ts`
  - `apps/mercato/src/modules/hackon/data/validators.ts` (participantImportRowSchema)
- **Delivers:**
  `POST /api/hackon/participants/import` — accepts `multipart/form-data` with `competitionId`,
  `trackId` (optional), and `file` (CSV). Validates headers (required: `email`, `name`;
  optional: `phone`, `company`). Enqueues a background job per batch of 50 rows.
  Returns `{ jobId, rowCount }`.

  Worker `participant-import.ts` (queue: `hackon.participant.import`, concurrency: 3):
  For each row — looks up or creates a `CustomerUser` (reuses `customer_accounts` invitation
  flow via service call, not direct ORM). Assigns the `hackon-participant` customer role.
  Stores `competition_id` and `track_id` on the customer user's metadata field.
  Emits `hackon.participant.imported` per created user.
  Idempotent: skip rows where a CustomerUser with matching email already has the
  `hackon-participant` role for this competition.

  Guarded by `hackon.participants.import`.
- **Depends on:** Commit 2, Commit 4

---

## Commit 15: Admin backend — Participant import page

- **Scope:** app
- **Pattern:** backend page
- **Files:**
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/participants/import/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/participants/import/page.meta.ts`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/participants/page.tsx`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/participants/page.meta.ts`
- **Delivers:**
  `/backend/hackon/competitions/[id]/participants` — list of imported participants (reads
  CustomerUsers with `hackon-participant` role scoped to competition via metadata filter).
  Columns: name, email, track, import date, portal access status (invited/active).

  `/backend/hackon/competitions/[id]/participants/import` — CSV upload form.
  Drag-and-drop file input, required `competitionId` pre-filled, optional track selector.
  Submit posts to `/api/hackon/participants/import`, shows progress/job status.
  Guarded by `hackon.participants.import`.
- **Depends on:** Commit 14, Commit 7

---

## Commit 16: Stage advancement API + side-effect preview

- **Scope:** app
- **Pattern:** entity + CRUD (custom action) + subscriber
- **Files:**
  - `apps/mercato/src/modules/hackon/api/competitions/advance-stage/route.ts`
  - `apps/mercato/src/modules/hackon/api/competitions/advance-stage/preview/route.ts`
  - `apps/mercato/src/modules/hackon/subscribers/competition-stage-advanced.ts`
- **Delivers:**
  `GET /api/hackon/competitions/advance-stage/preview?competitionId=<id>&targetStage=<stage>` —
  returns a dry-run object: `{ from, to, checks: [{ label, pass, detail }] }`.
  Checks: competition has at least one track, at least one criterion with weights summing to 100,
  at least one sponsor, `starts_at` is set (for DRAFT→OPEN), `ends_at` is set (for OPEN→JUDGING).
  No state mutation.

  `POST /api/hackon/competitions/advance-stage` — body: `{ competitionId, targetStage }`.
  Validates allowed transition (DRAFT→OPEN→JUDGING→CLOSED only).
  Re-runs preview checks server-side; returns 422 with check details if any fail.
  On success: updates `competition.stage`, flushes, emits `hackon.competition.stage.advanced`.
  Guarded by `hackon.competitions.manage`.

  Persistent subscriber `competition-stage-advanced.ts`:
  On `DRAFT→OPEN` — sends portal invitation emails to all imported participants who have not
  yet received one (calls existing `customer_accounts` invitation service).
  Metadata: `{ event: 'hackon.competition.stage.advanced', persistent: true, id: 'hackon-stage-invite' }`.
- **Depends on:** Commit 5, Commit 14

---

## Commit 17: Admin backend — Stage advancement UI on competition detail

- **Scope:** app
- **Pattern:** backend page (widget injection or inline section)
- **Files:**
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/page.tsx` (extend existing detail)
  - `apps/mercato/src/modules/hackon/components/StageAdvancePanel.tsx`
- **Delivers:**
  Competition detail page gains a "Stage" card below the edit form.
  Shows current stage chip, "Advance to [next stage]" button.
  On button hover/focus: calls the preview API and renders a checklist (green tick / red cross
  per check) in a popover before the user confirms.
  On confirm: `POST advance-stage`, invalidates page data, shows flash message.
  Uses `apiCall` from `@open-mercato/ui/backend/utils/apiCall`. No raw fetch.
- **Depends on:** Commit 16, Commit 7

---

## Commit 18: seedExamples — demo competition with tracks, criteria, sponsors

- **Scope:** app
- **Pattern:** setup.ts seed (seedExamples)
- **Files:**
  - `apps/mercato/src/modules/hackon/lib/seeds.ts` (fill in seedExamples logic)
  - `apps/mercato/src/modules/hackon/setup.ts` (wire seedExamples)
- **Delivers:**
  On `seedExamples`: creates one demo competition "HackOn 2026" in DRAFT stage with
  two tracks ("Web", "Mobile"), three judging criteria (Innovation 40%, Execution 40%,
  Presentation 20%), and two sponsors (Gold, Silver tier). All idempotent via name check.
  Gives admins an immediately usable demo state.
- **Depends on:** Commit 12, Commit 10, Commit 8

---

## Dependency Graph Summary

```
1 (scaffold)
└── 2 (setup + roles)
    └── 14 (import API + worker)
        └── 15 (import page)
        └── 16 (stage API + subscriber)
            └── 17 (stage UI)
└── 3 (Competition entity)
    └── 4 (Competition CRUD API)
        └── 5 (Competition commands)
            └── 8 (Track entity + API)
                └── 9 (Tracks pages)
                └── 12 (Sponsor + Prize entities)
                    └── 13 (Sponsors + Prizes pages)
                    └── 18 (seedExamples)
            └── 10 (Criterion entity + API)
                └── 11 (Criteria pages)
                    └── 18
        └── 6 (Competitions list page)
            └── 7 (Competition create/edit pages)
                └── 9, 11, 13, 15, 17
```

---

## Platform Features Used — Score 0 (no commit needed)

| Feature | Platform module |
|---|---|
| Customer role seeding (hackon-participant/mentor/judge) | `customer_accounts` CustomerRole entities — seeded in Commit 2 via existing service |
| Portal invitation email dispatch | `customer_accounts` invitation service (called from Commit 16 subscriber) |
| Magic link + portal shell | `customer_accounts` portal shell, already exists |
| Bulk CustomerUser creation | `customer_accounts` bulk ops, called from Commit 14 worker |
| Background job queue | `@open-mercato/queue` — worker in Commit 14 uses existing worker contract |
| Event bus + persistent subscriber retry | `@open-mercato/events` — used in Commits 5, 16 |
| RBAC feature checks | `auth` module `requireFeatures` metadata guard — declarative on all routes/pages |
| Sidebar nav auto-discovery | `auth/api/admin/nav.ts` discovers `pageGroup`/`pageGroupKey` from page.meta.ts |
| Query index | `query_index` module — triggered by `indexer: { entityType }` in makeCrudRoute |
| Undoable commands infrastructure | `@open-mercato/shared/lib/commands` — used in all command files |
