# HackOn — WF5: Results & Prizes + Cross-cutting Commits

> Module path shorthand: `apps/mercato/src/modules/hackon/`
> All WF1-WF4 entities assumed present: Competition, Track, Team, TeamMember, Project, JudgingScore, JudgingRound.
> Assumed entity IDs (generated): `E.hackon.*` for all hackon entities.
> Portal routes live under `frontend/` (public-facing, no backend auth wall).
> Backend pages live under `backend/hackon/`.

---

## WF5: Results & Prizes

---

### Commit WF5-1: PeerVote entity + migration

- Scope: app
- Pattern: entity+migration
- Files:
  - `apps/mercato/src/modules/hackon/data/entities.ts` — add `PeerVote` entity (fields: `id uuid PK`, `voter_customer_user_id uuid`, `project_id uuid FK projects`, `organization_id uuid`, `tenant_id uuid`, `created_at`, `deleted_at`; unique constraint on `(voter_customer_user_id, project_id)` scoped per tenant)
  - `apps/mercato/src/modules/hackon/data/validators.ts` — add `peerVoteCreateSchema` (`z.object({ projectId: z.string().uuid() })`), `peerVoteDeleteSchema` (`z.object({ id: z.string().uuid() })`)
  - Run `yarn db:generate` to emit migration → commit generated file under `apps/mercato/src/modules/hackon/migrations/`
- Delivers: PeerVote table in DB with unique constraint preventing duplicate votes; self-vote guard enforced at application layer in WF5-2
- Depends on: WF1-1 (Project entity exists)

---

### Commit WF5-2: PeerVote API route (cast / retract vote)

- Scope: app
- Pattern: entity+CRUD
- Files:
  - `apps/mercato/src/modules/hackon/api/openapi.ts` — extend `buildHackonCrudOpenApi` factory with `peerVote` resource schemas
  - `apps/mercato/src/modules/hackon/api/peer-votes/route.ts` — `makeCrudRoute` over `PeerVote`; `indexer: { entityType: E.hackon.peer_vote }`;
    - `GET`: list votes for a project (`projectId` filter); returns `{ id, projectId, count }` aggregate + caller's own vote id
    - `POST`: cast vote; guard: resolve `voterCustomerUserId` from portal session; reject if `voterCustomerUserId === project.ownerCustomerUserId` OR voter is a member of the project's team (self-vote guard); enforce DB unique constraint via try/catch → `createCrudFormError`
    - `DELETE`: retract vote by id; ownership check (voter must own the vote)
    - `metadata`: `GET requireAuth: true`, `POST/DELETE requireFeatures: ['hackon.vote']`
  - `apps/mercato/src/modules/hackon/api/openapi.ts` — export `peerVoteOpenApi` doc
- Delivers: Portal can cast/retract votes; duplicate and self-vote blocked at API layer; vote count queryable per project
- Depends on: WF5-1

---

### Commit WF5-3: Portal Vote page (project grid with live vote counter)

- Scope: app
- Pattern: portal page
- Files:
  - `apps/mercato/src/modules/hackon/frontend/competitions/[competitionId]/vote/page.tsx` — "use client"; fetches projects for the competition (grouped by track); renders project cards with:
    - Project name, team name, track badge
    - Vote button (filled/outline toggle) showing `X / N` counter (X = my votes cast, N = total votes on project)
    - Own team projects shown as dimmed with "Your project" label and vote button disabled
    - Optimistic update on vote/unvote; reverts on error
  - `apps/mercato/src/modules/hackon/frontend/competitions/[competitionId]/vote/VoteCard.tsx` — reusable card component; `aria-pressed` on toggle button; `Cmd+Enter` not applicable (toggle, not dialog)
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add keys: `hackon.vote.page.title`, `hackon.vote.card.voteButton`, `hackon.vote.card.unvoteButton`, `hackon.vote.card.ownProject`, `hackon.vote.card.counter`, `hackon.vote.error.selfVote`, `hackon.vote.error.generic`
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish translations for same keys
- Delivers: Participants visit `/competitions/{id}/vote`, see all projects, can vote/unvote with live counter; own team excluded from voting
- Depends on: WF5-2, WF3-x (Project portal page pattern)

