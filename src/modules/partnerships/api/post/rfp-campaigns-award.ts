import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { EventBus } from '@open-mercato/events/types'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { PartnerRfpCampaign, PartnerRfpResponse } from '../../data/entities'

export const metadata = {
  path: '/partnerships/rfp-campaigns/[id]/award',
  POST: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
}

const awardSchema = z.object({
  winnerOrganizationId: z.string().uuid().optional(),
})

function extractCampaignId(req: Request): string | null {
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  // /api/partnerships/rfp-campaigns/{id}/award
  const awardIdx = segments.lastIndexOf('award')
  if (awardIdx > 0) return segments[awardIdx - 1] || null
  return null
}

async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const campaignId = extractCampaignId(req)
  if (!campaignId || !/^[0-9a-f-]{36}$/i.test(campaignId)) {
    return NextResponse.json({ error: 'Campaign ID is required' }, { status: 422 })
  }

  let winnerOrganizationId: string | undefined
  try {
    const body = await req.json()
    const parsed = awardSchema.safeParse(body)
    if (parsed.success) winnerOrganizationId = parsed.data.winnerOrganizationId
  } catch {
    // no body is OK — we'll pick the first responder
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const tenantId = auth.tenantId

  const campaign = await em.findOne(PartnerRfpCampaign, { id: campaignId, tenantId })
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status === 'awarded') {
    return NextResponse.json({ error: 'Campaign is already awarded' }, { status: 422 })
  }

  // Find responses
  const responses = await em.find(PartnerRfpResponse, { campaignId, tenantId })
  if (responses.length === 0) {
    return NextResponse.json({ error: 'Cannot award campaign with no responses' }, { status: 422 })
  }

  // Determine winner
  const winnerId = winnerOrganizationId ?? responses[0].organizationId
  const isValidResponder = responses.some((r) => r.organizationId === winnerId)
  if (!isValidResponder) {
    return NextResponse.json({ error: 'Winner must be a respondent' }, { status: 422 })
  }

  campaign.status = 'awarded'
  campaign.winnerOrganizationId = winnerId
  await em.flush()

  // Emit event (best-effort)
  try {
    const eventBus = container.resolve('eventBus') as EventBus
    void eventBus.emitEvent('partnerships.rfp_campaign.awarded', {
      campaignId: campaign.id,
      title: campaign.title,
      winnerOrganizationId: winnerId,
      respondentOrganizationIds: responses.map((r) => r.organizationId),
      tenantId,
    }).catch(() => undefined)
  } catch {
    // Event emission is best-effort
  }

  return NextResponse.json({
    ok: true,
    campaign: { id: campaign.id, status: campaign.status, winnerOrganizationId: winnerId },
  })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const postDoc: OpenApiMethodDoc = {
  summary: 'Award an RFP campaign to a responding agency',
  tags: ['Partnerships'],
  requestBody: { schema: awardSchema },
  responses: [
    { status: 200, description: 'Campaign awarded' },
    { status: 404, description: 'Campaign not found' },
    { status: 422, description: 'Already awarded, no responses, or invalid winner' },
    { status: 403, description: 'Forbidden' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Award RFP campaign',
  methods: { POST: postDoc },
}

export default POST
