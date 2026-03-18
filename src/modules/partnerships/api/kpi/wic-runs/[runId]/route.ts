import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerWicRun, PartnerWicContributionUnit } from '../../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.kpi.view'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  const runId = ctx.params?.runId
  if (!tenantId || !organizationId || !runId) throw new CrudHttpError(403, { error: 'Missing context' })

  const em = ctx.container.resolve('em') as any

  const run = await em.findOne(PartnerWicRun, {
    id: runId, tenantId, organizationId,
  })
  if (!run) throw new CrudHttpError(404, { error: 'WIC run not found' })

  const units = await em.find(PartnerWicContributionUnit, {
    tenantId, organizationId, wicRunId: runId,
  }, { orderBy: { ghProfile: 'asc', monthKey: 'asc' } })

  return Response.json({
    ok: true,
    data: {
      run: {
        id: run.id,
        runDate: run.runDate.toISOString?.() ?? run.runDate,
        periodStart: run.periodStart.toISOString?.() ?? run.periodStart,
        periodEnd: run.periodEnd.toISOString?.() ?? run.periodEnd,
        scriptVersion: run.scriptVersion,
        status: run.status,
        importedByUserId: run.importedByUserId,
        createdAt: run.createdAt.toISOString(),
      },
      units: units.map((u: PartnerWicContributionUnit) => ({
        id: u.id,
        ghProfile: u.ghProfile,
        monthKey: u.monthKey,
        featureKey: u.featureKey,
        baseScore: Number(u.baseScore),
        impactBonus: Number(u.impactBonus),
        bountyMultiplier: Number(u.bountyMultiplier),
        wicFinal: Number(u.wicFinal),
        wicLevel: u.wicLevel,
        bountyBonus: Number(u.bountyBonus),
        partnerAgencyId: u.partnerAgencyId,
        includedReason: u.includedReason,
        excludedReason: u.excludedReason,
      })),
      totalUnits: units.length,
    },
  })
}

export const openApi = {
  '/api/partnerships/kpi/wic-runs/{runId}': {
    get: { summary: 'Get WIC run detail with contribution units', tags: ['Partnerships'] },
  },
}
