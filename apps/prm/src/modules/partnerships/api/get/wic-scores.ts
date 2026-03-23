import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  path: '/partnerships/wic-scores',
  GET: { requireAuth: true },
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CU_ENTITY_ID = 'partnerships:contribution_unit'
const USER_ENTITY_ID = 'auth:user'
const GH_USERNAME_FIELD_KEY = 'github_username'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export const querySchema = z.object({
  month: z
    .string()
    .regex(MONTH_REGEX, 'month must be in YYYY-MM format')
    .optional(),
  organizationId: z
    .string()
    .uuid('organizationId must be a valid UUID')
    .optional(),
})

export type WicScoresQuery = z.infer<typeof querySchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMonthUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

// ---------------------------------------------------------------------------
// Role detection (mirrors onboarding-status pattern)
// ---------------------------------------------------------------------------

type RbacService = {
  userHasAllFeatures(
    userId: string,
    required: string[],
    scope: { tenantId: string | null; organizationId: string | null },
  ): Promise<boolean>
}

async function isPm(
  rbacService: RbacService,
  userId: string,
  tenantId: string,
  organizationId: string | null,
): Promise<boolean> {
  return rbacService.userHasAllFeatures(userId, ['partnerships.manage'], {
    tenantId,
    organizationId,
  })
}

// ---------------------------------------------------------------------------
// Record type
// ---------------------------------------------------------------------------

export type WicScoreRecord = {
  recordId: string
  contributorGithubUsername: string
  prId: string
  month: string
  featureKey: string
  level: string
  impactBonus: boolean
  bountyApplied: boolean
  wicScore: number
  assessmentSource: string
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const rawMonth = url.searchParams.get('month') ?? undefined
    const rawOrgId = url.searchParams.get('organizationId') ?? undefined

    const parseResult = querySchema.safeParse({ month: rawMonth, organizationId: rawOrgId })
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message ?? 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const auth = await getAuthFromRequest(req)
    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const tenantId: string = scope?.tenantId ?? auth.tenantId
    const resolvedOrgId = scope?.selectedId ?? auth.orgId ?? null

    const em = container.resolve('em') as EntityManager
    const rbacService = container.resolve('rbacService') as RbacService
    const userId = auth.sub
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const month = parseResult.data.month ?? formatMonthUtc(new Date())
    const userIsPm = await isPm(rbacService, userId, tenantId, resolvedOrgId)

    // Determine organization filter
    let orgFilter: string | null
    if (userIsPm) {
      // PM can filter by specific org or see all (no org filter)
      orgFilter = parseResult.data.organizationId ?? null
    } else {
      // Non-PM: locked to own org
      orgFilter = resolvedOrgId
    }

    // 1. Query CFV rows for entity=contribution_unit, fieldKey=month, valueText=requested month
    const monthCfvFilter: Record<string, unknown> = {
      entityId: CU_ENTITY_ID,
      fieldKey: 'month',
      valueText: month,
      tenantId,
      deletedAt: null,
    }
    if (orgFilter) {
      monthCfvFilter.organizationId = orgFilter
    }

    const monthCfvs = await em.find(CustomFieldValue, monthCfvFilter)
    const recordIds = [...new Set(monthCfvs.map((cfv) => cfv.recordId))]

    if (recordIds.length === 0) {
      return NextResponse.json({ records: [], month, totalWicScore: 0 })
    }

    // 2. For contributors, resolve their GH username to filter own records only
    let contributorUsername: string | null = null
    if (!userIsPm) {
      const hasCustomersStar = await rbacService.userHasAllFeatures(
        userId,
        ['customers.*'],
        { tenantId, organizationId: resolvedOrgId },
      )
      if (!hasCustomersStar) {
        // Contributor role: look up GH username from auth:user custom fields
        const ghCfv = await em.findOne(CustomFieldValue, {
          entityId: USER_ENTITY_ID,
          fieldKey: GH_USERNAME_FIELD_KEY,
          recordId: userId,
          tenantId,
          deletedAt: null,
        })
        contributorUsername = ghCfv?.valueText ?? null
      }
    }

    // 3. Fetch all CFV rows for those recordIds
    const allCfvs = await em.find(CustomFieldValue, {
      entityId: CU_ENTITY_ID,
      recordId: { $in: recordIds },
      tenantId,
      deletedAt: null,
    })

    // 4. Group by recordId and parse into response objects
    const grouped = new Map<string, Map<string, string>>()
    for (const cfv of allCfvs) {
      let fields = grouped.get(cfv.recordId)
      if (!fields) {
        fields = new Map()
        grouped.set(cfv.recordId, fields)
      }
      if (cfv.valueText != null) {
        fields.set(cfv.fieldKey, cfv.valueText)
      }
    }

    const records: WicScoreRecord[] = []
    for (const [recordId, fields] of grouped) {
      const ghUsername = fields.get('contributor_github_username') ?? ''

      // Contributor filter: skip records not belonging to this contributor
      if (contributorUsername !== null && ghUsername !== contributorUsername) {
        continue
      }

      records.push({
        recordId,
        contributorGithubUsername: ghUsername,
        prId: fields.get('pr_id') ?? '',
        month: fields.get('month') ?? month,
        featureKey: fields.get('feature_key') ?? '',
        level: fields.get('level') ?? '',
        impactBonus: fields.get('impact_bonus') === 'true',
        bountyApplied: fields.get('bounty_applied') === 'true',
        wicScore: parseFloat(fields.get('wic_score') ?? '0'),
        assessmentSource: fields.get('assessment_source') ?? '',
      })
    }

    // 5. Sort by wicScore descending
    records.sort((a, b) => b.wicScore - a.wicScore)

    const totalWicScore = records.reduce((sum, r) => sum + r.wicScore, 0)

    return NextResponse.json({ records, month, totalWicScore })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/wic-scores.GET] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const wicScoreRecordSchema = z.object({
  recordId: z.string().uuid(),
  contributorGithubUsername: z.string(),
  prId: z.string(),
  month: z.string(),
  featureKey: z.string(),
  level: z.string(),
  impactBonus: z.boolean(),
  bountyApplied: z.boolean(),
  wicScore: z.number(),
  assessmentSource: z.string(),
})

const responseSchema = z.object({
  records: z.array(wicScoreRecordSchema),
  month: z.string().describe('The queried month in YYYY-MM format'),
  totalWicScore: z.number(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'Get WIC scores for a given month',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'WIC score records for the requested month', schema: responseSchema },
    { status: 400, description: 'Invalid query parameters' },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'WIC scores',
  methods: {
    GET: getDoc,
  },
}

export default GET
