# Unify Add Agency & Add User UX Flows

## TLDR
**Key Points:**
- The "Add Agency" and "Add User" creation flows are inconsistent — different form components, different post-creation UX, different credential handoff patterns
- Unify both to use OM-standard components (`CrudForm`, `DataTable`) with a shared credential banner pattern — both flows redirect to list with banner after creation

**Scope:**
- Convert Add Agency page to `CrudForm`, redirect to list with credential banner after creation
- Convert Add User dialog to `CrudForm` with `embedded={true}` (already stays on list)
- Convert Agencies list from raw `<table>` to `DataTable` with credential banner support
- Extract reusable `CredentialBanner` component used by both flows

## Overview

Two creation flows in the partnerships module — "Add Agency" and "Add User" — were built independently and diverge in every UX dimension: form component (raw HTML vs. raw HTML in dialog), post-creation behavior (in-place replacement vs. banner above list), and navigation target (button to list vs. stay on list). The Agencies list page also uses a raw `<table>` instead of `DataTable`.

This spec aligns both flows with OM backend conventions:
- `CrudForm` for all forms
- `DataTable` for all lists
- Consistent post-creation UX: both flows land on the list page with a credential banner

## Problem Statement

1. **No `CrudForm` usage** — Both forms use raw `<input>`/`<select>` elements, missing built-in validation UX, keyboard shortcuts, consistent styling, and custom field injection points
2. **Inconsistent post-creation UX** — Add Agency replaces the form with an invite card in-place; Add User closes a dialog and shows a floating banner above the list
3. **Raw `<table>` on agencies list** — Missing search, filters, sorting, pagination, row actions, and export — all standard DataTable features

## Proposed Solution

### Design Decisions
| Decision | Rationale |
|----------|-----------|
| Keep Add Agency as full page | Complex operation (org + user + tier + demo data, 4 fields + checkbox) warrants a dedicated page |
| Keep Add User as dialog | Simple form (2 fields: email + role) scoped to selected org — pragmatic exception to full-page rule, uses `CrudForm embedded={true}` |
| Both flows land on list with credential banner | Simplest consistent pattern. User creates entity → redirects/stays on list → credential banner above DataTable. Same UX for both. |
| Shared `CredentialBanner` component | Both flows need credential handoff. One component, one pattern, consistent UX |

## User Stories

- **PM** wants to **add a new agency and see the invite credentials on the list page** so that **they can copy and share login details with the agency admin**
- **PM** wants to **add a user to an agency and see the invite credentials on the list page** so that **they can copy and share login details with the new user**
- **PM** wants to **browse agencies with search, filters, and sorting** so that **they can quickly find and manage agencies at scale**

## Architecture

### Component Structure

```
src/modules/partnerships/
├── components/
│   └── CredentialBanner.tsx              ← NEW: shared credential banner
├── backend/partnerships/
│   ├── agencies/
│   │   ├── page.tsx                      ← MODIFY: raw table → DataTable + credential banner
│   │   ├── page.meta.ts                  (unchanged)
│   │   └── add/
│   │       ├── page.tsx                  ← MODIFY: raw form → CrudForm
│   │       └── page.meta.ts             (unchanged)
│   └── users/
│       ├── page.tsx                      ← MODIFY: raw dialog form → CrudForm embedded
│       └── page.meta.ts                 (unchanged)
```

### Data Flow — Add Agency

```
PM clicks "Add Agency" on agencies list
  → /backend/partnerships/agencies/add (CrudForm page)
  → Submits form
  → POST /api/partnerships/agencies → 201 { organizationId, inviteMessage, ... }
  → flash("Agency Created", "success")
  → router.push(`/backend/partnerships/agencies?credentials=${encodeURIComponent(inviteMessage)}`)
  → Agencies list page loads, reads `credentials` from URL searchParams
  → CredentialBanner renders above DataTable (dismissible, with copy button)
```

### Data Flow — Add User

```
PM clicks "Invite User" on users list
  → UserDialog opens (CrudForm embedded={true})
  → Submits form
  → POST /api/auth/users → 201 { id }
  → flash("User created", "success")
  → Dialog closes, credential message passed to parent via state
  → CredentialBanner renders above DataTable (dismissible, with copy button)
  → User list reloads
```

## UI/UX

### 1. CredentialBanner (shared component)

```tsx
// Props: { message: string; onDismiss: () => void }
// Renders: monospace pre block + "Copy Invite Message" button + "Dismiss" button
// Same visual as current implementations, just extracted
```

### 2. Add Agency Page (CrudForm)

