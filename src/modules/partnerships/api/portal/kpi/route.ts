import type { NextRequest } from 'next/server'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'
import { resolvePartnerAgency } from '../../../lib/resolvePartnerAgency'
import { PartnerMetricSnapshot, PartnerWicContributionUnit, PartnerLicenseDeal } from '../../../data/entities'

export const metadata = {
  GET: { requireCustomerAuth: true, requireCustomerFeatures: ['portal.partner.kpi.view'] },
}

export async function GET(req: NextRequest, ctx: any) {
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

  const { agency } = agencyCtx
  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25')))
  const offset = (page - 1) * pageSize

  const scope = { tenantId: auth.tenantId, organizationId: auth.orgId }

  const metrics = await findWithDecryption(
    em,
    PartnerMetricSnapshot,
    { tenantId: auth.tenantId, organizationId: auth.orgId, partnerAgencyId: agency.id } as any,
    { orderBy: { periodEnd: 'DESC' }, limit: pageSize, offset },
    scope,
  )

  const wicContributions = await findWithDecryption(
    em,
    PartnerWicContributionUnit,
    { tenantId: auth.tenantId, organizationId: auth.orgId, partnerAgencyId: agency.id } as any,
    { orderBy: { monthKey: 'DESC' }, limit: pageSize },
    scope,
  )

  const licenseDeals = await findWithDecryption(
    em,
    PartnerLicenseDeal,
    { tenantId: auth.tenantId, organizationId: auth.orgId, partnerAgencyId: agency.id, deletedAt: null } as any,
    { orderBy: { createdAt: 'DESC' }, limit: pageSize },
    scope,
  )

  return Response.json({
    ok: true,
    data: {
      metrics: metrics.map((m: PartnerMetricSnapshot) => ({
        metricKey: m.metricKey,
        value: m.value,
        periodStart: m.periodStart,
        periodEnd: m.periodEnd,
        source: m.source,
      })),
      wicContributions: wicContributions.map((c: PartnerWicContributionUnit) => ({
        ghProfile: c.ghProfile,
        monthKey: c.monthKey,
        featureKey: c.featureKey,
        baseScore: c.baseScore,
        wicFinal: c.wicFinal,
        wicLevel: c.wicLevel,
      })),
      licenseDeals: licenseDeals.map((d: PartnerLicenseDeal) => ({
        id: d.id,
        dealType: d.dealType,
        status: d.status,
        isRenewal: d.isRenewal,
        attributedAt: d.attributedAt?.toISOString() ?? null,
      })),
      page,
      pageSize,
    },
  })
}

export const openApi: OpenApiRouteDoc = {
  summary: 'Partner KPI details',
  methods: {
    GET: {
      summary: 'Get detailed KPI metrics, WIC contributions, and license deals for the partner',
      tags: ['Partner Portal'],
      responses: [{ status: 200, description: 'Success' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
      ],
    },
  },
}
