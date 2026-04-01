# Commit Plan: WF1 — Agency Onboarding

## Commit 1: Seed roles, dictionaries, pipeline stages, company profile fields, wip_registered_at
- Scope: app
- Pattern: setup.ts seed — defaultRoleFeatures + seedDefaults
- Files: `src/modules/partnerships/setup.ts`, `src/modules/partnerships/acl.ts`
- Delivers: Roles (partner_admin, partner_member, partner_contributor, partnership_manager), 6 dictionaries, PRM pipeline stages, 13 company profile custom fields, wip_registered_at deal field
- Depends on: none
- Phase: 1

## Commit 2: Seed case study custom entity (19 fields, minimum required validation)
- Scope: app
- Pattern: setup.ts seed — entities module custom entity definition
- Files: `src/modules/partnerships/setup.ts`
- Delivers: Case study entity with all 19 fields, minimum required validation (title, industry, technologies, budget_bucket, duration_bucket)
- Depends on: Commit 1
- Phase: 1

## Commit 3: WIP interceptor — stamp wip_registered_at on first SQL stage transition
- Scope: app
- Pattern: UMES API interceptor on deal PATCH
- Files: `src/modules/partnerships/api/interceptors.ts`
- Delivers: Immutable WIP stamp on first SQL+ transition. BD cannot write field directly.
- Depends on: Commit 1
- Phase: 1
- Note: Identify SQL stage by order index, not label string, for rename-safety.

## Commit 4: KPI dashboard widget — WIP count live query, org-scoped
- Scope: app
- Pattern: dashboard widget + widget injection
- Files: `src/modules/partnerships/widgets/dashboard/kpi/widget.ts`, `widget.client.tsx`, `widgets/injection-table.ts`
- Delivers: WIP count per agency per month. PM sees all agencies (org switcher), agency users see own org. WIC column shows "—" until Phase 2.
- Depends on: Commits 1-3
- Phase: 1

## Commit 5: Onboarding checklist widget — role-conditional, data-driven, auto-dismiss
- Scope: app
- Pattern: dashboard widget + widget injection (role-conditional rendering)
- Files: `src/modules/partnerships/widgets/dashboard/onboarding-checklist/widget.ts`, `widget.client.tsx`, `widgets/injection-table.ts`
- Delivers: Admin sees 4-item checklist (fill profile, add case study, invite BD, invite Contributor). BD sees 2-item checklist (add prospect, create deal). Each item links to relevant page. Checkmark on completed items. Widget disappears when all steps done. Completion state derived from live queries — no separate tracking flag.
- Completion checks:
  - Profile filled: company profile has non-empty `services` OR `industries` (at least one dictionary field populated)
  - Case study exists: at least 1 case study record linked to org's company
  - BD invited: at least 1 user with `partner_member` role in org
  - Contributor invited: at least 1 user with `partner_contributor` role in org
  - Prospect added (BD): at least 1 company record in org
  - Deal created (BD): at least 1 deal record in org
- Depends on: Commits 1-2
- Phase: 1

## Commit 6: seedExamples — Phase 1 demo data
- Scope: app
- Pattern: setup.ts seedExamples
- Files: `src/modules/partnerships/setup.ts`
- Delivers: 3 demo agencies, PM user, 3x (Admin+BD+Contributor), demo deals with WIP stamps, company profiles, case studies
- Depends on: Commits 1-5
- Phase: 1

## Commit 7: Auth module invitation flow (SPEC-038)
- Scope: core-module — FLAG: upstream PR required
- Pattern: auth module extension — invitation API + token + email template
- Files: auth module (upstream), `src/modules/partnerships/backend/partnerships/invite/page.tsx` (app)
- Delivers: PM sends email invitation, Admin accepts, sets password. Single-use token, 72h expiry, dedup.
- Depends on: Commit 1 + upstream PR merge
- Phase: 4

## Commit 8: PRM Settings Users entrypoint + auth guardrails for agency user management
- Scope: app
- Pattern: settings page + auth API interceptor
- Files: `src/modules/partnerships/backend/partnerships/users/page.tsx`, `page.meta.ts`, `src/modules/partnerships/api/interceptors.ts`, `src/modules/partnerships/api/get/onboarding-status.ts`
- Delivers: Agency Admin and Partnership Manager get a discoverable PRM `Settings > Users` entrypoint for listing, inviting, editing, and deleting `partner_admin`, `partner_member`, and `partner_contributor` users. The page reuses existing auth user-management APIs instead of cloning them. Agency Admin requests to raw auth users/roles routes are constrained to their own org and the three allowed agency roles. PM targets agencies explicitly in the page flow, not via org-switcher dependency. Generated credentials are handed off via the same copyable message pattern as `Add Agency`. Delete flow includes guardrails for self-delete and last-admin protection. SPEC-038 is still the Phase 4 email-invitation upgrade.
- Depends on: Commit 1
- Phase: 2
- Rationale: Keeps the App Spec contract (`Settings > Users`, `auth.users.*` for Agency Admin, `auth.*` for PM), removes the org-switcher write coupling, and solves the discoverability/safety gap with minimal duplication of OM auth functionality.

## Removed Note
- Onboarding sub-workflows dropped. Checklist widget is sufficient.
