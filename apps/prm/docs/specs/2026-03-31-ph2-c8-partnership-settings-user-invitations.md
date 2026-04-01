# Phase 2, Commit 8: Partnership Settings Users — Discoverable Agency User Management on Top of Auth

## Source
- App Spec sections: §1.4.3 (Business Rules), §2 (Identity Model), §3.5 (Navigation, Custom Pages, Key User Flows), §7 (Acceptance Criteria)
- User stories: US-1.4, US-1.5, US-1.7
- Commit plan: `commits-WF1.md`, Commit 8

## What This Delivers
After this commit, Agency Admins and Partnership Managers have a dedicated PRM entrypoint at `Settings > Users` for agency user management: list, invite, edit, and delete for users with roles `partner_admin`, `partner_member`, and `partner_contributor`. The page is a discoverable wrapper around the existing auth user-management capability, not a replacement for it: it reuses `auth` list/create/update/delete APIs, keeps App Spec role capabilities intact, and adds app-level guardrails so Agency Admins are always limited to their own organization and the three allowed agency roles. PMs use an explicit agency selector on the page, so the flow does not depend on the current org switcher state. After successful creation or password reset, the page shows the same kind of copyable credential handoff used by `Add Agency`: a ready-made message for email/chat containing login email, temporary password, and login path.

## Acceptance Criteria
**Domain (Vernon):**
- [ ] Agency Admin can only assign roles `partner_member`, `partner_contributor`, `partner_admin` to users in their own org. The `partnership_manager` role is reserved for PM and cannot be assigned by agency users.
- [ ] Agency data is isolated — no cross-org visibility for agency users.
- [ ] Admin can do everything BD can, but BD cannot do what Admin does (user management).

**Business (Mat):**
- [ ] Agency Admin sees `Settings` grouped as `Agency Profile`, `Case Studies`, `Users`.
- [ ] Admin opens user management in the backend and creates a BD account so that someone can start building pipeline.
- [ ] Admin opens user management in the backend and creates a Contributor account so that their code contributions are tracked under the agency.
- [ ] Onboarding checklist item links for `Invite BD` and `Invite Contributor` lead to the relevant page.

## Files
| File | Action | Purpose |
|------|--------|---------|
| `src/modules/partnerships/api/interceptors.ts` | Modify | Add PRM guardrails on top of existing auth routes. For `partner_admin`, force `/api/auth/users` reads/writes to the actor's org, reject any assigned role outside `partner_admin`, `partner_member`, `partner_contributor`, and block unsafe mutations such as deleting users outside the actor org. Narrow `/api/auth/roles` results to the same three agency roles so raw auth create/edit screens stay safe if opened directly. |
| `src/modules/partnerships/backend/partnerships/users/page.meta.ts` | Create | Register PRM `Settings > Users` page as the discoverable agency-user-management entrypoint. Base guard uses existing auth features, and the page degrades by sub-capability: list requires `auth.users.list`, invite requires `auth.users.create`, edit actions require `auth.users.edit`, delete actions require `auth.users.delete`. |
| `src/modules/partnerships/backend/partnerships/users/page.tsx` | Create | Render a PRM-scoped agency-user-management page: current agency members list filtered to agency roles, invite form limited to the three agency roles, own-org behavior for Agency Admin, explicit agency selector for PM, row actions for edit and delete. Submit via existing `/api/auth/users` route, link edit actions to existing auth edit flow or an embedded equivalent, and show a copyable post-create or password-reset credential message mirroring `Add Agency`. |
| `src/modules/partnerships/api/get/onboarding-status.ts` | Modify | Change checklist links for `invite_bd` and `invite_contributor` from raw auth screens to `/backend/partnerships/users`. |
| `src/modules/partnerships/i18n/en.json` | Modify | Add page labels, role help text, explicit PM agency-selector copy, validation errors, and empty-state text for the PRM wrapper page. |
| `src/modules/partnerships/api/__tests__/auth-user-guardrails.test.ts` | Create | Unit coverage for role filtering and org-scope enforcement implemented in the interceptor helpers. |
| `src/modules/partnerships/__integration__/TC-PRM-007.spec.ts` | Modify | Cover the PRM `Settings > Users` entrypoint and the raw-auth guardrails that backstop it. |

