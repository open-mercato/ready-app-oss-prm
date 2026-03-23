# App Spec: HackOn — Hackathon Management Platform

> App Spec is a business architecture document that sits above technical specs.
> It captures domain knowledge, validates cross-spec consistency, and ensures
> the app solves a real business problem using the platform correctly.
>
> This document is the SINGLE SOURCE OF TRUTH for what HackOn is, who it serves,
> and how it maps to Open Mercato. Technical specs are generated from this document.
> If a spec contradicts this document, this document wins.
>
> Each section has a checklist with owner (Mat or Piotr). Section is done when all checks pass.

---

## 1. Business Context `Mat`

### 1.1 Business Model

**What HackOn is:** A hackathon management platform — from participant registration, through team formation, hacking, live demos, judging, to announcing results and awarding prizes.

**Who pays:** The organization running the hackathon (company, foundation, community). HackOn is their operational tool — replaces spreadsheets, Slack, and manual coordination.

**Flywheel:**
```
Organizer runs hackathon on HackOn
  → participants get better experience (real-time, automation)
  → more signups for next editions
  → organizer saves operational time
  → can run larger/more frequent events
  → more participants → more sponsors → flywheel accelerates
```

#### Checklist
- [x] Paying customer identified — organization running the hackathon pays, participants use for free
- [x] Flywheel articulated — better UX → more signups → more sponsors → more events

### 1.2 Business Goals

**Primary goal:** Give hackathon organizers a tool to **manage a program of hackathons** — create and run multiple events, track participant history across events, build community around recurring hackathons.

**Production ROI unlock:**
1. Create and run a hackathon end-to-end (single event)
2. Organizer dashboard with event list (past/active/upcoming)
3. Participant returns to next event with existing profile

All 3 must work for the flywheel to spin. Point 1 is the MVP, but without 2-3 the platform is single-use.

**Secondary goal (example app):** Reference implementation for OM showing: Portal with multiple roles (participant/mentor/judge), real-time SSE (demo timer, live updates), stage machine with side effects, customer_accounts with invitation flow.

**What is NOT important:**
- Multi-org (multiple organizations on one instance) — single-org deployment
- Automated scheduling optimizer
- Marketplace of mentors/judges
- Paid registration / ticketing
- IDE / GitHub repos integration
- Video streaming of demos (assumes in-person)
- Advanced team-finding matching engine (v2)

#### Checklist
- [x] Primary goal stated with measurable outcome — manage hackathon program, run events end-to-end
- [x] Scope exclusions listed — multi-org, ticketing, streaming, scheduling, matching

### 1.3 Ubiquitous Language

| Term | Definition | Source | Period |
|------|-----------|--------|--------|
| **Competition** | A single hackathon event with configuration, participants, and phases | Admin creates | Event lifecycle |
| **Stage** | Phase of a competition (DRAFT->OPEN->TEAM_FORMATION->...->ARCHIVED) | Admin advances | Sequential |
| **Track** | Thematic category within a competition (e.g., "AI/ML", "Web3") | Admin creates | Per competition |
| **Team** | Group of participants working on a project. Min/max size from competition config | Participant creates | TEAM_FORMATION+ |
| **Project** | Team's submission: description, tech stack, URLs, screenshots | Auto-created at HACKING, team edits | HACKING+ |
| **Demo Session** | Presentation slot in the demo queue. Timer visible real-time to everyone | Generated at DEMOS | DEMOS |
| **Judge Panel** | Group of judges assigned to evaluate tracks | Admin creates | DEMOS+ |
| **Scoring Criterion** | Evaluation criterion with weight (e.g., "Innovation" 0-10, weight 30%) | Admin defines | Per competition |
| **People's Choice** | Participant voting for best project. N votes per person, no self-voting | Participants vote | Voting window |
| **Prize** | Award: track placement, special award, sponsor prize, people's choice | Admin assigns | FINISHED |
| **Incident Report** | Code of Conduct violation report. Can be anonymous | Any user | Anytime |
| **Check-in** | Confirming participant presence via QR code | QR scan / admin | Event day |

#### Checklist
- [x] Every domain term defined once
- [x] Same word = same meaning across all specs and conversations
- [x] Source of data and period specified per term

### 1.4 Domain Model

#### Competition Stage Machine

```
DRAFT -> OPEN -> TEAM_FORMATION -> TRACK_SELECTION -> HACKING -> DEMOS -> DELIBERATION -> FINISHED -> ARCHIVED
```

Transitions are sequential. Each stage change has side effects (e.g., HACKING->DEMOS: auto-publish projects, generate demo queue). Admin sees a preview of side effects before confirming.

#### Team Rules

- One participant = max one team per competition
- Min/max team size from competition config
- Team membership locks at HACKING stage
- Team owner can invite, others can send join requests
- Disqualified teams excluded from leaderboard

#### Judging Rules

- One score per judge per project per round
- Criteria with weights, weights sum to 100%
- Score = weighted average across criteria
- Judges can flag conflict of interest (recuse)
- Scores updatable until end of DELIBERATION
- Final leaderboard persisted at FINISHED

#### Voting Rules

- N votes per participant (configurable)
- Cannot vote for own team
- Votes must be cast within voting window
- People's Choice = separate prize category

#### Entity Fields

**Competition:**
- `name` (text, required), `slug` (text, required, unique), `description` (text)
- `location` (text), `startsAt` / `endsAt` (datetime, required), `timezone` (text, required)
- `stage` (select: DRAFT|OPEN|TEAM_FORMATION|TRACK_SELECTION|HACKING|DEMOS|DELIBERATION|FINISHED|ARCHIVED, required)
- `teamMinSize` / `teamMaxSize` (integer), `maxTeamsPerTrack` (integer)
- `demoConfig` (JSONB: durationSeconds, qaDurationSeconds, warningThresholds)
- `judgingConfig` (JSONB: rounds, enableFinalistSelection, finalistCount)
- `peerVotingConfig` (JSONB: maxVotesPerUser, allowVoteChange)
- `cocUrl` / `rulesUrl` / `privacyPolicyUrl` (text)

**Track:**
- `name` (text, required), `description` (text), `color` (text), `iconUrl` (text)
- `maxTeams` (integer), `order` (integer)
- `mentorIds` (JSONB array of CustomerUser UUIDs)
- `competitionId` (relation, required)

**Team:**
- `name` (text, required), `description` (text), `avatarUrl` (text)
- `status` (select: active|disqualified|withdrawn, required)
- `competitionId` (relation, required), `trackId` (relation)
- `presentationOrder` (integer), `isFinalist` (boolean), `tableNumber` (text)

**TeamMember:**
- `teamId` (relation, required), `customerUserId` (relation, required)
- `role` (select: owner|member, required), `joinedAt` (datetime), `leftAt` (datetime)
- Unique constraint: one team per user per competition

**TeamInvitation:**
- `teamId` (relation, required), `customerUserId` (relation, required)
- `type` (select: invite|join_request), `status` (select: pending|accepted|declined|expired|cancelled)
- `message` (text), `expiresAt` (datetime)

**Project:**
- `title` (text, required), `tagline` (text, max 140 chars), `description` (text)
- `problemStatement` (text), `solution` (text)
- `techStack` (JSONB array), `demoUrl` / `repoUrl` / `videoUrl` / `presentationUrl` (text)
- `status` (select: draft|published|under_review|scored, required)
- `usesPreexistingCode` (boolean), `preexistingCodeDescription` (text)
- `finalScore` (float), `peerVoteCount` (integer), `rank` (integer)
- `teamId` (relation, required), `competitionId` (relation, required)
- Unique constraint: one project per team per competition