---

### Commit WF5-4: Prize entity + CRUD API

- Scope: app
- Pattern: entity+CRUD
- Files:
  - `apps/mercato/src/modules/hackon/data/entities.ts` — add `Prize` entity (fields: `id`, `competition_id uuid`, `track_id uuid nullable`, `name text`, `description text nullable`, `rank int` (1=1st, 2=2nd, …), `winning_project_id uuid nullable FK projects`, `winning_team_id uuid nullable FK teams`, `organization_id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)
  - `apps/mercato/src/modules/hackon/data/validators.ts` — `prizeCreateSchema`, `prizeUpdateSchema` (include `winningProjectId`, `winningTeamId`, `rank`, `trackId`)
  - `apps/mercato/src/modules/hackon/api/prizes/route.ts` — `makeCrudRoute` over `Prize`; `indexer: { entityType: E.hackon.prize }`;
    - `GET`: list prizes for a competition (`competitionId` filter, optional `trackId`), sorted by `rank asc`
    - `POST/PUT/DELETE`: admin-only (`requireFeatures: ['hackon.prizes.manage']`)
    - `GET`: public read allowed when competition stage is `FINISHED`
  - `apps/mercato/src/modules/hackon/api/prizes/suggest/route.ts` — `GET /api/hackon/prizes/suggest?competitionId=&trackId=&rank=` — auto-suggest winning project/team from leaderboard ranking (reads `LeaderboardEntry` entities ordered by `totalScore desc`, returns top-N candidates for given rank)
  - Run `yarn db:generate` → commit migration
- Delivers: Prizes can be created and assigned; auto-suggest endpoint returns ranked candidates for prize assignment
- Depends on: WF4-x (LeaderboardEntry entity or score aggregation from judging), WF1-1

---

### Commit WF5-5: Backend prize management UI

- Scope: app
- Pattern: backend page
- Files:
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/prizes/page.tsx` — list prizes for competition; `DataTable` with columns: Rank, Prize Name, Track, Winning Project (auto-linked), Winning Team; row actions: Edit, Delete
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/prizes/page.meta.ts` — `requireAuth: true`, `requireFeatures: ['hackon.prizes.manage']`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/prizes/create/page.tsx` — `CrudForm`: fields `name`, `description`, `rank` (number), `trackId` (select), `winningProjectId` (async combobox, populated from `/api/hackon/prizes/suggest`), `winningTeamId` (auto-filled when project selected)
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/prizes/[prizeId]/edit/page.tsx` — same form, pre-populated; "Auto-suggest" button calls suggest endpoint and fills winner fields
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add keys: `hackon.prizes.*` (table columns, form labels, flash messages)
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish translations
- Delivers: Admins can create prizes, manually assign winners, or use auto-suggest from leaderboard ranking
- Depends on: WF5-4

---

### Commit WF5-6: LeaderboardEntry entity + score calculation worker

- Scope: app
- Pattern: entity+worker
- Files:
  - `apps/mercato/src/modules/hackon/data/entities.ts` — add `LeaderboardEntry` entity (fields: `id`, `competition_id`, `track_id nullable`, `project_id`, `team_id`, `total_score numeric(10,4)`, `peer_vote_count int`, `judge_score_avg numeric(10,4)`, `rank int`, `organization_id`, `tenant_id`, `calculated_at`, `created_at`, `updated_at`; unique constraint `(competition_id, project_id)`)
  - `apps/mercato/src/modules/hackon/workers/calculate-leaderboard.ts` — export `metadata: { queue: 'hackon.leaderboard', id: 'calculate-leaderboard', concurrency: 1 }` (CPU-bound single worker); job payload: `{ competitionId, organizationId, tenantId }`;
    - Aggregates `JudgingScore` per project → weighted average
    - Counts `PeerVote` per project
    - Computes `totalScore = judgeScoreAvg * 0.7 + normalizedPeerVoteCount * 0.3` (weights configurable via competition settings in later phase)
    - Upserts `LeaderboardEntry` rows per project, assigns `rank` within track
    - Uses `withAtomicFlush` for multi-phase mutation
  - `apps/mercato/src/modules/hackon/api/leaderboard/route.ts` — `GET /api/hackon/leaderboard?competitionId=&trackId=`; returns `LeaderboardEntry[]` sorted by `rank asc`; public when stage=`FINISHED`, auth-only otherwise
  - Run `yarn db:generate` → commit migration
- Delivers: Score calculation worker can be enqueued; leaderboard API ready to serve rankings
- Depends on: WF4-x (JudgingScore), WF5-1 (PeerVote), WF5-4 (Prize entity already present for auto-suggest)

---

### Commit WF5-7: Publish Results flow (stage → FINISHED side effect)

- Scope: app
- Pattern: subscriber+worker dispatch
- Files:
  - `apps/mercato/src/modules/hackon/subscribers/competition-stage-changed.ts` — export `metadata: { event: 'hackon.competition.stage_changed', persistent: true, id: 'competition-stage-changed' }`; when `payload.newStage === 'FINISHED'` → enqueue `hackon.leaderboard` job with `{ competitionId, organizationId, tenantId }`; also emit `hackon.competition.results_published` event
  - `apps/mercato/src/modules/hackon/events.ts` — add events: `hackon.competition.stage_changed` (`{ competitionId, oldStage, newStage }`), `hackon.competition.results_published` (`{ competitionId }`)
  - `apps/mercato/src/modules/hackon/api/competitions/[id]/publish-results/route.ts` — `POST /api/hackon/competitions/{id}/publish-results`; validates current stage is `JUDGING_COMPLETE` or `HACKING`; sets stage to `FINISHED` via command; emits `hackon.competition.stage_changed`; `requireFeatures: ['hackon.competitions.manage']`; returns `{ ok: true }`
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add keys: `hackon.competition.publishResults.confirm`, `hackon.competition.publishResults.success`, `hackon.competition.publishResults.error`
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish translations
- Delivers: Admin clicks "Publish Results" → stage set to FINISHED → leaderboard calculation enqueued automatically
- Depends on: WF5-6, WF1-x (competition stage management)

---

### Commit WF5-8: Portal Results page (leaderboard + prizes + judge feedback)

- Scope: app
- Pattern: portal page
- Files:
  - `apps/mercato/src/modules/hackon/frontend/competitions/[competitionId]/results/page.tsx` — server-fetched (or "use client" with SWR); only visible when stage=`FINISHED`; layout:
    - Hero: "Results — {competitionName}" with date
    - Track tabs (one tab per track + "Overall" tab)
    - Per-track leaderboard table: Rank, Project Name, Team, Judge Score Avg, Peer Votes, Total Score
    - Prizes section below leaderboard: Prize card (rank badge, prize name, winning team/project, description)
    - Judge Feedback accordion per project: shows aggregated public judge comments (non-confidential scores)
  - `apps/mercato/src/modules/hackon/frontend/competitions/[competitionId]/results/LeaderboardTable.tsx` — sortable table component; rank 1-3 get medal badge (gold/silver/bronze)
  - `apps/mercato/src/modules/hackon/frontend/competitions/[competitionId]/results/PrizeCard.tsx` — prize display card
  - `apps/mercato/src/modules/hackon/frontend/competitions/[competitionId]/results/FeedbackAccordion.tsx` — per-project public judge comments
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add keys: `hackon.results.*` (page title, table columns, prize section, feedback section, empty states)
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish translations
- Delivers: Participants and public can view final rankings, prizes, and judge feedback at `/competitions/{id}/results` after results are published
- Depends on: WF5-6 (leaderboard), WF5-4 (prizes), WF5-7 (published state gate), WF4-x (judge comments)

---

## Cross-cutting Concerns

---

### Commit CC-1: IncidentReport entity + migration

- Scope: app
- Pattern: entity+migration
- Files:
  - `apps/mercato/src/modules/hackon/data/entities.ts` — add `IncidentReport` entity (fields: `id uuid PK`, `competition_id uuid`, `reporter_customer_user_id uuid nullable` (null when anonymous), `is_anonymous boolean default false`, `title text`, `description text`, `severity enum('low','medium','high','critical')`, `status enum('open','investigating','resolved','dismissed') default 'open'`, `resolved_at timestamp nullable`, `resolution_note text nullable`, `organization_id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)
  - `apps/mercato/src/modules/hackon/data/validators.ts` — `incidentReportCreateSchema` (`title`, `description`, `severity`, `isAnonymous`, `competitionId`), `incidentReportUpdateSchema` (`status`, `resolutionNote`, `resolvedAt`)
  - Run `yarn db:generate` → commit migration
