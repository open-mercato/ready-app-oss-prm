# PRM Tier Assignment Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let PM assign tiers to agencies — at creation and later — and show auto-evaluation status on Tier Review page.

**Architecture:** Three independent changes to the partnerships module. No new entities, no migrations. TierAssignment is append-only (already exists). All changes are in `apps/prm/src/modules/partnerships/`.

**Tech Stack:** React (client components), OM backend patterns (apiCall, flash), Zod validation, MikroORM.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `data/validators.ts` | Modify | Add `initialTier` to createAgencySchema, add `tierAssignSchema` |
| `api/post/agencies.ts` | Modify | Create TierAssignment after agency creation |
| `backend/partnerships/add-agency/page.tsx` | Modify | Add Initial Tier select to form |
| `api/post/tier-assign.ts` | Create | Manual tier assignment endpoint |
| `backend/partnerships/agencies/page.tsx` | Modify | Add current tier column + "Change Tier" row action dialog |
| `api/get/tier-proposals.ts` | Modify | Add `lastEvaluatedAt` to response |
| `backend/partnerships/tier-review/page.tsx` | Modify | Add "Last evaluation" banner + "Run Evaluation Now" button |
| `i18n/en.json` | Modify | Add new translation keys |

---

## Task 1: Add Initial Tier to Add Agency Form

**Files:**
- Modify: `data/validators.ts`
- Modify: `api/post/agencies.ts`
- Modify: `backend/partnerships/add-agency/page.tsx`
- Modify: `i18n/en.json`

- [ ] **Step 1: Add `initialTier` to validator**

In `data/validators.ts`, add to `createAgencySchema`:

```typescript
const createAgencySchema = z.object({
  agencyName: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  seedDemoData: z.boolean().default(true),
  initialTier: z.string().default('OM Agency'),
})
```

- [ ] **Step 2: Create TierAssignment in agency creation endpoint**

In `api/post/agencies.ts`, after the agency org + user + role are created and flushed, add TierAssignment creation. Import `TierAssignment` from `../data/entities` and add before the event emit:

```typescript
// Create initial tier assignment
const tierAssignment = em.create(TierAssignment, {
  organizationId: org.id,
  tier: body.initialTier,
  effectiveDate: new Date(),
  approvedBy: auth.userId,
  reason: 'Initial onboarding',
  tenantId: auth.tenantId,
})
em.persist(tierAssignment)
await em.flush()
```

- [ ] **Step 3: Add tier select to Add Agency form**

In `backend/partnerships/add-agency/page.tsx`, import `TIER_THRESHOLDS` from `../../data/tier-thresholds` and add a select field after the `seedDemoData` checkbox:

```tsx
<div>
  <label htmlFor="initialTier">{t('partnerships.addAgency.initialTier')}</label>
  <select
    id="initialTier"
    name="initialTier"
    value={formData.initialTier}
    onChange={(e) => setFormData({ ...formData, initialTier: e.target.value })}
  >
    {TIER_THRESHOLDS.map((t) => (
      <option key={t.tier} value={t.tier}>{t.tier}</option>
    ))}
  </select>
</div>
```

Initialize `initialTier: 'OM Agency'` in the form state.

- [ ] **Step 4: Add translation keys**

In `i18n/en.json`, add:

```json
"partnerships.addAgency.initialTier": "Initial Tier",
"partnerships.agencies.currentTier": "Current Tier",
"partnerships.agencies.changeTier": "Change Tier",
"partnerships.agencies.changeTierReason": "Reason for tier change",
"partnerships.agencies.tierChanged": "Tier updated successfully",
"partnerships.agencies.noTier": "No tier",
"partnerships.tierReview.lastEvaluation": "Last auto-evaluation",
"partnerships.tierReview.evaluationNever": "Auto-evaluation has not run yet",
"partnerships.tierReview.runEvaluation": "Run Evaluation Now",
"partnerships.tierReview.evaluationRunning": "Evaluation running...",
"partnerships.tierReview.evaluationQueued": "Evaluation jobs queued"
```

- [ ] **Step 5: Test manually**

Run: `yarn dev`
1. Navigate to `/backend/partnerships/add-agency`
2. Verify "Initial Tier" select appears with 4 options, default "OM Agency"
3. Create an agency → verify TierAssignment created in DB

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(prm): add initial tier selection to Add Agency form

