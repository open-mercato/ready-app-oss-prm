import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { TierAssignment } from '../../data/entities'
import { TIER_THRESHOLDS } from '../../data/tier-thresholds'

export const metadata = {
  path: '/partnerships/tier-assign',
  POST: { requireAuth: true, requireFeatures: ['partnerships.tier.manage'] },
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const TIER_NAMES = TIER_THRESHOLDS.map((t) => t.tier) as [string, ...string[]]

const tierAssignSchema = z.object({
  organizationId: z.string().uuid(),
  tier: z.enum(TIER_NAMES),
  reason: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function POST(req: Request) {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = tierAssignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const em = container.resolve('em') as EntityManager

  const tierAssignment = em.create(TierAssignment, {
    organizationId: parsed.data.organizationId,
    tier: parsed.data.tier,
    effectiveDate: new Date(),
    approvedBy: auth.sub,
    reason: parsed.data.reason,
    tenantId: auth.tenantId,
  })
  em.persist(tierAssignment)
  await em.flush()

  return NextResponse.json(
    { success: true, tierAssignment: { id: tierAssignment.id, tier: tierAssignment.tier } },
    { status: 201 },
  )
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const postDoc: OpenApiMethodDoc = {
  summary: 'Manually assign tier to agency',
  tags: ['Partnerships'],
  requestBody: {
    schema: tierAssignSchema,
  },
  responses: [
    { status: 201, description: 'Tier assignment created' },
    { status: 401, description: 'Unauthorized' },
    { status: 422, description: 'Validation error' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Tier assignment',
  methods: { POST: postDoc },
}

export default POST