**CompetitionParticipation:**
- `competitionId` (relation, required), `customerUserId` (relation, required)
- `role` (select: participant|mentor|judge, required)
- `checkedIn` (boolean), `cocAccepted` (boolean), `privacyPolicyAccepted` (boolean)
- `profileComplete` (boolean), `lookingForTeam` (boolean)

**ParticipantProfile:**
- `customerUserId` (relation, required, unique)
- `bio` (text), `organization` (text)
- `skills` (JSONB array), `socialLinks` (JSONB: github, linkedin, twitter, website)

**AgendaItem:**
- `competitionId` (relation, required)
- `title` (text, required), `description` (text)
- `type` (select: ceremony|talk|workshop|break|meal|deadline|demo_session|custom)
- `startsAt` / `endsAt` (datetime, required), `location` (text)
- `isMandatory` (boolean), `order` (integer), `trackId` (relation)

**Announcement:**
- `competitionId` (relation, required)
- `title` (text, required), `content` (text, required)
- `priority` (select: info|warning|urgent)
- `targetRoles` (JSONB array), `targetTrackIds` (JSONB array)
- `pinned` (boolean)

**DemoSession:**
- `projectId` (relation, required), `competitionId` (relation, required)
- `presentationOrder` (integer, required)
- `status` (select: queued|on_deck|presenting|qa|completed|skipped)
- `scheduledStart` (datetime), `actualStart` / `actualEnd` (datetime)
- `durationSeconds` / `qaDurationSeconds` (integer)

**JudgePanel:**
- `competitionId` (relation, required)
- `name` (text, required), `round` (select: preliminary|final)

**JudgingCriterion:**
- `competitionId` (relation, required)
- `name` (text, required), `description` (text)
- `maxScore` (integer, required), `weight` (float, required)
- `round` (select: preliminary|final|both)
- `trackId` (relation, null = all tracks), `order` (integer)

**ProjectScore:**
- `projectId` (relation, required), `judgeCustomerUserId` (relation, required), `round` (select, required)
- `totalScore` (float, computed), `comment` (text), `privateNotes` (text)
- `conflictOfInterest` (boolean), `isSubmitted` (boolean)
- Unique constraint: one score per judge per project per round

**CriterionScore:**
- `projectScoreId` (relation, required), `judgingCriterionId` (relation, required)
- `score` (integer, 0 to maxScore), `note` (text)

**Sponsor:**
- `competitionId` (relation, required)
- `name` (text, required), `tier` (select: title|gold|silver|partner|in_kind)
- `logoUrl` (text), `website` (text), `description` (text)
- `challengeTitle` (text), `challengeDescription` (text)

**Prize:**
- `competitionId` (relation, required)
- `name` (text, required), `description` (text)
- `category` (select: track_placement|special_award|sponsor_prize|peoples_choice)
- `trackId` (relation), `sponsorId` (relation)
- `value` (text), `rank` (integer), `iconUrl` (text)
- `winningProjectId` (relation), `winningTeamId` (relation), `awardedAt` (datetime)

**PeerVote:**
- `voterCustomerUserId` (relation, required), `projectId` (relation, required)
- `competitionId` (relation, required)
- Unique constraint: one vote per voter per project

**IncidentReport:**
- `competitionId` (relation, required)
- `reporterId` (relation, nullable for anonymous), `reportedUserId` (relation)
- `description` (text, required), `severity` (select: low|medium|high|critical)
- `status` (select: reported|under_review|resolved|dismissed)
- `adminNotes` (text), `resolution` (text)

#### Checklist
- [x] Domain entities identified with clear ownership
- [x] Domain rules documented — invariants, constraints, calculations
- [x] Access control rules documented — who sees/does what
- [x] Data ownership per entity — who creates, who reads, who updates, system vs user
- [x] Entity fields defined precisely — every entity has fields with type, constraints, required flag

---

## 2. Identity Model `Mat`

| Persona | Role key | Identity | Org scope | Sees | Does |
|---------|----------|----------|-----------|------|------|
| **Admin** | `superadmin` / `admin` | User (staff) | Tenant-wide | Backend panel | Creates competitions, manages participants/tracks/teams, controls demos, manages judging, assigns prizes, resolves incidents |
| **Participant** | `participant` | CustomerUser | Per competition (via CompetitionParticipation) | Portal | Creates/joins teams, edits projects, presents demos, votes People's Choice, reports incidents |
| **Mentor** | `mentor` | CustomerUser | Per competition, scoped to assigned tracks | Portal (limited) | Views teams/projects in assigned tracks (read-only in v1), reports incidents |
| **Judge** | `judge` | CustomerUser | Per competition, scoped to assigned JudgePanel | Portal (judging) | Scores projects on criteria, gives feedback, flags conflict of interest |

**Portal Decision Framework:**

```
External persona?
├─ Admin → NO → User + Backend + RBAC
├─ Participant → YES, needs custom UX (team mgmt, project editor, voting, live demo) → CustomerUser + Portal
├─ Mentor → YES, limited read-only view → CustomerUser + Portal
└─ Judge → YES, scoring UI (tappable buttons, split-screen) → CustomerUser + Portal
```

**Portal decision:** USED

**Portal persona justification:**

| Portal persona | Why Portal, not Backend? | Custom pages needed? |
|---|---|---|
| Participant | Needs team browser, project editor, voting, live demo viewer — none of these are CRM patterns | ~8 pages |
| Mentor | Read-only track overview, different from admin view | ~2 pages |
| Judge | Scoring UI with tappable number buttons, split-screen — custom UX, not DataTable | ~3 pages |

**Onboarding flow (all portal users):**
1. Admin creates CustomerUser (name, email, role) — individually or bulk CSV import
2. System sends invitation email (magic link)
3. User activates account, sets password, completes profile
4. Gate: CoC + privacy policy acceptance (blocks portal access)
5. Check-in via QR code (event day)

**Decision log:**
- Participant/Mentor/Judge as CustomerUser not User — they don't need backend, they need custom portal UX (timer, scoring, team browser). Backend doesn't have these building blocks.
- Mentor and Judge in same identity type (CustomerUser) with different roles — shared onboarding flow, different permissions per role.

#### Checklist
- [x] Every persona has ONE identity type — User or CustomerUser `Mat`
- [x] Identity decision justified per persona `Mat`
- [x] No persona has two accounts `Piotr`
- [x] Org scoping defined per role `Piotr`
- [x] Portal decision justified with decision tree `Mat`
- [x] Every portal persona has custom page estimate `Piotr`
- [x] §3.5 includes Portal Pages subsection with full page specs `Mat`

---

## 3. Workflows `Mat`

### WF1: Competition Setup

**Journey:** Admin creates competition -> configures tracks/criteria/sponsors -> imports participants -> opens registration

**ROI:** Foundation for everything. Without setup, nothing works.

**Key personas:** Admin

**Boundaries:**
- Starts when: Admin creates a new competition (DRAFT)
- Ends when: Competition in stage OPEN, participants invited
- NOT this workflow: Running the hackathon itself (WF2-WF5)

**Edge cases:**
1. Admin wants to copy config from previous hackathon -> v2, manual for now
2. Bulk CSV import with duplicate emails -> validation, skip existing
3. Participant invited but hasn't activated before event -> reminder email, admin sees status

### WF2: Team Formation & Track Selection

**Journey:** Participant creates/joins team -> team selects track -> membership locks at hacking start

**ROI:** Self-service team formation replaces manual coordination (spreadsheet, Slack). Organizer monitors progress instead of matchmaking.

**Key personas:** Participant, Admin (monitoring)

**Boundaries:**
- Starts when: Stage = TEAM_FORMATION
- Ends when: Stage -> HACKING (teams locked)
- NOT this workflow: Hacking, project, demo