- Delivers: IncidentReport table ready; anonymous flag allows reports without identity
- Depends on: WF1-1 (Competition entity)

---

### Commit CC-2: IncidentReport CRUD API

- Scope: app
- Pattern: entity+CRUD
- Files:
  - `apps/mercato/src/modules/hackon/api/incident-reports/route.ts` — `makeCrudRoute` over `IncidentReport`; `indexer: { entityType: E.hackon.incident_report }`;
    - `POST`: create report; if `isAnonymous=true` do NOT persist `reporterCustomerUserId`; `requireAuth: true` (portal session)
    - `GET`: admin-only list with filters (`competitionId`, `status`, `severity`); `requireFeatures: ['hackon.incidents.manage']`; anonymous reports shown with `reporter: "Anonymous"`
    - `PUT`: update status/resolution; `requireFeatures: ['hackon.incidents.manage']`
    - `DELETE`: soft-delete; `requireFeatures: ['hackon.incidents.manage']`
  - `apps/mercato/src/modules/hackon/api/openapi.ts` — export `incidentReportOpenApi` doc with full CRUD spec
  - `apps/mercato/src/modules/hackon/events.ts` — add events: `hackon.incident.reported` (`{ incidentId, competitionId, severity, isAnonymous }`), `hackon.incident.resolved` (`{ incidentId, competitionId }`)
