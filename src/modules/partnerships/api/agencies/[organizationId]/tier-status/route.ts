import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerAgency } from '../../../../data/entities'
import { getCurrentTierAssignment, computeEligibility } from '../../../../lib/tier-lifecycle'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.tiers.view'] },
}

export async function GET(_req: NextRequest, ctx: any) {
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

  const scope = { tenantId, organizationId }
  const currentAssignment = await getCurrentTierAssignment(em, scope, agency.id)
  const eligibility = await computeEligibility(em, scope, agency.id)

  return Response.json({
    ok: true,
    data: {
      agencyId: agency.id,
      agencyOrganizationId: agencyOrgId,
      currentTier: currentAssignment
        ? {
            tierKey: currentAssignment.tierKey,
            grantedAt: currentAssignment.grantedAt.toISOString(),
            validUntil: currentAssignment.validUntil?.toISOString() ?? null,
            reason: currentAssignment.reason ?? null,
          }
        : null,
      eligibility,
    },
  })
}

export const openApi = {
  '/api/partnerships/agencies/{organizationId}/tier-status': {
    get: {
      summary: 'Get current tier status and eligibility for an agency',
      tags: ['Partnerships'],
      parameters: [
        { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { 200: { description: 'Tier status' }, 404: { description: 'Agency not found' } },
    },
  },
}
