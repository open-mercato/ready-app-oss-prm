import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { TierAssignment, TierEvaluationState, TierChangeProposal } from '../../data/entities'
import { PartnerLicenseDeal } from '../../data/entities'
import { TIER_THRESHOLDS, tierOrder } from '../../data/tier-thresholds'

export const metadata = {
  path: '/partnerships/tier-status',
  GET: { requireAuth: true },
}

// ---------------------------------------------------------------------------
// Constants (match entity IDs used by the worker)
// ---------------------------------------------------------------------------

const CU_ENTITY_ID = 'partnerships:contribution_unit'
const DEAL_ENTITY_ID = 'customers:customer_deal'
const WIP_FIELD_KEY = 'wip_registered_at'

// ---------------------------------------------------------------------------
// KPI Readers (same queries as tier-evaluation worker)
// ---------------------------------------------------------------------------

function currentYearMonth(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

async function readWic(
  em: EntityManager,
  organizationId: string,
  month: string,
  tenantId: string,
): Promise<number> {
  const monthCfvs = await em.find(CustomFieldValue, {
    entityId: CU_ENTITY_ID,
    fieldKey: 'month',
    valueText: month,
    organizationId,
    tenantId,
    deletedAt: null,
  })

  const recordIds = [...new Set(monthCfvs.map((c) => c.recordId))]
  if (recordIds.length === 0) return 0

  const scoreCfvs = await em.find(CustomFieldValue, {
    entityId: CU_ENTITY_ID,
    fieldKey: 'wic_score',
    recordId: { $in: recordIds },
    tenantId,
    deletedAt: null,
  })

  return scoreCfvs.reduce((sum, cfv) => sum + parseFloat(cfv.valueText ?? '0'), 0)
}

async function readWip(
  em: EntityManager,
  organizationId: string,
  month: string,
  tenantId: string,
): Promise<number> {
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthStr, 10) - 1
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0))

  return em.count(CustomFieldValue, {
    entityId: DEAL_ENTITY_ID,
    fieldKey: WIP_FIELD_KEY,
    tenantId,
    organizationId,
    deletedAt: null,
    valueText: { $gte: start.toISOString(), $lt: end.toISOString() },
  })
}

async function readMin(
  em: EntityManager,
  organizationId: string,
  tenantId: string,
): Promise<number> {
  const currentYear = new Date().getUTCFullYear()

  return em.count(PartnerLicenseDeal, {
    organizationId,
    tenantId,
    type: 'enterprise',
    status: 'won',
    isRenewal: false,
    year: currentYear,
  })
}

// ---------------------------------------------------------------------------
// Progress computation
// ---------------------------------------------------------------------------

type TierThreshold = { wic: number; wip: number; min: number }

function getNextTierThreshold(currentTier: string): TierThreshold | null {
  const currentOrder = tierOrder(currentTier)
  const nextTier = TIER_THRESHOLDS.find((t) => t.order === currentOrder + 1)
  return nextTier ? { wic: nextTier.wic, wip: nextTier.wip, min: nextTier.min } : null
}

function getCurrentTierThreshold(currentTier: string): TierThreshold {
  const found = TIER_THRESHOLDS.find((t) => t.tier === currentTier)
  return found ? { wic: found.wic, wip: found.wip, min: found.min } : { wic: 1, wip: 1, min: 1 }
}

function progressPercent(value: number, threshold: number): number {
  if (threshold <= 0) return 100
  return Math.min(100, Math.round((value / threshold) * 100))
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const tenantId: string = scope?.tenantId ?? auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId ?? null

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization context required' }, { status: 400 })
    }

    const em = container.resolve('em') as EntityManager
    const month = currentYearMonth()

    // Read live KPIs (same queries as worker)
    const [wic, wip, min] = await Promise.all([
      readWic(em, organizationId, month, tenantId),
      readWip(em, organizationId, month, tenantId),
      readMin(em, organizationId, tenantId),
    ])

    // Current tier assignment (latest by effectiveDate)
    const currentAssignment = await em.findOne(
      TierAssignment,
      { organizationId, tenantId },
      { orderBy: { effectiveDate: 'DESC' } },
    )
    const tier = currentAssignment?.tier ?? null

    // Current month evaluation state
    const evalState = await em.findOne(TierEvaluationState, {
      organizationId,
      evaluationMonth: month,
      tenantId,
    })
    const gracePeriod = evalState?.status === 'GracePeriod'

    // Open tier change proposal
    const openProposal = await em.findOne(TierChangeProposal, {
      organizationId,
      tenantId,
      status: 'PendingApproval',
    })
    const pendingProposal = !!openProposal

    // Compute thresholds: use next tier if available, otherwise current tier
    const thresholds = tier
      ? getNextTierThreshold(tier) ?? getCurrentTierThreshold(tier)
      : getCurrentTierThreshold('OM Agency')

    return NextResponse.json({
      tier,
      kpis: {
        wic,
        wip,
        min,
        wicThreshold: thresholds.wic,
        wipThreshold: thresholds.wip,
        minThreshold: thresholds.min,
      },
      gracePeriod,
      pendingProposal,
      progressPercent: {
        wic: progressPercent(wic, thresholds.wic),
        wip: progressPercent(wip, thresholds.wip),
        min: progressPercent(min, thresholds.min),
      },
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/tier-status.GET] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const kpiSchema = z.object({
  wic: z.number(),
  wip: z.number().int().nonnegative(),
  min: z.number().int().nonnegative(),
  wicThreshold: z.number(),
  wipThreshold: z.number().int(),
  minThreshold: z.number().int(),
})

const progressSchema = z.object({
  wic: z.number().int().min(0).max(100),
  wip: z.number().int().min(0).max(100),
  min: z.number().int().min(0).max(100),
})

const responseSchema = z.object({
  tier: z.string().nullable(),
  kpis: kpiSchema,
  gracePeriod: z.boolean(),
  pendingProposal: z.boolean(),
  progressPercent: progressSchema,
})

const getDoc: OpenApiMethodDoc = {
  summary: 'Get tier status and KPI progress for the requesting user\'s organization',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Current tier status with live KPI metrics', schema: responseSchema },
    { status: 400, description: 'Organization context required' },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Tier status',
  methods: {
    GET: getDoc,
  },
}

export default GET