- Delivers: Participants can submit incident reports (anonymously or not); admins can list, investigate, and resolve incidents
- Depends on: CC-1

---

### Commit CC-3: Portal floating incident report button + form

- Scope: app
- Pattern: portal page + widget
- Files:
  - `apps/mercato/src/modules/hackon/frontend/competitions/[competitionId]/_components/IncidentReportButton.tsx` — "use client"; floating action button (bottom-right, `z-50`); opens a dialog; `Cmd+Enter` submits, `Escape` closes; fields: `title` (text, required), `description` (textarea, required), `severity` (select: Low / Medium / High / Critical), `isAnonymous` (checkbox — "Submit anonymously"); calls `POST /api/hackon/incident-reports`; shows flash on success; clears form on close
  - `apps/mercato/src/modules/hackon/frontend/competitions/[competitionId]/layout.tsx` — import and render `<IncidentReportButton competitionId={competitionId} />` so button appears on all competition sub-pages (vote, results, project pages)
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add keys: `hackon.incident.button.label`, `hackon.incident.form.title`, `hackon.incident.form.fields.*`, `hackon.incident.form.submit`, `hackon.incident.form.success`, `hackon.incident.form.error`
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish translations
- Delivers: Any competition page shows a floating "Report Incident" button; participants can submit reports; anonymous option preserves privacy
- Depends on: CC-2

---

