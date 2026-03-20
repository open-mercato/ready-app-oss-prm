import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { cf } from '@open-mercato/shared/modules/dsl'
import {
  CustomerEntity,
  CustomerCompanyProfile,
  CustomerDeal,
  CustomerDealCompanyLink,
  CustomerPipeline,
  CustomerPipelineStage,
} from '@open-mercato/core/modules/customers/data/entities'
import { Dictionary, DictionaryEntry } from '@open-mercato/core/modules/dictionaries/data/entities'
import { ensureCustomFieldDefinitions } from '@open-mercato/core/modules/entities/lib/field-definitions'
import { DefaultDataEngine } from '@open-mercato/shared/lib/data/engine'
import { E } from '#generated/entities.ids.generated'
import {
  PRM_PIPELINE_NAME,
  PRM_PIPELINE_STAGES,
  COMPANY_PROFILE_FIELDS,
  CASE_STUDY_FIELDS,
  WIP_REGISTERED_AT_FIELD,
  SERVICES_OPTIONS,
  INDUSTRIES_OPTIONS,
  TECHNOLOGIES_OPTIONS,
  VERTICALS_OPTIONS,
  BUDGET_BUCKET_OPTIONS,
  DURATION_BUCKET_OPTIONS,
} from './data/custom-fields'

// ---------------------------------------------------------------------------
// Dictionary definitions
// ---------------------------------------------------------------------------

type DictionaryDef = {
  key: string
  name: string
  options: readonly string[]
}

const DICTIONARIES: DictionaryDef[] = [
  { key: 'prm_services', name: 'Services', options: SERVICES_OPTIONS },
  { key: 'prm_industries', name: 'Industries', options: INDUSTRIES_OPTIONS },
  { key: 'prm_technologies', name: 'Technologies', options: TECHNOLOGIES_OPTIONS },
  { key: 'prm_verticals', name: 'Verticals', options: VERTICALS_OPTIONS },
  { key: 'prm_budget_bucket', name: 'Budget Bucket', options: BUDGET_BUCKET_OPTIONS },
  { key: 'prm_duration_bucket', name: 'Duration Bucket', options: DURATION_BUCKET_OPTIONS },
]

// ---------------------------------------------------------------------------
// Field definition mapping helpers
// ---------------------------------------------------------------------------

/**
 * Maps custom-fields.ts FieldDefinition types to OM CustomFieldDefinition
 * via the cf.* DSL helpers.
 */
