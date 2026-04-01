import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { validateCrudMutationGuard, runCrudMutationGuardAfterSuccess } from '@open-mercato/shared/lib/crud/mutation-guard'
import { wicImportRequestSchema } from '../../data/validators'

export const metadata = {
  path: '/partnerships/wic/import',
  POST: { requireAuth: true, requireFeatures: ['partnerships.wic.manage'] },
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CU_ENTITY_ID = 'partnerships:contribution_unit'
const USER_ENTITY_ID = 'auth:user'
const GH_USERNAME_FIELD_KEY = 'github_username'

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function POST(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Parse and validate request body
    const body = await req.json()
    const parseResult = wicImportRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 422 },
      )
    }

    const { organizationId, month, source, records } = parseResult.data
    const tenantId = auth.tenantId

    // 1b. Validate per-record month matches outer month
    const monthMismatches = records
      .filter((r) => r.month !== month)
      .map((r) => ({ contributorGithubUsername: r.contributorGithubUsername, recordMonth: r.month }))
    if (monthMismatches.length > 0) {
      return NextResponse.json(
        { error: 'Record month does not match request month', month, mismatches: monthMismatches },
        { status: 422 },
      )
    }

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

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    // 3. Resolve GH usernames → Users via batch CustomFieldValue lookup
    const uniqueUsernames = [...new Set(records.map((r) => r.contributorGithubUsername))]
    const usernameToUserId = new Map<string, string>()
    const unmatchedUsernames: string[] = []

    const ghCfvs = await em.find(CustomFieldValue, {
      entityId: USER_ENTITY_ID,
      fieldKey: GH_USERNAME_FIELD_KEY,
      valueText: { $in: uniqueUsernames },
      tenantId,
      deletedAt: null,
    })

    // Group CFVs by username for uniqueness check
    const cfvsByUsername = new Map<string, typeof ghCfvs>()
    for (const cfv of ghCfvs) {
      const existing = cfvsByUsername.get(cfv.valueText!) ?? []
      existing.push(cfv)
      cfvsByUsername.set(cfv.valueText!, existing)
    }

    // Check for unmatched usernames
    for (const username of uniqueUsernames) {
      if (!cfvsByUsername.has(username)) {
        unmatchedUsernames.push(username)
      }
    }

    if (unmatchedUsernames.length > 0) {
      return NextResponse.json(
        { error: 'Unmatched GitHub usernames', unmatchedUsernames },
        { status: 422 },
      )
    }

    // 4. Batch resolve users + check uniqueness + org-membership
    const allResolvedUserIds = new Set(ghCfvs.map((cfv) => cfv.recordId))
    const users = await em.find(User, { id: { $in: [...allResolvedUserIds] }, deletedAt: null })
    const userById = new Map(users.map((u) => [u.id, u]))

    // Check GH username uniqueness — no two Users may share a handle
    for (const [username, cfvGroup] of cfvsByUsername) {
      const distinctActiveUserIds = new Set<string>()
      for (const cfv of cfvGroup) {
        if (userById.has(cfv.recordId)) distinctActiveUserIds.add(cfv.recordId)
      }
      if (distinctActiveUserIds.size > 1) {
        return NextResponse.json(
          {
            error: 'Duplicate GitHub username across users',
            username,
            userIds: [...distinctActiveUserIds],
          },
          { status: 422 },
        )
      }
      // Map the single resolved userId
      if (distinctActiveUserIds.size === 1) {
        usernameToUserId.set(username, [...distinctActiveUserIds][0])
      }
    }

    // Org-membership validation: each contributor must belong to the target organization
    const orgMismatches: Array<{ username: string; userId: string }> = []
    for (const [username, userId] of usernameToUserId) {
      const user = userById.get(userId)
      if (user && (user as any).organizationId !== organizationId) {
        orgMismatches.push({ username, userId })
      }
    }
    if (orgMismatches.length > 0) {
      return NextResponse.json(
        { error: 'Contributors do not belong to the target organization', orgMismatches },
        { status: 422 },
      )
    }

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

    // 6 & 7. Insert new ContributionUnits with wic_score from payload
    const assessmentId = crypto.randomUUID()
    const now = new Date()

    for (const record of records) {
      const recordId = crypto.randomUUID()
      const wicScore = record.wicScore

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

      for (const fv of fieldValues) {
        em.persist(em.create(CustomFieldValue, {
          entityId: CU_ENTITY_ID,
          recordId,
          fieldKey: fv.fieldKey,
          valueText: fv.valueText,
          organizationId,
          tenantId,
          createdAt: now,
        }))
      }
    }

    // Mutation guard: validate before flush
    const guardResult = await validateCrudMutationGuard(container, {
      tenantId,
      organizationId,
      userId: auth.sub,
      resourceKind: 'partnerships:contribution_unit',
      resourceId: assessmentId,
      operation: 'create',
      requestMethod: 'POST',
      requestHeaders: req.headers,
      mutationPayload: { organizationId, month, recordCount: records.length },
    })
    if (guardResult && !guardResult.ok) {
      return NextResponse.json(guardResult.body, { status: guardResult.status })
    }

    await em.flush()

    // Mutation guard: after-success hook
    if (guardResult?.shouldRunAfterSuccess) {
      await runCrudMutationGuardAfterSuccess(container, {
        tenantId,
        organizationId,
        userId: auth.sub,
        resourceKind: 'partnerships:contribution_unit',
        resourceId: assessmentId,
        operation: 'create',
        requestMethod: 'POST',
        requestHeaders: req.headers,
        metadata: guardResult.metadata ?? null,
      })
    }

    return NextResponse.json({
      imported: records.length,
      archived: archivedCount,
      assessmentId,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/wic-import.POST] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  imported: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  assessmentId: z.string().uuid(),
})

const postDoc: OpenApiMethodDoc = {
  summary: 'Import WIC scoring results for an organization+month',
  tags: ['Partnerships'],
  requestBody: {
    schema: wicImportRequestSchema,
  },
  responses: [
    { status: 200, description: 'Import successful', schema: responseSchema },
    { status: 401, description: 'Unauthorized' },
    { status: 422, description: 'Validation error or unmatched usernames' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'WIC score import',
  methods: { POST: postDoc },
}

export default POST
