# Tier Validity Dates

> Feature spec for adding scheduled review dates (validFrom/validUntil) to TierAssignment.
> Derived from App Spec WF5 (Tier Governance). All existing tier evaluation logic unchanged.
>
> **Challenger review:** 2026-04-01 — 3 CRITICAL, 5 WARNING. 
> Resolutions in `app-spec/mat-notes/challenger-tier-validity.md`.

---

## 1. Business Context

### Why

Partnership agreements with agencies have a defined evaluation period. Tiers are not granted forever
— they reflect a commitment with a start and scheduled review date. PM needs to see when tiers
are due for review so they can proactively renew or re-evaluate.

### What changes

| Aspect | Before | After |
|--------|--------|-------|
| TierAssignment duration | Endless — valid until next evaluation changes it | Has explicit `validFrom` + `validUntil` (scheduled review date) |
| Agency awareness | No visibility into tier timeline | Dashboard notification when tier is approaching review / past review date |
| PM awareness | Must manually track review dates | Agencies list shows review status; upcoming renewals visible |
| Auto-evaluation (KPI) | Monthly, proposes upgrade/downgrade | **Unchanged** — runs independently of validity dates |

### What does NOT change

- Tier thresholds (WIC/WIP/MIN)
- Grace period state machine (OK -> GracePeriod -> ProposedDowngrade)
- TierChangeProposal approval flow (extended with validUntil input)
- TierEvaluationState monthly snapshots
- 4-tier hierarchy (OM Agency / AI-native Agency / AI-native Expert / AI-native Core)

### Deferred: Partnership Suspension

When a tier passes its review date and PM does not renew: account blocking after 1-month grace period.
Tracked as GitHub issue. NOT in this spec.

---

## 2. Ubiquitous Language Updates

| Term | Updated Definition |
|------|-------------------|
| **TierAssignment** | The actual tier an agency holds, **with a scheduled review date** (`validFrom` to `validUntil`). Durable, auditable, requires PM approval to change. When `validUntil` passes, the assignment enters `PendingReview` state — tier remains operationally active but PM is alerted. |
| **Tier Validity Period** | *(new)* The time span during which a TierAssignment is active before its scheduled review. Defined by `validFrom` (assignment date, always today) and `validUntil` (scheduled review date, set by PM). |

**Read-model projections** (computed at query time, not domain concepts):
- `isExpiring`: `validUntil` within EXPIRY_NOTICE_DAYS of now AND `validUntil > now`
- `isExpired`: `validUntil < now` AND no newer TierAssignment for this org
- `EXPIRY_NOTICE_DAYS`: configurable constant, default 30 (in tier-thresholds config)

---

## 3. Domain Model Changes

### 3.1 TierAssignment Entity

```
TierAssignment {
  id: UUID
  organizationId: UUID
  tier: string
  validFrom: Date          -- renamed from effectiveDate (assignment date)
  validUntil: Date | null  -- NEW: scheduled review date (null = legacy, no review date set)
  approvedBy: UUID
  reason: string | null
  tenantId: UUID
  createdAt: Date
}
```

**Invariants:**
- `validFrom` cannot be in the future — tiers are assigned effective immediately
- When `validUntil` is set: `validFrom < validUntil`
- `validUntil` is nullable — legacy assignments (pre-migration) have null (displayed as "No review date")
- New assignments require `validUntil` (enforced at API level)
- Current tier = latest TierAssignment by `validFrom` WHERE `validFrom <= now` (unchanged logic)
- **Superseding semantics:** When a new TierAssignment is created, it becomes the current tier. The previous assignment's `validUntil` is historical record only — no overlap constraint needed.
- When `validUntil` passes without PM action: tier remains operationally active (`PendingReview` is a computed read-model state, not a write-model state change)

**Migration strategy:**
- Rename column `effective_date` -> `valid_from` (ALTER RENAME)
- Add column `valid_until` (TIMESTAMPTZ, nullable, default NULL)
- Existing rows keep `valid_until = NULL` — no fabricated dates
- Audit all codebase references to `effectiveDate` and update

### 3.2 Computed Read-Model States

Derived at query time from TierAssignment (no new entity, no domain events for v1):
- `isExpiring`: `validUntil IS NOT NULL AND validUntil > now AND validUntil <= now + EXPIRY_NOTICE_DAYS`
- `isExpired`: `validUntil IS NOT NULL AND validUntil < now` (on current assignment only)
- `validUntilDisplay`: `validUntil ?? "No review date"`

These projections power UI banners and PM filters. When async notifications (email/push) are needed, domain events will be added.

### 3.3 Tier Assign Flow Update

