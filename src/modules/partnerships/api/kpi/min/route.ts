import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerLicenseDeal } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.kpi.view'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

  const em = ctx.container.resolve('em') as any
  const url = new URL(req.url)
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString(), 10)

  const deals = await em.find(PartnerLicenseDeal, {
    tenantId, organizationId,
    dealType: 'enterprise',
    status: 'won',
    isRenewal: false,
    deletedAt: null,
    createdAt: {
      $gte: new Date(year, 0, 1),
      $lt: new Date(year + 1, 0, 1),
    },
  })

  // Group by attributed agency
  const byAgency: Record<string, number> = {}
  for (const deal of deals) {
    const key = deal.partnerAgencyId ?? 'unattributed'
    byAgency[key] = (byAgency[key] || 0) + 1
  }

  return Response.json({
    ok: true,
    data: {
      year,
      totalDeals: deals.length,
      attributedDeals: deals.filter((d: PartnerLicenseDeal) => d.partnerAgencyId).length,
      byAgency,
    },
  })
}

export const openApi = {
  '/api/partnerships/kpi/min': {
    get: { summary: 'Get MIN summary by year', tags: ['Partnerships'] },
  },
}
