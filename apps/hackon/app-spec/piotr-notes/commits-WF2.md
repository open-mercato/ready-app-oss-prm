# WF2: Team Formation & Track Selection — Atomic Commit Plan

Module path convention: `apps/mercato/src/modules/competitions/`

Assumes WF1 delivered:
- `competitions` module registered in `apps/mercato/src/modules.ts`
- `Competition`, `Track`, `CompetitionParticipation` ORM entities in `data/entities.ts`
- `competitions.competition.*` and `competitions.track.*` events declared
- Portal shell (layout, auth middleware, `[orgSlug]` routing) already in place
- ACL features `competitions.view`, `competitions.manage` declared and seeded

---

## Commit 1: Team entity + CRUD API

- Scope: app
- Pattern: entity + CRUD
- Files:
  - `apps/mercato/src/modules/competitions/data/entities.ts` — add `HackTeam` entity (`hack_teams` table: id, organization_id, tenant_id, competition_id, track_id nullable, name, description, status `open|closed|disqualified`, created_at, updated_at, deleted_at)
  - `apps/mercato/src/modules/competitions/data/validators.ts` — add `teamCreateSchema`, `teamUpdateSchema`
  - `apps/mercato/src/modules/competitions/api/openapi.ts` — add `buildCompetitionsCrudOpenApi` factory (mirrors `_example/api/openapi.ts`)
  - `apps/mercato/src/modules/competitions/api/teams/route.ts` — `makeCrudRoute` with `indexer: { entityType: E.competitions.hack_team }`, list fields: id, name, description, status, competition_id, track_id, created_at; `buildFilters` by competitionId, status, trackId; commands `competitions.teams.create/update/delete`; exports `openApi`
  - `apps/mercato/src/modules/competitions/commands/teams.ts` — `createTeamCommand`, `updateTeamCommand`, `deleteTeamCommand`; `teamCrudEvents` (`competitions.team.*`), `teamCrudIndexer`; `registerCommand` calls; mirrors `_example/commands/todos.ts` without custom fields
- Delivers: `GET/POST/PUT/DELETE /api/competitions/teams` with tenant scoping, soft delete, query engine indexing, undoable commands
- Depends on: WF1 (module scaffold, entities base)

---

## Commit 2: Team events declaration

- Scope: app
- Pattern: events declaration
- Files:
  - `apps/mercato/src/modules/competitions/events.ts` — extend existing events config to add `competitions.team.created`, `competitions.team.updated`, `competitions.team.deleted`, `competitions.team.locked` (lifecycle, `excludeFromTriggers: false`), `competitions.team_member.added`, `competitions.team_member.removed`; use `as const`; re-export `emitCompetitionsEvent`
- Delivers: typed event IDs for all team-related events; `npm run modules:prepare` picks up new events for workflow trigger discovery
- Depends on: Commit 1

---

## Commit 3: TeamMember entity + CRUD API

- Scope: app
- Pattern: entity + CRUD
- Files:
  - `apps/mercato/src/modules/competitions/data/entities.ts` — add `TeamMember` entity (`hack_team_members` table: id, organization_id, tenant_id, team_id, customer_user_id, role `owner|member`, joined_at, created_at, updated_at, deleted_at; unique index on `(competition_id, customer_user_id)` — requires competition_id denormalized onto the row for the constraint)
  - `apps/mercato/src/modules/competitions/data/validators.ts` — add `teamMemberAddSchema` (teamId, customerUserId, role), `teamMemberUpdateSchema` (id, role)
  - `apps/mercato/src/modules/competitions/api/team-members/route.ts` — `makeCrudRoute`; list filters by teamId, competitionId, customerUserId; `requireFeatures: ['competitions.manage']` on write methods; exports `openApi`
  - `apps/mercato/src/modules/competitions/commands/team-members.ts` — create/delete commands; on create: enforce unique-per-competition constraint (query existing active member for same customerUserId+competitionId, throw 409); emit `competitions.team_member.added/removed`