When PM assigns a tier (manual):
- `validFrom` = today (not editable)
- `validUntil` = required date picker (no default — PM must choose)
- Validation: `validUntil > today`

When PM approves a TierChangeProposal:
- `validFrom` = today (automatic)
- `validUntil` = required date picker in approval dialog
- Validation: `validUntil > today`

### 3.4 EXPIRY_NOTICE_DAYS Configuration

Added to tier-thresholds config:

```typescript
export const EXPIRY_NOTICE_DAYS = 30
```

Single value for all tiers. Per-tier override possible in future if needed.

---

## 4. Workflow Changes

### WF5: Tier Governance — Updated

**Added to journey:**
```
... -> PM reviews + approves/rejects -> PM sets scheduled review date (validUntil) on new assignment
-> agency sees new status + validity dates + progress to next level
```

**Added edge cases:**
6. Tier approaching review date (within EXPIRY_NOTICE_DAYS) -> agency dashboard shows info banner: "Your partnership tier [tier] is due for review on [date]. Your partnership is being evaluated." -> PM sees agency in "expiring" filter on agencies list.
7. Tier past review date, PM hasn't assigned new tier -> agency dashboard shows warning: "Your partnership tier review is overdue. Please contact your Partnership Manager." -> PM sees agency in "overdue" filter. Tier remains operationally active. KPI evaluation continues normally.
8. PM assigns new tier before review date -> new TierAssignment becomes current (latest validFrom). Old assignment remains in audit trail. Previous validUntil becomes historical.
9. Legacy assignment with null validUntil -> no expiry notifications. PM can assign new tier with validUntil at any time. Treated as "no scheduled review."

---

## 5. User Stories

### US-TV-1: PM assigns tier with validity dates

As a PM,
I want to set a scheduled review date when assigning a tier to an agency,
so that I know when to re-evaluate their partnership.

**Success:**
- Tier assign form shows `validFrom` (read-only, today) and `validUntil` (date picker, required)
- Validation rejects `validUntil` in the past
- After assigning, tier-status API returns `validFrom` and `validUntil` in response
- TierAssignment record persisted with both dates

### US-TV-2: PM sets validity on proposal approval

As a PM,
I want to set a review date when approving a tier change proposal,
so that the new tier has a scheduled re-evaluation point.

**Success:**
- Approval dialog includes `validUntil` date picker (required)
- `validFrom` = today (set automatically)
- Approved TierAssignment persisted with both dates
- Existing rejection flow unchanged

### US-TV-3: Agency sees tier review approaching notification

As an Agency Admin or BD,
I want to see a notification on my dashboard when my tier review date is approaching,
so that I know my partnership is being evaluated.

**Success:**
- When `validUntil` is within EXPIRY_NOTICE_DAYS (default 30): dashboard shows info banner "Your partnership tier [tier name] is due for review on [date]. Your partnership is being evaluated."
- Banner visible to Admin (`partner_admin`) and BD (`partner_member`)
- Not visible to Contributor (`partner_contributor`)
- Banner disappears when PM assigns new tier

### US-TV-4: Agency sees overdue review warning

As an Agency Admin or BD,
I want to see a warning when my tier review is overdue,
so that I know to contact the PM.

**Success:**
- When `validUntil` has passed: dashboard shows warning banner "Your partnership tier review is overdue. Please contact your Partnership Manager."
- Warning visible to Admin and BD
- Warning disappears when PM assigns new tier
- Null `validUntil` (legacy) = no warning shown

### US-TV-5: PM sees expiring/overdue tiers on agencies list

As a PM,
I want to see which agencies have upcoming or overdue tier reviews,
so that I can proactively manage renewals.

**Success:**
- Agencies list shows visual indicator for agencies with:
  - Approaching review (within EXPIRY_NOTICE_DAYS) — warning badge with days remaining
  - Overdue review — danger badge with "Overdue"
- PM can filter agencies by: All / Approaching Review / Overdue
- Legacy assignments (null validUntil) show no indicator

### US-TV-6: Tier validity shown in tier status

As a PM or Agency Admin/BD,
I want to see the review date in the tier status view,
so that I know when the current tier is scheduled for re-evaluation.

**Success:**
- Tier status API response includes `validFrom`, `validUntil` (nullable), `isExpiring`, `isExpired`
- Tier status widget shows "Review date: [validUntil]" below tier name (or "No review date" if null)
- If approaching: date shown in warning color
- If overdue: date shown in danger color

---

## 6. Platform Mapping

