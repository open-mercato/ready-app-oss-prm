# WIC Import — Assessment Guide Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the WIC import schema, storage, APIs, and UI with the WIC Assessment Guide output format (1 record per contributor per month, numeric bonuses, textual justifications).

**Architecture:** Replace per-feature/per-PR granularity with per-contributor/per-month records matching Assessment Guide columns. Change archive semantics from soft-delete to `archived_at` timestamp so archived assessments remain queryable for the archive UI.

**Tech Stack:** TypeScript, Zod, Next.js API routes, React, MikroORM CustomFieldValue, Playwright

**Spec:** `apps/prm/docs/specs/2026-03-28-wic-import-assessment-guide-alignment.md`

**Reference:** `apps/prm/app-spec/Wic Assessment Guide` — source of truth for column definitions

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/modules/partnerships/data/custom-fields.ts` | Modify | Replace CONTRIBUTION_UNIT_FIELDS |
| `src/modules/partnerships/data/validators.ts` | Modify | New wicScoringResultSchema + wicImportRequestSchema |
| `src/modules/partnerships/api/post/wic-import.ts` | Modify | New schema, dedup key, archive semantics |
| `src/modules/partnerships/api/get/wic-scores.ts` | Modify | New response type, includeArchived param |
| `src/modules/partnerships/backend/partnerships/my-wic/page.tsx` | Modify | New columns, archive section |
| `src/modules/partnerships/backend/partnerships/wic-import/page.tsx` | Modify | New Agentic Helper prompt, new placeholder |
| `src/modules/partnerships/i18n/en.json` | Modify | New translation keys |
| `src/modules/partnerships/__integration__/TC-PRM-009.spec.ts` | Modify | Updated fixtures |
| `src/modules/partnerships/__integration__/TC-PRM-010.spec.ts` | Modify | New columns + archive UI test |
| `src/modules/partnerships/__integration__/TC-PRM-011.spec.ts` | Modify | Fixture update |

All paths relative to `apps/prm/`.

---

### Task 1: Update custom fields and validators

**Files:**
- Modify: `src/modules/partnerships/data/custom-fields.ts`
- Modify: `src/modules/partnerships/data/validators.ts`

- [ ] **Step 1: Update CONTRIBUTION_UNIT_FIELDS in custom-fields.ts**

Replace the existing `CONTRIBUTION_UNIT_FIELDS` array:

```typescript
// ContributionUnit custom fields (entity: partnerships:contribution_unit)
// Aligned with WIC Assessment Guide output format (1 record = 1 contributor per month)
export const CONTRIBUTION_UNIT_FIELDS: FieldDefinition[] = [
  { key: 'contributor_github_username', type: 'text', label: 'Contributor GitHub Username', required: true },
  { key: 'month', type: 'text', label: 'Month', required: true },
  { key: 'wic_score', type: 'text', label: 'WIC Score', required: true },
  { key: 'level', type: 'select', label: 'Level', required: true, options: [...WIC_LEVEL_OPTIONS] },
  { key: 'impact_bonus', type: 'text', label: 'Impact Bonus', required: true },
  { key: 'bounty_bonus', type: 'text', label: 'Bounty Bonus', required: true },
  { key: 'why_bonus', type: 'text', label: 'Why Bonus' },
  { key: 'included', type: 'text', label: 'What Included' },
  { key: 'excluded', type: 'text', label: 'What Excluded' },
  { key: 'script_version', type: 'text', label: 'Script Version', required: true },
  { key: 'organization_id', type: 'text', label: 'Organization ID', required: true },
  { key: 'assessment_id', type: 'text', label: 'Assessment ID', required: true },
  { key: 'assessment_source', type: 'select', label: 'Assessment Source', required: true, options: [...WIC_SOURCE_OPTIONS] },
  { key: 'archived_at', type: 'text', label: 'Archived At' },
]
```

- [ ] **Step 2: Update wicScoringResultSchema in validators.ts**

Replace the existing schemas:

```typescript
export const wicScoringResultSchema = z.object({
  contributorGithubUsername: z.string().min(1, 'GitHub username is required'),
  month: z.string().regex(MONTH_REGEX, 'month must be in YYYY-MM format'),
  wicScore: z.number().nonnegative('WIC score must be non-negative'),
  level: z.enum(WIC_LEVEL_OPTIONS),
  impactBonus: z.number().min(0).max(0.5, 'Impact bonus max is 0.5'),
  bountyBonus: z.number().nonnegative('Bounty bonus must be non-negative'),
  whyBonus: z.string(),
  included: z.string(),
  excluded: z.string(),
  scriptVersion: z.string().min(1, 'Script version is required'),
})