- Delivers: `GET/POST/DELETE /api/competitions/team-members`; membership uniqueness enforced at command layer
- Depends on: Commit 2

---

## Commit 4: CompetitionParticipation "looking for team" flag + CRUD patch

- Scope: app
- Pattern: entity field addition + API patch
- Files:
  - `apps/mercato/src/modules/competitions/data/entities.ts` — add `lookingForTeam boolean default false` to `CompetitionParticipation` entity
  - `apps/mercato/src/modules/competitions/data/validators.ts` — add `lookingForTeam: z.boolean().optional()` to `participationUpdateSchema`
  - `apps/mercato/src/modules/competitions/api/participations/route.ts` — add `lookingForTeam` to list fields and `buildFilters` (filter `lookingForTeam=true`); update command maps the field through
  - `apps/mercato/src/modules/competitions/commands/participations.ts` — update command sets `entity.lookingForTeam` when present in payload
  - Migration: `yarn db:generate` produces `Migration_add_looking_for_team.ts`
- Delivers: participants can signal availability; `GET /api/competitions/participations?lookingForTeam=true` returns the directory feed
- Depends on: WF1 (participations CRUD baseline)

---

## Commit 5: TeamInvitation entity + CRUD API

- Scope: app
- Pattern: entity + CRUD
- Files:
  - `apps/mercato/src/modules/competitions/data/entities.ts` — add `TeamInvitation` entity (`hack_team_invitations` table: id, organization_id, tenant_id, team_id, competition_id denormalized, sender_customer_user_id, recipient_customer_user_id, kind `invite|join_request`, status `pending|accepted|declined|expired`, message nullable, expires_at nullable, created_at, updated_at, deleted_at)
  - `apps/mercato/src/modules/competitions/data/validators.ts` — add `invitationCreateSchema`, `invitationRespondSchema` (id, action `accept|decline`)
  - `apps/mercato/src/modules/competitions/api/team-invitations/route.ts` — `makeCrudRoute`; list filters by teamId, recipientCustomerUserId, senderCustomerUserId, status, kind; exports `openApi`
  - `apps/mercato/src/modules/competitions/commands/team-invitations.ts` — `createInvitationCommand`: validate no duplicate pending invitation for same team+recipient; `respondInvitationCommand`: transition status, on accept call `teamMemberAddCommand` internally; emit `competitions.team_invitation.created`, `competitions.team_invitation.accepted`, `competitions.team_invitation.declined`
  - `apps/mercato/src/modules/competitions/events.ts` — add `competitions.team_invitation.created`, `competitions.team_invitation.accepted`, `competitions.team_invitation.declined`
- Delivers: `GET/POST/PUT/DELETE /api/competitions/team-invitations`; invite and join-request flows with status transitions; accepting an invitation atomically adds the member
- Depends on: Commit 3

---

## Commit 6: Team lockdown subscriber (stage transition)

- Scope: app
- Pattern: subscriber
- Files:
  - `apps/mercato/src/modules/competitions/subscribers/lock-teams-on-hacking.ts` — subscribes to `competitions.competition.stage_changed` (persistent, id `competitions.lock-teams-on-hacking`); when `payload.toStage === 'HACKING'`: bulk-update all `hack_team_members` for the competition to set a `locked_at` timestamp; expire all pending `hack_team_invitations` (status → `expired`); emit `competitions.team.locked` for each team in the competition
- Delivers: on stage transition to HACKING, membership is frozen and outstanding invitations are cancelled; no portal or admin changes required for enforcement — queries can filter `locked_at IS NULL` for mutating actions
- Depends on: Commit 2, Commit 3, Commit 5 (events + entities must exist)

---

## Commit 7: ACL features + module setup update

