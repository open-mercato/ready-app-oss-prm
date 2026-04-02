# App Spec Revision — PM Scoping, WIP Qualification, Data Access Model

**Date**: 2026-04-02
**Status**: Draft — pending review
**Supersedes**: Sections of SPEC-053b related to PM visibility, WIP computation, and UI/UX
**Context**: Integration test failures exposed undefined PM scoping behavior. Root cause: no spec for what PM sees depending on org context. This revision defines the model.

---

## 1. Problem Statement

The current spec says PM has `partnerships.manage` feature guard but never defines:
- What org context PM operates in
- How PM accesses agency data (org switcher? dedicated API? drill-down?)
- Which pages are program-level vs org-scoped
- How WIP is qualified beyond "deal in SQL stage"
- How WIP connects to License Deal attribution

This causes:
- Inconsistent page behavior (some pages show all orgs, some show nothing)
- Integration test failures (makeCrudRoute defaults to home org)
- No governance on WIP quality (BD drags deal to SQL, instant WIP credit)
- No traceability from WIP prospect to signed license

---

## 2. Identity & Scoping Model

### 2.1 Core Principle

**Every user belongs to their own organization(s). Org switcher shows only what you belong to.** PM belongs to one org (OM Backoffice) — just like any normal user. PM does not "belong to" partner agencies.

### 2.2 Key Insight: PM IS an Agency

PM's org (OM Backoffice) is itself an agency in the program. PM has the same agency pages as everyone else (Agency Settings, Case Studies, Users) plus additional program management pages. PM is not a special floating role — PM is an agency with extra capabilities.

### 2.3 Scoping Rules

| Role | `organizationsJson` | Org switcher | Behavior |
|------|---------------------|--------------|----------|
| `agency_admin` (1 org) | `[orgId]` | Hidden (1 org) | Normal user |
| `agency_admin` (2+ orgs) | `[orgA, orgB]` | Visible | Switches between own orgs |
| `agency_business_developer` | `[orgId]` | Hidden | Normal user |
| `agency_developer` | `[orgId]` | Hidden | Normal user |
| `partnership_manager` | `[homeOrgId]` | Hidden (1 org) | Normal user + program pages |

### 2.4 PM Data Access — Two Layers

**Layer 1: Standard CRUD (org-scoped)**
PM uses standard `makeCrudRoute` pages in their home org. CRM (deals, companies, people), Agency Settings, Case Studies, Users — all scoped to PM's own org. Works out of the box, zero custom logic.

**Layer 2: Dedicated PRM APIs (feature-guarded, cross-org)**
Program management pages (Agencies, WIP Scores, WIC Scores, MIN - Licenses, RFP Campaigns) use purpose-built PRM endpoints that:
- Require specific PRM features (e.g., `partnerships.agencies.manage`)
- Accept explicit `organizationId` parameter where needed
- Are read-only with respect to agency data (PM creates program records, not agency records)
- Never use org switcher or `makeCrudRoute` scoping

---

## 3. WIP Qualification Model (replaces "deal in SQL stage = WIP")

### 3.1 Current Problem

WIP is auto-stamped when deal moves to SQL stage. No proof of qualification. BD can drag deal to SQL and get instant WIP credit. At hundreds of agencies this is ungovernable.

### 3.2 New Definition

> **WIP**: A prospect is a verified contact with a confirmed problem, the budget to fix it, and a clear decision timeline — validated through a documented qualification conversation.

### 3.3 WIP Registration Conditions (all required, AND logic)

| # | Condition | Source | Who |
|---|-----------|--------|-----|
| 1 | Qualification checklist — all 4 checkboxes checked | Custom fields on deal | BD fills in |
| 2 | Qualification notes — all 4 text fields non-empty | Custom fields on deal | BD fills in |
| 3 | Qualification metadata filled (method + date) | Custom fields on deal | BD fills in |

Pipeline stage is **not** a WIP condition. A deal in any stage (or even closed) counts as WIP if the checklist is complete. The checklist is the source of truth — it proves that a real qualification conversation happened.

`WIP Registered At` auto-stamps **when all conditions are met.** Once stamped, it is immutable.

`wip_qualification_date` determines **which month** the WIP counts toward in KPI scoring. WIP Scores month selector filters by this date, not by `wip_registered_at`.

### 3.4 Qualification Checklist (custom fields on Deal entity)

**Checklist items (boolean + text pairs):**

| Checkbox field | Notes field | What BD confirms |
|---|---|---|
| `wip_contact_verified` | `wip_contact_notes` | Decision maker identified and contacted |
| `wip_problem_confirmed` | `wip_problem_notes` | Prospect has a confirmed problem |
| `wip_budget_confirmed` | `wip_budget_notes` | Budget exists and is allocated |
| `wip_timeline_confirmed` | `wip_timeline_notes` | Decision timeline is defined |