function mapFieldDefinitions(
  fields: typeof COMPANY_PROFILE_FIELDS | typeof CASE_STUDY_FIELDS
) {
  return fields.map((field) => {
    const opts: Record<string, unknown> = { label: field.label }
    if (field.required) opts.required = true
    if (field.hidden === true) opts.listVisible = false

    switch (field.type) {
      case 'text':
        return cf.text(field.key, opts)
      case 'long_text':
        return cf.multiline(field.key, opts)
      case 'number':
        return cf.integer(field.key, opts)
      case 'boolean':
        return cf.boolean(field.key, opts)
      case 'date':
      case 'date_time':
        // OM stores dates as text custom fields with a date-like key convention
        return cf.text(field.key, opts)
      case 'select':
        return cf.select(field.key, field.options ?? [], opts)
      case 'multi_select':
        return cf.select(field.key, field.options ?? [], { ...opts, multi: true })
      default:
        return cf.text(field.key, opts)
    }
  })
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

type SeedScope = { tenantId: string; organizationId: string }

async function seedPrmPipeline(
  em: import('@mikro-orm/postgresql').EntityManager,
  scope: SeedScope
): Promise<void> {
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

async function seedCustomFields(
  em: import('@mikro-orm/postgresql').EntityManager,
  scope: SeedScope
): Promise<void> {
  const fieldSets = [
    {
      entity: E.customers.customer_deal,
      fields: [
        cf.text(WIP_REGISTERED_AT_FIELD.key, {
          label: WIP_REGISTERED_AT_FIELD.label,
          listVisible: false,
        }),
      ],
    },
    {
      entity: E.customers.customer_company_profile,
      fields: mapFieldDefinitions(COMPANY_PROFILE_FIELDS),
    },
    {
      entity: 'partnerships:case_study',
      fields: mapFieldDefinitions(CASE_STUDY_FIELDS),
    },
  ]

  await ensureCustomFieldDefinitions(em, fieldSets, {
    organizationId: null,
    tenantId: scope.tenantId,
  })
}

async function seedDictionaries(
  em: import('@mikro-orm/postgresql').EntityManager,
  scope: SeedScope
): Promise<void> {
  for (const dict of DICTIONARIES) {
    let dictionary = await em.findOne(Dictionary, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      key: dict.key,
    })

    if (!dictionary) {
      dictionary = em.create(Dictionary, {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        key: dict.key,
        name: dict.name,
        isSystem: true,
      })
      em.persist(dictionary)
      await em.flush()
    }

    for (const option of dict.options) {
      const normalized = option.toLowerCase()
      const existing = await em.findOne(DictionaryEntry, {
        dictionary,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        normalizedValue: normalized,
      })
      if (!existing) {
        em.persist(
          em.create(DictionaryEntry, {
            dictionary,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            value: option,
            normalizedValue: normalized,
            label: option,
          })
        )
      }
    }
    await em.flush()
  }
}

// ---------------------------------------------------------------------------
// Demo data definitions for seedExamples
// ---------------------------------------------------------------------------

const DEMO_SENTINEL = 'Acme Digital (Demo)'

type DemoAgency = {
  name: string
  vertical: string
  teamSize: string
  profile: 'full' | 'minimal'
  customFields?: Record<string, unknown>
  caseStudies: Array<{
    title: string
    values: Record<string, unknown>
  }>
  deals: Array<{
    title: string
    stageName: string
    status: string
    valueAmount: number
    wipRegisteredAt?: string
  }>
}

const DEMO_AGENCIES: DemoAgency[] = [
  {
    name: 'Acme Digital (Demo)',
    vertical: 'FinTech',
    teamSize: '21-50',
    profile: 'full',
    customFields: {
      services: ['Software Development', 'Consulting', 'Integration'],
      industries: ['Finance', 'Technology'],
      technologies: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'AWS'],
      verticals: ['FinTech'],
      team_size: '21-50',
      founded_year: 2018,
      website: 'https://acme-digital.demo',
      headquarters_city: 'London',
      headquarters_country: 'UK',
      partnership_start_date: '2025-06-01',
      primary_contact_name: 'Alice Admin',
      primary_contact_email: 'admin@acme-demo.local',
      description: 'Full-service FinTech consultancy specializing in payment integrations and compliance platforms.',
    },
    caseStudies: [
      {
        title: 'FinTech Payment Integration Platform',
        values: {
          title: 'FinTech Payment Integration Platform',
          industry: ['Finance'],
          technologies: ['React', 'Node.js', 'TypeScript'],
          budget_bucket: '200k-500k',
          duration_bucket: '6-12 months',
          client_name: 'PayStream Inc.',
          client_industry: 'Finance',
          project_type: 'Integration',
          team_size: 8,
          start_date: '2025-01-15',
          end_date: '2025-09-30',
          description: 'End-to-end payment gateway integration supporting multi-currency transactions across 12 European markets.',
          challenges: 'Legacy systems with inconsistent APIs, strict PCI DSS compliance requirements, real-time settlement needs.',
          solution: 'Built a unified payment abstraction layer with automatic currency conversion and compliance-checked transaction routing.',
          results: '40% reduction in payment processing time, 99.97% uptime, PCI DSS Level 1 certification achieved.',
          is_public: true,
        },
      },
      {
        title: 'Banking Compliance Platform',
        values: {
          title: 'Banking Compliance Platform',
          industry: ['Finance'],
          technologies: ['TypeScript', 'PostgreSQL', 'AWS'],
          budget_bucket: '500k+',
          duration_bucket: '12+ months',
          client_name: 'NordBank AG',
          client_industry: 'Finance',
          project_type: 'Software Development',
          team_size: 12,
          start_date: '2024-03-01',
          end_date: '2025-06-30',
          description: 'Automated regulatory compliance platform covering KYC, AML, and transaction monitoring for a mid-tier European bank.',
          challenges: 'Complex regulatory landscape across multiple jurisdictions, high-volume transaction screening, audit trail requirements.',
          solution: 'Rule-engine based compliance platform with real-time transaction screening, automated SAR filing, and comprehensive audit logging.',
          results: 'Reduced compliance review time by 65%, zero regulatory findings in subsequent audit, processing 2M+ transactions daily.',
          is_public: true,
        },
      },
    ],
    deals: [
      { title: 'Acme: Mobile Wallet MVP', stageName: 'New', status: 'open', valueAmount: 75000 },
      { title: 'Acme: API Gateway Upgrade', stageName: 'Contacted', status: 'open', valueAmount: 120000 },
      { title: 'Acme: Payment Rails v2', stageName: 'SQL', status: 'open', valueAmount: 250000, wipRegisteredAt: '2026-03-10' },
      { title: 'Acme: RegTech Dashboard', stageName: 'Proposal', status: 'open', valueAmount: 180000, wipRegisteredAt: '2026-02-15' },
      { title: 'Acme: Crypto Settlement Engine', stageName: 'Won', status: 'win', valueAmount: 340000 },
    ],
  },
  {
    name: 'Nordic AI Labs (Demo)',
    vertical: 'HealthTech',
    teamSize: '6-20',
    profile: 'full',
    customFields: {
      services: ['Software Development', 'Consulting'],
      industries: ['Healthcare', 'Technology'],
      technologies: ['Python', 'React', 'TypeScript', 'GCP'],
      verticals: ['HealthTech'],
      team_size: '6-20',
      founded_year: 2021,
      website: 'https://nordic-ai.demo',
      headquarters_city: 'Stockholm',
      headquarters_country: 'Sweden',
      partnership_start_date: '2025-09-15',
      primary_contact_name: 'Nils Admin',
      primary_contact_email: 'admin@nordic-demo.local',
      description: 'AI-driven HealthTech studio building patient engagement and clinical decision-support tools.',
    },
    caseStudies: [
      {
        title: 'HealthTech Patient Portal',
        values: {
          title: 'HealthTech Patient Portal',
          industry: ['Healthcare'],
          technologies: ['React', 'Python', 'GCP'],
          budget_bucket: '50k-200k',
          duration_bucket: '3-6 months',
          client_name: 'MedConnect AB',
          client_industry: 'Healthcare',
          project_type: 'Software Development',
          team_size: 5,
          start_date: '2025-11-01',
          end_date: '2026-02-28',
          description: 'Patient-facing portal with appointment scheduling, lab results viewing, and secure messaging with care teams.',
          challenges: 'HIPAA-equivalent EU data protection, integration with legacy EHR systems, accessibility requirements.',
          solution: 'Progressive web app with FHIR-based EHR integration, end-to-end encryption, and WCAG 2.1 AA compliance.',
          results: 'Patient satisfaction up 35%, 60% reduction in phone-based appointment scheduling, adopted by 15 clinics.',
          is_public: true,
        },
      },
    ],
    deals: [
      { title: 'Nordic: Clinical Decision Support', stageName: 'Qualified', status: 'open', valueAmount: 95000 },
      { title: 'Nordic: Telemedicine Platform', stageName: 'SQL', status: 'open', valueAmount: 160000, wipRegisteredAt: '2026-03-18' },
      { title: 'Nordic: EHR Migration (lost)', stageName: 'Lost', status: 'loose', valueAmount: 200000 },
    ],
  },
  {
    name: 'CloudBridge Solutions (Demo)',
    vertical: 'RetailTech',
    teamSize: '1-5',
    profile: 'minimal',
    customFields: undefined,
    caseStudies: [],
    deals: [
      { title: 'CloudBridge: POS Integration', stageName: 'New', status: 'open', valueAmount: 30000 },
      { title: 'CloudBridge: Inventory Sync', stageName: 'Contacted', status: 'open', valueAmount: 45000 },
    ],
  },
]