**Edge cases:**
1. Participant can't find a team -> flags "looking for team", visible in team browser
2. Team below min size at HACKING -> admin sees warning, decides whether to allow
3. Participant wants to switch teams -> leave + join another, but only before lock
4. Solo participant -> optionally auto-assigned to solo "team" if config allows

### WF3: Hacking & Project Submission

**Journey:** Team gets draft project -> edits (description, tech stack, screenshots, URLs) -> submits before deadline

**ROI:** Structured submission instead of "send your link on Slack". Organizer sees progress in real-time.

**Key personas:** Participant (team), Admin (monitoring)

**Boundaries:**
- Starts when: Stage = HACKING, draft projects auto-created
- Ends when: Stage -> DEMOS, remaining drafts auto-published
- NOT this workflow: Demo presentation, judging

**Edge cases:**
1. Team didn't submit before deadline -> draft auto-published at stage change
2. Team wants to edit after submit -> locked, admin can unlock
3. Originality concern -> team declares pre-existing code, admin can flag
4. Auto-save failure -> client retries, conflict resolution via optimistic locking

### WF4: Demos & Live Judging

**Journey:** Demo queue generated -> admin controls timer -> judges score -> participants vote People's Choice

**ROI:** Key moment of the hackathon. Live timer + scoring in one platform instead of stopwatch + Google Sheet.

**Key personas:** Admin (demo control), Judge (scoring), Participant (watching + voting)

**Boundaries:**
- Starts when: Stage = DEMOS, queue generated
- Ends when: Stage -> DELIBERATION, voting closed
- NOT this workflow: Calculating results, assigning prizes

**Edge cases:**
1. Team no-show at demo -> admin skip, team gets score 0 or disqualified
2. Judge has conflict of interest -> flags, recuses from that project
3. Timer ends but team still presenting -> visual warning (red), admin decides
4. Internet drop during SSE -> client reconnect, catch up from server state
5. Judge didn't finish scoring -> admin nudge, sees progress in dashboard

### WF5: Results & Prizes

**Journey:** Admin reviews scores -> assigns prizes -> publishes results -> everyone sees leaderboard

**ROI:** Transparent results instead of "someone announces from stage". Participants see their scores and feedback.

**Key personas:** Admin, All (viewing results)

**Boundaries:**
- Starts when: Stage = DELIBERATION
- Ends when: Stage = FINISHED, results published
- NOT this workflow: Archiving, data retention

**Edge cases:**
1. Score tie -> admin manual rank override
2. Admin wants 2 rounds (preliminary -> finalists -> final) -> judgingConfig.rounds
3. Score anomaly (judge gave 0 to everyone) -> admin sees in dashboard, can intervene

#### Checklist (per workflow)
- [x] End-to-end journey — first touchpoint to value delivery `Mat`
- [x] Measurable ROI — specific metric that moves `Mat`
- [x] Boundaries — explicit start, end, and NOT-this-workflow `Mat`
- [x] 3-5 edge cases — high probability production scenarios `Mat`
- [x] Every step mapped to OM module `Piotr` — commit plans in `piotr-notes/commits-WF*.md`

#### Checklist (overall)
- [x] 5 core workflows defined `Mat`
- [x] No workflow requires >200 lines of new code — all leverage makeCrudRoute, portal auto-discovery, event subscribers `Piotr`

---

## 3.5 UI Architecture `Mat + Krug`

### Navigation (per role)

| Role | Sidebar groups | Notes |
|------|---------------|-------|
| **Admin** (Backend) | Competitions, Participants, Tracks, Teams, Projects, Demos & Judging, Sponsors & Prizes, Incidents, Check-In, Event Command Center | Competitions first — admin starts here. Participants added (Krug fix). Command Center last — monitoring, not setup. |
| **Participant** (Portal) | Dashboard, Competition, Agenda, Participants, Announcements, My Team, Browse Teams, My Project, Presentations, Vote, Results, Sponsors & Prizes | Stage-aware: items always visible, unavailable = disabled with tooltip |
| **Judge** (Portal) | Dashboard, Competition, Agenda, Announcements, Judging, Presentations, Results, Sponsors & Prizes | Judging is the primary item |
| **Mentor** (Portal) | Dashboard, Competition, Agenda, Announcements, Mentor Tracks, Results, Sponsors & Prizes | Read-only in v1 |

### Dashboard Widgets (per role)

| Widget | Roles | Data shown | Click-through |
|--------|-------|------------|---------------|
| **Your Current Task** | All portal | Stage-aware card: "what to do now" (e.g., "Form a team", "Submit project", "Score 3 remaining projects") | Link to relevant page |
| **Team Status** | Participant | Roster, track, missing members | My Team |
| **Project Status** | Participant | Draft/submitted, deadline countdown | My Project |
| **Scoring Progress** | Judge | X/Y projects scored, current presenter | Judging |
| **Track Overview** | Mentor | Teams/projects in assigned tracks | Mentor Tracks |
| **Next Agenda Item** | All portal | Next event with countdown | Agenda |
| **Event Command Center** | Admin | Traffic lights: check-in, teams, projects, judging, incidents | Per-section drill-down |

### Portal Pages

| Page | URL pattern | Portal role | Purpose | Stage gate |
|------|-----------|-------------|---------|------------|
| Competition Overview | `/portal/competition` | All | Description, rules, CoC, stage progress | Always |
| Agenda | `/portal/agenda` | All | Timeline with "now" indicator, filter by track | Always |
| Participants Directory | `/portal/participants` | All | Search/filter by skills, org, looking-for-team | Always |
| Announcements | `/portal/announcements` | All | Feed with priority (info/warning/urgent) | Always |
| My Team | `/portal/my-team` | Participant | Roster, pending join requests (incoming + outgoing), invitations, track selection | TEAM_FORMATION+ |
| Browse Teams | `/portal/teams` | Participant | Teams with spots, join request | TEAM_FORMATION, TRACK_SELECTION |
| My Project | `/portal/my-project` | Participant | Editor, submit, deadline countdown | HACKING+ |
| Presentations | `/portal/presentations` | All | Live queue, timer, current/on-deck | DEMOS+ |
| Kiosk View | `/portal/presentations/kiosk` | All (projector) | Full-screen timer, dark bg, auto-advance via SSE | DEMOS+ |
| Vote | `/portal/vote` | Participant | Grid of projects, vote/unvote, personal counter ("3 of 5 votes used") + per-project count | DELIBERATION (voting window = DELIBERATION stage) |
| Judging | `/portal/judging` | Judge | Assigned projects, scored/unscored | DEMOS+ |
| Score Card | `/portal/judging/:projectId` | Judge | Per-criterion scoring (tappable numbers), feedback, "Now Presenting" header from SSE | DEMOS+ |
| Mentor Tracks | `/portal/mentor-tracks` | Mentor | Tracks with teams/projects overview | Always |
| Results | `/portal/results` | All | Leaderboard, scores, prizes, feedback | FINISHED+ |
| Sponsors & Prizes | `/portal/sponsors` | All | Sponsor list, prize categories | Always |
| Profile | `/portal/profile` | All | Bio, skills, social links, organization | Always |
| My QR Code | `/portal/qr` | All | QR for check-in, full-screen | Always |
| Report Incident | Floating button (all pages) | All | Form with anonymous toggle | Always |

### Key User Flows

| Persona | Task | Flow | Clicks |
|---------|------|------|--------|
| Participant | Join a team | Dashboard -> "Your Task: Join a team" -> Browse Teams -> Join Request -> done | 3 |
| Participant | Submit project | Dashboard -> "Your Task: Submit project" -> My Project -> edit -> Submit -> done | 3 |
| Judge | Score a project | Dashboard -> "Score 3 remaining" -> Judging -> Score Card -> score -> Submit -> done | 3 |
| Admin | Advance stage | Command Center -> Competition -> Stage Control -> Preview -> Confirm -> done | 3 |
| Admin | Check-in participant | Backend -> Check-In -> Scan QR -> confirmed | 2 |

