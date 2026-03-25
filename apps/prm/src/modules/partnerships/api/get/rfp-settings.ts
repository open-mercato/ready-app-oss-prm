import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { RfpSettings } from '../../data/entities'

export const metadata = {
  path: '/partnerships/rfp-settings',
  GET: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
}

async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const settings = await em.findOne(RfpSettings, { tenantId: auth.tenantId })

  if (!settings) {
    return NextResponse.json({
      campaignTemplate: '',
      awardTemplate: '',
      rejectionTemplate: '',
    })
  }

  return NextResponse.json({
    campaignTemplate: settings.campaignTemplate,
    awardTemplate: settings.awardTemplate,
    rejectionTemplate: settings.rejectionTemplate,
  })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  campaignTemplate: z.string(),
  awardTemplate: z.string(),
  rejectionTemplate: z.string(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'Get RFP message templates',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'RFP message templates', schema: responseSchema },
    { status: 401, description: 'Unauthorized' },
    { status: 403, description: 'Forbidden' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'RFP settings',
  methods: { GET: getDoc },
}

export default GET