export type WicScoringResult = z.infer<typeof wicScoringResultSchema>

export const wicImportRequestSchema = z.object({
  organizationId: z.string().uuid('organizationId must be a valid UUID'),
  month: z.string().regex(MONTH_REGEX, 'month must be in YYYY-MM format'),
  source: z.enum(WIC_SOURCE_OPTIONS),
  records: z.array(wicScoringResultSchema).min(1, 'At least one record is required').max(500, 'Maximum 500 records per batch'),
})

export type WicImportRequest = z.infer<typeof wicImportRequestSchema>
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: Type errors in `wic-import.ts`, `wic-scores.ts`, `my-wic/page.tsx` (they still reference removed fields). This confirms the schema change propagated.

- [ ] **Step 4: Commit**

```bash
git add src/modules/partnerships/data/custom-fields.ts src/modules/partnerships/data/validators.ts
git commit -m "refactor(wic): align schema with Assessment Guide — 1 record per contributor/month

Remove prId, featureKey, bountyApplied (bool). Add bountyBonus (number),
whyBonus, included, excluded, scriptVersion, archived_at. Change
impactBonus from boolean to number."
```

---

### Task 2: Update import API handler

**Files:**
- Modify: `src/modules/partnerships/api/post/wic-import.ts`

- [ ] **Step 1: Update dedup check**

Replace the dedup check block (lines 62-82) with new key `(contributorGithubUsername, month)`:

```typescript
    // 2. Check within-batch duplicates: (contributorGithubUsername, month)
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const rec of records) {
      const key = `${rec.contributorGithubUsername}|${rec.month}`
      if (seen.has(key)) {
        duplicates.push(key)
      }
      seen.add(key)
    }
    if (duplicates.length > 0) {
      return NextResponse.json(
        {
          error: 'Duplicate records in batch',
          duplicates: duplicates.map((d) => {
            const [username, m] = d.split('|')
            return { contributorGithubUsername: username, month: m }
          }),
        },
        { status: 422 },
      )
    }
```

- [ ] **Step 2: Update archive semantics**

Replace the soft-archive block (lines 164-191). Instead of setting `deletedAt`, stamp `archived_at`:

```typescript
    // 5. Archive existing ContributionUnits for same org+month
    //    (set archived_at instead of deletedAt — keeps records queryable for archive UI)
    const existingMonthCfvs = await em.find(CustomFieldValue, {
      entityId: CU_ENTITY_ID,
      fieldKey: 'month',
      valueText: month,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    let archivedCount = 0
    if (existingMonthCfvs.length > 0) {
      // Find distinct recordIds, then filter to only those NOT already archived
      const candidateRecordIds = [...new Set(existingMonthCfvs.map((cfv) => cfv.recordId))]

      // Check which recordIds already have archived_at set (skip them)
      const archiveCfvs = await em.find(CustomFieldValue, {
        entityId: CU_ENTITY_ID,
        fieldKey: 'archived_at',
        recordId: { $in: candidateRecordIds },
        tenantId,
        deletedAt: null,
      })
      const alreadyArchived = new Set(archiveCfvs.filter((cfv) => cfv.valueText).map((cfv) => cfv.recordId))
      const recordIdsToArchive = candidateRecordIds.filter((id) => !alreadyArchived.has(id))
      archivedCount = recordIdsToArchive.length

      const now = new Date()
      for (const recordId of recordIdsToArchive) {
        em.persist(em.create(CustomFieldValue, {
          entityId: CU_ENTITY_ID,
          recordId,
          fieldKey: 'archived_at',
          valueText: now.toISOString(),
          organizationId,
          tenantId,
          createdAt: now,
        }))
      }
    }
```

- [ ] **Step 3: Update field values insertion**

Replace the fieldValues array (lines 201-213) with new fields:

