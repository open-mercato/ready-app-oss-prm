# Phase 1, Commit 4: Onboarding Checklist Widget — Role-Conditional, Data-Driven, Auto-Dismiss

## Source
- App Spec sections: §3 (WF1 journey), §7 (Phase 1)
- User stories: US-1.7, US-1.8
- Commit plan: commits-WF1.md (Commit 5)

## What This Delivers
After this commit, when an Agency Admin logs in for the first time, they see a dashboard checklist showing 4 onboarding steps: fill company profile, add case study, invite BD, invite Contributor. When a BD logs in, they see 2 steps: add prospect company, create first deal. Each item links to the relevant page. Completed items show a checkmark. The widget disappears when all steps are done. Completion state is derived from live queries — no separate tracking flag.

## Acceptance Criteria
**Domain (Vernon):**
- [ ] Onboarding checklist widget visible only to users who have incomplete onboarding steps — not shown to PM, not shown after completion
- [ ] Checklist completion state derived from live data (profile fields non-empty, case study exists, users with BD/Contributor role exist in org, deal exists) — not from a separate flag that can drift

**Business (Mat):**
- [ ] Admin logs in for the first time and sees a checklist: fill profile, add case study, invite BD, invite Contributor
- [ ] BD logs in for the first time and sees a checklist: add prospect company, create first deal
- [ ] Checklist items link to the right page
- [ ] Completed items show checkmark
- [ ] Widget disappears when all steps done

## Files
| File | Action | Purpose |
|------|--------|---------|
| `src/modules/partnerships/api/get/onboarding-status.ts` | Create | `GET /api/partnerships/onboarding-status` — returns checklist state per role. Auth-guarded: `partnerships.widgets.onboarding-checklist`. Org-scoped. Exports `openApi`. |
| `src/modules/partnerships/widgets/dashboard/onboarding-checklist/widget.ts` | Create | Dashboard widget server definition: metadata (id: `partnerships.dashboard.onboarding-checklist`, features: `partnerships.widgets.onboarding-checklist`), lazy-load client component |
| `src/modules/partnerships/widgets/dashboard/onboarding-checklist/widget.client.tsx` | Create | Client component: calls onboarding-status API, renders checklist with links, checkmarks, auto-dismiss logic |
| `src/modules/partnerships/widgets/injection-table.ts` | Modify | Add `partnerships.dashboard.onboarding-checklist` widget registration at `dashboard:widgets` spot |
| `src/modules/partnerships/i18n/en.json` | Create | i18n keys for onboarding checklist: step labels, links, completion messages |

## OM Patterns Used
- **Dashboard widget** — Reference: `$OM_REPO/packages/core/src/modules/customers/widgets/dashboard/customer-todos/widget.ts`
- **Widget client component** — Reference: `$OM_REPO/packages/core/src/modules/customers/widgets/dashboard/customer-todos/widget.client.tsx`
- **Widget injection** — Reference: `$OM_REPO/packages/core/src/modules/customers/widgets/injection-table.ts`
- **Custom GET route** — Reference: `$OM_REPO/packages/core/src/modules/customers/api/people/route.ts`

## Implementation Notes

### API Route: `GET /api/partnerships/onboarding-status`

Returns role-specific checklist state:

```typescript
type OnboardingStatusResponse = {
  role: 'partner_admin' | 'partner_member'
  items: Array<{
    id: string
    label: string      // i18n key
    completed: boolean
    link: string        // relative URL to relevant page
  }>
  allCompleted: boolean
}
```

### Completion Checks (Live Queries)

**Admin items (4):**

| Item | Check | Link |
|------|-------|------|
| Fill company profile | Company profile has non-empty `services` OR `industries` (at least one dictionary field populated) | `/backend/customers/companies/{orgCompanyId}` |
| Add case study | At least 1 `partnerships:case_study` record linked to org's company via `organization_id` | `/backend/partnerships/case-studies` |
| Invite BD | At least 1 user with `partner_member` role in org | `/backend/auth/users/create` |
| Invite Contributor | At least 1 user with `partner_contributor` role in org | `/backend/auth/users/create` |

**BD items (2):**

| Item | Check | Link |
|------|-------|------|
| Add prospect company | At least 1 `customers:company` record in org | `/backend/customers/companies/create` |
| Create first deal | At least 1 `customers:deal` record in org | `/backend/customers/deals/create` |

### Role Filtering
- `partner_admin`: show Admin items
- `partner_member` (BD): show BD items
- `partner_contributor`: no checklist (Contributor onboarding is minimal — set GH username, which is Phase 2)
- `partnership_manager` (PM): no checklist (PM is not onboarding into an agency)

### Auto-Dismiss Logic
The widget client component checks `allCompleted` from the API response. If true, the widget is not rendered. This is evaluated on every dashboard load — no cached state.

### Query Implementation
Each completion check is a separate count query scoped by `organizationId`:
1. Profile: `SELECT COUNT(*) FROM entity_field_values WHERE entity_id = :orgCompanyId AND field_definition_id IN (:servicesFieldId, :industriesFieldId) AND value IS NOT NULL AND value != '[]'`
2. Case study: `SELECT COUNT(*) FROM entity_records WHERE entity_type = 'partnerships:case_study' AND organization_id = :orgId LIMIT 1`
3. BD user: `SELECT COUNT(*) FROM user_role_assignments WHERE role_key = 'partner_member' AND organization_id = :orgId LIMIT 1`
4. Contributor user: `SELECT COUNT(*) FROM user_role_assignments WHERE role_key = 'partner_contributor' AND organization_id = :orgId LIMIT 1`
5. Company: `SELECT COUNT(*) FROM customer_entities WHERE kind = 'company' AND organization_id = :orgId AND deleted_at IS NULL LIMIT 1`
6. Deal: `SELECT COUNT(*) FROM customer_entities WHERE kind = 'deal' AND organization_id = :orgId AND deleted_at IS NULL LIMIT 1`

Note: Exact table/column names depend on OM schema. Adapt queries to match entities module storage. Use `em.getConnection().execute()` or entities module query API.

## Testing

### Unit Tests
- `api/get/onboarding-status.test.ts` — colocated

| Function | Test |
|----------|------|
| `handler` | Returns 4 items for partner_admin role, all uncompleted in fresh org |
| `handler` | Returns 2 items for partner_member role |
| `handler` | Returns 403 for partnership_manager (no checklist for PM) |
| `handler` | Marks "Fill profile" as completed when services field is populated |
| `handler` | Returns `allCompleted: true` when all items pass |

### Integration Test Scenarios

| ID | Type | Scenario | Expected Result |
|----|------|----------|-----------------|
| T1 | API | Fresh org, Admin queries onboarding status | 4 items, all `completed: false`, `allCompleted: false` |
| T2 | API | Admin fills company profile (sets services), queries again | "Fill company profile" shows `completed: true`, rest still false |
| T3 | API | Admin creates case study, invites BD, invites Contributor, fills profile | All 4 items `completed: true`, `allCompleted: true` |
| T4 | API | Fresh org, BD queries onboarding status | 2 items (add prospect, create deal), both `completed: false` |
| T5 | API | BD creates company and deal, queries again | Both items `completed: true`, `allCompleted: true` |

## Verification
```bash
yarn generate                    # After modifying widget files
yarn typecheck                   # Must pass
yarn build                       # Must pass
yarn test                        # Unit tests pass
yarn test:integration:ephemeral  # Integration tests pass (T1-T5)
```