### Empty States

| Page/Widget | Empty state | Action |
|-------------|------------|--------|
| My Team | "You haven't joined a team yet" | Browse Teams / Create Team |
| Browse Teams | "No teams formed yet. Be the first!" | Create Team |
| My Project | "Your project will appear here when hacking starts" | -- (stage gate). After submit: status banner says "Submitted" (not "Published") |
| Judging | "No projects assigned yet" | -- (admin assigns panels) |
| Announcements | "No announcements yet. Check back later" | -- |
| Results (not finished) | "Results will be published after judging" | -- (stage gate) |
| Results (finished, computing) | "Results are being calculated..." | Spinner. Distinct from "not published" |

### UX Rules (Krug review)

**Admin backend:**
- Competitions first in sidebar — admin starts here, not Command Center (which is monitoring)
- "Participants" gets its own sidebar item (CSV import, participant list)
- Competition detail page shows "current competition" context — all sub-pages (Tracks, Teams, etc.) scope to selected competition
- Stage advance uses business language: "Open Registration" not "Advance to OPEN"
- "Publish Results" wired to stage advance DELIBERATION→FINISHED (same Stage Control panel)
- Demo Control page: "Open Kiosk" button that opens kiosk URL in new tab

**Portal:**
- "Your Current Task" widget always renders FIRST on dashboard (above fold on mobile)
- After join request: "Your Task" changes to "Waiting for Team X to accept" (prevents spam requests)
- My Team page shows incoming join requests for team owners (Krug blocker fix)
- Browse Teams: filter by track (dropdown), show team card with track + member count + skills wanted
- Submit dialog: "Submit project — your project will be locked for editing. Judges will see it." (explicit copy)
- Status labels use user language: DB "published" → UI "Submitted". DB "DELIBERATION" → UI "Judging in progress"
- Project submit: team owner only. Non-owners see read-only with "Only your team owner can submit"
- Deadline countdown escalation: color change at < 1 hour (yellow), < 15 min (red/pulsing)
- Auto-save error: red indicator "Unsaved — check your connection" when save fails
- Score Card: "Now Presenting: Team X" header from SSE (judge always knows which team is live)
- Demo Control keyboard: Ctrl+Space (not bare Space) to avoid browser scroll conflict
- Vote page: two separate counters — global "You used 3 of 5 votes" + per-card "12 votes"
- Results page: leaderboard highlights "your team" row
- Judge feedback visibility: `ProjectScore.comment` = public, `ProjectScore.privateNotes` = private, `CriterionScore.note` = private (never shown to teams)

**Notifications (Krug transition fixes):**
- Auto-published project: notify participant "Hacking ended — your project was submitted as-is"
- Stage change: participant-facing label in notification, not stage enum name

#### Checklist
- [x] Every persona has a defined login-to-primary-task flow `Mat`
- [x] Navigation grouping matches how users think about their work `Krug`
- [x] Dashboard widgets answer "what to do next" not just "data" `Krug`
- [x] Empty states are helpful, not blank pages `Krug`
- [x] Custom pages use OM patterns (makeCrudRoute, DataTable, CrudForm for backend; PortalCard, PortalPageHeader for portal) `Piotr`
- [x] Click count from login to primary task is <= 3 for each persona `Krug`
- [x] Every portal page specced in table with stage gate `Mat`
- [x] Real-time events mapped: Presentation Queue + Kiosk (demo timer SSE), My Team + Browse Teams (team member SSE), Announcements (announcement SSE) `Piotr`

---

## 4. Workflow Gap Analysis `Piotr`

> Piotr checkpoint complete. Upstream synced, platform capabilities verified against
> `customer_accounts`, `portal`, `events`, `core` AGENTS.md. All gaps are `app` scope —
> no upstream dependencies (`core-module` or `official-module`).
>
> Detailed commit plans saved to `piotr-notes/commits-WF*.md`.

### Gap Scoring — Atomic Commits

| Score | Meaning | Example |
|-------|---------|---------|
| 0 | Platform does it, zero commits | Portal shell, customer auth, SSE reconnect, RBAC guards |
| 1 | 1 commit: config/seed only | Customer roles in setup.ts, search config |
| 2 | 1-2 commits: small gap | Widget injection + i18n |
| 3 | 2-3 commits: medium gap | Entity + CRUD route + backend page |
| 4 | 3-5 commits: large gap | Multi-entity + pages + workflow definition |
| 5 | 5+ commits or external dependency | Demo timer SSE + kiosk + control panel |

### Platform capabilities used (score 0 — no commits needed)

| Capability | OM Module | HackOn usage |
|------------|-----------|--------------|
| Portal shell + layout | portal, ui/portal | PortalShell, PortalContext, PortalPageHeader, PortalCard, PortalEmptyState |
| Customer identity + RBAC | customer_accounts | 3 portal roles (participant, mentor, judge), two-tier ACL |
| Invitation flow | customer_accounts | Admin bulk invite, magic link, 72h TTL, auto-login on accept |
| SSE event bridge | events, ui/portal | portalBroadcast for demo timer, team events, announcements |
| Notification system | notifications | In-app + email for stage changes, invitations, results |
| File uploads | attachments | Project screenshots, presentation slides |
| CRUD route builder | core (makeCrudRoute) | All entity CRUD routes with query engine + openApi |
| Backend UI components | ui/backend | DataTable, CrudForm, FormHeader, RowActions |
| Auto-discovery | core | Frontend/backend pages, API routes, subscribers, workers |
| Event bus | events | Persistent subscribers for stage side effects |

### Per-Workflow Gap Matrix

#### WF1: Competition Setup — 18 atomic commits

| Step | OM Module | Gap | Scope | Commits | Notes |
|------|-----------|-----|-------|---------|-------|
| Module scaffold (acl, events, index, i18n) | core | Config | app | 1 | Standard module bootstrap |
| setup.ts (3 customer roles, features, seeds) | customer_accounts | Config | app | 1 | `seedDefaults` with `defaultCustomerRoleFeatures` |
| Competition entity + CRUD + commands | core | New entity | app | 3 | Entity, makeCrudRoute, undoable commands |
| Competition backend pages (list, create, edit) | ui/backend | New pages | app | 2 | DataTable + CrudForm |
| Track entity + CRUD + backend | core, ui/backend | New entity | app | 2 | Entity + CRUD, backend pages |
| JudgingCriterion entity + CRUD + backend | core, ui/backend | New entity | app | 2 | Weight validation in command layer |
| Sponsor + Prize entities + CRUD + backend | core, ui/backend | New entities | app | 2 | Two entities, one commit pair |
| Participant CSV import (API + worker) | customer_accounts | Extend | app | 2 | Worker calls existing invitation service |
| Stage advancement (preview + execute + UI) | — | Custom logic | app | 2 | Readiness checks, side effect preview |
| seedExamples (demo data) | core | Seed | app | 1 | Demo competition + tracks + criteria |

#### WF2: Team Formation — 12 atomic commits

| Step | OM Module | Gap | Scope | Commits | Notes |
|------|-----------|-----|-------|---------|-------|
| Team entity + CRUD + events | core | New entity | app | 2 | Entity + events declaration |
| TeamMember entity + CRUD | core | New entity | app | 1 | Unique per competition constraint |
| CompetitionParticipation "looking for team" | — | Extend | app | 1 | Boolean flag + API filter |
| TeamInvitation entity + CRUD | core | New entity | app | 1 | Invite/join_request flow |
| Team lockdown subscriber | events | Subscriber | app | 1 | Lock on stage→HACKING |
| ACL features + setup update | core | Config | app | 1 | Features for portal + admin |
| Admin backend: teams page | ui/backend | New page | app | 1 | DataTable + disqualify action |
| Portal: My Team | portal | Custom page | app | 1 | Roster, invitations, track select |
| Portal: Browse Teams | portal | Custom page | app | 1 | Team list, join request |
| Portal: Participants Directory | portal | Custom page | app | 1 | Search/filter by skills |
| SSE broadcast for team events | events | Subscriber | app | 1 | Real-time roster refresh |