**Metadata fields:**

| Field | Type | Purpose |
|---|---|---|
| `wip_qualification_method` | Select: Call / Video / On-site | How the qualification conversation happened |
| `wip_qualification_date` | Date | When the conversation happened |
| `wip_registered_at` | DateTime (auto) | System stamp — when all conditions met |

### 3.5 Custom Fields Removed from Deal

The following generic custom fields are removed — they served no PRM purpose:

- `competitive_risk`
- `implementation_complexity`
- `estimated_seats_licenses`
- `requires_legal_review`

### 3.6 Anti-Gaming

No input-level blocking. Self-correcting governance:
- Agency has many WIPs but zero license conversions → visible in tier review data
- PM addresses quality in tier governance conversation
- Tier benefits depend on WIP-to-license conversion, not just WIP count

---

## 4. PM Sidebar / Navigation

PM sees the same sidebar structure as any agency user, plus program management items.

### 4.1 Sidebar Layout

```
CRM
  Companies
  Deals
  People

Partnerships (program — PM only)
  Agencies
  WIP Scores
  WIC Scores
  MIN - Licenses
  RFP Campaigns
  Tier Review

Settings (agency — same as everyone)
  Agency Profile
  Case Studies
  Users

Dashboard (top)
  Program-level widgets for PM
  Agency-level widgets for agency users
```

### 4.2 Naming Changes

| Before | After | Reason |
|--------|-------|--------|
| License Deals | MIN - Licenses | Aligns with KPI terminology |
| My WIC | WIC Scores | Consistent with WIP Scores naming |

---

## 5. WIP Scores Page

### 5.1 Purpose

Dedicated read-only view of WIP declarations across agencies. Replaces the need for PM to access agency CRM.

### 5.2 UI Pattern

Same pattern as WIC Scores:
- **Month selector** in top-right corner
- **List view**: one row per agency, showing aggregated WIP score for selected month
- **Click row** → detail view showing individual WIP deals for that agency in that month

### 5.3 List View Columns

| Column | Source |
|--------|--------|
| Agency | Organization name |
| WIP Score | Count of qualified WIPs in selected month (checklist complete) |
| Pending | Count of deals with checklist started but incomplete |

### 5.4 Detail View (after clicking an agency row)

Shows individual deals that contribute to that agency's WIP score:

| Column | Source |
|--------|--------|
| Deal | Deal title |
| Company | Company linked to deal |
| Contact | Primary contact on deal |
| Checklist | 4/4, 2/4, etc. |
| Qualification Method | Call / Video / On-site |
| Qualification Date | Date of conversation |
| WIP Registered At | Auto-stamp (null if incomplete) |

### 5.5 Visible to

| Role | What they see |
|------|---------------|
| `partnership_manager` | All agencies, list + detail |
| `agency_admin` / `agency_business_developer` | Own agency only (no list, straight to detail) |

### 5.6 API

`GET /api/partnerships/wip-scores?month=YYYY-MM`
- Feature: `partnerships.wip.view`
- PM: returns all orgs (cross-org, feature-guarded)
- Agency: returns own org only

`GET /api/partnerships/wip-scores/:organizationId?month=YYYY-MM`
- Feature: `partnerships.wip.view`
- Returns individual deals for the agency in that month

### 5.7 Informational Banner (agency users)

> "To register a WIP, add a deal to the PRM pipeline, complete the qualification checklist, and move the deal to SQL stage."

---

## 6. WIP → License Traceability

PM uses WIP Scores as reference when creating MIN - Licenses. License Deal has field `referringAgencyId` — PM looks up which agency brought the prospect and assigns credit manually. No automatic mapping.

---

## 7. Changes to Existing Setup

### 7.1 `partnership_manager` Role — `organizationsJson`

**Before**: `null` (unrestricted — sees all orgs in switcher)
**After**: `[homeOrgId]` (belongs to own org — normal user)

### 7.2 WIP Interceptor — Registration Logic

**Before**: Stamp `wip_registered_at` when deal moves to SQL+ stage
**After**: Stamp `wip_registered_at` when all 4 checkboxes checked AND all 4 notes non-empty AND qualification method + date filled. Pipeline stage is irrelevant — checklist is the source of truth. Stamp triggers on `entities/records` PUT/PATCH when checklist completes. Old `wip-stamp-after` interceptor on pipeline stage change is removed.

### 7.3 Custom Fields on Deal

