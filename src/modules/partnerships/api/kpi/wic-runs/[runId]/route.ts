import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'
import { PartnerWicRun, PartnerWicContributionUnit } from '../../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.kpi.view'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.auth?.orgId
  const runId = ctx.params?.runId
  if (!tenantId || !organizationId || !runId) throw new CrudHttpError(403, { error: 'Missing context' })

  const container = await createRequestContainer()
  const em = container.resolve('em') as any

  const run = await findOneWithDecryption(em, PartnerWicRun, {
    id: runId, tenantId, organizationId,
  } as any, undefined, { tenantId, organizationId })
  if (!run) throw new CrudHttpError(404, { error: 'WIC run not found' })

  const units = await findWithDecryption(em, PartnerWicContributionUnit, {
    tenantId, organizationId, wicRunId: runId,
  } as any, { orderBy: { ghProfile: 'asc', monthKey: 'asc' } } as any, { tenantId, organizationId })

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

export const openApi: OpenApiRouteDoc = {
  summary: 'WIC run detail with contribution units',
  methods: {
    GET: {
      summary: 'Get WIC run detail with contribution units',
      tags: ['Partnerships'],
      responses: [{ status: 200, description: 'WIC run with contribution units' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
        { status: 404, description: 'WIC run not found' },
      ],
    },
  },
}
