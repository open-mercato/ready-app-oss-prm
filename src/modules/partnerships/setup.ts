import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import type { EntityManager } from '@mikro-orm/postgresql'
import { PartnerTierDefinition, PartnerAgency } from './data/entities'
import { seedPrmDataFoundation } from './lib/seed-data-foundation'

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

const PARTNER_ROLES = [
  {
    name: 'Partner Admin',
    slug: 'partner_admin',
    description: 'Full partner portal access including team management',
    isDefault: false,
    isSystem: true,
    customerAssignable: false,
    isPortalAdmin: false,
    features: ['portal.partner.*', 'portal.users.manage', 'portal.users.view'],
  },
  {
    name: 'Partner Member',
    slug: 'partner_member',
    description: 'Can view KPIs, respond to RFPs, and view case studies',
    isDefault: true,
    isSystem: true,
    customerAssignable: true,
    isPortalAdmin: false,
    features: [
      'portal.partner.access',
      'portal.partner.kpi.view',
      'portal.partner.rfp.view',
      'portal.partner.rfp.respond',
      'portal.partner.profile.view',
    ],
  },
  {
    name: 'Partner Viewer',
    slug: 'partner_viewer',
    description: 'Read-only access to KPIs and case studies',
    isDefault: false,
    isSystem: true,
    customerAssignable: true,
    isPortalAdmin: false,
    features: [
      'portal.partner.access',
      'portal.partner.kpi.view',
      'portal.partner.profile.view',
    ],
  },
] as const

async function seedPartnerRoles(em: EntityManager, scope: SeedScope) {
  const { CustomerRole, CustomerRoleAcl } = await import(
    '@open-mercato/core/modules/customer_accounts/data/entities'
  )

  for (const roleDef of PARTNER_ROLES) {
    const existing = await em.findOne(CustomerRole, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      slug: roleDef.slug,
      deletedAt: null,
    })
    if (existing) continue

    const role = em.create(CustomerRole, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      name: roleDef.name,
      slug: roleDef.slug,
      description: roleDef.description,
      isSystem: roleDef.isSystem,
      customerAssignable: roleDef.customerAssignable,
      isDefault: roleDef.isDefault,
      createdAt: new Date(),
    })
    em.persist(role)

    const acl = em.create(CustomerRoleAcl, {
      role,
      tenantId: scope.tenantId,
      featuresJson: [...roleDef.features],
      isPortalAdmin: roleDef.isPortalAdmin,
      createdAt: new Date(),
    })
    em.persist(acl)
  }

  await em.flush()
}

async function seedExampleAgencies(em: EntityManager, scope: SeedScope) {
  const profile = process.env.OM_PRM_SEED_PROFILE || 'demo_agency'
  if (profile !== 'demo_agency') return

  const existing = await em.count(PartnerAgency, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  if (existing > 0) return

  // PartnerAgency requires agencyOrganizationId (UUID referencing a CRM organization).
  // For demo seeding, we generate a random UUID.
  const { randomUUID } = await import('node:crypto')
  const demoAgencyOrgId = randomUUID()

  const demoAgency = em.create(PartnerAgency, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    agencyOrganizationId: demoAgencyOrgId,
    name: 'Demo Agency',
    status: 'active',
  })
  em.persist(demoAgency)
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
    // Structural defaults always seed (tiers + roles are required for PRM to function)
    await seedTierDefaults(ctx.em, scope)
    await seedPartnerRoles(ctx.em, scope)
    // SPEC-053a: dictionaries, custom entity fields, and taxonomy
    await seedPrmDataFoundation(ctx.em, scope)

    // Example data only seeds when OM_SEED_EXAMPLES is not explicitly false
    const seedExamples = process.env.OM_SEED_EXAMPLES !== 'false'
    if (seedExamples) {
      await seedExampleAgencies(ctx.em, scope)
    }
  },
}

export default setup
