import type { NextRequest } from 'next/server'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolvePartnerAgency } from '../../../../lib/resolvePartnerAgency'

export const metadata = {
  PUT: { requireCustomerAuth: true, requireCustomerFeatures: ['portal.partner.profile.manage'] },
  DELETE: { requireCustomerAuth: true, requireCustomerFeatures: ['portal.partner.profile.manage'] },
}

export async function PUT(req: NextRequest, ctx: any) {
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

  // TODO: Update case study via custom entities API
  return Response.json({ error: 'Case study update pending SPEC-053a implementation' }, { status: 501 })
}

export async function DELETE(req: NextRequest, ctx: any) {
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

  // TODO: Delete case study via custom entities API
  return Response.json({ error: 'Case study deletion pending SPEC-053a implementation' }, { status: 501 })
}
