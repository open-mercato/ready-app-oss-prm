import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { createQueue } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  path: '/partnerships/enqueue-tier-evaluation',
  POST: { requireAuth: true, requireFeatures: ['partnerships.manage'] },
}

// ---------------------------------------------------------------------------
// Payload type (must match worker expectation)
// ---------------------------------------------------------------------------

type TierEvaluationPayload = {
  organizationId: string
  evaluationMonth: string
  tenantId: string
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const tenantId = auth.tenantId

  // Determine the PM's own org (to exclude from agency list)
  const pmOrgId = auth.orgId

  // Query all active agency organizations
  const allOrgs = await em.find(Organization, {
    tenant: tenantId,
    isActive: true,
    deletedAt: null,
  })

  const agencyOrgs = allOrgs.filter((o) => o.id !== pmOrgId)

  if (agencyOrgs.length === 0) {
    return NextResponse.json({ jobsEnqueued: 0, message: 'No active agency organizations found' })
  }

  // Determine current evaluation month (YYYY-MM)
  const now = new Date()
  const evaluationMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  // Create queue matching the worker's queue name
  const queue = createQueue<TierEvaluationPayload>('partnerships', 'local')

  let jobsEnqueued = 0
  for (const org of agencyOrgs) {
    await queue.enqueue({
      organizationId: org.id,
      evaluationMonth,
      tenantId,
    })
    jobsEnqueued++
  }

  await queue.close()

  return NextResponse.json({ jobsEnqueued })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  jobsEnqueued: z.number().int().nonnegative(),
  message: z.string().optional(),
})

const postDoc: OpenApiMethodDoc = {
  summary: 'Enqueue tier evaluation jobs for all active agency organizations',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Jobs enqueued', schema: responseSchema },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Enqueue tier evaluation',
  methods: { POST: postDoc },
}

export default POST