- Scope: app
- Pattern: ACL + setup
- Files:
  - `apps/mercato/src/modules/competitions/acl.ts` — add `competitions.teams.view`, `competitions.teams.manage`, `competitions.team_invitations.view`, `competitions.team_invitations.manage`
  - `apps/mercato/src/modules/competitions/setup.ts` — extend `defaultRoleFeatures`: admin gets all `competitions.*`; employee gets `competitions.teams.view`, `competitions.team_invitations.view`; add `competitions.teams.manage` and `competitions.team_invitations.manage` to customer portal role (read from WF1 portal role seeding)
- Delivers: RBAC correctly gates team write actions; admin role gets full access; portal customer role can create invitations and manage their own team
- Depends on: Commit 1, Commit 5

---

## Commit 8: Admin backend — Team management page

- Scope: app
- Pattern: backend page (DataTable + row actions)
- Files:
  - `apps/mercato/src/modules/competitions/backend/competitions/teams/page.meta.ts` — `requireFeatures: ['competitions.teams.view']`, nav group `Competitions`, order 30
  - `apps/mercato/src/modules/competitions/backend/competitions/teams/page.tsx` — `DataTable<TeamRow>` with columns: name, competition, track, status, member count (from joined query or separate fetch), created_at; filters: competitionId (select), status (select), trackId (select); `RowActions` per row: view members (links to `[id]` detail), disqualify (calls `PUT /api/competitions/teams` with `{ status: 'disqualified' }`), delete; search by team name
  - `apps/mercato/src/modules/competitions/backend/competitions/teams/[id]/page.meta.ts` — breadcrumb, requireAuth
  - `apps/mercato/src/modules/competitions/backend/competitions/teams/[id]/page.tsx` — detail page: team info header (name, status, track); members roster table (customer user name, role, joined_at, remove action); pending invitations table (recipient, kind, status, expire action)
- Delivers: admin can browse all teams across competitions, disqualify a team, view roster, and revoke invitations from the backend
- Depends on: Commit 1, Commit 3, Commit 5, Commit 7

---

## Commit 9: Portal — My Team page

- Scope: app
- Pattern: portal page (custom React, no DataTable/CrudForm)
- Files:
  - `apps/mercato/src/modules/competitions/frontend/[orgSlug]/portal/[competitionSlug]/team/page.tsx` — portal page (client component); loads: current user's team membership via `GET /api/competitions/team-members?customerUserId=<me>&competitionId=<id>`; if no team: shows "You are not on a team yet" with CTA buttons "Create a team" (inline form → `POST /api/competitions/teams`) and "Browse teams" (link to browse page); if on a team: shows team name/description, track selector (dropdown of competition tracks, calls `PUT /api/competitions/teams` with `{ trackId }`), roster list (member name + role), pending invitations section (incoming join requests for owners: accept/decline buttons; outgoing invites: cancel button); uses `PortalCard`, `PortalPageHeader`, `PortalEmptyState` primitives (these are plain styled components declared within this module's `components/portal/` folder since no shared portal component library exists yet in platform — see note below); `usePortalAppEvent('competitions.team_member.added')` to refresh roster without page reload
  - `apps/mercato/src/modules/competitions/components/portal/PortalCard.tsx` — simple `div` with card styling (border, rounded, padding) — module-local until a platform portal component library is extracted
  - `apps/mercato/src/modules/competitions/components/portal/PortalEmptyState.tsx` — centered empty state with title + description + optional CTA slot
  - `apps/mercato/src/modules/competitions/components/portal/PortalPageHeader.tsx` — page title + subtitle row
- Delivers: portal participants can create/join a team, select a track, see their roster, and respond to invitations; SSE-driven roster refresh
- Depends on: Commit 1, Commit 3, Commit 5, Commit 7

> **Note on portal primitives:** `PortalCard`, `PortalEmptyState`, `PortalPageHeader` are not in `@open-mercato/ui` today. They are introduced here as module-local components. If a shared portal component package is added to the platform later, extract them at that time.

---

## Commit 10: Portal — Browse Teams page

