import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerAgency } from '../../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['partnerships.tiers.manage'] },
}

export async function POST(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) {
    throw new CrudHttpError(403, { error: 'Missing context' })
  }

  const agencyOrgId = ctx.params?.organizationId
  if (!agencyOrgId) {
    throw new CrudHttpError(400, { error: 'Missing organizationId param' })
  }

  const em = ctx.container.resolve('em') as any

  const agency = await em.findOne(PartnerAgency, {
    tenantId, organizationId, agencyOrganizationId: agencyOrgId, deletedAt: null,
  })
  if (!agency) {
    throw new CrudHttpError(404, { error: 'Partner agency not found' })
  }

  const body = await req.json()
  const executeCommand = ctx.container.resolve('executeCommand') as any
  const result = await executeCommand('partnerships.partner_tier.downgrade', {
    ...body,
    partnerAgencyId: agency.id,
  }, ctx)

  return Response.json({
    ok: true,
    data: {
      id: result.id,
      tierKey: result.tierKey,
      grantedAt: result.grantedAt.toISOString(),
      validUntil: result.validUntil?.toISOString() ?? null,
      reason: result.reason ?? null,
    },
  }, { status: 201 })
}

export const openApi = {
  '/api/partnerships/agencies/{organizationId}/tier-downgrade': {
    post: {
      summary: 'Downgrade an agency tier',
      tags: ['Partnerships'],
      parameters: [
        { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                newTierKey: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['newTierKey', 'reason'],
            },
          },
        },
      },
      responses: { 201: { description: 'Tier downgraded' }, 404: { description: 'Agency or tier not found' } },
    },
  },
}
