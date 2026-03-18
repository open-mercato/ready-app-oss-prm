import type { EntityManager } from '@mikro-orm/postgresql'
import { PartnerTierDefinition, PartnerTierAssignment, PartnerMetricSnapshot } from '../data/entities'

interface TierScope {
  tenantId: string
  organizationId: string
}

export interface TierEligibility {
  tierKey: string
  tierLabel: string
  wicThreshold: number
  wipThreshold: number
  minThreshold: number
  wicCurrent: number
  wipCurrent: number
  minCurrent: number
  wicMet: boolean
  wipMet: boolean
  minMet: boolean
  allMet: boolean
}

export async function getCurrentTierAssignment(
  em: EntityManager,
  scope: TierScope,
  partnerAgencyId: string,
): Promise<PartnerTierAssignment | null> {
  return em.findOne(
    PartnerTierAssignment,
    {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      partnerAgencyId,
      $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
    },
    { orderBy: { grantedAt: 'desc' } },
  )
}

export async function getLatestMetricValues(
  em: EntityManager,
  scope: TierScope,
  partnerAgencyId: string,
): Promise<{ wic: number; wip: number; min: number }> {
  const metrics = { wic: 0, wip: 0, min: 0 }
  for (const key of ['wic', 'wip', 'min'] as const) {
    const latest = await em.findOne(
      PartnerMetricSnapshot,
      { tenantId: scope.tenantId, organizationId: scope.organizationId, partnerAgencyId, metricKey: key },
      { orderBy: { periodEnd: 'desc' } },
    )
    if (latest) metrics[key] = Number(latest.value)
  }
  return metrics
}

export async function computeEligibility(
  em: EntityManager,
  scope: TierScope,
  partnerAgencyId: string,
): Promise<TierEligibility[]> {
  const metrics = await getLatestMetricValues(em, scope, partnerAgencyId)
  const tiers = await em.find(PartnerTierDefinition, {
    tenantId: scope.tenantId, organizationId: scope.organizationId, isActive: true, deletedAt: null,
  }, { orderBy: { wicThreshold: 'asc' } })

  return tiers.map((tier) => {
    const wicMet = metrics.wic >= tier.wicThreshold
    const wipMet = metrics.wip >= tier.wipThreshold
    const minMet = metrics.min >= tier.minThreshold
    return {
      tierKey: tier.key, tierLabel: tier.label,
      wicThreshold: tier.wicThreshold, wipThreshold: tier.wipThreshold, minThreshold: tier.minThreshold,
      wicCurrent: metrics.wic, wipCurrent: metrics.wip, minCurrent: metrics.min,
      wicMet, wipMet, minMet, allMet: wicMet && wipMet && minMet,
    }
  })
}