// ---------------------------------------------------------------------------
// seedExamples implementation
// ---------------------------------------------------------------------------

async function seedPrmExamples(
  em: import('@mikro-orm/postgresql').EntityManager,
  container: import('@open-mercato/shared/lib/di/container').AppContainer,
  scope: SeedScope
): Promise<void> {
  // Idempotency: check if demo data already exists
  const alreadySeeded = await em.findOne(CustomerEntity, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    displayName: DEMO_SENTINEL,
    kind: 'company',
  })
  if (alreadySeeded) return

  // Resolve the PRM pipeline and its stages
  const pipeline = await em.findOne(CustomerPipeline, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    name: PRM_PIPELINE_NAME,
  })
  if (!pipeline) {
    console.warn('[partnerships.seedExamples] PRM Pipeline not found — run seedDefaults first')
    return
  }

  const stages = await em.find(CustomerPipelineStage, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    pipelineId: pipeline.id,
  })
  const stageByName = new Map(stages.map((s) => [s.label, s]))

  const dataEngine = new DefaultDataEngine(em, container)
  const customFieldAssignments: Array<() => Promise<void>> = []

  // TODO: Multi-org and user seeding requires platform auth module support
  // (creating organizations, users with bcrypt passwords, and role assignments).
  // The current seedExamples context provides a single org — seeding multiple
  // agency orgs with distinct users is deferred until platform support is available.
  // For now, all demo companies/deals/case studies are created within the ctx org.

  const companyEntities = new Map<string, CustomerEntity>()
  const companyProfiles = new Map<string, { id: string }>()

  // Step 1-2: Create companies (as CRM company entities)
  for (const agency of DEMO_AGENCIES) {
    const companyEntity = em.create(CustomerEntity, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      kind: 'company',
      displayName: agency.name,
      description: agency.profile === 'full'
        ? `${agency.vertical} agency — demo partner`
        : null,
      primaryEmail: null,
      primaryPhone: null,
      lifecycleStage: agency.profile === 'full' ? 'partner' : 'prospect',
      status: 'active',
      source: 'demo-seed',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const companyProfile = em.create(CustomerCompanyProfile, {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      entity: companyEntity,
      legalName: agency.name.replace(' (Demo)', ''),
      brandName: agency.name.replace(' (Demo)', ''),
      domain: null,
      websiteUrl: null,
      industry: agency.vertical,
      sizeBucket: agency.teamSize,
      annualRevenue: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(companyEntity)
    em.persist(companyProfile)

    companyEntities.set(agency.name, companyEntity)
    companyProfiles.set(agency.name, companyProfile)

    // Step 3: Fill company profiles with custom fields (full profiles only)
    if (agency.customFields && Object.keys(agency.customFields).length > 0) {
      const values = { ...agency.customFields } as Record<string, unknown>
      customFieldAssignments.push(async () => {
        try {
          await dataEngine.setCustomFields({
            entityId: E.customers.customer_company_profile,
            recordId: companyProfile.id,
            organizationId: scope.organizationId,
            tenantId: scope.tenantId,
            values: values as Record<string, string | number | boolean | null>,
            notify: false,
          })
        } catch (err) {
          console.warn(`[partnerships.seedExamples] Failed to set company profile custom fields for ${agency.name}`, err)
        }
      })
    }
  }

  // Flush companies before creating deals (need company IDs for links)
  await em.flush()

  // Step 4: Create case studies (custom entity records)
  for (const agency of DEMO_AGENCIES) {
    const companyProfile = companyProfiles.get(agency.name)
    if (!companyProfile) continue

    for (const cs of agency.caseStudies) {
      const caseStudyValues = {
        ...cs.values,
        organization_id: scope.organizationId,
      }
      customFieldAssignments.push(async () => {
        try {
          await dataEngine.createCustomEntityRecord({
            entityId: 'partnerships:case_study',
            organizationId: scope.organizationId,
            tenantId: scope.tenantId,
            values: caseStudyValues,
            notify: false,
          })
        } catch (err) {
          console.warn(`[partnerships.seedExamples] Failed to create case study "${cs.title}"`, err)
        }
      })
    }
  }

  // Step 5-6: Create deals at various pipeline stages
  const dealsToStamp: Array<{ deal: CustomerDeal; wipRegisteredAt: string }> = []

  for (const agency of DEMO_AGENCIES) {
    const companyEntity = companyEntities.get(agency.name)
    if (!companyEntity) continue

    for (const dealDef of agency.deals) {
      const stage = stageByName.get(dealDef.stageName)
      const deal = em.create(CustomerDeal, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        title: dealDef.title,
        description: null,
        status: dealDef.status,
        pipelineId: pipeline.id,
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

      const companyLink = em.create(CustomerDealCompanyLink, {
        deal,
        company: companyEntity,
        createdAt: new Date(),
      })
      em.persist(companyLink)

      if (dealDef.wipRegisteredAt) {
        dealsToStamp.push({ deal, wipRegisteredAt: dealDef.wipRegisteredAt })
      }
    }
  }

  await em.flush()

  // Step 7: Stamp wip_registered_at on qualifying deals
  for (const { deal, wipRegisteredAt } of dealsToStamp) {
    customFieldAssignments.push(async () => {
      try {
        await dataEngine.setCustomFields({
          entityId: E.customers.customer_deal,
          recordId: deal.id,
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
          values: { [WIP_REGISTERED_AT_FIELD.key]: wipRegisteredAt },
          notify: false,
        })
      } catch (err) {
        console.warn(`[partnerships.seedExamples] Failed to stamp wip_registered_at on deal "${deal.title}"`, err)
      }
    })
  }

  // Execute all deferred custom field assignments
  for (const assign of customFieldAssignments) {
    await assign()
  }
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

export const setup: ModuleSetupConfig = {
  seedDefaults: async (ctx) => {
    const scope: SeedScope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    await seedPrmPipeline(ctx.em, scope)
    await seedCustomFields(ctx.em, scope)
    await seedDictionaries(ctx.em, scope)
  },

  seedExamples: async (ctx) => {
    const scope: SeedScope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    await seedPrmExamples(ctx.em, ctx.container, scope)
  },

  defaultRoleFeatures: {
    partner_admin: [
      'customers.*',
      'partnerships.manage',
      'partnerships.widgets.onboarding-checklist',
    ],
    partner_member: [
      'customers.*',
      'partnerships.widgets.wip-count',
      'partnerships.widgets.onboarding-checklist',
    ],
    partner_contributor: [
      'partnerships.widgets.onboarding-checklist',
    ],
    partnership_manager: [
      'customers.people.view',
      'customers.companies.view',
      'customers.deals.view',
      'customers.pipelines.view',
      'partnerships.manage',
      'partnerships.widgets.wip-count',
    ],
  },
}

export default setup