#### WF3: Hacking & Submission — 11 atomic commits

| Step | OM Module | Gap | Scope | Commits | Notes |
|------|-----------|-----|-------|---------|-------|
| Project entity + validators + events + ACL | core | New entity | app | 3 | Entity, events, ACL+setup |
| Project CRUD API | core | New route | app | 1 | makeCrudRoute + /submit + /flag |
| Auto-create drafts subscriber (stage→HACKING) | events | Subscriber | app | 1 | Persistent, idempotent |
| Auto-publish drafts subscriber (stage→DEMOS) | events | Subscriber | app | 1 | Bulk promote remaining drafts |
| Portal: My Project (editor + auto-save) | portal | Custom page | app | 1 | Debounced auto-save, deadline countdown |
| Portal: attachment upload wiring | attachments | Extend | app | 1 | Uses existing /api/attachments |
| Admin backend: project management | ui/backend | New pages | app | 2 | DataTable + detail/flag page |
| i18n + module registration | — | Config | app | 1 | Final wiring |

#### WF4: Demos & Judging — 16 atomic commits

| Step | OM Module | Gap | Scope | Commits | Notes |
|------|-----------|-----|-------|---------|-------|
| DemoSession entity + CRUD + queue generation | core | New entity | app | 2 | Entity + generate endpoint |
| Demo timer state + control endpoints | — | Custom logic | app | 1 | Separate entity for mutable timer |
| SSE broadcast subscriber for timer | events | Subscriber | app | 1 | portalBroadcast timer updates |
| Backend: Demo Control page | ui/backend | New page | app | 1 | Queue reorder, timer, keyboard shortcuts |
| Portal: Presentation Queue | portal | Custom page | app | 1 | Live board with SSE |
| Portal: Kiosk View | portal | Custom page | app | 1 | Full-screen projector, reuses demo hook |
| JudgePanel + assignment entities + CRUD | core | New entities | app | 1 | 3 entities in one commit |
| JudgingCriterion entity + CRUD | core | New entity | app | 1 | Already scaffolded in WF1, extended here |
| ProjectScore + CriterionScore + scoring API | core | New entities | app | 1 | Unique constraints, weighted calc |
| Portal: Judging Dashboard | portal | Custom page | app | 1 | Assigned projects, progress indicator |
| Portal: Score Card | portal | Custom page | app | 1 | Tappable numbers, auto-save, conflict flag |
| Final score calculation worker | queue | Worker | app | 1 | Triggered by stage→FINISHED event |
| Backend: Judging management pages | ui/backend | New pages | app | 1 | Panels, criteria, progress, nudge |
| ACL + events + notifications wiring | core | Config | app | 1 | Consolidate all WF4 declarations |
| Integration tests | — | Tests | app | 1 | End-to-end WF4 coverage |

#### WF5: Results & Prizes — 8 atomic commits

| Step | OM Module | Gap | Scope | Commits | Notes |
|------|-----------|-----|-------|---------|-------|
| PeerVote entity + voting API | core | New entity | app | 2 | Entity + cast/retract with self-vote guard |
| Portal: Vote page | portal | Custom page | app | 1 | Project grid, X/N counter |
| Prize entity + CRUD + auto-suggest | core | New entity | app | 1 | Already in WF1, extended with assignment |
| Backend: prize management | ui/backend | New page | app | 1 | Table + auto-suggest button |
| LeaderboardEntry + score calc worker | queue | Worker | app | 1 | 70% judge / 30% peer vote weighting |
| Publish Results subscriber | events | Subscriber | app | 1 | stage→FINISHED triggers leaderboard |
| Portal: Results page | portal | Custom page | app | 1 | Leaderboard, prizes, feedback |

#### Cross-cutting — 9 atomic commits

| Step | OM Module | Gap | Scope | Commits | Notes |
|------|-----------|-----|-------|---------|-------|
| IncidentReport entity + CRUD | core | New entity | app | 2 | Entity + anonymous POST |
| Portal: floating incident button + form | portal | Custom widget | app | 1 | Persistent in portal shell |
| Backend: incident management | ui/backend | New page | app | 1 | Severity badges, resolution flow |
| Event Command Center backend | ui/backend | New page | app | 1 | Traffic lights, 30s auto-refresh |
| Search configuration | search | Config | app | 1 | Fulltext + token for 4 entity types |
| Notification types + subscribers | notifications | Config | app | 1 | results-published, incident-reported |
| i18n consolidation (en + pl) | — | Config | app | 1 | All keys across all modules |
| ACL + setup.ts + seedExamples | core | Config | app | 1 | Final consolidation, demo data |

### Gap Summary

| Workflow | Business Priority | Atomic Commits | Scope | Blocks ROI? |
|----------|------------------|----------------|-------|-------------|
| WF1: Competition Setup | Critical | 18 | All app | Yes |
| WF2: Team Formation | Critical | 12 | All app | Yes |
| WF3: Hacking & Submission | Critical | 11 | All app | Yes |
| WF4: Demos & Judging | Critical | 16 | All app | Yes |
| WF5: Results & Prizes | Critical | 8 | All app | Yes |
| Cross-cutting | Critical | 9 | All app | Yes |
| **Total** | | **74** | **All app** | |

**No upstream dependencies.** All 74 commits are `app` scope. Platform provides portal shell, customer auth, SSE, notifications, attachments, CRUD builder, event bus — zero platform changes needed.

#### Checklist
- [x] Every workflow step scored in atomic commits `Mat`
- [x] Piotr checkpoint: workflow-to-OM mapping verified — no module missed, no overengineering, commit plans saved `Piotr`

---

## 4.5 Module Architecture `Piotr`

### OM Core modules used

| Module | Usage | Extension points used | Notes |
|--------|-------|----------------------|-------|
| `customer_accounts` | Extend | Customer roles (participant/mentor/judge), invitation flow, portal auth, two-tier RBAC | 3 custom roles via `defaultCustomerRoleFeatures` in setup.ts |
| `portal` | Extend | Portal shell, dashboard widget injection, portal nav, SSE event bridge | Custom portal pages auto-discovered |
| `auth` | As-is | Staff authentication for admin | No extensions needed |
| `notifications` | Extend | Notification types for stage changes, invitations, results | Custom notification renderers |
| `audit_logs` | As-is | Audit trail for all CRUD operations | Auto via makeCrudRoute |
| `attachments` | As-is | File uploads for project screenshots | Used from portal via existing API |
| `events` | Extend | Persistent subscribers for stage side effects, SSE broadcast | portalBroadcast for demo timer |
| `search` | Extend | Fulltext search config for competitions, teams, projects, participants | search.ts per module |

### App modules

| Module | Responsibility | Entities owned | Notes |
|--------|---------------|----------------|-------|
| `competitions` | Hub entity, stage machine, participation, agenda, announcements, profiles | Competition, CompetitionParticipation, ParticipantProfile, AgendaItem, Announcement | 5 entities, largest module |
| `tracks` | Thematic categories within competition | Track | 1 entity, simple CRUD |
| `teams` | Team lifecycle, formation, invitations | Team, TeamMember, TeamInvitation | 3 entities, invitation flow |
| `projects` | Project submissions and management | Project | 1 entity, portal editor |
| `judging` | Scoring, demo queue, timer, panels | JudgePanel, JudgePanelJudge, JudgePanelTrack, JudgingCriterion, ProjectScore, CriterionScore, DemoSession | 7 entities, most complex module |
| `sponsors` | Partners, prizes, peer voting | Sponsor, Prize, PeerVote | 3 entities |
| `incidents` | CoC violation reporting | IncidentReport | 1 entity, anonymous support |