**Remove**: `competitive_risk`, `implementation_complexity`, `estimated_seats_licenses`, `requires_legal_review`
**Add**: `wip_contact_verified`, `wip_contact_notes`, `wip_problem_confirmed`, `wip_problem_notes`, `wip_budget_confirmed`, `wip_budget_notes`, `wip_timeline_confirmed`, `wip_timeline_notes`, `wip_qualification_method`, `wip_qualification_date`

### 7.4 License Deal Entity

**Rename**: "License Deals" → "MIN - Licenses" (UI only, entity name unchanged)
**Add field**: `referringAgencyId` (UUID, nullable) — which agency brought the prospect

### 7.5 Sidebar Rename

- "My WIC" → "WIC Scores"
- "License Deals" → "MIN - Licenses"

---

## 8. Phasing

### Phase 1: PM is a Normal User

**Goal**: PM belongs to one org, sees their own CRM, has agency pages like everyone else. Program pages use dedicated APIs. No org switcher confusion.

| Change | Type |
|--------|------|
| PM `organizationsJson: [homeOrgId]` instead of `null` | Setup/seed + migration |
| PM gets agency pages (Settings, Case Studies, Users) in own org | Already works — just needs correct org scoping |
| Program pages (Agencies, RFP, Tier Review) use dedicated PRM APIs — verify they don't depend on org switcher | Audit + fix where needed |
| MIN - Licenses page uses dedicated PRM API — verify no `makeCrudRoute` org dependency | Audit + fix |
| WIC Scores (rename from My WIC) — verify works for PM in own org context | Audit |
| Sidebar renames: My WIC → WIC Scores, License Deals → MIN - Licenses | UI |
| WIP Scores page — list view (month selector, agency + score per row, click → detail) | New page + API |
| WIP qualification custom fields on Deal (4 checkboxes + 4 notes + method + date) | Seed |
| Remove unused Deal custom fields | Seed |
| WIP interceptor — stamp on checklist completion (decoupled from pipeline stage) | Code |
| License Deal `referringAgencyId` field | Entity + migration |
| Fix integration tests to align with new model | Tests |
| Remove `pm-crm-readonly` interceptor — PM never accesses agency CRM | Delete |

**Exit criteria**: PM logs in, sees one org (own), has CRM + agency settings + program pages in sidebar. WIP Scores shows cross-org data via dedicated API. WIP requires qualification. All integration tests pass.

### Phase 2: Agency Drill-Down

**Goal**: PM can inspect agency details from agencies list.

| Change | Type |
|--------|------|
| `/agencies/[id]` detail page — profile, users, case studies (read-only) | New page |
| Dedicated API for agency detail data | API |

**Exit criteria**: PM clicks agency in list → sees profile, users, case studies. Read-only. No org switching.

---

## 9. UX Review Findings

### 9.1 BD Qualifies WIP — Deal Form Guidance (FRICTION)

BD opens deal detail and sees checklist fields but no context for what "WIP qualification" means or why to fill it in.

**Fix:** Inject a `Notice` component above the WIP checklist fields via widget injection (`crud-form:customers:customer_deal:fields`):

> "Complete this checklist to register a WIP. Each item requires confirmation from a direct conversation with the prospect."

### 9.2 BD Qualifies WIP — No Feedback After Stamp (FRICTION)

BD saves deal with completed checklist but gets no confirmation that WIP was registered.

**Fix:** After save, if WIP just got registered, show `flash('WIP registered successfully')`. If checklist is partial, show `flash('WIP checklist updated — 2 of 4 items complete', 'info')`.

### 9.3 WIP Scores Detail — Show Pending + Qualified (OK)

Detail view shows all deals for the agency in selected month — both qualified and pending. Status column uses badges:
- **Qualified** (green badge) — all conditions met, `wip_registered_at` stamped
- **Missing data** (yellow badge) — checklist started but incomplete

### 9.4 MIN - Licenses Form — Two Agency Fields (FRICTION, resolved)

License deals have two distinct agency references:
- **License Owner** (`organizationId`) — which organization owns the license
- **Referred By Agency** (`referringAgencyId`) — which agency brought the prospect

These are often different. Labels on form: "License Owner" and "Referred By Agency".

### 9.5 Sidebar KPI Naming (POLISH, resolved)

Three KPI items in Partnerships sidebar group use consistent naming:
- WIP Scores
- WIC Scores
- MIN - Licenses

---

## 10. Resolved Questions

1. **Multi-agency admin**: Admin with 2+ orgs uses org switcher to switch between own agencies. WIP Scores shows data for currently selected org. Standard OM behavior, no custom logic.

2. **PM's own agency on Agencies list**: Yes — PM's org appears on the list like any other agency. PM is an agency, no reason to hide. Keeps the system simple, zero filtering exceptions.