## OM Patterns Used
- Pattern: Settings page metadata — Reference: `apps/prm/src/modules/partnerships/backend/partnerships/agency-profile/page.meta.ts`, `apps/prm/src/modules/partnerships/backend/partnerships/case-studies/page.meta.ts`
- Pattern: App-level auth route guardrails via API interceptors — Reference: `$OM_REPO/AGENTS.md` Task Router (`api/interceptors.ts`) and PRM `src/modules/partnerships/api/interceptors.ts`
- Pattern: Reuse existing auth CRUD/API instead of cloning it — Reference: [`packages/core/src/modules/auth/backend/users/page.tsx`](/Users/maciejgren/Documents/OM-PRM/open-mercato/packages/core/src/modules/auth/backend/users/page.tsx), [`packages/core/src/modules/auth/backend/users/create/page.tsx`](/Users/maciejgren/Documents/OM-PRM/open-mercato/packages/core/src/modules/auth/backend/users/create/page.tsx), [`packages/core/src/modules/auth/api/users/route.ts`](/Users/maciejgren/Documents/OM-PRM/open-mercato/packages/core/src/modules/auth/api/users/route.ts)
- Pattern: UI package conventions (`Button`, `CrudForm`, `DataTable`, settings navigation) — Reference: [`packages/ui/AGENTS.md`](/Users/maciejgren/Documents/OM-PRM/open-mercato/packages/ui/AGENTS.md)

## Implementation Notes
- This commit must **not** remove `auth.users.*` from `partner_admin` or `auth.*` from `partnership_manager`. App Spec §2 defines those capabilities and this spec stays within that ceiling.
- This commit must **not** introduce custom `agency-users` or `agency-user-invitations` APIs. OM already provides auth list/create APIs; the app-specific work here is discoverability plus guardrails.
- PRM `Settings > Users` is the preferred, guided entrypoint for agency onboarding and day-2 agency user management. Raw auth user pages remain available for parity with App Spec and PM's broader auth responsibilities.
- The PRM page itself only offers the three agency roles. `partnership_manager` is outside this flow even for PM; PM keeps broader auth powers through the raw auth surface.
- The page must degrade cleanly by auth sub-capability. If a role has `auth.users.list` but not `auth.users.create`, the list still renders and invite CTA does not. If a role lacks `auth.users.edit` or `auth.users.delete`, the corresponding row actions are omitted rather than rendered and failing later.
- For Agency Admin, org scope is derived from the authenticated actor and is never editable in the PRM page. The auth-route interceptor must enforce the same rule for direct raw-auth requests.
- For PM, org targeting is explicit in the PRM page via an agency selector. Do **not** require the PM to switch org first. App Spec §1.4.3 says PM writes are global actions attributed to agencies, not writes scoped by the currently selected org in switcher.
- Edit scope for agency users in this commit: update email, reset password by setting a new temporary password, and change role within `partner_admin`, `partner_member`, `partner_contributor`.
- Agency Admin must not be able to reassign a user to another organization, assign `partnership_manager`, or edit/delete users outside their own organization.
- Delete scope in this commit: delete agency-role users within the currently targeted org (platform uses hard-delete with command-bus undo support). Add explicit business guardrails: no self-delete for the current actor and no deleting the last remaining `partner_admin` in the organization.
- UX/UI should mirror `Add Agency` whenever credentials are newly generated: after successful creation or password reset, show a copyable ready-made message with email, temporary password, and login URL/path rather than only a generic success flash. Direct email invitation delivery remains the separate Phase 4 upgrade path via SPEC-038.
- Temporary passwords are sensitive. They must never be written to logs, audit payloads, or list responses, and must only be shown once in the immediate success state after create/password reset.
- No new persistence model, cache layer, or background worker is introduced in this commit. Existing auth storage, pagination, and command routes remain the execution path; app code only constrains scope and discoverability.