PM can now select a tier when creating an agency (default: OM Agency).
Creates TierAssignment directly — no proposal/review needed for initial assignment."
```

---

## Task 2: Add "Change Tier" Action to Agencies List

**Files:**
- Create: `api/post/tier-assign.ts`
- Modify: `backend/partnerships/agencies/page.tsx`
- Modify: `api/get/agencies.ts` (add current tier to response)

- [ ] **Step 1: Add current tier to agencies GET endpoint**

In `api/get/agencies.ts`, after fetching agencies, query current tier for each org. Add a subquery or post-fetch that gets the latest `TierAssignment` per org (by `effectiveDate` DESC, LIMIT 1). Add `currentTier` to each agency in the response.

```typescript
// After fetching agencies, get current tiers
const tierAssignments = await em.find(TierAssignment, {
  tenantId: auth.tenantId,
  organizationId: { $in: agencies.map(a => a.organizationId) },
}, { orderBy: { effectiveDate: 'DESC' } })

// Group by org, take first (latest)
const currentTiers = new Map<string, string>()
for (const ta of tierAssignments) {
  if (!currentTiers.has(ta.organizationId)) {
    currentTiers.set(ta.organizationId, ta.tier)
  }
}

// Add to response
const enriched = agencies.map(a => ({
  ...a,
  currentTier: currentTiers.get(a.organizationId) ?? null,
}))
```

- [ ] **Step 2: Create tier-assign endpoint**

Create `api/post/tier-assign.ts`:

```typescript
import { z } from 'zod'
import type { RouteContext } from '@open-mercato/core'
import { TierAssignment } from '../../data/entities'

const tierAssignSchema = z.object({
  organizationId: z.string().uuid(),
  tier: z.string().min(1),
  reason: z.string().min(1),
})

export const openApi = {
  summary: 'Manually assign tier to agency',
  tags: ['partnerships'],
}

export default async function handler({ request, em, auth }: RouteContext) {
  const body = tierAssignSchema.parse(await request.json())

  const tierAssignment = em.create(TierAssignment, {
    organizationId: body.organizationId,
    tier: body.tier,
    effectiveDate: new Date(),
    approvedBy: auth.userId,
    reason: body.reason,
    tenantId: auth.tenantId,
  })
  em.persist(tierAssignment)
  await em.flush()

  return Response.json({ success: true, tierAssignment: { id: tierAssignment.id, tier: tierAssignment.tier } })
}

export const meta = {
  requireAuth: true,
  requireFeatures: ['partnerships.tier.approve'],
}
```

- [ ] **Step 3: Add tier column and Change Tier dialog to agencies list**

In `backend/partnerships/agencies/page.tsx`:

1. Add "Current Tier" column to the table (after Agency Name)
2. Add a "Change Tier" button per row (visible only if user has `partnerships.tier.approve`)
3. Add a dialog with: tier select (from `TIER_THRESHOLDS`) + reason textarea (required) + submit
4. On submit: `POST /api/partnerships/tier-assign` → flash success → refresh list

```tsx
// Dialog state
const [changeTierOpen, setChangeTierOpen] = useState(false)
const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null)
const [newTier, setNewTier] = useState('')
const [reason, setReason] = useState('')

// In table row
<td>{agency.currentTier ?? t('partnerships.agencies.noTier')}</td>
<td>
  <button onClick={() => {
    setSelectedAgency(agency)
    setNewTier(agency.currentTier ?? 'OM Agency')
    setReason('')
    setChangeTierOpen(true)
  }}>
    {t('partnerships.agencies.changeTier')}
  </button>
</td>

// Dialog
{changeTierOpen && selectedAgency && (
  <Dialog onClose={() => setChangeTierOpen(false)}>
    <h3>{t('partnerships.agencies.changeTier')}: {selectedAgency.agencyName}</h3>
    <select value={newTier} onChange={(e) => setNewTier(e.target.value)}>
      {TIER_THRESHOLDS.map((t) => (
        <option key={t.tier} value={t.tier}>{t.tier}</option>
      ))}
    </select>
    <textarea
      placeholder={t('partnerships.agencies.changeTierReason')}
      value={reason}
      onChange={(e) => setReason(e.target.value)}
      required
    />
    <button onClick={handleChangeTier} disabled={!reason.trim()}>
      {t('partnerships.agencies.changeTier')}
    </button>
  </Dialog>
)}
```

Handler:
```tsx
const handleChangeTier = async () => {
  const res = await apiCall('/api/partnerships/tier-assign', {
    method: 'POST',
    body: JSON.stringify({
      organizationId: selectedAgency!.organizationId,
      tier: newTier,
      reason,
    }),
  })
  if (res.ok) {
    flash('success', t('partnerships.agencies.tierChanged'))
    setChangeTierOpen(false)
    fetchAgencies() // refresh list
  }
}
```

- [ ] **Step 4: Test manually**

Run: `yarn dev`
1. Navigate to `/backend/partnerships/agencies`
2. Verify "Current Tier" column shows tier for each agency
3. Click "Change Tier" on an agency → dialog opens
4. Select new tier, enter reason, submit → tier updates, flash message shows

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(prm): add Change Tier action to agencies list

PM can now manually change an agency's tier from the agencies list.
Creates TierAssignment directly with reason. Requires partnerships.tier.approve."
```

