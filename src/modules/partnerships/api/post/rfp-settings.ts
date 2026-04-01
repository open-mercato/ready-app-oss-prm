import { NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { RfpSettings } from '../../data/entities'
import { rfpSettingsUpdateSchema } from '../../data/validators'

export const metadata = {
  path: '/partnerships/rfp-settings',
  POST: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
}

async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = rfpSettingsUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const tenantId = auth.tenantId

  let settings = await em.findOne(RfpSettings, { tenantId })

  if (settings) {
    settings.campaignTemplate = parsed.data.campaignTemplate
    settings.awardTemplate = parsed.data.awardTemplate
    settings.rejectionTemplate = parsed.data.rejectionTemplate
  } else {
    settings = em.create(RfpSettings, {
      campaignTemplate: parsed.data.campaignTemplate,
      awardTemplate: parsed.data.awardTemplate,
      rejectionTemplate: parsed.data.rejectionTemplate,
      tenantId,
    })
    em.persist(settings)
  }

  await em.flush()

  return NextResponse.json({
    ok: true,
    campaignTemplate: settings.campaignTemplate,
    awardTemplate: settings.awardTemplate,
    rejectionTemplate: settings.rejectionTemplate,
  })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const postDoc: OpenApiMethodDoc = {
  summary: 'Save RFP message templates',
  tags: ['Partnerships'],
  requestBody: { schema: rfpSettingsUpdateSchema },
  responses: [
    { status: 200, description: 'Templates saved' },
    { status: 401, description: 'Unauthorized' },
    { status: 403, description: 'Forbidden' },
    { status: 422, description: 'Validation error' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Save RFP settings',
  methods: { POST: postDoc },
}

export default POST
