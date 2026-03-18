import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import type { EntityManager } from '@mikro-orm/postgresql'
import { PartnerTierDefinition } from './data/entities'

interface SeedScope {
  tenantId: string
  organizationId: string
}

async function seedTierDefaults(em: EntityManager, scope: SeedScope) {
  const existing = await em.count(PartnerTierDefinition, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  if (existing > 0) return

  const tiers = [
    { key: 'bronze', label: 'Bronze', wicThreshold: 5, wipThreshold: 2, minThreshold: 1 },
    { key: 'silver', label: 'Silver', wicThreshold: 10, wipThreshold: 5, minThreshold: 3 },
    { key: 'gold', label: 'Gold', wicThreshold: 20, wipThreshold: 10, minThreshold: 5 },
  ]

  for (const tier of tiers) {
    const entity = em.create(PartnerTierDefinition, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      key: tier.key,
      label: tier.label,
      wicThreshold: tier.wicThreshold,
      wipThreshold: tier.wipThreshold,
      minThreshold: tier.minThreshold,
    })
    em.persist(entity)
  }

  await em.flush()
}

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['partnerships.*'],
    admin: ['partnerships.*'],
    employee: [
      'partnerships.view',
      'partnerships.agencies.view',
      'partnerships.tiers.view',
      'partnerships.kpi.view',
      'partnerships.rfp.view',
      'partnerships.rfp.respond',
    ],
  },

  seedDefaults: async (ctx) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    await seedTierDefaults(ctx.em, scope)
    // Phase 1a: dictionaries and custom fields seeded via API in future iteration
    // For now, tier definitions are the critical seed
  },
}

export default setup
