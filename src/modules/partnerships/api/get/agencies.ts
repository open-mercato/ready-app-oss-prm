import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { User, UserRole, Role } from '@open-mercato/core/modules/auth/data/entities'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { WIP_REGISTERED_AT_FIELD } from '../../data/custom-fields'
import { PartnerLicenseDeal, TierAssignment } from '../../data/entities'
import { EXPIRY_NOTICE_DAYS } from '../../data/tier-thresholds'

export const metadata = {
  path: '/partnerships/agencies',
  GET: { requireAuth: true, requireFeatures: ['partnerships.agencies.manage'] },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgencyListItem = {
  organizationId: string
  name: string
  adminEmail: string | null
  wipCount: number
  wicScore: number
  minCount: number
  createdAt: string
  currentTier: string | null
  validUntil: string | null
  reviewStatus: 'ok' | 'expiring' | 'overdue' | null
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

const querySchema = z.object({
  month: z.string().regex(MONTH_REGEX, 'month must be in YYYY-MM format').optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CU_ENTITY_ID = 'partnerships:contribution_unit'
const DEAL_ENTITY_ID = 'customers:customer_deal'

function formatMonthUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function parseMonthBoundaries(month: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthStr, 10) - 1
  return {
    start: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0)),
  }
}

async function countWipForOrg(
  em: EntityManager, orgId: string, tenantId: string, start: Date, end: Date,
): Promise<number> {
  return em.count(CustomFieldValue, {
    entityId: DEAL_ENTITY_ID,
    fieldKey: WIP_REGISTERED_AT_FIELD.key,
    organizationId: orgId,
    tenantId,
    deletedAt: null,
    valueText: { $gte: start.toISOString(), $lt: end.toISOString() },
  })
}

async function sumWicForOrg(
  em: EntityManager, orgId: string, tenantId: string, month: string,
): Promise<number> {
  const monthCfvs = await em.find(CustomFieldValue, {
    entityId: CU_ENTITY_ID,
    fieldKey: 'month',
    valueText: month,
    organizationId: orgId,
    tenantId,
    deletedAt: null,
  })
  const recordIds = [...new Set(monthCfvs.map((c) => c.recordId))]
  if (recordIds.length === 0) return 0

  // Exclude archived records
  const archivedCfvs = await em.find(CustomFieldValue, {
    entityId: CU_ENTITY_ID,
    fieldKey: 'archived_at',
    recordId: { $in: recordIds },
    tenantId,
    deletedAt: null,
  })
  const archivedIds = new Set(archivedCfvs.filter((c) => c.valueText).map((c) => c.recordId))
  const activeRecordIds = recordIds.filter((id) => !archivedIds.has(id))
  if (activeRecordIds.length === 0) return 0

  const scoreCfvs = await em.find(CustomFieldValue, {
    entityId: CU_ENTITY_ID,
    fieldKey: 'wic_score',
    recordId: { $in: activeRecordIds },
    tenantId,
    deletedAt: null,
  })
  return scoreCfvs.reduce((sum, cfv) => sum + parseFloat(cfv.valueText ?? '0'), 0)
}

async function countMinForOrg(
  em: EntityManager, orgId: string, tenantId: string, year: number,
): Promise<number> {
  return em.count(PartnerLicenseDeal, {
    organizationId: orgId,
    tenantId,
    type: 'enterprise',
    status: 'won',
    isRenewal: false,
    year,
  })
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  const url = new URL(req.url)
  const rawMonth = url.searchParams.get('month') ?? undefined
  const parseResult = querySchema.safeParse({ month: rawMonth })
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? 'Invalid month format' },
      { status: 400 },
    )
  }

  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const em = container.resolve('em') as EntityManager
  const tenantId = auth.tenantId
  const pmOrgId = auth.orgId

  const month = parseResult.data.month ?? formatMonthUtc(new Date())
  const { start, end } = parseMonthBoundaries(month)
  const year = parseInt(month.split('-')[0], 10)

  // Find all organizations in tenant (including PM's own org — OM Backoffice has contributors too)
  const allOrgs = await em.find(Organization, {
    tenant: tenantId,
    isActive: true,
    deletedAt: null,
  })
  const agencyOrgs = allOrgs

  const partnerAdminRole = await em.findOne(Role, { name: 'partner_admin', tenantId, deletedAt: null })
  const agencies: AgencyListItem[] = []

  for (const org of agencyOrgs) {
    // Find admin user for this specific org
    let adminEmail: string | null = null
    if (partnerAdminRole) {
      const orgUsers = await em.find(User, {
        organizationId: org.id,
        tenantId,
        deletedAt: null,
      })
      for (const user of orgUsers) {
        const hasAdminRole = await em.findOne(UserRole, {
          user: user.id as any,
          role: partnerAdminRole.id as any,
          deletedAt: null,
        })
        if (hasAdminRole) {
          adminEmail = user.email
          break
        }
      }
    }

    const [wipCount, wicScore, minCount] = await Promise.all([
      countWipForOrg(em, org.id, tenantId, start, end),
      sumWicForOrg(em, org.id, tenantId, month),
      countMinForOrg(em, org.id, tenantId, year),
    ])

    agencies.push({
      organizationId: org.id,
      name: org.name,
      adminEmail,
      wipCount,
      wicScore,
      minCount,
      createdAt: org.createdAt.toISOString(),
      currentTier: null as string | null,
      validUntil: null as string | null,
      reviewStatus: null as AgencyListItem['reviewStatus'],
    })
  }

  // Enrich with current tier (latest TierAssignment per org)
  if (agencies.length > 0) {
    const tierAssignments = await em.find(TierAssignment, {
      tenantId,
      organizationId: { $in: agencies.map((a) => a.organizationId) },
    }, { orderBy: { validFrom: 'DESC' } })

    const currentAssignments = new Map<string, typeof tierAssignments[number]>()
    for (const ta of tierAssignments) {
      if (!currentAssignments.has(ta.organizationId)) {
        currentAssignments.set(ta.organizationId, ta)
      }
    }

    const now = new Date()
    const msPerDay = 1000 * 60 * 60 * 24
    for (const agency of agencies) {
      const ta = currentAssignments.get(agency.organizationId)
      agency.currentTier = ta?.tier ?? null
      agency.validUntil = ta?.validUntil?.toISOString() ?? null
      if (ta?.validUntil) {
        const daysUntil = (ta.validUntil.getTime() - now.getTime()) / msPerDay
        agency.reviewStatus = daysUntil <= 0 ? 'overdue' : daysUntil <= EXPIRY_NOTICE_DAYS ? 'expiring' : 'ok'
      } else {
        agency.reviewStatus = null
      }
    }
  }

  return NextResponse.json({ agencies, month, year })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const agencySchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  adminEmail: z.string().nullable(),
  wipCount: z.number(),
  wicScore: z.number(),
  minCount: z.number(),
  createdAt: z.string(),
  currentTier: z.string().nullable(),
  validUntil: z.string().nullable(),
  reviewStatus: z.enum(['ok', 'expiring', 'overdue']).nullable(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'List all partner agencies with KPI metrics (WIP, WIC, MIN)',
  tags: ['Partnerships'],
  responses: [
    {
      status: 200,
      description: 'Agency list with KPIs for the requested month',
      schema: z.object({
        agencies: z.array(agencySchema),
        month: z.string().describe('Queried month in YYYY-MM format'),
        year: z.number().describe('Year derived from the queried month'),
      }),
    },
    { status: 400, description: 'Invalid month format' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Partner agencies',
  methods: { GET: getDoc },
}

export default GET
