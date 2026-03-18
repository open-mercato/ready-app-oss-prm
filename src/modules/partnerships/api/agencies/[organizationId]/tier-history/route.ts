import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerAgency, PartnerTierAssignment } from '../../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.tiers.view'] },
}

export async function GET(req: NextRequest, ctx: any) {
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

  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50', 10), 100)

  const [items, total] = await em.findAndCount(
    PartnerTierAssignment,
    { tenantId, organizationId, partnerAgencyId: agency.id },
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderBy: { grantedAt: 'desc' },
    },
  )

  return Response.json({
    ok: true,
    data: {
      items: items.map((a: PartnerTierAssignment) => ({
        id: a.id,
        tierKey: a.tierKey,
        grantedAt: a.grantedAt.toISOString(),
        validUntil: a.validUntil?.toISOString() ?? null,
        reason: a.reason ?? null,
        assignedByUserId: a.assignedByUserId ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}

export const openApi = {
  '/api/partnerships/agencies/{organizationId}/tier-history': {
    get: {
      summary: 'Get tier assignment history for an agency',
      tags: ['Partnerships'],
      parameters: [
        { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
      ],
      responses: { 200: { description: 'Tier history' }, 404: { description: 'Agency not found' } },
    },
  },
}
