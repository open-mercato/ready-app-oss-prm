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
  GET: { requireAuth: true, requireFeatures: ['partnerships.wic.view'] },
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
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
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
  return rbacService.userHasAllFeatures(userId, ['partnerships.wic.manage'], {
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

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const rawMonth = url.searchParams.get('month') ?? undefined
    const rawOrgId = url.searchParams.get('organizationId') ?? undefined
    const rawIncludeArchived = url.searchParams.get('includeArchived') ?? undefined
    const rawPage = url.searchParams.get('page') ?? undefined
    const rawPageSize = url.searchParams.get('pageSize') ?? undefined

    const parseResult = querySchema.safeParse({ month: rawMonth, organizationId: rawOrgId, includeArchived: rawIncludeArchived, page: rawPage, pageSize: rawPageSize })
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
      return NextResponse.json({ records: [], month, totalWicScore: 0, total: 0, page: parseResult.data.page, pageSize: parseResult.data.pageSize, totalPages: 0 })
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

    // 5. Sort by wicScore descending
    records.sort((a, b) => b.wicScore - a.wicScore)

    const totalWicScore = records.reduce((sum, r) => sum + r.wicScore, 0)
    const total = records.length

    // 6. Paginate
    const { page, pageSize } = parseResult.data
    const offset = (page - 1) * pageSize
    const paginatedRecords = records.slice(offset, offset + pageSize)

    return NextResponse.json({
      records: paginatedRecords,
      month,
      totalWicScore,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
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

const responseSchema = z.object({
  records: z.array(wicScoreRecordSchema),
  month: z.string().describe('The queried month in YYYY-MM format'),
  totalWicScore: z.number(),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalPages: z.number().int().nonnegative(),
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