**7 app modules justified:** Each maps to a distinct bounded context with clear ownership. `judging` is the largest (7 entities) but splitting it would break the scoring transaction boundary. `competitions` has 5 entities but they share the competition lifecycle context.

#### Checklist
- [x] Every OM core module listed with explicit usage type (as-is / extend) and extension points `Piotr`
- [x] Every listed module traces to a user story or workflow `Piotr`
- [x] Reusability check: all modules are app-specific — no reusable pattern hidden `Piotr`
- [x] App module count justified — 7 modules with clear bounded contexts `Piotr`
- [x] No direct modification of core or official module code — extend only via UMES `Piotr`
- [x] Module boundaries align with bounded context boundaries `Vernon`

---

## 5. User Stories `Mat`

### WF1: Competition Setup

**US-1.1** As an admin, I create a new competition with name, dates, location, and team constraints so that I have a configured event ready to open for registration.
Success: Competition created in DRAFT stage. All config fields saved. Competition visible in backend list.

**US-1.2** As an admin, I define tracks with names, descriptions, and colors so that participants can choose their thematic category.
Success: Tracks created and visible in competition detail. Max teams per track enforced if set.

**US-1.3** As an admin, I define judging criteria with weights so that judges have a structured scoring framework.
Success: Criteria created with weights summing to 100%. Visible in judging config.

**US-1.4** As an admin, I add sponsors with tier levels and optional challenges so that sponsors are credited and their challenges are visible to participants.
Success: Sponsors visible on portal sponsors page. Challenge details shown if defined.

**US-1.5** As an admin, I import participants via CSV (name, email, role) so that I can onboard many users at once.
Success: CSV parsed, validated (duplicates skipped), CustomerUsers created, invitation emails sent. Import progress visible.

**US-1.6** As an admin, I advance the competition from DRAFT to OPEN so that invited participants can activate accounts and access the portal.
Success: Stage changed. Side effect preview shown before confirmation. Portal accessible to activated users.

### WF2: Team Formation & Track Selection

**US-2.1** As a participant, I create a team with a name and description so that others can find and join my team.
Success: Team created. I am the owner. Team visible in Browse Teams.

**US-2.2** As a participant, I browse teams and send a join request so that I can find a team that matches my skills.
Success: Join request sent. Team owner sees notification. I can cancel pending request.

**US-2.3** As a team owner, I accept or decline join requests and invite specific participants so that I build the right team.
Success: Accepted members appear in roster. Declined requests are resolved. Team size respects max constraint.

**US-2.4** As a participant without a team, I flag myself as "looking for team" so that team owners can find me.
Success: Flag visible in Participants Directory and Browse Teams "People Looking for Teams" section.

**US-2.5** As a team owner, I select a track for my team so that we're registered in a competition category.
Success: Track assigned. Team visible under that track. Track team count respects max if set.

### WF3: Hacking & Project Submission

**US-3.1** As a participant, I edit my team's project (title, description, tech stack, URLs, screenshots) so that our submission is complete.
Success: All fields saved. Auto-save every 30s. Attachment upload works.

**US-3.2** As a participant, I submit our project before the deadline so that it's included in demos and judging.
Success: Project status changes to PUBLISHED. Content locked. Submission timestamp recorded.

**US-3.3** As a participant, I declare originality (pre-existing code disclosure) so that the competition is fair.
Success: Originality fields saved. Admin can see disclosure. Flagged projects visible in admin view.

### WF4: Demos & Live Judging

**US-4.1** As a participant, I see the live presentation queue and timer so that I know when my team presents.
Success: Queue shows current, on-deck, and full list. Timer counts down in real-time via SSE. My team highlighted.

**US-4.2** As an admin, I control the demo timer (start, pause, skip, reorder) so that presentations run smoothly.
Success: Timer controls work. Changes broadcast to all connected clients via SSE. Keyboard shortcuts available.

**US-4.3** As a judge, I score a project on each criterion using tappable number buttons so that scoring is fast and precise.
Success: Per-criterion scores saved. Total auto-calculated. Can add written feedback and private notes. Auto-save on every field change.

**US-4.4** As a judge, I flag a conflict of interest so that I'm recused from scoring that project.
Success: Conflict flagged. Project removed from my scoring list. Admin notified.

**US-4.5** As a participant, I cast my People's Choice votes (up to N) so that my favorite projects get recognized.
Success: Votes cast. Counter shows X of N used. Cannot vote for own team. Can change votes within window.

### WF5: Results & Prizes

**US-5.1** As an admin, I review the scoring progress and leaderboard so that I can verify results before publishing.
Success: Leaderboard shows computed scores per track. Incomplete judge scores visible. Anomalies flagged.

**US-5.2** As an admin, I assign prizes to winning projects/teams so that awards are recorded.
Success: Prizes linked to projects/teams. Auto-suggestions based on rankings. Manual override possible.

**US-5.3** As a participant, I view the published results including my score breakdown and judge feedback so that I learn from the experience.
Success: Results page shows leaderboard, my team's scores per criterion, judge comments (not private notes), prizes.

### Default User Stories

**US-0.1** As a developer evaluating this ready app, I run `yarn initialize` and get pre-configured demo users with distinct roles so that I can log in and test every persona's experience without manual setup.
Success:
- Each role from §2 has at least one seeded user
- All demo users share a single known password logged to console at seed time
- Login with each demo user shows only the UI and data their role permits
- Seeding is idempotent — running `yarn initialize` twice does not create duplicates
- Demo user emails follow the pattern `{role}@demo.local`

**US-0.2** As a developer evaluating this ready app, I run `yarn dev` after `yarn initialize` and see realistic demo data (a competition in HACKING stage with teams, tracks, draft projects) so that I can understand the app's domain without reading source code.
Success:
- Demo competition with at least 3 tracks, 5 teams, and representative projects
- Teams span different states (full, looking for members, with/without track)
- Agenda items populated
- Demo data is visually distinguishable (names contain "Demo" marker)

#### Checklist (domain stories)
- [x] Every story has: persona + action + measurable outcome + success criteria
- [x] Every story traces to a workflow step — no orphan stories
- [x] Identity checkpoint per story — CustomerUser for portal, User for admin
- [x] No weak stories — vague verbs killed

#### Checklist (default stories)
- [x] US-0.1: Demo users seeded for every role in §2, idempotent, known password
- [x] US-0.2: Demo data covers major domain concepts with realistic values

---

## 6. User Story Gap Analysis `Piotr`

> Piotr checkpoint complete. Story-level gaps derived from workflow commit plans.
> All stories map to `app` scope commits — no upstream dependencies.

