# WF4: Demos & Live Judging — Atomic Commit Plan

Module path: `apps/mercato/src/modules/hackon/`
All files below are relative to that root unless noted otherwise.

---

## Commit 1: DemoSession entity + CRUD API
- Scope: app
- Pattern: entity + CRUD
- Files:
  - `data/entities.ts` — add `DemoSession` entity (fields: `id`, `competition_id`, `project_id`, `presentation_order`, `status` enum `queued|on_deck|presenting|qa|completed|skipped`, `started_at`, `ended_at`, `duration_seconds`, `notes`, `organization_id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)
  - `data/validators.ts` — add `createDemoSessionSchema`, `updateDemoSessionSchema`, `deleteDemoSessionSchema`
  - `api/demo-sessions/route.ts` — `makeCrudRoute` with `indexer: { entityType: E.hackon.demo_session }`, GET/POST/PUT/DELETE, `openApi` export
  - `api/openapi.ts` — extend with `buildHackonCrudOpenApi` factory (or create if not yet present from WF1-3)
  - `commands/demo-sessions.ts` — `demoSessionCrudEvents`, `demoSessionCrudIndexer`, create/update/delete commands with undo
  - `migrations/Migration_DemoSession.ts` — generated via `yarn db:generate`
- Delivers: Persisted DemoSession records, full CRUD API at `/api/hackon/demo-sessions`
- Depends on: WF1 (competition + project entities exist)

---

## Commit 2: Demo queue generation endpoint
- Scope: app
- Pattern: custom endpoint
- Files:
  - `api/demo-sessions/generate-queue/route.ts` — POST endpoint; reads published projects for a competition, ordered by track then submission time; upserts `DemoSession` rows with `status=queued` and monotonic `presentation_order`; idempotent (skips already-present sessions); exports `openApi`
  - `data/validators.ts` — add `generateQueueSchema` (`{ competitionId: z.string().uuid() }`)
- Delivers: Admin can POST to generate an ordered demo queue from published projects; re-running is safe
- Depends on: Commit 1

---

## Commit 3: Demo timer state — entity + control endpoints
- Scope: app
- Pattern: entity + custom endpoints
- Files:
  - `data/entities.ts` — add `DemoTimerState` entity (fields: `id`, `competition_id`, `current_session_id` nullable FK string, `status` enum `idle|running|paused`, `started_at`, `paused_at`, `elapsed_seconds`, `organization_id`, `tenant_id`, `updated_at`); one row per competition, upserted
  - `data/validators.ts` — add `timerActionSchema` (`{ competitionId, action: z.enum(['start','pause','resume','skip','advance']) }`)
  - `api/demo-timer/route.ts` — POST; resolves current `DemoTimerState` + `DemoSession`; applies action (start sets `current_session_id` to first queued, marks it `presenting`; pause/resume toggle state; skip marks session `skipped` and advances; advance marks session `completed` and promotes next `on_deck` to `presenting`); emits `hackon.demo.timer.updated` event; exports `openApi`
  - `api/demo-timer/state/route.ts` — GET; returns current `DemoTimerState` + current `DemoSession` + next on-deck session; exports `openApi`
  - `events.ts` — add `hackon.demo.timer.updated` event (`{ competitionId, status, currentSessionId, elapsedSeconds, updatedAt }`)
  - `migrations/Migration_DemoTimerState.ts` — generated
- Delivers: Stateful timer with start/pause/resume/skip/advance; state readable via GET; event emitted on every mutation
- Depends on: Commit 1

---

## Commit 4: SSE broadcast subscriber — push timer state to all clients
- Scope: app
- Pattern: subscriber + custom SSE endpoint
- Files:
  - `subscribers/demo-timer-sse.ts` — ephemeral subscriber on `hackon.demo.timer.updated`; resolves `sseManager` from DI and broadcasts `{ type: 'demo.timer.updated', payload }` to all connected clients scoped to the competition
  - `api/demo-sessions/stream/route.ts` — GET SSE endpoint; sets `Content-Type: text/event-stream`; registers client in an in-process `SseConnectionManager` keyed by `competitionId`; sends `ping` every 15 s; on client disconnect cleans up; exports `openApi` with `{ streaming: true }`
  - `lib/sseManager.ts` — `SseConnectionManager` class: `add(competitionId, writer)`, `broadcast(competitionId, data)`, `remove(competitionId, writer)`; singleton registered in DI
  - `di.ts` — register `sseManager: asSingletonValue(new SseConnectionManager())`
- Delivers: Any browser holding an SSE connection at `/api/hackon/demo-sessions/stream?competitionId=X` receives live timer updates within milliseconds of an admin action; exponential-backoff reconnect is handled by the browser `EventSource` API natively
- Depends on: Commit 3

---

## Commit 5: Backend — Demo Control page (queue + timer controls)
- Scope: app
- Pattern: backend page
- Files:
  - `backend/hackon/demo-control/page.meta.ts` — `requireAuth: true`, `requireFeatures: ['hackon.demos.manage']`, `pageTitle: 'Demo Control'`, breadcrumb
  - `backend/hackon/demo-control/page.tsx` — `"use client"` component; two-panel layout: left = sortable queue list (drag-to-reorder with optimistic PUT to `presentation_order`), right = timer panel; timer panel shows elapsed countdown, current/on-deck session cards, and action buttons (Start / Pause / Resume / Skip / Advance); keyboard shortcuts: `Space` = pause/resume, `ArrowRight` = advance, `S` = skip; polls GET `/api/hackon/demo-timer/state` every 2 s as fallback; primary updates come from SSE stream; uses `apiCallOrThrow` for all mutations
  - `i18n/en.json` — keys for Demo Control page labels, button labels, status labels
- Delivers: Fully functional admin control room: reorder queue, drive timer, observe live state; keyboard-driven for presentation flow
- Depends on: Commits 2, 4

---

## Commit 6: Portal — Presentation Queue page (live board with SSE)
- Scope: app
- Pattern: portal page + SSE consumer
- Files:
  - `frontend/hackon/demo-queue/page.tsx` — public-facing live queue board; connects to SSE stream via `useEffect` + `EventSource`; on `demo.timer.updated` event updates local state without reload; renders: header with competition name and status badge, "Now Presenting" card (project name, team name, track, elapsed timer ticking client-side), "On Deck" card, scrollable queue list with position numbers and status icons; all styled with Tailwind; no auth required (public portal page)
  - `frontend/hackon/demo-queue/page.meta.ts` — `requireAuth: false`, `pageTitle: 'Demo Queue'`
  - `frontend/hackon/demo-queue/hooks/useDemoQueue.ts` — encapsulates SSE connection + exponential-backoff reconnect logic + fallback polling at 5 s; returns `{ timerState, currentSession, onDeckSession, queue, connected }`
  - `i18n/en.json` — portal-facing string keys
- Delivers: Attendees on any device see a self-updating board with who is presenting, who is next, and the full ordered list; reconnects automatically after network hiccups
- Depends on: Commit 4

---

## Commit 7: Portal — Kiosk View (projector full-screen)
- Scope: app
- Pattern: portal page + SSE consumer
- Files:
  - `frontend/hackon/kiosk/page.tsx` — `"use client"`; full-viewport dark (`bg-black text-white`) layout intended for a projected display; large team name + project title in the upper half; massive countdown/elapsed timer (`text-9xl font-mono`) in the center; status badge (PRESENTING / QA / ON DECK) in bottom left; next-up panel in bottom right; auto-advances display on `demo.timer.updated` SSE event without any user interaction; no nav chrome; font size responsive to viewport
  - `frontend/hackon/kiosk/page.meta.ts` — `requireAuth: false`, `pageTitle: 'Kiosk'`
  - `frontend/hackon/kiosk/hooks/useKiosk.ts` — thin wrapper around `useDemoQueue` from Commit 6, adds client-side tick interval for the running timer
  - `i18n/en.json` — kiosk string keys
- Delivers: Plug a laptop into a projector, navigate to `/hackon/kiosk?competitionId=X`, walk away; screen auto-updates in real time
- Depends on: Commit 6

---

## Commit 8: JudgePanel + JudgePanelJudge + JudgePanelTrack entities + CRUD API
- Scope: app
- Pattern: entity + CRUD
- Files:
  - `data/entities.ts` — add three entities:
    - `JudgePanel` (`id`, `competition_id`, `name`, `round`, `organization_id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)
    - `JudgePanelJudge` (`id`, `panel_id`, `user_id`, `organization_id`, `tenant_id`, `created_at`)
    - `JudgePanelTrack` (`id`, `panel_id`, `track_id`, `organization_id`, `tenant_id`, `created_at`)
  - `data/validators.ts` — schemas for create/update/delete of each entity
  - `api/judge-panels/route.ts` — `makeCrudRoute` for `JudgePanel`; includes inline `judges` and `tracks` in GET response via secondary queries; exports `openApi`
  - `api/judge-panels/[id]/judges/route.ts` — POST to add judge, DELETE to remove; exports `openApi`
  - `api/judge-panels/[id]/tracks/route.ts` — POST to assign track, DELETE to unassign; exports `openApi`
  - `commands/judge-panels.ts` — create/update/delete commands with undo
  - `migrations/Migration_JudgePanels.ts` — generated
