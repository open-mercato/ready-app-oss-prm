import {
  CustomerEntity,
  CustomerCompanyProfile,
  CustomerDeal,
  CustomerDealCompanyLink,
  CustomerPipeline,
  CustomerPipelineStage,
} from '@open-mercato/core/modules/customers/data/entities'
import {
  PRM_PIPELINE_NAME,
  PRM_PIPELINE_STAGES,
} from '../data/custom-fields'
import type { EntityManager } from '@mikro-orm/postgresql'

type SeedScope = { tenantId: string; organizationId: string }

/**
 * Seeds PRM pipeline stages for an organization.
 */
export async function seedPipelineForOrg(em: EntityManager, scope: SeedScope): Promise<void> {
  const existing = await em.findOne(CustomerPipeline, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    name: PRM_PIPELINE_NAME,
  })
  if (existing) return

  const pipeline = em.create(CustomerPipeline, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    name: PRM_PIPELINE_NAME,
    isDefault: false,
  })
  em.persist(pipeline)
  await em.flush()

  for (const stage of PRM_PIPELINE_STAGES) {
    em.persist(
      em.create(CustomerPipelineStage, {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        pipelineId: pipeline.id,
        label: stage.name,
        order: stage.order,
      })
    )
  }
  await em.flush()
}

type DemoDeal = {
  title: string
  stageName: string
  status: string
  valueAmount: number
}

const DEMO_DEALS: DemoDeal[] = [
  { title: 'Initial Prospect — ERP Modernization', stageName: 'New', status: 'open', valueAmount: 50000 },
  { title: 'First Contact — Cloud Migration', stageName: 'Contacted', status: 'open', valueAmount: 80000 },
  { title: 'Qualified Lead — API Platform', stageName: 'SQL', status: 'open', valueAmount: 150000 },
]

/**
 * Seeds demo CRM data (prospect companies + deals) for a new agency org.
 * KPI-safe: no wip_registered_at stamps on demo deals.
 */
export async function seedAgencyDemoData(em: EntityManager, scope: SeedScope): Promise<void> {
  // Ensure pipeline exists
  await seedPipelineForOrg(em, scope)

  // Resolve pipeline stages
  const pipeline = await em.findOne(CustomerPipeline, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    name: PRM_PIPELINE_NAME,
  })
  const stages = pipeline
    ? await em.find(CustomerPipelineStage, {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        pipelineId: pipeline.id,
      })
    : []
  const stageByName = new Map(stages.map((s) => [s.label, s]))

  // Create a demo prospect company
  const prospectCompany = em.create(CustomerEntity, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    kind: 'company',
    displayName: 'Demo Prospect Corp',
    description: 'Sample prospect company — demo data',
    primaryEmail: null,
    primaryPhone: null,
    lifecycleStage: 'prospect',
    status: 'active',
    source: 'demo-seed',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  const prospectProfile = em.create(CustomerCompanyProfile, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    entity: prospectCompany,
    legalName: 'Demo Prospect Corp',
    brandName: 'Demo Prospect',
    domain: null,
    websiteUrl: null,
    industry: 'Technology',
    sizeBucket: '51-200',
    annualRevenue: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  em.persist(prospectCompany)
  em.persist(prospectProfile)
  await em.flush()

  // Create demo deals (no WIP stamps — KPI-safe)
  for (const dealDef of DEMO_DEALS) {
    const stage = stageByName.get(dealDef.stageName)
    const deal = em.create(CustomerDeal, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      title: dealDef.title,
      description: null,
      status: dealDef.status,
      pipelineId: pipeline?.id ?? null,
      pipelineStage: dealDef.stageName,
      pipelineStageId: stage?.id ?? null,
      valueAmount: dealDef.valueAmount.toFixed(2),
      valueCurrency: 'USD',
      probability: null,
      expectedCloseAt: null,
      ownerUserId: null,
      source: 'demo-seed',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(deal)

    em.persist(em.create(CustomerDealCompanyLink, {
      deal,
      company: prospectCompany,
      createdAt: new Date(),
    }))
  }

  await em.flush()
}