| Story | Platform Match | Atomic Commits | Notes |
|-------|---------------|----------------|-------|
| US-1.1 | makeCrudRoute + DataTable + CrudForm | 5 | Entity + CRUD + commands + backend pages |
| US-1.2 | makeCrudRoute + backend pages | 2 | Track entity + CRUD + pages |
| US-1.3 | makeCrudRoute | 2 | JudgingCriterion + weight validation |
| US-1.4 | makeCrudRoute + backend pages | 2 | Sponsor + Prize entities |
| US-1.5 | customer_accounts invitation service | 2 | CSV parser + worker |
| US-1.6 | Custom endpoint + events | 2 | Preview + execute + subscriber |
| US-2.1 | makeCrudRoute | 1 | Team entity (part of WF2-C1) |
| US-2.2 | Portal page | 1 | Browse Teams (WF2-C10) |
| US-2.3 | TeamInvitation entity | 1 | Accept/decline flow (WF2-C5) |
| US-2.4 | CompetitionParticipation extend | 1 | Boolean flag (WF2-C4) |
| US-2.5 | Portal page | 1 | Track select in My Team (WF2-C9) |
| US-3.1 | Portal page + attachments | 2 | Project editor + attachment upload |
| US-3.2 | Custom endpoint | 1 | Submit flow (status promotion) |
| US-3.3 | Entity fields | 0 | Originality fields in Project entity |
| US-4.1 | Portal page + SSE | 1 | Presentation Queue (WF4-C6) |
| US-4.2 | Backend page + SSE broadcast | 2 | Demo Control + timer SSE (WF4-C3,5) |
| US-4.3 | Portal page | 1 | Score Card (WF4-C12) |
| US-4.4 | Entity field | 0 | conflictOfInterest on ProjectScore |
| US-4.5 | Portal page + entity | 2 | PeerVote + Vote page (WF5-C1,3) |
| US-5.1 | Backend page + worker | 2 | Judging mgmt + score calc (WF4-C13,14) |
| US-5.2 | Backend page | 1 | Prize assignment (WF5-C5) |
| US-5.3 | Portal page | 1 | Results page (WF5-C8) |
| US-0.1 | setup.ts seedDefaults | 1 | Demo users (WF1-C2) |
| US-0.2 | setup.ts seedExamples | 1 | Demo data (CC-C9) |

#### Checklist
- [x] Every story mapped to specific OM module/mechanism with atomic commit estimate `Mat`
- [x] Piotr checkpoint: story-to-OM mapping verified — simplest solution for each story `Piotr`

---

## 7. Phasing & Rollout `Mat`

> Phasing logic: High business priority + Low gap = ship first.
> Every phase must deliver measurable business value.

### Phase 1: Foundation & Competition Shell

**Goal:** Admin can create a competition, import participants, and open registration. Participants can activate accounts, complete profiles, check in.

**Why this order:** Nothing works without the competition entity and participant onboarding.

| Story | What ships | Commits |
|-------|-----------|---------|
| US-1.1 | Competition entity + CRUD + backend | 7 |
| US-1.2 | Track entity + CRUD + backend | 2 |
| US-1.5 | Bulk CSV import | 2 |
| US-1.6 | Stage advance with side effect preview | 2 |
| US-0.1 | Demo users seeded | 1 |
| Cross | Portal shell, customer roles, CoC gate, QR check-in, agenda, announcements | 4 |

**Acceptance criteria:**

**Domain criteria** `Vernon`:
- [ ] Competition stage transitions are sequential — no skipping stages
- [ ] CompetitionParticipation unique per user per competition
- [ ] CoC + privacy policy gate blocks portal until both accepted

**Business criteria** `Mat`:
- [ ] Admin can create competition, add tracks, import participants via CSV
- [ ] Participant receives invitation, activates account, sees portal dashboard
- [ ] Check-in via QR code works end-to-end

**Value delivered:**
- **Business value:** Organizer can set up a hackathon and onboard participants. First time the platform replaces spreadsheet-based registration.
- **ROI metric:** Time to onboard 100 participants < 10 minutes (vs hours manually).

**Platform ROI:**
- Portal with customer_accounts invitation flow
- Stage machine pattern with side effect preview
- Bulk CSV import with validation
- **Copy test:** How to set up portal with multiple customer roles, stage-driven entity lifecycle

### Phase 2: Teams & Tracks

**Goal:** Participants can form teams, browse other teams, select tracks. Self-service team formation replaces manual coordination.

**Why this order:** Teams are prerequisite for projects. Must work before hacking starts.

| Story | What ships | Commits |
|-------|-----------|---------|
| US-2.1-2.5 | Team CRUD, invitations, join requests, track selection, "looking for team" | 11 |
| US-0.2 | Demo data with teams and tracks | 1 |

**Acceptance criteria:**

**Domain criteria** `Vernon`:
- [ ] One team per user per competition enforced
- [ ] Team size min/max from competition config respected
- [ ] Team membership locks at HACKING stage

**Business criteria** `Mat`:
- [ ] Participant can create team, invite others, select track
- [ ] Participant without team can flag "looking for team" and browse teams
- [ ] Admin sees team formation progress in backend

**Value delivered:**
- **Business value:** Self-service team formation. Organizer monitors instead of matchmaking.
- **ROI metric:** Zero manual team assignments needed by organizer.

**Platform ROI:**
- Portal custom pages with real-time data
- Event subscriber pattern (team lockdown on stage change)
- **Copy test:** How to build invitation/request flow with portal pages

### Phase 3: Hacking & Submissions

**Goal:** Teams edit and submit projects. Organizer sees submission progress.

**Why this order:** Projects are the deliverable. Needed before demos.

| Story | What ships | Commits |
|-------|-----------|---------|
| US-3.1-3.3 | Project entity + CRUD, portal editor, auto-save, submit flow, originality | 9 |
| Cross | Auto-create draft projects on HACKING, auto-publish on DEMOS | 2 |

**Acceptance criteria:**

**Domain criteria** `Vernon`:
- [ ] One project per team per competition enforced
- [ ] Published project content is locked (admin can override)
- [ ] Auto-create and auto-publish side effects are idempotent

**Business criteria** `Mat`:
- [ ] Team can edit project with all fields, upload screenshots, submit before deadline
- [ ] Admin sees submission progress (draft/submitted/flagged counts)

**Value delivered:**
- **Business value:** Structured project submission with deadline enforcement.
- **ROI metric:** 100% of projects collected in platform (vs scattered links in Slack).

**Platform ROI:**
- Attachment upload integration
- Stage-driven side effects (auto-create, auto-publish)
- **Copy test:** How to build a portal form with auto-save and file uploads

### Phase 4: Demos & Judging

**Goal:** Live demo presentations with timer. Judges score projects. Core value of the platform.

**Why this order:** Most complex phase. Depends on projects from Phase 3.

| Story | What ships | Commits |
|-------|-----------|---------|
| US-4.1-4.4 | Demo queue, timer + SSE, scoring, score card, conflict of interest | 12 |
| US-1.3 | Judging criteria (may move to Phase 1 if needed for setup) | 1 |
| Cross | Kiosk view, demo control backend, scoring progress dashboard | 3 |

**Acceptance criteria:**

**Domain criteria** `Vernon`:
- [ ] One score per judge per project per round enforced
- [ ] Scoring criteria weights sum to 100%
- [ ] Demo timer state broadcast to all clients via SSE
- [ ] Conflict of interest removes project from judge's list

**Business criteria** `Mat`:
- [ ] Admin can start, pause, skip demos with live timer visible to all
- [ ] Judge can score all assigned projects with tappable number buttons
- [ ] Kiosk view works on projector (full-screen, large timer)

**Value delivered:**
- **Business value:** Live demos and structured judging in one platform.
- **ROI metric:** Zero paper scorecards. Judge scores available in real-time.

**Platform ROI:**
- Real-time SSE with clientBroadcast + portalBroadcast
- Complex portal pages with split-screen scoring
- **Copy test:** How to build real-time features with OM's SSE event bridge

### Phase 5: Voting, Results & Prizes

**Goal:** People's Choice voting. Results calculated, published. Prizes assigned.

**Why this order:** Final phase — wraps up the event.

| Story | What ships | Commits |
|-------|-----------|---------|
| US-4.5 | People's Choice voting | 3 |
| US-5.1-5.3 | Leaderboard, prize assignment, results publication | 4 |
| US-1.4 | Sponsors (may move earlier) | 1 |

**Acceptance criteria:**