| Story | OM Module | Gap? | Approach |
|-------|-----------|------|----------|
| US-TV-1: Entity change | MikroORM entity | Yes — migration + entity | Rename field, add nullable column, update entity class |
| US-TV-1: Assign form | Backend UI (page) | Yes — form extension | Add date picker to tier-assign page/dialog |
| US-TV-2: Proposal approval | Backend UI (page) | Yes — dialog extension | Add date picker to approval dialog on tier-review page |
| US-TV-3+4: Agency banner | Dashboard widget | Yes — new widget | Banner widget reading tier-status API isExpiring/isExpired |
| US-TV-5: PM agencies list | Backend UI (page) | Yes — page extension | Computed fields in agencies GET API + badges + filter |
| US-TV-6: Tier status API | API route | Yes — response extension | Add fields to tier-status response + widget update |

**Zero-code items:** None — all stories are small extensions of existing code.

---

## 7. Gap Analysis — Atomic Commits

| # | Commit | Stories | Score | Description |
|---|--------|---------|-------|-------------|
| C1 | Entity + migration | All | 2 | Rename `effectiveDate` -> `validFrom`, add nullable `validUntil` to TierAssignment. Migration. Update all entity references across codebase. Add `EXPIRY_NOTICE_DAYS` to tier-thresholds config. |
| C2 | Tier assign API + form | US-TV-1 | 2 | Extend tier-assign API schema (validUntil required). Extend tier-assign backend page with date picker. Update Add Agency initial tier assignment. |
| C3 | Tier proposal approval | US-TV-2 | 1 | Extend tier-proposals-action API: validUntil required on approve. Add date picker to approval dialog on tier-review page. |
| C4 | Tier status API + widget | US-TV-6 | 2 | Extend tier-status response with validFrom, validUntil, isExpiring, isExpired. Update tier status widget to show review date with color coding. |
| C5 | Agency expiry banner | US-TV-3, US-TV-4 | 2 | New dashboard banner widget: reads tier-status API, shows info/warning banners conditionally. Feature-gated to Admin + BD. Widget injection in injection-table.ts. |
| C6 | PM agencies list indicators | US-TV-5 | 2 | Extend agencies GET API with computed review status. Add badges + status filter to agencies list page. |
| C7 | Seed data + tests | All | 1 | Update demo seed with realistic validUntil dates. Update existing unit tests for renamed field. New tests for expiry logic. |

**Total: 7 atomic commits, Score 12**

---

## 8. Phasing

### Phase A: Data Model + Assignment Flows (C1, C2, C3, C7) — 4 commits

**Business value:** PM can assign tiers with scheduled review dates. All existing flows work. Data model is in place.

**Acceptance criteria (Mat):**
- PM assigns "OM Agency" tier with validUntil = 2026-12-31. TierAssignment stored correctly.
- PM approves tier upgrade proposal, sets validUntil. New TierAssignment created with both dates.
- Legacy assignments show null validUntil — no fabricated dates, no broken queries.
- All existing integration tests pass with renamed field.

### Phase B: Visibility + Notifications (C4, C5, C6) — 3 commits

**Business value:** Agency knows when review is coming. PM can proactively manage renewals.

**Acceptance criteria (Mat):**
- Tier status widget shows "Review date: 2026-12-31" for assignments with validUntil.
- Agency dashboard shows info banner 30 days before validUntil.
- Agency dashboard shows warning banner when validUntil has passed.
- PM agencies list shows "Overdue" badge for past-validUntil agencies.
- PM can filter agencies by review status.

---

## 9. Resolved Questions

1. **EXPIRY_NOTICE_DAYS** — 30 days, single constant. Per-tier override deferred.
2. **Default validUntil in date picker** — today + 12 months, rounded to end of month. E.g. 2026-04-02 -> 2027-04-30.
3. **AgencyTierChanged event** — Removed entirely (zero consumers). Re-add when needed.

---

## 10. Cleanup

### Remove unused AgencyTierChanged event

`partnerships.agency.tier_changed` is emitted in `tier-proposals-action.ts` but has zero subscribers.
Remove: event declaration in `events.ts`, emit call in `tier-proposals-action.ts`, workflow example reference.
Bundled into C1 (entity + migration commit) as cleanup.

If a consumer is needed in the future, re-add with the correct payload at that time.

---

## 11. Deferred

- **Partnership Suspension** — account blocking when tier review is overdue. GitHub issue matgren/prm-ready-app#27.
- **Domain events for review approaching/overdue** — TierReviewApproaching, TierReviewOverdue events for async notifications (email/push). Add when notification channels are implemented.
- **Per-tier EXPIRY_NOTICE_DAYS** — configurable per tier if different tiers need different notice periods.