**Fields:**
| Field ID | Label | Type | Required | Notes |
|----------|-------|------|----------|-------|
| `agencyName` | Agency Name | `text` | Yes | placeholder: "e.g. Acme Digital" |
| `adminEmail` | Admin Email | `text` (email) | Yes | placeholder: "admin@agency.com" |
| `initialTier` | Initial Tier | `select` | Yes | options from `TIER_THRESHOLDS`, default: "OM Agency" |
| `seedDemoData` | Seed Demo Data | `checkbox` | No | default: `true` |

**Groups:**
| Group ID | Title | Column | Fields |
|----------|-------|--------|--------|
| `details` | Agency Details | 1 | `agencyName`, `adminEmail` |
| `options` | Options | 1 | `initialTier`, `seedDemoData` |

**Post-submit:** `flash("Agency Created", "success")` → `router.push('/backend/partnerships/agencies?credentials=...')`

### 3. Agencies List (DataTable + CredentialBanner)

**Credential banner:** Reads `credentials` from `useSearchParams()` on mount. If present, shows `CredentialBanner` above DataTable. Dismissing clears the param from URL (via `router.replace` without the param). This matches the Add User flow where credential banner is shown above the users DataTable.

**Columns:**
| Column | Header | Cell | Sortable |
|--------|--------|------|----------|
| `name` | Agency | Text (font-medium) | Yes |
| `currentTier` | Current Tier | Text, "No tier" fallback | Yes |
| `validUntil` | Review Date | Date + ReviewBadge (expiring/overdue) | Yes |
| `adminEmail` | Admin Email | Text, "—" fallback | No |
| `wipCount` | WIP | Number, right-aligned | Yes |

**Filters:**
| Filter ID | Label | Type | Options |
|-----------|-------|------|---------|
| `reviewStatus` | Review Status | `select` | All, Expiring, Overdue |

**Row actions:**
| Action | Label | Type |
|--------|-------|------|
| `changeTier` | Change Tier | `onSelect` → opens existing `ChangeTierDialog` |

**Actions slot:** "Add Agency" button linking to `/backend/partnerships/agencies/add`

### 5. User Dialog (CrudForm embedded)

Convert existing `UserDialog` to use `CrudForm` with `embedded={true}`.

**Fields:**
| Field ID | Label | Type | Required |
|----------|-------|------|----------|
| `email` | Email | `text` | Yes |
| `roleId` | Role | `select` | Yes |
| `resetPassword` | Reset password | `checkbox` | No (edit mode only) |

**Groups:**
| Group ID | Title | Column | Fields |
|----------|-------|--------|--------|
| `details` | — | 1 | `email`, `roleId`, (conditionally `resetPassword`) |

## API Contracts

No API changes required. All existing endpoints are reused:
- `GET /api/partnerships/agencies` — list agencies (already returns all needed data)
- `POST /api/partnerships/agencies` — create agency (already returns `organizationId` + `inviteMessage`)
- `GET /api/partnerships/agency-users?organizationId=...` — list users for an agency
- `POST /api/auth/users` — create user
- `PUT /api/auth/users` — update user

## Internationalization (i18n)

New keys needed:
```json
{
  "partnerships.agencies.list.filterReviewStatus": "Review Status",
  "partnerships.credential.copyButton": "Copy Invite Message",
  "partnerships.credential.dismissButton": "Dismiss",
  "partnerships.credential.copied": "Credentials copied to clipboard"
}
```

Existing keys reused where possible. All new keys follow `partnerships.*` namespace.

## Implementation Plan

### Phase 1: Shared CredentialBanner Component
1. Create `src/modules/partnerships/components/CredentialBanner.tsx` — extract from existing `users/page.tsx` banner, accept `{ message, onDismiss }` props
2. Add i18n keys for copy/dismiss buttons

### Phase 2: Convert Add Agency to CrudForm
1. Rewrite `src/modules/partnerships/backend/partnerships/agencies/add/page.tsx`:
   - Replace raw form with `CrudForm`
   - Define fields array with `agencyName`, `adminEmail`, `initialTier`, `seedDemoData`
   - Define groups array
   - `onSubmit`: call existing `POST /api/partnerships/agencies`, then `flash()` + `router.push('/backend/partnerships/agencies?credentials=...')`
   - Remove in-place success card rendering
2. Verify form works end-to-end

### Phase 3: Convert Agencies List to DataTable + CredentialBanner
1. Rewrite `src/modules/partnerships/backend/partnerships/agencies/page.tsx`:
   - Replace raw `<table>` with `DataTable`
   - Define columns (name, tier, review date, admin email, WIP)
   - Add review status filter
   - Add row actions (change tier)
   - Keep existing `ChangeTierDialog` (already works)
   - Move "Add Agency" button to `actions` slot
   - Read `credentials` from `useSearchParams()`, show `CredentialBanner` above DataTable when present
   - On dismiss: `router.replace('/backend/partnerships/agencies')` to clear param