```typescript
      const fieldValues: Array<{ fieldKey: string; valueText: string }> = [
        { fieldKey: 'contributor_github_username', valueText: record.contributorGithubUsername },
        { fieldKey: 'month', valueText: record.month },
        { fieldKey: 'wic_score', valueText: String(record.wicScore) },
        { fieldKey: 'level', valueText: record.level },
        { fieldKey: 'impact_bonus', valueText: String(record.impactBonus) },
        { fieldKey: 'bounty_bonus', valueText: String(record.bountyBonus) },
        { fieldKey: 'why_bonus', valueText: record.whyBonus },
        { fieldKey: 'included', valueText: record.included },
        { fieldKey: 'excluded', valueText: record.excluded },
        { fieldKey: 'script_version', valueText: record.scriptVersion },
        { fieldKey: 'organization_id', valueText: organizationId },
        { fieldKey: 'assessment_id', valueText: assessmentId },
        { fieldKey: 'assessment_source', valueText: source },
      ]
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: No errors in wic-import.ts. Errors may remain in wic-scores.ts and UI files (not yet updated).

- [ ] **Step 5: Commit**

```bash
git add src/modules/partnerships/api/post/wic-import.ts
git commit -m "refactor(wic): update import handler for Assessment Guide schema

Dedup key changed to (username, month). Archive uses archived_at timestamp
instead of soft-delete. New fields: bountyBonus, whyBonus, included,
excluded, scriptVersion."
```

---

### Task 3: Update read API

**Files:**
- Modify: `src/modules/partnerships/api/get/wic-scores.ts`

- [ ] **Step 1: Update WicScoreRecord type and response construction**

Replace the `WicScoreRecord` type (lines 83-94):

```typescript
export type WicScoreRecord = {
  recordId: string
  contributorGithubUsername: string
  month: string
  wicScore: number
  level: string
  impactBonus: number
  bountyBonus: number
  whyBonus: string
  included: string
  excluded: string
  scriptVersion: string
  assessmentSource: string
  assessmentId: string
  archivedAt: string | null
}
```

- [ ] **Step 2: Add includeArchived query parameter**

Update `querySchema` (line 30) to add:

```typescript
export const querySchema = z.object({
  month: z
    .string()
    .regex(MONTH_REGEX, 'month must be in YYYY-MM format')
    .optional(),
  organizationId: z
    .string()
    .uuid('organizationId must be a valid UUID')
    .optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
```

Add parsing in the handler (after line 106):

```typescript
    const rawIncludeArchived = url.searchParams.get('includeArchived') ?? undefined
```

Add it to the safeParse call:

```typescript
    const parseResult = querySchema.safeParse({ month: rawMonth, organizationId: rawOrgId, includeArchived: rawIncludeArchived, page: rawPage, pageSize: rawPageSize })
```

- [ ] **Step 3: Filter archived records**

After building the `grouped` map and before constructing `records`, add archive filtering. Replace the record construction loop (lines 207-228):

```typescript
    const records: WicScoreRecord[] = []
    for (const [recordId, fields] of grouped) {
      const ghUsername = fields.get('contributor_github_username') ?? ''
      const archivedAt = fields.get('archived_at') || null

      // Contributor filter: skip records not belonging to this contributor
      if (contributorUsername !== null && ghUsername !== contributorUsername) {
        continue
      }

      // Archive filter: skip archived records unless includeArchived
      if (!parseResult.data.includeArchived && archivedAt !== null) {
        continue
      }

      records.push({
        recordId,
        contributorGithubUsername: ghUsername,
        month: fields.get('month') ?? month,
        wicScore: parseFloat(fields.get('wic_score') ?? '0'),
        level: fields.get('level') ?? '',
        impactBonus: parseFloat(fields.get('impact_bonus') ?? '0'),
        bountyBonus: parseFloat(fields.get('bounty_bonus') ?? '0'),
        whyBonus: fields.get('why_bonus') ?? '',
        included: fields.get('included') ?? '',
        excluded: fields.get('excluded') ?? '',
        scriptVersion: fields.get('script_version') ?? '',
        assessmentSource: fields.get('assessment_source') ?? '',
        assessmentId: fields.get('assessment_id') ?? '',
        archivedAt,
      })
    }
```

- [ ] **Step 4: Update OpenAPI response schema**

Replace `wicScoreRecordSchema` (lines 263-274):

```typescript
const wicScoreRecordSchema = z.object({
  recordId: z.string().uuid(),
  contributorGithubUsername: z.string(),
  month: z.string(),
  wicScore: z.number(),
  level: z.string(),
  impactBonus: z.number(),
  bountyBonus: z.number(),
  whyBonus: z.string(),
  included: z.string(),
  excluded: z.string(),
  scriptVersion: z.string(),
  assessmentSource: z.string(),
  assessmentId: z.string(),
  archivedAt: z.string().nullable(),
})
```

- [ ] **Step 5: Run typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: No errors in wic-scores.ts. UI files still have errors (next task).

- [ ] **Step 6: Commit**

```bash
git add src/modules/partnerships/api/get/wic-scores.ts
git commit -m "refactor(wic): update read API for Assessment Guide schema

New response fields: bountyBonus, whyBonus, included, excluded,
scriptVersion, assessmentId, archivedAt. Add includeArchived query param.
Remove prId, featureKey, bountyApplied."
```

---

### Task 4: Update i18n keys

**Files:**
- Modify: `src/modules/partnerships/i18n/en.json`

- [ ] **Step 1: Replace myWic translation keys**

Replace the `"myWic"` block:

```json
    "myWic": {
      "title": "WIC Scores",
      "noData": "No WIC scores for this month.",
      "totalScore": "Total WIC Score:",
      "colContributor": "Contributor",
      "colLevel": "Level",
      "colScore": "Score",
      "colImpactBonus": "Impact Bonus",
      "colBountyBonus": "Bounty Bonus",
      "colWhyBonus": "Why Bonus",
      "colSource": "Source",
      "colScriptVersion": "Script Version",
      "expandDetails": "Show details",
      "collapseDetails": "Hide details",
      "colIncluded": "What was included",
      "colExcluded": "What was excluded",
      "previousAssessments": "Previous assessments",
      "archivedOn": "Archived on",
      "sourceAutomated": "Automated",
      "sourceManual": "Manual",
      "paginationInfo": "Page {{page}} of {{totalPages}} ({{total}} records)",
      "paginationPrev": "Previous",
      "paginationNext": "Next"
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/partnerships/i18n/en.json
git commit -m "refactor(wic): update i18n keys for Assessment Guide alignment

New keys: colImpactBonus, colBountyBonus, colWhyBonus, colScriptVersion,
expandDetails, collapseDetails, colIncluded, colExcluded,
previousAssessments, archivedOn. Remove: colPr, colFeature, colBounty,
bountyYes, bountyNo."
```

---

### Task 5: Update My WIC page

**Files:**
- Modify: `src/modules/partnerships/backend/partnerships/my-wic/page.tsx`

- [ ] **Step 1: Update WicScoreRecord type**

Replace the type at the top of the file:

```typescript
type WicScoreRecord = {
  recordId: string
  contributorGithubUsername: string
  month: string
  wicScore: number
  level: string
  impactBonus: number
  bountyBonus: number
  whyBonus: string
  included: string
  excluded: string
  scriptVersion: string
  assessmentSource: string
  assessmentId: string
  archivedAt: string | null
}
```

- [ ] **Step 2: Add state for expanded rows and archive**

After existing state declarations, add:

```typescript
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set())
  const [showArchive, setShowArchive] = React.useState(false)
  const [archiveData, setArchiveData] = React.useState<WicScoresResponse | null>(null)
  const [loadingArchive, setLoadingArchive] = React.useState(false)
```

Add toggle helper:

```typescript
  function toggleRow(recordId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return next
    })
  }
