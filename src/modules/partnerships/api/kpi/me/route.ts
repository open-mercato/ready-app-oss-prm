import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'
import { PartnerAgency, PartnerMetricSnapshot } from '../../../data/entities'
import { getCurrentTierAssignment } from '../../../lib/tier-lifecycle'

const meQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM format').optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.kpi.view'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.auth?.orgId
  if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

  const container = await createRequestContainer()
  const em = container.resolve('em') as any
  const url = new URL(req.url)
  const queryParams = meQuerySchema.parse({
    period: url.searchParams.get('period') ?? undefined,
  })

  // Find agency for current user's organization
  const agency = await findOneWithDecryption(em, PartnerAgency, {
    tenantId, organizationId, agencyOrganizationId: organizationId, deletedAt: null,
  } as any, undefined, { tenantId, organizationId })
  if (!agency) throw new CrudHttpError(404, { error: 'No partner agency found for this organization' })

  const where: any = { tenantId, organizationId, partnerAgencyId: agency.id }
  if (queryParams.period) {
    const [year, month] = queryParams.period.split('-').map(Number)
    where.periodStart = { $gte: new Date(year, month - 1, 1) }
    where.periodEnd = { $lte: new Date(year, month, 0) }
  }

  const snapshots = await findWithDecryption(em, PartnerMetricSnapshot, where, {
    orderBy: { periodEnd: 'desc', metricKey: 'asc' },
  } as any, { tenantId, organizationId })

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

export const openApi: OpenApiRouteDoc = {
  summary: 'Agency self-view KPI snapshots',
  methods: {
    GET: {
      summary: 'Get my KPI snapshots (agency self-view)',
      tags: ['Partnerships'],
      query: meQuerySchema,
      responses: [{ status: 200, description: 'KPI snapshots for the current agency' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
        { status: 404, description: 'No partner agency found for this organization' },
      ],
    },
  },
}