## Testing

### Unit Tests
- `restrictAgencyUserRoles` — filters role options to `partner_admin`, `partner_member`, `partner_contributor` for `partner_admin`
- `resolveAgencyUserScope` — returns actor org for `partner_admin`; preserves explicit target org for PM
- `guardAgencyUserMutation` — rejects `partnership_manager` assignment and foreign-org writes for `partner_admin`
- `guardAgencyUserListQuery` — rewrites raw `/api/auth/users` query to actor org for `partner_admin`
- `guardAgencyUserDelete` — rejects self-delete, cross-org delete, and delete of the last remaining `partner_admin` in the org
- `buildCredentialHandoffMessage` — returns the same message shape used by `Add Agency`, including login email, temporary password, and login path

### Integration Test Scenarios
| ID | Type | Scenario | Expected Result |
|----|------|----------|-----------------|
| T1 | UI | Agency Admin opens `/backend/partnerships/users` | Page renders under `Settings`, shows existing agency users, invite form offers only `partner_admin`, `partner_member`, `partner_contributor` |
| T2 | UI/API | Agency Admin creates user with role `partner_member` from PRM page | `201`, user created in Admin's org, visible in PRM list, and success state shows copyable credential handoff message |
| T3 | UI/API | Agency Admin creates user with role `partner_contributor` from PRM page | `201`, user created in Admin's org, Contributor can log in and reach scoped dashboard |
| T4 | UI/API | Agency Admin edits an existing `partner_member` from PRM flow | Email or role is updated within the same org; role picker still offers only the three agency roles |
| T5 | UI/API | Agency Admin resets a user's password from PRM flow | Save succeeds and success state shows copyable credential handoff message with the new temporary password |
| T6 | UI/API | Agency Admin deletes an agency user from the same org | Confirm dialog appears, delete succeeds, user disappears from PRM list |
| T7 | API | Agency Admin submits `partnership_manager` to raw `/api/auth/users` | `403` or `422`, no user created or updated |
| T8 | API | Agency Admin submits another organization ID to raw `/api/auth/users` | Request is rejected or rewritten to Admin's org; no user is created or moved outside Admin's org |
| T9 | API | Agency Admin loads raw `/api/auth/users` without organization filter | Response contains only users from Admin's org |
| T10 | API | Agency Admin tries to delete self or the last remaining `partner_admin` in the org | `403` or `422`, no deletion occurs |
| T11 | UI/API | PM opens PRM page, selects an agency org, edits or invites `partner_admin` | Page works without org-switcher dependency and user remains scoped to the selected agency |
| T12 | UI | PM opens PRM page with no agency selected yet | Empty state asks to choose a target agency; no misleading switcher requirement |
| T13 | UI | BD opens `/backend/partnerships/users` | No menu item or `403`; BD cannot manage users |
| T14 | UI | Onboarding checklist links for `Invite BD` and `Invite Contributor` open `/backend/partnerships/users` | Guided onboarding lands on the PRM entrypoint |

## Verification
```bash
cd apps/prm
yarn typecheck
yarn build
yarn test
yarn test:integration
```

Check after verification:
- `Settings > Users` is visible for Agency Admin and PM, but not for BD or Contributor.
- Agency Admin can create, edit, and delete only `partner_admin`, `partner_member`, `partner_contributor`, always within their own org.
- PM can target any agency from the PRM page without depending on the currently selected org in switcher.
- Raw auth user APIs remain the implementation base; the PRM page does not duplicate user CRUD routes.
- Post-create and password-reset UX mirrors `Add Agency`: operator gets a copyable credential message with email and temporary password for out-of-band sharing.
- Self-delete and deleting the last remaining `partner_admin` are blocked.
- Onboarding checklist links for `Invite BD` and `Invite Contributor` open `/backend/partnerships/users`.

