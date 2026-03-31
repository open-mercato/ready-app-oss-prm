import { NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { EventBus } from '@open-mercato/events/types'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { PartnerRfpCampaign } from '../../data/entities'

export const metadata = {
  path: '/partnerships/rfp-campaigns/[id]/publish',
  POST: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
}

function extractCampaignId(req: Request): string | null {
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  // /api/partnerships/rfp-campaigns/{id}/publish
  const publishIdx = segments.lastIndexOf('publish')
  if (publishIdx > 0) return segments[publishIdx - 1] || null
  return null
}

async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Support both URL param and body
  let campaignId = extractCampaignId(req)
  if (!campaignId) {
    try {
      const body = await req.json()
      campaignId = body?.campaignId
    } catch {
      // no body
    }
  }

  if (!campaignId || !/^[0-9a-f-]{36}$/i.test(campaignId)) {
    return NextResponse.json({ error: 'Campaign ID is required' }, { status: 422 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const tenantId = auth.tenantId

  const campaign = await em.findOne(PartnerRfpCampaign, {
    id: campaignId,
    tenantId,
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'draft') {
    return NextResponse.json(
      { error: `Campaign is already ${campaign.status}` },
      { status: 422 },
    )
  }

  campaign.status = 'published'
  await em.flush()

  // Emit event (best-effort)
  try {
    const eventBus = container.resolve('eventBus') as EventBus
    void eventBus.emitEvent('partnerships.rfp_campaign.published', {
      campaignId: campaign.id,
      title: campaign.title,
      audience: campaign.audience,
      selectedAgencyIds: campaign.selectedAgencyIds,
      deadline: campaign.deadline.toISOString(),
      tenantId,
    }).catch(() => undefined)
  } catch {
    // Event emission is best-effort
  }

  return NextResponse.json({
    ok: true,
    campaign: {
      id: campaign.id,
      status: campaign.status,
    },
  })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const postDoc: OpenApiMethodDoc = {
  summary: 'Publish a draft RFP campaign (changes status from draft to published)',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Campaign published successfully' },
    { status: 404, description: 'Campaign not found' },
    { status: 422, description: 'Campaign is not in draft status' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Publish RFP campaign',
  methods: { POST: postDoc },
}

export default POST
