import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'
import { PartnerAgency, PartnerMetricSnapshot, PartnerTierAssignment } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.kpi.manage'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.auth?.orgId
  if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

  const container = await createRequestContainer()
  const em = container.resolve('em') as any

  // Batch fetch all agencies
  const agencies = await findWithDecryption(em, PartnerAgency, {
    tenantId, organizationId, deletedAt: null,
  } as any, undefined, { tenantId, organizationId })

  if (agencies.length === 0) {
    return Response.json({ ok: true, data: { items: [], total: 0 } })
  }

  const agencyIds = agencies.map((a: PartnerAgency) => a.id)

  // Batch fetch all latest metric snapshots for all agencies in one query
  // Then group by agencyId + metricKey, keeping only the latest per pair
  const allSnapshots = await findWithDecryption(em, PartnerMetricSnapshot, {
    tenantId, organizationId, partnerAgencyId: { $in: agencyIds },
  } as any, {
    orderBy: { periodEnd: 'desc' },
  } as any, { tenantId, organizationId })

  // Group latest metric per agency+metricKey
  const metricsByAgency = new Map<string, { wic: number; wip: number; min: number }>()
  for (const snap of allSnapshots) {
    const key = snap.partnerAgencyId
    if (!metricsByAgency.has(key)) {
      metricsByAgency.set(key, { wic: 0, wip: 0, min: 0 })
    }
    const entry = metricsByAgency.get(key)!
    const metricKey = snap.metricKey as 'wic' | 'wip' | 'min'
    if (metricKey in entry && entry[metricKey] === 0) {
      entry[metricKey] = Number(snap.value)
    }
  }

  // Batch fetch all current tier assignments in one query
  const allAssignments = await findWithDecryption(em, PartnerTierAssignment, {
    tenantId, organizationId, partnerAgencyId: { $in: agencyIds },
    $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
  } as any, {
    orderBy: { grantedAt: 'desc' },
  } as any, { tenantId, organizationId })

  // Keep only the latest assignment per agency
  const tierByAgency = new Map<string, string>()
  for (const assignment of allAssignments) {
    if (!tierByAgency.has(assignment.partnerAgencyId)) {
      tierByAgency.set(assignment.partnerAgencyId, assignment.tierKey)
    }
  }

  const dashboard = agencies.map((agency: PartnerAgency) => {
    const metrics = metricsByAgency.get(agency.id) ?? { wic: 0, wip: 0, min: 0 }
    return {
      agencyId: agency.id,
      agencyOrganizationId: agency.agencyOrganizationId,
      status: agency.status,
      currentTier: tierByAgency.get(agency.id) ?? null,
      wic: metrics.wic,
      wip: metrics.wip,
      min: metrics.min,
    }
  })

  return Response.json({ ok: true, data: { items: dashboard, total: dashboard.length } })
}

export const openApi: OpenApiRouteDoc = {
  summary: 'KPI dashboard for all agencies',
  methods: {
    GET: {
      summary: 'Get KPI dashboard (all agencies)',
      tags: ['Partnerships'],
      responses: [{ status: 200, description: 'Dashboard with metrics for all agencies' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
      ],
    },
  },
}