---

## Task 3: Add Evaluation Status to Tier Review

**Files:**
- Modify: `api/get/tier-proposals.ts`
- Modify: `backend/partnerships/tier-review/page.tsx`

- [ ] **Step 1: Add `lastEvaluatedAt` to tier proposals endpoint**

In `api/get/tier-proposals.ts`, query the latest `TierEvaluationState` to get the most recent evaluation timestamp. Add to response:

```typescript
import { TierEvaluationState } from '../../data/entities'

// After fetching proposals, get last evaluation time
const lastEvaluation = await em.findOne(TierEvaluationState, {
  tenantId: auth.tenantId,
}, { orderBy: { evaluatedAt: 'DESC' } })

return Response.json({
  proposals: enrichedProposals,
  lastEvaluatedAt: lastEvaluation?.evaluatedAt?.toISOString() ?? null,
})
```

- [ ] **Step 2: Add evaluation banner and "Run Now" button to Tier Review**

In `backend/partnerships/tier-review/page.tsx`, add above the proposals table:

```tsx
// State
const [evaluationRunning, setEvaluationRunning] = useState(false)

// Compute evaluation status
const lastEval = data?.lastEvaluatedAt ? new Date(data.lastEvaluatedAt) : null
const daysSinceEval = lastEval ? Math.floor((Date.now() - lastEval.getTime()) / (1000 * 60 * 60 * 24)) : null
const isOverdue = daysSinceEval !== null && daysSinceEval > 35
const isNever = lastEval === null

// Handler
const handleRunEvaluation = async () => {
  setEvaluationRunning(true)
  const res = await apiCall('/api/partnerships/enqueue-tier-evaluation', { method: 'POST' })
  if (res.ok) {
    const result = await res.json()
    flash('success', `${t('partnerships.tierReview.evaluationQueued')}: ${result.jobsEnqueued} agencies`)
  }
  setEvaluationRunning(false)
}

// Banner JSX (above proposals table)
<div className={`evaluation-banner ${isOverdue ? 'warning' : isNever ? 'info' : ''}`}>
  {isNever ? (
    <span>{t('partnerships.tierReview.evaluationNever')}</span>
  ) : (
    <span>
      {t('partnerships.tierReview.lastEvaluation')}: {lastEval!.toLocaleDateString()}
      {isOverdue && ' ⚠️ Overdue'}
    </span>
  )}
  <button
    onClick={handleRunEvaluation}
    disabled={evaluationRunning}
  >
    {evaluationRunning
      ? t('partnerships.tierReview.evaluationRunning')
      : t('partnerships.tierReview.runEvaluation')}
  </button>
</div>
```

- [ ] **Step 3: Test manually**

Run: `yarn dev`
1. Navigate to `/backend/partnerships/tier-review`
2. With demo data: should show "Last auto-evaluation: {date}" (from seeded TierEvaluationState)
3. Without evaluation data: shows "Auto-evaluation has not run yet"
4. Click "Run Evaluation Now" → flash "Evaluation jobs queued: N agencies" → button shows loading
5. If evaluation is > 35 days old: warning style on banner

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(prm): show evaluation status and Run Now button on Tier Review

PM can see when auto-evaluation last ran and trigger it manually.
Shows warning when evaluation is overdue (>35 days) or never ran."
```

---

## Summary

| Task | Files changed | Commits |
|------|--------------|---------|
| 1. Initial Tier on Add Agency | 4 modified | 1 |
| 2. Change Tier on agencies list | 1 created, 2 modified | 1 |
| 3. Evaluation status on Tier Review | 2 modified | 1 |
| **Total** | **7 files (1 new)** | **3** |

No new entities. No migrations. No upstream dependencies.
