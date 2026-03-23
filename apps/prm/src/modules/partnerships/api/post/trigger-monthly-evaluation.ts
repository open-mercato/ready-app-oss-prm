import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { createQueue } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  path: '/partnerships/trigger-monthly-evaluation',
  POST: { requireAuth: false },
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
  // Cron API key auth — not standard user auth
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Query all active organizations across the default tenant
  // The cron trigger is tenant-wide; CRON_SECRET grants cross-tenant access
  const allOrgs = await em.find(Organization, {
    isActive: true,
    deletedAt: null,
  })

  if (allOrgs.length === 0) {
    return NextResponse.json({ jobsEnqueued: 0, message: 'No active organizations found' })
  }

  // Determine current evaluation month (YYYY-MM)
  const now = new Date()
  const evaluationMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  // Create queue matching the worker's queue name
  const queue = createQueue<TierEvaluationPayload>('partnerships', 'local')

  let jobsEnqueued = 0
  for (const org of allOrgs) {
    const tenantId = typeof org.tenant === 'string' ? org.tenant : (org.tenant as { id: string }).id
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
  summary: 'Cron trigger: enqueue monthly tier evaluation jobs for all active organizations',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Jobs enqueued', schema: responseSchema },
    { status: 401, description: 'Invalid or missing x-api-key' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Cron trigger — monthly tier evaluation',
  methods: { POST: postDoc },
}

export default POST
