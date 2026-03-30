import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { PartnerLicenseDeal } from '../../../data/entities'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.license-deals.view'] },
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const resolved = await params
    const parsed = paramsSchema.safeParse(resolved)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    const deal = await em.findOne(PartnerLicenseDeal, {
      id: parsed.data.id,
      tenantId: auth.tenantId,
    })
    if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(deal)
  } catch (err) {
    console.error('[partnerships/partner-license-deals/[id].GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'License deal detail',
  methods: {
    GET: {
      summary: 'Get a single license deal by ID',
      tags: ['Partnerships'],
      responses: [
        { status: 200, description: 'License deal detail' },
        { status: 404, description: 'Not found' },
      ],
    },
  },
}