- Scope: app
- Pattern: portal page (custom React)
- Files:
  - `apps/mercato/src/modules/competitions/frontend/[orgSlug]/portal/[competitionSlug]/teams/page.tsx` — client component; fetches `GET /api/competitions/teams?competitionId=<id>&status=open&page=<n>&pageSize=20`; renders list of `PortalCard` per team: name, track name, member count / max (if maxTeamSize is on Competition), description excerpt; "Request to join" button — `POST /api/competitions/team-invitations` with `kind: 'join_request'`; disabled and shows "Requested" if pending invitation already exists (checked from a separate `GET /api/competitions/team-invitations?recipientCustomerUserId=<me>&teamId=<id>&status=pending`); second section "People Looking for Teams" — fetches `GET /api/competitions/participations?competitionId=<id>&lookingForTeam=true&pageSize=20`; shows participant name, org, skills (custom field or description); "Invite" button per person if viewer is a team owner — `POST /api/competitions/team-invitations` with `kind: 'invite'`; uses module-local portal primitives from Commit 9; pagination via load-more button
- Delivers: participants can discover open teams and send join requests; team owners can invite participants who are looking for a team
- Depends on: Commit 4, Commit 5, Commit 9

---

## Commit 11: Portal — Participants Directory page

- Scope: app
- Pattern: portal page (custom React)
- Files:
  - `apps/mercato/src/modules/competitions/frontend/[orgSlug]/portal/[competitionSlug]/participants/page.tsx` — client component; fetches `GET /api/competitions/participations?competitionId=<id>&page=<n>&pageSize=20&lookingForTeam=<bool>&search=<text>`; search input (name/org); toggle filter "Looking for team only"; renders grid of participant cards: display name, organization name, `lookingForTeam` badge, skills field (from participation custom fields or description); no team-invite action here (that lives on Browse Teams); shows team assignment if participant is on a team (team name, linked to team detail in browse page)
- Delivers: full participant directory with search and looking-for-team filter; completes the team formation discovery surface
- Depends on: Commit 4, Commit 9 (portal primitives)

---

## Commit 12: Portal event broadcasting for team events

- Scope: app
- Pattern: subscriber (SSE broadcast)
- Files:
  - `apps/mercato/src/modules/competitions/subscribers/broadcast-team-events.ts` — ephemeral subscriber (`persistent: false`, id `competitions.broadcast-team-events`); subscribes to `competitions.team_member.added` and `competitions.team_member.removed`; calls portal SSE bridge with `portalBroadcast: true` flag so connected portal clients receive `usePortalAppEvent()` notifications; handler is a no-op beyond the broadcast signal (actual refresh is client-side)
- Delivers: My Team page roster and Browse Teams page update in real time when membership changes without polling
- Depends on: Commit 2, Commit 9, Commit 10

---

## Dependency Graph

```
WF1 baseline
  └── C1 (Team entity + CRUD)
        └── C2 (Team events)
              ├── C3 (TeamMember entity + CRUD)
              │     ├── C5 (TeamInvitation entity + CRUD)
              │     │     ├── C6 (Lock subscriber)
              │     │     ├── C7 (ACL + setup)  ← also needs C1
              │     │     │     ├── C8 (Admin teams page)
              │     │     │     ├── C9 (Portal: My Team)  ← needs C5
              │     │     │     │     ├── C10 (Portal: Browse Teams)  ← needs C4
              │     │     │     │     └── C11 (Portal: Participants)  ← needs C4
              │     │     │     └── C12 (SSE broadcast)  ← needs C9,C10
              │     │     └── (C7, C8, C9 above)
              │     └── (C7 above)
WF1 baseline
  └── C4 (lookingForTeam flag)  — independent of C1-C3, only needs WF1 participations
```

## Recommended Merge Order

1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

Each commit builds and runs independently. Run `yarn db:generate` after Commits 1, 3, 4, 5.
Run `npm run modules:prepare` after Commits 2, 7, 12.
