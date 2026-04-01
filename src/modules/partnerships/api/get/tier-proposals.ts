import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { TierChangeProposal, TierEvaluationState } from '../../data/entities'

export const metadata = {
  path: '/partnerships/tier-proposals',
  GET: { requireAuth: true, requireFeatures: ['partnerships.tier.manage'] },
}

async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const tenantId = auth.tenantId

  const url = new URL(req.url)
  const statusFilter = url.searchParams.get('status') || null

  const filter: Record<string, unknown> = { tenantId }
  if (statusFilter) {
    filter.status = statusFilter
  }

  const proposals = await em.find(TierChangeProposal, filter, {
    orderBy: { createdAt: 'DESC' },
  })

  // Resolve org names
  const orgIds = [...new Set(proposals.map((p) => p.organizationId))]
  const orgs = orgIds.length > 0
    ? await em.find(Organization, { id: { $in: orgIds } })
    : []
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]))

  const lastEvaluation = await em.findOne(TierEvaluationState, { tenantId }, { orderBy: { createdAt: 'DESC' } })

  const items = proposals.map((p) => ({
    id: p.id,
    organizationId: p.organizationId,
    organizationName: orgNameById.get(p.organizationId) ?? 'Unknown',
    evaluationMonth: p.evaluationMonth,
    currentTier: p.currentTier,
    proposedTier: p.proposedTier,
    type: p.type,
    status: p.status,
    wicSnapshot: p.wicSnapshot,
    wipSnapshot: p.wipSnapshot,
    minSnapshot: p.minSnapshot,
    rejectionReason: p.rejectionReason ?? null,
    resolvedAt: p.resolvedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }))

  return NextResponse.json({
    proposals: items,
    lastEvaluatedAt: lastEvaluation?.createdAt?.toISOString() ?? null,
  })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const proposalSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  evaluationMonth: z.string(),
  currentTier: z.string(),
  proposedTier: z.string(),
  type: z.string(),
  status: z.string(),
  wicSnapshot: z.number(),
  wipSnapshot: z.number().int(),
  minSnapshot: z.number().int(),
  rejectionReason: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'List tier change proposals (PM only)',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Proposal list', schema: z.object({ proposals: z.array(proposalSchema), lastEvaluatedAt: z.string().nullable() }) },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Tier change proposals',
  methods: { GET: getDoc },
}

export default GET
