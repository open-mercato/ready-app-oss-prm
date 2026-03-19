import type { NextRequest } from 'next/server'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'
import { resolvePartnerAgency } from '../../../lib/resolvePartnerAgency'
import { PartnerRfpCampaign, PartnerRfpResponse } from '../../../data/entities'

export const metadata = {
  GET: { requireCustomerAuth: true, requireCustomerFeatures: ['portal.partner.rfp.view'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const auth = await getCustomerAuthFromRequest(req)
  if (!auth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as any

  const agencyCtx = await resolvePartnerAgency(em, auth.customerEntityId, auth.tenantId, auth.orgId)
  if (!agencyCtx) {
    return Response.json({ error: 'No partner agency linked to your account' }, { status: 403 })
  }

  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25')))
  const offset = (page - 1) * pageSize

  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }

  const campaigns = await findWithDecryption(
    em,
    PartnerRfpCampaign,
    {
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      status: { $in: ['published', 'closed'] },
      deletedAt: null,
    } as any,
    { orderBy: { createdAt: 'DESC' }, limit: pageSize, offset },
    scope,
  )

  const visibleCampaigns = campaigns.filter((c: PartnerRfpCampaign) =>
    c.audience === 'all' ||
    (c.invitedAgencyIds ?? []).includes(agencyCtx.agency.id)
  )

  const campaignIds = visibleCampaigns.map((c: PartnerRfpCampaign) => c.id)
  const responses = campaignIds.length > 0
    ? await findWithDecryption(em, PartnerRfpResponse, {
        rfpCampaignId: { $in: campaignIds },
        partnerAgencyId: agencyCtx.agency.id,
        tenantId: auth.tenantId,
      } as any, undefined, scope)
    : []

  const responseMap = new Map<string, PartnerRfpResponse>(responses.map((r: PartnerRfpResponse) => [r.rfpCampaignId, r]))

  return Response.json({
    ok: true,
    data: {
      items: visibleCampaigns.map((c: PartnerRfpCampaign) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        deadline: c.deadline?.toISOString() ?? null,
        createdAt: c.createdAt?.toISOString(),
        hasResponded: responseMap.has(c.id),
        responseStatus: responseMap.get(c.id)?.status ?? null,
      })),
      page,
      pageSize,
    },
  })
}

export const openApi: OpenApiRouteDoc = {
  summary: 'List RFP campaigns visible to partner',
  methods: {
    GET: {
      summary: 'List published/closed RFP campaigns for the authenticated partner',
      tags: ['Partner Portal'],
      responses: [{ status: 200, description: 'Success' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
      ],
    },
  },
}