## Implementation Checklist

### `/src/modules/partnerships/api/interceptors.ts`
- Add auth-route matching for `/api/auth/users` `GET|POST|PUT|DELETE` and `/api/auth/roles` `GET`.
- For `partner_admin`, rewrite auth user list/detail queries to actor org and agency-role subset before handler execution.
- For `partner_admin`, reject create/update payloads that contain:
  - `organizationId` outside actor org
  - any role outside `partner_admin`, `partner_member`, `partner_contributor`
- For `partner_admin`, reject delete when target user:
  - is outside actor org
  - is the current actor
  - is the last remaining `partner_admin` in the org
- For role-option queries, narrow visible roles to the three agency roles when actor is `partner_admin`.
- Keep PM path pass-through except for PRM page-driven agency targeting rules handled in UI.
- Add/extend helper functions so unit tests can cover scope rewrite, role filtering, delete guardrails, and last-admin detection independently.

### `/src/modules/partnerships/backend/partnerships/users/page.meta.ts`
- Register page under Settings navigation with PRM naming and icon conventions matching existing settings pages.
- Use base auth feature guard sufficient to enter the page; rely on in-page capability checks for invite/edit/delete affordances.
- Ensure breadcrumb and grouping are consistent with `Agency Profile` and `Case Studies`.

### `/src/modules/partnerships/backend/partnerships/users/page.tsx`
- Build agency selector for PM and fixed-org context for `partner_admin`.
- Load current agency users via existing auth list API, filtered to selected org and agency roles.
- Render `DataTable` with stable columns: email, role(s), organization name where useful, and row actions.
- Render invite flow using existing auth create API with three allowed roles only.
- Render edit flow using existing auth update API or an embedded edit state that stays inside this page; do not branch into a second bespoke backend CRUD surface.
- Render delete flow with shared confirm dialog.
- Show copyable credential handoff panel after create and password reset, using the same message shape as `Add Agency`.
- Hide invite/edit/delete actions when actor lacks `auth.users.create`, `auth.users.edit`, or `auth.users.delete`.
- Handle PM empty state when no target agency is selected yet.

### `/src/modules/partnerships/api/get/onboarding-status.ts`
- Update `invite_bd` and `invite_contributor` checklist destinations to `/backend/partnerships/users`.
- Keep completion logic unchanged; only adjust link target and any related labels if needed.

### `/src/modules/partnerships/i18n/en.json`
- Add Settings page title/group labels.
- Add agency role labels/help copy for the invite/edit UI.
- Add PM agency-selector labels and empty-state copy.
- Add validation/guardrail messages for forbidden role assignment, foreign-org mutation, self-delete, and last-admin delete block.
- Add credential-handoff helper copy and copy-to-clipboard success/error messages.

### `/src/modules/partnerships/api/__tests__/auth-user-guardrails.test.ts`
- Cover org-scope rewrite for auth user list/detail requests by `partner_admin`.
- Cover role filtering for auth role options.
- Cover create/update rejection for forbidden roles and foreign-org payloads.
- Cover delete rejection for self-delete, cross-org delete, and last-admin delete.

### `/src/modules/partnerships/__integration__/TC-PRM-007.spec.ts`
- Cover Admin list/invite/edit/delete happy paths from `/backend/partnerships/users`.
- Cover PM selected-agency happy path without org-switcher dependency.
- Cover blocked behaviors: forbidden role assignment, foreign-org mutation, self-delete, last-admin delete.
- Verify checklist links land on the PRM users page.

