import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import tierEvaluationHandler from '../../workers/tier-evaluation'
import { TierChangeProposal } from '../../data/entities'

export const metadata = {
  path: '/partnerships/enqueue-tier-evaluation',
  POST: { requireAuth: true, requireFeatures: ['partnerships.tier.manage'] },
}

// ---------------------------------------------------------------------------
// Handler — runs tier evaluation inline (workaround for #1088: app-level
// workers not discovered by generator). Will switch back to queue-based
// once upstream fix lands.
// ---------------------------------------------------------------------------

async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const tenantId = auth.tenantId
  const pmOrgId = auth.orgId

  const allOrgs = await em.find(Organization, {
    tenant: tenantId,
    isActive: true,
    deletedAt: null,
  })

  const agencyOrgs = allOrgs.filter((o) => o.id !== pmOrgId)

  if (agencyOrgs.length === 0) {
    return NextResponse.json({ jobsEnqueued: 0, message: 'No active agency organizations found' })
  }

  const now = new Date()
  const evaluationMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  let evaluated = 0
  const errors: string[] = []

  for (const org of agencyOrgs) {
    try {
      await tierEvaluationHandler(
        { payload: { organizationId: org.id, evaluationMonth, tenantId } } as any,
        { resolve: container.resolve.bind(container) } as any,
      )
      evaluated++
    } catch (err) {
      errors.push(`${org.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Count proposals created for this evaluation month
  const proposalCount = await em.count(TierChangeProposal, {
    evaluationMonth,
    tenantId,
    status: 'PendingApproval',
  })

  return NextResponse.json({
    evaluated,
    proposals: proposalCount,
    unchanged: evaluated - (errors.length),
    month: evaluationMonth,
    errors: errors.length > 0 ? errors : undefined,
  })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  evaluated: z.number().int().nonnegative(),
  proposals: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  month: z.string(),
  errors: z.array(z.string()).optional(),
})

const postDoc: OpenApiMethodDoc = {
  summary: 'Run tier evaluation for all active agency organizations (inline)',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Evaluation complete', schema: responseSchema },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Run tier evaluation',
  methods: { POST: postDoc },
}

export default POST
