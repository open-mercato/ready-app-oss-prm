import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerAgency, PartnerMetricSnapshot } from '../../../data/entities'
import { getCurrentTierAssignment, getLatestMetricValues } from '../../../lib/tier-lifecycle'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.kpi.manage'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

  const em = ctx.container.resolve('em') as any

  const agencies = await em.find(PartnerAgency, {
    tenantId, organizationId, deletedAt: null,
  })

  const dashboard = await Promise.all(agencies.map(async (agency: PartnerAgency) => {
    const metrics = await getLatestMetricValues(em, { tenantId, organizationId }, agency.id)
    const currentTier = await getCurrentTierAssignment(em, { tenantId, organizationId }, agency.id)

    return {
      agencyId: agency.id,
      agencyOrganizationId: agency.agencyOrganizationId,
      status: agency.status,
      currentTier: currentTier?.tierKey ?? null,
      wic: metrics.wic,
      wip: metrics.wip,
      min: metrics.min,
    }
  }))

  return Response.json({ ok: true, data: { items: dashboard, total: dashboard.length } })
}

export const openApi = {
  '/api/partnerships/kpi/dashboard': {
    get: { summary: 'Get KPI dashboard (all agencies)', tags: ['Partnerships'] },
  },
}