2. Remove manual filter buttons

### Phase 4: Convert User Dialog to CrudForm Embedded
1. Rewrite `UserDialog` in `src/modules/partnerships/backend/partnerships/users/page.tsx`:
   - Replace raw form with `CrudForm embedded={true}` inside existing `Dialog`
   - Define fields array with `email`, `roleId`, conditionally `resetPassword`
   - Handle credential generation in `onSubmit`
   - Keep keyboard shortcuts (Cmd+Enter, Escape)
2. Replace inline `CredentialBanner` with shared component from Phase 1
3. Verify create and edit modes work

### File Manifest

| File | Action | Phase | Purpose |
|------|--------|-------|---------|
| `src/modules/partnerships/components/CredentialBanner.tsx` | Create | 1 | Shared credential handoff banner |
| `src/modules/partnerships/backend/partnerships/agencies/add/page.tsx` | Modify | 2 | Raw form → CrudForm |
| `src/modules/partnerships/backend/partnerships/agencies/page.tsx` | Modify | 3 | Raw table → DataTable + credential banner |
| `src/modules/partnerships/backend/partnerships/users/page.tsx` | Modify | 4 | Raw dialog → CrudForm embedded |
| `src/i18n/en.json` | Modify | 1-4 | New i18n keys |

## Risks & Impact Review

### Data Integrity Failures
- No new write operations introduced. All mutations use existing API endpoints unchanged.
- Credentials passed via URL param from Add Agency → list page are ephemeral and contain a temporary password that must be changed on first login.

### Cascading Failures & Side Effects
- None. This is a pure frontend refactor. No backend changes, no new events, no new API endpoints.

### Tenant & Data Isolation Risks
- No new data loading. All existing endpoints are already tenant-scoped.

### Migration & Deployment Risks
- No database migrations. No breaking API changes. No new pages requiring `yarn generate`.
- Zero downtime deployment.

### Risk Register

#### Credential exposure via URL param
- **Scenario**: Temporary password passed via `?credentials=` URL param (Add Agency → agencies list) could appear in browser history
- **Severity**: Low
- **Affected area**: Agencies list URL after creation
- **Mitigation**: (1) Password is temporary and must be changed on first login, (2) banner dismissal clears param via `router.replace`, (3) existing flow already shows the same credential in-place
- **Residual risk**: Browser history may retain the URL briefly. Acceptable because the password is temporary.

#### CrudForm field type limitations
- **Scenario**: `CrudForm` checkbox field type may not match current raw checkbox styling exactly
- **Severity**: Low
- **Affected area**: Add Agency form — "Seed Demo Data" checkbox
- **Mitigation**: Use `type: 'custom'` with a custom component if native checkbox field type is insufficient
- **Residual risk**: Minor visual difference. Acceptable.

## Final Compliance Report — 2026-04-02

### AGENTS.md Files Reviewed
- `AGENTS.md` (root — standalone app conventions)

### Compliance Matrix

| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| root AGENTS.md | Use `CrudForm` for all forms | Compliant | Phase 2 + 4 convert raw forms to CrudForm |
| root AGENTS.md | Use `DataTable` for tabular data | Compliant | Phase 3 converts raw table to DataTable |
| root AGENTS.md | `flash()` for notifications | Compliant | Already used, maintained |
| root AGENTS.md | i18n for all user-facing strings | Compliant | All new strings use i18n keys |
| root AGENTS.md | `requireAuth` + `requireFeatures` on pages | Compliant | Existing pages unchanged |

### Internal Consistency Check

| Check | Status | Notes |
|-------|--------|-------|
| UI uses shared primitives | Pass | CrudForm, DataTable, CredentialBanner, flash |
| i18n keys planned | Pass | All new strings listed |
| No API changes needed | Pass | Frontend-only refactor |
| Consistent post-creation UX | Pass | Both flows: list page + credential banner |

### Verdict
- **Fully compliant**: Approved — ready for implementation

## Implementation Status

| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| Phase 1 — CredentialBanner | Done | 2026-04-02 | Shared component extracted |
| Phase 2 — Add Agency CrudForm | Done | 2026-04-02 | Raw form → CrudForm, redirect to list with ?credentials= |
| Phase 3 — Agencies DataTable | Done | 2026-04-02 | Raw table → DataTable, credential banner from URL param |
| Phase 4 — User Dialog CrudForm | Done | 2026-04-02 | Raw dialog → CrudForm embedded, shared CredentialBanner |

Branch: `feature/unify-create-flows-ux` (worktree: `.worktrees/unify-create-flows`)

## Changelog
### 2026-04-02
- Initial specification
- Simplified: removed agency detail page, both flows land on list with credential banner
- Implementation complete: all 4 phases done, TypeScript passes