```

Add archive fetch:

```typescript
  async function loadArchive() {
    if (archiveData) { setShowArchive(!showArchive); return }
    setLoadingArchive(true)
    const call = await apiCall<WicScoresResponse>(
      `/api/partnerships/wic-scores?month=${encodeURIComponent(selectedMonth)}&includeArchived=true&pageSize=100`,
    )
    if (call.ok && call.result) {
      setArchiveData(call.result)
    }
    setLoadingArchive(false)
    setShowArchive(true)
  }
```

- [ ] **Step 3: Replace the table columns and add expandable rows**

Replace the table `<thead>` and `<tbody>`:

```tsx
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colContributor')}</th>
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colLevel')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('partnerships.myWic.colScore')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('partnerships.myWic.colImpactBonus')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('partnerships.myWic.colBountyBonus')}</th>
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colWhyBonus')}</th>
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colSource')}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <React.Fragment key={record.recordId}>
                      <tr
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleRow(record.recordId)}
                      >
                        <td className="px-4 py-3 font-medium">{record.contributorGithubUsername}</td>
                        <td className="px-4 py-3">{record.level}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{record.wicScore.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{record.impactBonus > 0 ? `+${record.impactBonus}` : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{record.bountyBonus > 0 ? `+${record.bountyBonus}` : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{record.whyBonus || '—'}</td>
                        <td className="px-4 py-3"><SourceBadge source={record.assessmentSource} t={t} /></td>
                      </tr>
                      {expandedRows.has(record.recordId) && (
                        <tr className="border-b bg-muted/10">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="font-medium">{t('partnerships.myWic.colIncluded')}:</span>
                                <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{record.included || '—'}</p>
                              </div>
                              <div>
                                <span className="font-medium">{t('partnerships.myWic.colExcluded')}:</span>
                                <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{record.excluded || '—'}</p>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t('partnerships.myWic.colScriptVersion')}: {record.scriptVersion}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
```

- [ ] **Step 4: Add archive section after the pagination block**

Add before the closing `</>` of the records-exist branch:

```tsx
            {/* Archive section */}
            <div className="mt-6">
              <button
                type="button"
                onClick={loadArchive}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                data-testid="archive-toggle"
              >
                <span>{showArchive ? '▾' : '▸'}</span>
                {t('partnerships.myWic.previousAssessments')}
                {loadingArchive && <Spinner className="ml-1 h-3 w-3" />}
              </button>
              {showArchive && archiveData && (() => {
                // Group archived records by assessmentId
                const archived = archiveData.records.filter((r) => r.archivedAt)
                const groups = new Map<string, WicScoreRecord[]>()
                for (const r of archived) {
                  const list = groups.get(r.assessmentId) ?? []
                  list.push(r)
                  groups.set(r.assessmentId, list)
                }
                const sortedGroups = [...groups.entries()].sort((a, b) => {
                  const dateA = a[1][0]?.archivedAt ?? ''
                  const dateB = b[1][0]?.archivedAt ?? ''
                  return dateB.localeCompare(dateA)
                })
                if (sortedGroups.length === 0) {
                  return <p className="mt-2 text-xs text-muted-foreground">No previous assessments.</p>
                }
                return (
                  <div className="mt-2 space-y-3">
                    {sortedGroups.map(([assessmentId, groupRecords]) => {
                      const archivedAt = groupRecords[0]?.archivedAt
                      const source = groupRecords[0]?.assessmentSource ?? ''
                      const version = groupRecords[0]?.scriptVersion ?? ''
                      return (
                        <details key={assessmentId} className="rounded-md border p-3">
                          <summary className="cursor-pointer text-sm font-medium">
                            {t('partnerships.myWic.archivedOn')} {archivedAt ? new Date(archivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?'}
                            {' · '}{source === 'automated_pipeline' ? t('partnerships.myWic.sourceAutomated') : t('partnerships.myWic.sourceManual')}
                            {' · v'}{version}
                          </summary>
                          <div className="mt-2 rounded-lg border">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="px-3 py-2 text-left font-medium">{t('partnerships.myWic.colContributor')}</th>
                                  <th className="px-3 py-2 text-left font-medium">{t('partnerships.myWic.colLevel')}</th>
                                  <th className="px-3 py-2 text-right font-medium">{t('partnerships.myWic.colScore')}</th>
                                  <th className="px-3 py-2 text-right font-medium">{t('partnerships.myWic.colImpactBonus')}</th>
                                  <th className="px-3 py-2 text-right font-medium">{t('partnerships.myWic.colBountyBonus')}</th>
                                  <th className="px-3 py-2 text-left font-medium">{t('partnerships.myWic.colWhyBonus')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupRecords.map((r) => (
                                  <tr key={r.recordId} className="border-b last:border-0">
                                    <td className="px-3 py-2">{r.contributorGithubUsername}</td>
                                    <td className="px-3 py-2">{r.level}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{r.wicScore.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{r.impactBonus > 0 ? `+${r.impactBonus}` : '—'}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{r.bountyBonus > 0 ? `+${r.bountyBonus}` : '—'}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{r.whyBonus || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
```

- [ ] **Step 5: Reset archive state when month changes**

Update `handleMonthChange`:

```typescript
  function handleMonthChange(value: string) {
    setSelectedMonth(value)
    setCurrentPage(1)
    setArchiveData(null)
    setShowArchive(false)
  }
```

- [ ] **Step 6: Run typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: PASS — all type errors resolved.

- [ ] **Step 7: Commit**

```bash
git add src/modules/partnerships/backend/partnerships/my-wic/page.tsx
git commit -m "refactor(wic): update My WIC page for Assessment Guide schema

New columns: Impact Bonus, Bounty Bonus, Why Bonus. Expandable rows for
included/excluded details. Archive section with collapsible previous
assessments grouped by assessmentId."
```

---

### Task 6: Update WIC Import page

**Files:**
- Modify: `src/modules/partnerships/backend/partnerships/wic-import/page.tsx`

- [ ] **Step 1: Update JSON placeholder in textarea**

Replace the `placeholder` attribute on the textarea (line 197):

```tsx
                placeholder={`[\n  {\n    "contributorGithubUsername": "octocat",\n    "month": "${selectedMonth}",\n    "wicScore": 1.5,\n    "level": "L3",\n    "impactBonus": 0.25,\n    "bountyBonus": 0.0,\n    "whyBonus": "",\n    "included": "SPEC-042 implementation + tests",\n    "excluded": "Routine dependency updates",\n    "scriptVersion": "1.0-agent"\n  }\n]`}
```

- [ ] **Step 2: Replace Agentic IDE Helper prompt**

Replace the `<pre>` block inside the Agentic IDE Helper section (lines 241-260):

```tsx
              <pre className="whitespace-pre-wrap rounded-md bg-blue-100 dark:bg-blue-900/50 p-3 text-xs font-mono text-blue-900 dark:text-blue-100 select-all cursor-pointer">
{`Użyj WIC Assessment Guide i oblicz WIC score dla poniższych kont GitHub za okres ${selectedMonth} na repozytorium open-mercato/open-mercato.

Konta (${agencies.find(a => a.organizationId === selectedOrgId)?.name ?? 'selected agency'}):
${contributors.map(c => `  - ${c.githubUsername} (${c.name})`).join('\n')}

Wygeneruj rezultat w postaci JSON array:
[
  {
    "contributorGithubUsername": "<gh-username>",
    "month": "${selectedMonth}",
    "wicScore": <suma base+impact+bounty>,
    "level": "L1|L2|L3|L4|routine",
    "impactBonus": <0|0.25|0.5>,
    "bountyBonus": <wartość liczbowa bonusu>,
    "whyBonus": "<tytuł bounty lub pusty string>",
    "included": "<co zaliczono i dlaczego>",
    "excluded": "<co odrzucono i dlaczego>",
    "scriptVersion": "1.0-agent"
  }
]

Output ONLY the JSON array, no explanation.`}
              </pre>
```

- [ ] **Step 3: Remove stale comment**

Remove the comment at line 152:

```tsx
          <p className="text-xs text-muted-foreground">
            App Spec mentions CSV/markdown — JSON chosen because the external script outputs JSON directly.
          </p>
```

Replace with nothing (delete the `<p>` block).

- [ ] **Step 4: Run typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/partnerships/backend/partnerships/wic-import/page.tsx
git commit -m "refactor(wic): update import page for Assessment Guide schema

New JSON placeholder matching Assessment Guide fields. Agentic Helper
prompt now references WIC Assessment Guide and outputs new format."
```

---

### Task 7: Update integration tests

**Files:**
- Modify: `src/modules/partnerships/__integration__/TC-PRM-009.spec.ts`
- Modify: `src/modules/partnerships/__integration__/TC-PRM-010.spec.ts`
- Modify: `src/modules/partnerships/__integration__/TC-PRM-011.spec.ts`

- [ ] **Step 1: Update TC-PRM-009 fixtures**

In TC-PRM-009, replace the JSON fixture in T2 (lines 73-83):

```typescript
    const json = JSON.stringify([{
      contributorGithubUsername: GH_USERNAME,
      month,
      wicScore: 1.0,
      level: 'L2',
      impactBonus: 0.25,
      bountyBonus: 0.0,
      whyBonus: '',
      included: 'TC-PRM-009 test import',
      excluded: 'None',
      scriptVersion: '1.0-agent',
    }])
```

Replace the fixture in T4 (lines 111-120):

```typescript
    const json = JSON.stringify([{
      contributorGithubUsername: `nonexistent-user-${Date.now()}`,
      month,
      wicScore: 0.5,
      level: 'L1',
      impactBonus: 0.0,
      bountyBonus: 0.0,
      whyBonus: '',
      included: 'Test',
      excluded: 'None',
      scriptVersion: '1.0-agent',
    }])
```

- [ ] **Step 2: Update TC-PRM-010 fixture and column assertions**

Replace the import fixture in `beforeAll` (lines 53-69):

```typescript
    await apiRequest(request, 'POST', '/api/partnerships/wic/import', {
      token: pmToken,
      data: {
        organizationId: acmeOrgId,
        month,
        source: 'manual_import',
        records: [{
          contributorGithubUsername: GH_USERNAME,
          month,
          wicScore: 0.5,
          level: 'L3',
          impactBonus: 0.25,
          bountyBonus: 0.0,
          whyBonus: '',
          included: 'TC-PRM-010 test feature',
          excluded: 'Routine maintenance',
          scriptVersion: '1.0-agent',
        }],
      },
    })
```

In T1 (lines 81-89), replace column assertions:

```typescript
    if (hasTable) {
      await expect(page.locator('th:text-is("Level")').first()).toBeVisible()
      await expect(page.locator('th:text-is("Score")').first()).toBeVisible()
      await expect(page.locator('th:text-is("Impact Bonus")').first()).toBeVisible()
      await expect(page.locator('th:text-is("Bounty Bonus")').first()).toBeVisible()
    }
```

- [ ] **Step 3: Update TC-PRM-011 fixture**

Replace the `importWicForUser` helper function (lines 68-96):

```typescript
async function importWicForUser(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  organizationId: string,
  ghUsername: string,
  month: string,
): Promise<void> {
  const res = await apiRequest(request, 'POST', '/api/partnerships/wic/import', {
    token,
    data: {
      organizationId,
      month,
      source: 'manual_import',
      records: [
        {
          contributorGithubUsername: ghUsername,
          month,
          wicScore: 0.5,
          level: 'L1',
          impactBonus: 0.0,
          bountyBonus: 0.0,
          whyBonus: '',
          included: 'Guard test',
          excluded: 'None',
          scriptVersion: '1.0-agent',
        },
      ],
    },
  })
  expect(res.ok(), `WIC import for guard test failed: ${res.status()}`).toBeTruthy()
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: PASS — all files updated, zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/partnerships/__integration__/TC-PRM-009.spec.ts src/modules/partnerships/__integration__/TC-PRM-010.spec.ts src/modules/partnerships/__integration__/TC-PRM-011.spec.ts
git commit -m "test(wic): update integration test fixtures for Assessment Guide schema

TC-PRM-009, 010, 011: replace prId/featureKey/bountyApplied fixtures with
bountyBonus/whyBonus/included/excluded/scriptVersion. Update column
assertions in TC-PRM-010."
```

---

### Task 8: Verify full build and generate

- [ ] **Step 1: Regenerate module files**

Run: `cd apps/prm && yarn generate`
Expected: PASS — module files regenerated with updated custom fields.

- [ ] **Step 2: Run full typecheck**

Run: `cd apps/prm && yarn typecheck`
Expected: PASS — zero errors.

- [ ] **Step 3: Run full build**

Run: `cd apps/prm && yarn build`
Expected: PASS

- [ ] **Step 4: Commit if generate produced changes**

```bash
git add -A
git commit -m "chore: regenerate module files after WIC schema change"
```
