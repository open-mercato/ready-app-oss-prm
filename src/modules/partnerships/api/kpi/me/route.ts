import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerAgency, PartnerMetricSnapshot } from '../../../data/entities'
import { getCurrentTierAssignment } from '../../../lib/tier-lifecycle'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.kpi.view'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

  const em = ctx.container.resolve('em') as any
  const url = new URL(req.url)
  const period = url.searchParams.get('period') // YYYY-MM

  // Find agency for current user's organization
  const agency = await em.findOne(PartnerAgency, {
    tenantId, organizationId, agencyOrganizationId: organizationId, deletedAt: null,
  })
  if (!agency) throw new CrudHttpError(404, { error: 'No partner agency found for this organization' })

  const where: any = { tenantId, organizationId, partnerAgencyId: agency.id }
  if (period) {
    const [year, month] = period.split('-').map(Number)
    where.periodStart = { $gte: new Date(year, month - 1, 1) }
    where.periodEnd = { $lte: new Date(year, month, 0) }
  }

  const snapshots = await em.find(PartnerMetricSnapshot, where, {
    orderBy: { periodEnd: 'desc', metricKey: 'asc' },
  })

  const currentTier = await getCurrentTierAssignment(em, { tenantId, organizationId }, agency.id)

  return Response.json({
    ok: true,
    data: {
      agencyId: agency.id,
      currentTier: currentTier?.tierKey ?? null,
      snapshots: snapshots.map((s: PartnerMetricSnapshot) => ({
        id: s.id, metricKey: s.metricKey, value: Number(s.value),
        periodStart: s.periodStart.toISOString?.() ?? s.periodStart,
        periodEnd: s.periodEnd.toISOString?.() ?? s.periodEnd,
        source: s.source,
      })),
    },
  })
}

export const openApi = {
  '/api/partnerships/kpi/me': {
    get: { summary: 'Get my KPI snapshots (agency self-view)', tags: ['Partnerships'] },
  },
}