- Delivers: Admins can CRUD judge panels and assign judges (by user ID) and tracks to each panel
- Depends on: WF1 (competitions, tracks exist)

---

## Commit 9: JudgingCriterion entity + CRUD API
- Scope: app
- Pattern: entity + CRUD
- Files:
  - `data/entities.ts` — add `JudgingCriterion` (`id`, `competition_id`, `panel_id` nullable, `name`, `description` nullable, `max_score`, `weight` decimal, `round`, `sort_order`, `organization_id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)
  - `data/validators.ts` — `createCriterionSchema`, `updateCriterionSchema`, `deleteCriterionSchema`
  - `api/judging-criteria/route.ts` — `makeCrudRoute` with `indexer`; filterable by `competitionId`, `panelId`, `round`; exports `openApi`
  - `commands/judging-criteria.ts` — create/update/delete with undo
  - `migrations/Migration_JudgingCriterion.ts` — generated
- Delivers: Admins define weighted scoring criteria per competition/panel/round
- Depends on: Commit 8

---

## Commit 10: ProjectScore + CriterionScore entities + scoring API
- Scope: app
- Pattern: entity + custom endpoints
- Files:
  - `data/entities.ts` — add two entities:
    - `ProjectScore` (`id`, `project_id`, `panel_id`, `judge_user_id`, `round`, `weighted_total` decimal nullable, `is_submitted`, `conflict_of_interest` boolean, `private_notes` text nullable, `organization_id`, `tenant_id`, `created_at`, `updated_at`)
    - `CriterionScore` (`id`, `project_score_id`, `criterion_id`, `score` integer nullable, `feedback` text nullable, `organization_id`, `tenant_id`, `updated_at`)
  - `data/validators.ts` — `upsertProjectScoreSchema`, `upsertCriterionScoreSchema`, `submitScoreSchema`
  - `api/project-scores/route.ts` — GET lists `ProjectScore` rows for the authenticated judge (filtered to their `panelId` assignments); POST upserts a `ProjectScore` shell (creates if not exists); exports `openApi`
  - `api/project-scores/[id]/criteria/route.ts` — GET returns `CriterionScore` rows for a `ProjectScore`; PUT upserts one `CriterionScore` by `criterionId` (auto-save friendly, idempotent); exports `openApi`
  - `api/project-scores/[id]/submit/route.ts` — POST; validates all criteria have scores; computes `weighted_total = SUM(criterion.score * criterion.weight) / SUM(criterion.weight)`; sets `is_submitted=true`; emits `hackon.score.submitted` event; exports `openApi`
  - `events.ts` — add `hackon.score.submitted` event
  - `commands/project-scores.ts` — create/update commands (no hard delete — scores are immutable once submitted)
  - `migrations/Migration_Scores.ts` — generated
- Delivers: One score sheet per judge per project per round; auto-save per criterion; final weighted total computed on submit
- Depends on: Commits 8, 9

---

## Commit 11: Portal — Judging Dashboard (assigned projects, scored/unscored indicator)
- Scope: app
- Pattern: portal page
- Files:
  - `frontend/hackon/judging/page.tsx` — `"use client"`; auth-gated (`requireAuth: true`); fetches judge's assigned panels via `GET /api/hackon/judge-panels?judgeUserId=me`; for each panel fetches the associated projects via track assignments; renders a grid of project cards; each card shows: project name, team name, track badge, scored/unscored pill (green check if `is_submitted`, amber dot if in-progress, grey circle if untouched); tapping a card navigates to the score card page; includes a round selector if multiple rounds exist
  - `frontend/hackon/judging/page.meta.ts` — `requireAuth: true`, `pageTitle: 'Judging Dashboard'`
  - `i18n/en.json` — judging dashboard string keys
- Delivers: Judge lands on their dashboard and sees at a glance which projects need scoring; scored status is accurate without page reload (refetch on focus via React Query)
- Depends on: Commit 10

---

## Commit 12: Portal — Score Card (per-criterion scoring UI with auto-save)
- Scope: app
- Pattern: portal page
- Files:
  - `frontend/hackon/judging/[projectScoreId]/page.tsx` — `"use client"`; loads `ProjectScore` + `CriterionScore` rows + `JudgingCriterion` definitions; renders:
    - Project header (name, team, track)
    - Conflict-of-interest toggle (if true, disables scoring and shows recusal message)
    - Per-criterion rows: criterion name, `maxScore` label, tappable integer picker (0 … maxScore rendered as a row of buttons; selected score highlighted); feedback textarea below each criterion; auto-saves `CriterionScore` on blur/change via debounced PUT (500 ms); optimistic update
    - Private notes textarea (saved to `ProjectScore.private_notes`)
    - Progress bar: X of N criteria scored
    - Submit button (enabled when all criteria scored and no conflict); `Cmd/Ctrl+Enter` triggers submit; `Escape` navigates back to dashboard; submit calls `/api/hackon/project-scores/[id]/submit`
  - `frontend/hackon/judging/[projectScoreId]/page.meta.ts` — `requireAuth: true`, `pageTitle: 'Score Card'`
  - `frontend/hackon/judging/[projectScoreId]/hooks/useScoreCard.ts` — manages local state, debounced auto-save, optimistic updates, submit state
  - `i18n/en.json` — score card string keys
- Delivers: Complete mobile-friendly judging UX; tapping numbers feels instant; scores persist automatically; submit is guarded and keyboard-accessible
- Depends on: Commit 10

---

## Commit 13: Final score calculation worker + subscriber
- Scope: app
- Pattern: subscriber + worker
- Files:
  - `subscribers/compute-final-scores.ts` — persistent subscriber on `hackon.competition.stage.changed` (from WF1 stage machine); when `newStage === 'FINISHED'` enqueues a `compute-final-scores` job via `@open-mercato/queue`; exports `metadata: { event: 'hackon.competition.stage.changed', persistent: true, id: 'hackon-compute-final-scores' }`
  - `workers/compute-final-scores.worker.ts` — exports `metadata: { queue: 'hackon.compute-final-scores', id: 'hackon-compute-final-scores', concurrency: 2 }`; handler: for each submitted `ProjectScore` in the competition, re-computes `weighted_total` from its `CriterionScore` rows and persists; then computes per-project aggregate across panels (average of panel totals) and stores in a `ProjectFinalScore` summary record; idempotent (upsert on `project_id + round`)
  - `data/entities.ts` — add `ProjectFinalScore` (`id`, `project_id`, `competition_id`, `round`, `panel_aggregate`, `overall_score` decimal, `rank` integer nullable, `computed_at`, `organization_id`, `tenant_id`)
  - `migrations/Migration_ProjectFinalScore.ts` — generated
  - `api/project-final-scores/route.ts` — GET; lists final scores for a competition ordered by `overall_score desc`; exports `openApi` (read-only, no mutations)
- Delivers: When a competition transitions to FINISHED, all submitted scores are aggregated; final ranked leaderboard is available via API
- Depends on: Commit 10, WF1 stage machine event

---

## Commit 14: Backend — Judging management pages (panels, criteria, progress, nudge)
- Scope: app
- Pattern: backend page (multiple)
- Files:
  - `backend/hackon/judging/page.meta.ts` + `page.tsx` — index page; two tabs: "Panels" and "Criteria"; links to sub-pages
  - `backend/hackon/judging/panels/page.meta.ts` + `page.tsx` — `DataTable` of `JudgePanel` rows; columns: name, round, judge count, track count; row actions: edit, delete; "Create Panel" button; judge/track counts fetched as aggregates in the API
  - `backend/hackon/judging/panels/create/page.meta.ts` + `page.tsx` — `CrudForm`; fields: competition (select), name (text), round (number); after create redirects to edit to assign judges/tracks
  - `backend/hackon/judging/panels/[id]/edit/page.meta.ts` + `page.tsx` — `CrudForm` for panel fields plus two sub-sections: judge assignment (user search + add/remove) and track assignment (track multi-select); all changes via dedicated API endpoints from Commit 8
  - `backend/hackon/judging/criteria/page.meta.ts` + `page.tsx` — `DataTable` of `JudgingCriterion` rows; columns: name, panel, round, max score, weight; row actions: edit, delete; "Add Criterion" button
  - `backend/hackon/judging/criteria/create/page.meta.ts` + `page.tsx` — `CrudForm`; fields: competition, panel (optional), name, description, maxScore (number), weight (decimal 0-1), round, sort order
  - `backend/hackon/judging/criteria/[id]/edit/page.meta.ts` + `page.tsx` — edit form
  - `backend/hackon/judging/progress/page.meta.ts` + `page.tsx` — scoring progress view; table: project name | judge name | criteria scored / total | submitted; "Nudge" button per row emits `hackon.judge.nudge` event (picked up by notifications subscriber to send in-app notification to the judge); filterable by panel/round
  - `i18n/en.json` — judging management string keys
- Delivers: Complete admin surface for managing the judging structure and tracking submission progress; nudge button triggers in-app notification to lagging judges
- Depends on: Commits 8, 9, 10

---

## Commit 15: ACL, setup, events, notifications — wiring and integration
- Scope: app
- Pattern: acl + setup + notifications + subscriber
- Files:
  - `acl.ts` — add features: `hackon.demos.view`, `hackon.demos.manage`, `hackon.judging.view`, `hackon.judging.manage`, `hackon.judging.score` (for portal judges)
  - `setup.ts` — `defaultRoleFeatures`: admin gets `hackon.demos.*` + `hackon.judging.*`; employee/judge role gets `hackon.judging.score` + `hackon.judging.view`
  - `events.ts` — consolidate all WF4 events declared across commits: `hackon.demo.timer.updated`, `hackon.score.submitted`, `hackon.judge.nudge`; ensure `createModuleEvents()` covers all with `as const`
  - `notifications.ts` — declare `hackon.judge.nudge` notification type (`{ title: 'Scoring reminder', severity: 'info' }`)
  - `notifications.client.ts` — renderer for `hackon.judge.nudge` (simple text + link to judging dashboard)
  - `subscribers/judge-nudge-notification.ts` — persistent subscriber on `hackon.judge.nudge`; resolves `notificationService` from DI; creates in-app notification for the target judge user; `metadata: { event: 'hackon.judge.nudge', persistent: true, id: 'hackon-judge-nudge-notify' }`
  - `i18n/en.json` — notification string keys
- Delivers: Full permission matrix in place; roles assigned correctly by default; nudge produces a real in-app notification; all events are type-safe and registered; run `npm run modules:prepare` after this commit
- Depends on: All previous WF4 commits

---

## Commit 16: Integration tests — WF4 Demos & Judging
- Scope: app
- Pattern: integration tests (Playwright)
- Files:
  - `apps/mercato/e2e/hackon-wf4-demo-queue.spec.ts` — tests: generate queue from published projects; verify order; update `presentation_order` via reorder; SSE stream receives `demo.timer.updated` on POST to timer control; advance through statuses
  - `apps/mercato/e2e/hackon-wf4-judging.spec.ts` — tests: create panel, assign judge user, assign track; create criterion with weight; judge logs in, sees dashboard with assigned project; opens score card, enters scores per criterion, verifies auto-save; submits score card; verifies `is_submitted=true` in API; trigger FINISHED stage → verify `ProjectFinalScore` records exist with correct weighted totals
  - Setup: API fixtures create competition + tracks + teams + projects (published) in `beforeAll`; teardown deletes all created records in `afterAll` via `finally`
- Delivers: CI coverage for the full WF4 happy path; tests are self-contained and leave no residual data
- Depends on: All previous WF4 commits

---

## Summary — Commit Order

| # | Description | Key deliverable |
|---|-------------|-----------------|
| 1 | DemoSession entity + CRUD | Queue data model |
| 2 | Queue generation endpoint | One-click queue from projects |
| 3 | Timer state entity + control API | Start/pause/skip/advance |
| 4 | SSE subscriber + stream endpoint | Real-time push to all clients |
| 5 | Backend Demo Control page | Admin control room |
| 6 | Portal Presentation Queue page | Attendee live board |
| 7 | Portal Kiosk View | Projector auto-display |
| 8 | JudgePanel + assignments CRUD | Panel structure |
| 9 | JudgingCriterion CRUD | Weighted scoring rubric |
| 10 | ProjectScore + CriterionScore + scoring API | Score persistence + submission |
| 11 | Portal Judging Dashboard | Judge project overview |
| 12 | Portal Score Card | Per-criterion tap-to-score UI |
| 13 | Final score computation worker | Leaderboard on FINISHED |
| 14 | Backend Judging management pages | Admin panels, criteria, progress, nudge |
| 15 | ACL + setup + events + notifications wiring | Full permission + notification integration |
| 16 | Integration tests | CI coverage for WF4 |