## Risks & Impact Review
| Risk | Severity | Impact | Mitigation | Residual Risk |
|------|----------|--------|------------|---------------|
| Agency Admin reaches raw auth routes and sees/modifies users outside own org | High | Tenant/org isolation breach | Interceptors rewrite auth user list/query scope to actor org and reject cross-org create/update/delete attempts | Low — depends on interceptor coverage staying complete for all relevant methods |
| Agency Admin escalates privileges by assigning `partnership_manager` | High | Unauthorized PM capability grant | Role options and mutation guards both restrict agency flow to `partner_admin`, `partner_member`, `partner_contributor` | Low |
| PRM page renders actions the actor cannot actually execute | Medium | Broken UX, confusing permissions | Page degrades by `auth.users.list/create/edit/delete` sub-capabilities and hides unavailable actions | Low |
| Credential handoff leaks temporary passwords via logs or later reloads | High | Credential exposure | Temporary password shown only in immediate success state, excluded from logs/responses beyond that state, never recoverable from list view | Medium — operator can still mishandle copied credentials out-of-band |
| Agency loses administrative access by deleting the last `partner_admin` | High | Organization becomes unmanaged | Delete guard blocks removing the last remaining `partner_admin` in the targeted org | Low |
| User deletes own account accidentally | Medium | Session/ownership disruption | Delete guard blocks self-delete in PRM flow and on raw auth delete path for agency admins | Low |

## Review
### Review — 2026-03-31
- **Reviewer**: Codex using `spec-writing` skill
- **Security**: Passed with changes — added temp-password handling, org/role guardrails, self-delete and last-admin protections
- **Performance**: Passed — no new heavy query path; existing auth pagination retained
- **Cache**: N/A — no new cache layer or invalidation path introduced
- **Commands**: Passed with changes — spec now states reuse of existing `auth.users.create/update/delete` commands rather than parallel mutations
- **Risks**: Passed with changes — added concrete risks, mitigations, and residual risk
- **Verdict**: Approved

## Final Compliance Report — 2026-03-31

### AGENTS.md Files Reviewed
- [`AGENTS.md`](/Users/maciejgren/Documents/OM-PRM/open-mercato/AGENTS.md)
- [`packages/core/src/modules/auth/AGENTS.md`](/Users/maciejgren/Documents/OM-PRM/om-claude-plugin/om-reference/packages/core/src/modules/auth/AGENTS.md)
- [`packages/ui/AGENTS.md`](/Users/maciejgren/Documents/OM-PRM/om-claude-plugin/om-reference/packages/ui/AGENTS.md)
- [`writing-specs.md`](/Users/maciejgren/Documents/OM-PRM/ready-apps/docs/agent-guides/writing-specs.md)

### Compliance Matrix
| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| `writing-specs.md` | One spec = one atomic commit | Compliant | Commit 8 stays within one app-level page + interceptor slice |
| `writing-specs.md` | Acceptance criteria come from App Spec | Compliant | Acceptance criteria remain copied from App Spec user-management and onboarding flow |
| root `AGENTS.md` | API routes MUST export `openApi` | Compliant | Spec reuses existing auth routes that already export `openApi`; no new custom routes added |
| root `AGENTS.md` | No direct ORM relationships between modules | Compliant | Spec adds no new entities or cross-module ORM links |
| root `AGENTS.md` | Validation with Zod | Compliant | Existing auth routes remain the write path; spec adds interceptor-level guardrails, not ad-hoc persistence |
| auth `AGENTS.md` | Use `requireFeatures` and feature-based access control | Compliant | Spec now states page/action degradation by `auth.users.list/create/edit/delete` sub-capabilities |
| ui `AGENTS.md` | Use shared UI patterns | Compliant | Spec uses `DataTable`, `CrudForm`, and existing auth edit flow patterns |

### Internal Consistency Check
| Check | Status | Notes |
|-------|--------|-------|
| Data models match API contracts | Pass | No new data model; existing auth user model is reused |
| API contracts match UI/UX section | Pass | UI now explicitly maps to existing auth list/create/update/delete APIs |
| Risks cover all write operations | Pass | Create, update, delete, and password-reset handoff covered |
| Commands defined for all mutations | Pass | Mutations reuse existing auth commands |
| Cache strategy covers all read APIs | N/A | No new cache strategy introduced |

### Non-Compliant Items
- None

### Verdict
- **Fully compliant**: Approved — ready for implementation