### Commit CC-4: Backend incident management page

- Scope: app
- Pattern: backend page
- Files:
  - `apps/mercato/src/modules/hackon/backend/hackon/incidents/page.tsx` — `DataTable` with columns: Severity (badge: critical=red, high=orange, medium=yellow, low=blue), Title, Competition, Reporter (or "Anonymous"), Status, Created At; filters: competitionId, status, severity; row actions: View, Resolve, Dismiss
  - `apps/mercato/src/modules/hackon/backend/hackon/incidents/page.meta.ts` — `requireAuth: true`, `requireFeatures: ['hackon.incidents.manage']`
  - `apps/mercato/src/modules/hackon/backend/hackon/incidents/[id]/page.tsx` — detail view: full description, timeline of status changes, resolution form (`status` select, `resolutionNote` textarea); submit calls `PUT /api/hackon/incident-reports` via `updateCrud`
  - `apps/mercato/src/modules/hackon/backend/hackon/incidents/[id]/page.meta.ts` — same guard
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add keys: `hackon.incidents.page.*`, `hackon.incidents.detail.*`
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish translations
- Delivers: Admins have a dedicated incident management interface; severity-coded badges for triage; resolution workflow
- Depends on: CC-2

---

### Commit CC-5: Event Command Center backend page

- Scope: app
- Pattern: backend page (dashboard/status)
- Files:
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/command-center/page.tsx` — "use client"; auto-refreshes every 30 s via `useSWR`; traffic-light status grid layout:
    - **Check-in** tile: `checked-in count / total registered` with progress bar; status red/yellow/green thresholds (e.g., <50% red, 50-80% yellow, >80% green)
    - **Teams** tile: total teams formed / min required; status if competition requires minimum team count
    - **Projects** tile: projects submitted / teams registered; green when all teams have submitted
    - **Judging Progress** tile: judging scores recorded / (projects × judges assigned); per-round breakdown
    - **Open Incidents** tile: count of `open` + `investigating` incidents; severity breakdown (critical/high highlighted red)
    - Stage selector: current competition stage with "Advance Stage" action button
  - `apps/mercato/src/modules/hackon/api/competitions/[id]/command-center/route.ts` — `GET`; aggregates all five metrics in a single DB query batch; returns `{ checkIn, teams, projects, judging, incidents, currentStage }`; `requireFeatures: ['hackon.competitions.manage']`
  - `apps/mercato/src/modules/hackon/backend/hackon/competitions/[id]/command-center/page.meta.ts` — `requireAuth: true`, `requireFeatures: ['hackon.competitions.manage']`
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add keys: `hackon.commandCenter.*` (tile labels, threshold descriptions, status labels)
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish translations
- Delivers: Real-time event operational dashboard; organizers see competition health at a glance with traffic-light indicators
- Depends on: CC-2 (incidents), WF2-x (check-in), WF3-x (projects), WF4-x (judging), WF5-7 (stage transitions)

---

### Commit CC-6: Search configuration (competitions, teams, projects, participants)

- Scope: app
- Pattern: config (search)
- Files:
  - `apps/mercato/src/modules/hackon/search.ts` — export `searchConfig: SearchModuleConfig[]` with four entries:
    ```
    competition: { entityType: E.hackon.competition, fieldPolicy: { name: 'fulltext', description: 'fulltext' }, buildSource: (c) => `${c.name} ${c.description}`, formatResult: (c) => ({ title: c.name, subtitle: c.status, icon: 'trophy' }) }
    team: { entityType: E.hackon.team, fieldPolicy: { name: 'fulltext' }, buildSource: (t) => t.name, formatResult: (t) => ({ title: t.name, subtitle: t.competition_name, icon: 'users' }) }
    project: { entityType: E.hackon.project, fieldPolicy: { name: 'fulltext', description: 'fulltext' }, buildSource: (p) => `${p.name} ${p.description}`, formatResult: (p) => ({ title: p.name, subtitle: p.team_name, icon: 'code' }) }
    participant: { entityType: E.hackon.participant, fieldPolicy: { display_name: 'fulltext', email: 'token' }, buildSource: (p) => p.display_name, formatResult: (p) => ({ title: p.display_name, subtitle: p.email, icon: 'user' }) }
    ```
  - `apps/mercato/src/modules/hackon/index.ts` — re-export `searchConfig` so generator picks it up
- Delivers: Full-text search across all four entity types; admins can find competitions, teams, projects, participants from the global search bar
- Depends on: WF1-1, WF2-x (participant/team entities)

---

### Commit CC-7: Notification types declaration

- Scope: app
- Pattern: config (notifications)
- Files:
  - `apps/mercato/src/modules/hackon/notifications.ts` — export `notificationTypes: NotificationTypeDefinition[]` with types:
    - `hackon.competition.invitation` — icon: `mail`, severity: `info`, link: `/competitions/{sourceEntityId}`, expires: 72h
    - `hackon.competition.stage_changed` — icon: `flag`, severity: `info`, link: `/backend/hackon/competitions/{sourceEntityId}`, expires: 168h
    - `hackon.team.invite_received` — icon: `user-plus`, severity: `info`, link: `/competitions/{competitionId}/teams/{sourceEntityId}`, expires: 48h
    - `hackon.judging.scoring_complete` — icon: `check-circle`, severity: `success`, link: `/backend/hackon/competitions/{sourceEntityId}/judging`, expires: 168h
    - `hackon.competition.results_published` — icon: `trophy`, severity: `success`, link: `/competitions/{sourceEntityId}/results`, expires: 720h (30 days)
    - `hackon.incident.reported` — icon: `alert-triangle`, severity: `warning`, link: `/backend/hackon/incidents/{sourceEntityId}`, expires: 168h (admin-only)
  - `apps/mercato/src/modules/hackon/notifications.client.ts` — re-export notification type IDs for client renderers; default renderers use `titleKey`/`bodyKey` (no custom components needed at MVP)
  - `apps/mercato/src/modules/hackon/subscribers/results-published-notify.ts` — `metadata: { event: 'hackon.competition.results_published', persistent: true, id: 'results-published-notify' }`; sends in-app notification to all registered participants of the competition
  - `apps/mercato/src/modules/hackon/subscribers/incident-reported-notify.ts` — `metadata: { event: 'hackon.incident.reported', persistent: true, id: 'incident-reported-notify' }`; sends in-app notification to users with `hackon.incidents.manage` feature
  - `apps/mercato/src/modules/hackon/i18n/en.json` — add keys: `hackon.notifications.*` (title/body for all 6 types)
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — Polish translations
- Delivers: All six notification types registered; results-published and incident-reported subscribers fire and deliver in-app alerts
- Depends on: WF5-7 (results published event), CC-2 (incident reported event)

---

### Commit CC-8: i18n setup (en.json + pl.json consolidation)

- Scope: app
- Pattern: config (i18n)
- Files:
  - `apps/mercato/src/modules/hackon/i18n/en.json` — consolidate all English translation keys from WF1-WF5 and CC commits into a single flat JSON file; namespaced under `hackon.*`; includes: module title, nav labels, all entity form labels, table column headers, flash messages, error messages, notification bodies, command center labels
  - `apps/mercato/src/modules/hackon/i18n/pl.json` — full Polish equivalents for all keys; no machine-translated placeholders — every key must have a human-quality value
  - `apps/mercato/src/modules/hackon/index.ts` — verify i18n directory is referenced (auto-discovered by module scanner)
- Delivers: Complete bilingual (EN/PL) coverage for the entire hackon module; no missing translation keys at runtime
- Depends on: All WF1-WF5 and CC-1 through CC-7 (final sweep after all keys are known)

---

### Commit CC-9: ACL features + setup.ts (role defaults + seedDefaults + seedExamples)

- Scope: app
- Pattern: config (acl + seed)
- Files:
  - `apps/mercato/src/modules/hackon/acl.ts` — declare all features:
    ```
    hackon.competitions.view, hackon.competitions.manage
    hackon.teams.view, hackon.teams.manage
    hackon.projects.view, hackon.projects.manage
    hackon.judging.view, hackon.judging.score
    hackon.prizes.view, hackon.prizes.manage
    hackon.vote (cast peer votes)
    hackon.incidents.report, hackon.incidents.manage
    hackon.checkin.manage
    hackon.commandcenter.view
    ```
  - `apps/mercato/src/modules/hackon/setup.ts` — `ModuleSetupConfig`:
    - `defaultRoleFeatures`:
      - `superadmin`: `['hackon.*']`
      - `admin`: `['hackon.competitions.*', 'hackon.teams.*', 'hackon.projects.*', 'hackon.judging.*', 'hackon.prizes.*', 'hackon.incidents.*', 'hackon.checkin.manage', 'hackon.commandcenter.view']`
      - `employee`: `['hackon.competitions.view', 'hackon.teams.view', 'hackon.projects.view', 'hackon.judging.view', 'hackon.vote', 'hackon.incidents.report']`
    - `seedDefaults`: no-op (no reference data needed)
    - `seedExamples`: calls `seedHackonExamples(em, { tenantId, organizationId })` (defined in `cli.ts`)
  - `apps/mercato/src/modules/hackon/cli.ts` — export `seedHackonExamples` function:
    - Creates 1 competition: name "BuildFast 2026", slug `buildfast-2026`, stage `HACKING`, dates: startDate = today, endDate = today+2d
    - Creates 2 tracks: "Web & Mobile", "AI/ML"
    - Creates 3 teams: "Pixel Pirates" (Web track), "Data Ninjas" (AI track), "Full Stack Falcons" (Web track)
    - Creates 1 participant per team (3 total) with `customerUserId` references to seeded customer users
    - Creates 1 project per team submitted in `HACKING` stage: name, short description, GitHub URL placeholder
    - Creates 2 prizes: 1st place (Web track), 1st place (AI track) — `winningProjectId` null (not yet judged)
    - All seed data scoped to `tenantId` + `organizationId`; idempotent via `upsert` on slug/name
  - `apps/mercato/src/modules/hackon/index.ts` — export `metadata: ModuleInfo` with `name: 'hackon'`
- Delivers: Role ACLs seeded on tenant creation; demo competition in HACKING stage with teams, tracks, projects available via `--examples`; full module is self-describing
- Depends on: All prior WF and CC commits (final integration step)

---

## Dependency Graph Summary

```
WF5-1 → WF5-2 → WF5-3
WF5-4 → WF5-5
WF5-6 → WF5-7 → WF5-8
WF5-4 → WF5-6

CC-1 → CC-2 → CC-3
             → CC-4
CC-2 → CC-5 (also depends on WF5-7, WF2-x, WF3-x, WF4-x)

CC-6 → (independent, just needs WF entity IDs)
CC-7 → (depends on WF5-7 and CC-2 for events)
CC-8 → (final i18n sweep — depends on all prior)
CC-9 → (final wiring — depends on all prior)
```

## Files Not Listed Above (must exist from WF1-WF4)

The following module files are assumed created in earlier WFs. CC-9 is the first commit that declares `setup.ts` and `acl.ts` as a unified module-level concern; any partial declarations in WF1-WF4 must be merged in this commit.

- `apps/mercato/src/modules/hackon/data/entities.ts` — extended across all WF commits (additive)
- `apps/mercato/src/modules/hackon/events.ts` — extended across WF and CC commits (additive)
- `apps/mercato/src/modules/hackon/di.ts` — DI registrar (created WF1, extended as services are added)
- `apps/mercato/src/modules/hackon/api/openapi.ts` — extended across all WF API commits
