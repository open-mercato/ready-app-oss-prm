import type { NextRequest } from 'next/server'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolvePartnerAgency } from '../../../../../lib/resolvePartnerAgency'
import { PartnerRfpCampaign, PartnerRfpResponse } from '../../../../../data/entities'
import { emitPartnershipEvent } from '../../../../../events'
import { z } from 'zod'

const rfpResponseSchema = z.object({
  content: z.string().min(1).max(10000),
})

export const metadata = {
  POST: { requireCustomerAuth: true, requireCustomerFeatures: ['portal.partner.rfp.respond'] },
}

export async function POST(req: NextRequest, ctx: any) {
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

  const body = await req.json()
  const parsed = rfpResponseSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const campaign = await em.findOne(PartnerRfpCampaign, {
    id: campaignId,
    tenantId: auth.tenantId,
    organizationId: auth.orgId,
    status: 'published',
    deletedAt: null,
  })
  if (!campaign) {
    return Response.json({ error: 'Campaign not found or not accepting responses' }, { status: 404 })
  }

  let response = await em.findOne(PartnerRfpResponse, {
    rfpCampaignId: campaign.id,
    partnerAgencyId: agencyCtx.agency.id,
    tenantId: auth.tenantId,
  })

  if (response) {
    response.content = parsed.data.content
    response.status = 'submitted'
    response.submittedAt = new Date()
    response.updatedAt = new Date()
  } else {
    response = em.create(PartnerRfpResponse, {
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      rfpCampaignId: campaign.id,
      partnerAgencyId: agencyCtx.agency.id,
      content: parsed.data.content,
      status: 'submitted',
      submittedAt: new Date(),
      createdAt: new Date(),
    })
    em.persist(response)
  }

  await em.flush()

  try {
    emitPartnershipEvent('partnerships.partner_rfp.responded', {
      id: response.id,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      rfpCampaignId: campaign.id,
      partnerAgencyId: agencyCtx.agency.id,
    }, ctx)
  } catch {
    // Event emission is best-effort from portal routes
  }

  return Response.json({
    ok: true,
    data: {
      id: response.id,
      status: response.status,
      content: response.content,
      submittedAt: response.submittedAt?.toISOString(),
    },
  })
}
