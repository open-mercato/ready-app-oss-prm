import type { NextRequest } from 'next/server'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'
import { resolvePartnerAgency } from '../../../../lib/resolvePartnerAgency'
import { PartnerRfpCampaign, PartnerRfpResponse } from '../../../../data/entities'

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

  const campaignId = ctx.params?.id
  if (!campaignId) return Response.json({ error: 'Missing campaign ID' }, { status: 400 })

  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }

  const campaign = await findOneWithDecryption(em, PartnerRfpCampaign, {
    id: campaignId,
    tenantId: auth.tenantId,
    organizationId: auth.orgId,
    deletedAt: null,
  } as any, undefined, scope)
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  const response = await findOneWithDecryption(em, PartnerRfpResponse, {
    rfpCampaignId: campaign.id,
    partnerAgencyId: agencyCtx.agency.id,
    tenantId: auth.tenantId,
  } as any, undefined, scope)

  return Response.json({
    ok: true,
    data: {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description ?? null,
      status: campaign.status,
      deadline: campaign.deadline?.toISOString() ?? null,
      createdAt: campaign.createdAt?.toISOString(),
      response: response
        ? {
            id: response.id,
            status: response.status,
            content: response.content ?? null,
            submittedAt: response.submittedAt?.toISOString() ?? null,
          }
        : null,
    },
  })
}

export const openApi: OpenApiRouteDoc = {
  summary: 'Get RFP campaign detail',
  methods: {
    GET: {
      summary: 'Get a single RFP campaign with partner response status',
      tags: ['Partner Portal'],
      responses: [{ status: 200, description: 'Success' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
        { status: 404, description: 'Campaign not found' },
      ],
    },
  },
}