**Domain criteria** `Vernon`:
- [ ] No duplicate votes, no self-voting
- [ ] Final scores persisted at FINISHED (snapshot)
- [ ] Disqualified teams excluded from leaderboard

**Business criteria** `Mat`:
- [ ] Participants can vote for favorite projects (up to N)
- [ ] Admin can review scores, assign prizes, publish results
- [ ] Everyone sees leaderboard with scores and feedback after publication

**Value delivered:**
- **Business value:** Transparent, automated results. No manual score tallying.
- **ROI metric:** Results published within minutes of deliberation end (vs hours of spreadsheet tallying).

**Platform ROI:**
- Voting pattern with constraints
- Leaderboard computation and persistence
- **Copy test:** How to build a voting system with business rules on OM

### Phase 6: Incidents & Polish

**Goal:** Incident reporting. Event Command Center. Search. i18n. Mobile polish.

**Why this order:** Non-blocking quality layer. Event can run without it, but it's needed for production.

| Story | What ships | Commits |
|-------|-----------|---------|
| Cross | Incident reporting (portal + backend), Event Command Center, search config, i18n, mobile pass | 9 |

**Acceptance criteria:**

**Business criteria** `Mat`:
- [ ] Any user can report a CoC incident (optionally anonymous)
- [ ] Admin sees Event Command Center with traffic light indicators
- [ ] All user-facing strings are translatable (en + pl)

**Value delivered:**
- **Business value:** Production-ready hackathon platform with safety and observability.
- **ROI metric:** Organizer can run a 200-person hackathon without spreadsheets.

### Rollout Summary

```
Phase 1: Foundation & Competition Shell    18 commits    WF1
Phase 2: Teams & Tracks                   12 commits    WF2
Phase 3: Hacking & Submissions            11 commits    WF3
Phase 4: Demos & Judging                  16 commits    WF4
Phase 5: Voting, Results & Prizes          8 commits    WF5
Phase 6: Incidents & Polish                9 commits    Cross-cutting
                                          ---------
                                          74 atomic commits total
                                          65 commits for production-ready (Phases 1-5)
```

#### Checklist
- [x] Phases ordered by: business priority x gap score x blocker status
- [x] Each phase delivers complete, usable increment
- [x] Total atomic commits estimated per phase `Piotr`
- [x] Acceptance criteria per phase: Vernon wrote domain criteria, Mat wrote business criteria `Vernon + Mat`
- [x] Business value + ROI metric stated per phase
- [x] No artificial phases — every phase delivers measurable business value

---

## 8. Cross-Spec Conflicts `Mat`

| Conflict | Specs involved | Resolution |
|----------|---------------|------------|
| No conflicts identified yet | — | First app spec for HackOn |

#### Checklist
- [x] No conflicts — this is the initial app spec

---

## 9. Example App Quality Gate `Piotr`

**Platform patterns to demonstrate:**
- Portal with 3 customer roles (participant, mentor, judge) and role-based nav/content
- Real-time SSE: demo timer with clientBroadcast + portalBroadcast
- Stage machine with sequential transitions and side effects
- customer_accounts: invitation flow, magic link auth, CoC/privacy gates
- Bulk CSV import with validation and progress
- Event subscribers for stage-driven automation (lock teams, auto-create projects)
- Widget injection for dashboard customization per role

**Anti-patterns to avoid:**
- Building custom auth instead of using customer_accounts invitation/magic link flow
- Building custom real-time instead of using OM's SSE DOM Event Bridge
- Custom state machine library instead of stage field with transition commands
- Leaving scaffold boilerplate modules (example/, empty dirs) from create-mercato-app
- Leaving unused modules in modules.ts
- Copying platform helpers locally instead of importing from @open-mercato
- Creating app-local Playwright config instead of using mercato test CLI
- Seeding org-scoped users without UserAcl.organizationsJson restriction

#### Checklist
- [x] Platform features demonstrated
- [x] Anti-patterns explicitly listed
- [ ] Every piece of new code passes the "copy test" `Piotr` [PENDING — verify during implementation]
- [ ] Scaffold boilerplate removed `Piotr` [PENDING — verify during implementation]

---

## 10. Open Questions `Mat`

| # | Question | Options | Impact | Owner | Status |
|---|----------|---------|--------|-------|--------|
| 1 | Should mentor role have active features in v1 (session requests) or read-only? | A) Read-only (current), B) Session requests | 2-3 commits if B | Mat | DECIDED: A, defer to v2 |
| 2 | Single-round or two-round judging in v1? | A) Single round only, B) Support both | 3-4 extra commits if B | Mat | OPEN |
| 3 | Should competition archiving trigger GDPR data anonymization automatically? | A) Manual, B) Automatic after retention period | 2-3 commits if B | Mat | OPEN |
| 4 | Kiosk view — separate URL or same portal with ?mode=kiosk? | A) Separate portal page, B) Query param mode | Minimal diff | Mat | DECIDED: A, separate page at `/portal/presentations/kiosk`. Demo Control page gets "Open Kiosk" button (Krug) |
| 5 | When does voting window open? | A) DEMOS stage, B) DELIBERATION stage | Defines Vote page gate | Mat | DECIDED: B, voting = DELIBERATION. WF4 ends at DELIBERATION, voting is part of that stage (Krug blocker fix) |
| 6 | Who can submit a project? | A) Team owner only, B) Any team member | UX clarity for non-owners | Mat | DECIDED: A, team owner only. Non-owners see read-only with explanation (Krug) |
| 7 | Is CriterionScore.note visible to teams? | A) Public, B) Private | Trust/safety for judges | Mat | DECIDED: B, private. Only ProjectScore.comment is public feedback (Krug) |

#### Checklist
- [x] Every question has: options, impact, owner, status
- [ ] No BLOCKER question unresolved before its phase starts
- [x] Decided questions have rationale recorded

---

## Production Readiness `Mat`

| Workflow | Deployable | Blocker | What client would say |
|----------|-----------|---------|----------------------|
| WF1: Competition Setup | After Phase 1 | None | "I can set up an event and invite people" |
| WF2: Team Formation | After Phase 2 | Phase 1 | "Teams form themselves, I just watch" |
| WF3: Hacking & Submission | After Phase 3 | Phase 2 | "All projects collected in one place" |
| WF4: Demos & Judging | After Phase 4 | Phase 3 | "Live timer and scoring, no paper needed" |
| WF5: Results & Prizes | After Phase 5 | Phase 4 | "Results published in minutes, not hours" |
| Full event | After Phase 5 | Phase 4 | "We ran the whole hackathon on this" |
| Production-grade | After Phase 6 | Phase 5 | "Safe, translated, mobile-friendly" |

#### Checklist
- [x] Each workflow assessed: deployable or not
- [x] "What would client say?" test
- [x] No workflow stops midway

---

## Changelog

### 2026-03-23
- Initial app spec created from business analysis of HackOn technical spec (comerito/om-hackathon-starter)
- §1-§3.5 drafted (Mat) and approved
- §5 User Stories, §7-§10 drafted (Mat)
- §4 Gap Analysis, §4.5 Module Architecture, §6 Story Gap Analysis completed (Piotr)
- 74 atomic commits across 6 phases, all `app` scope — zero upstream dependencies
- Commit plans saved to `piotr-notes/commits-WF*.md`
- §3.5 Krug review completed — 7 blockers fixed, UX rules added:
  - Admin sidebar reordered (Competitions first, not Command Center)
  - "Participants" added to admin sidebar
  - My Team shows incoming join requests for team owners
  - Voting window defined: DELIBERATION stage
  - Judge Score Card shows "Now Presenting" from SSE
  - "Publish Results" wired to stage advance
  - Results page: separate "calculating" loading state
  - Resolved open questions: kiosk URL, voting window, submit ownership, feedback visibility
