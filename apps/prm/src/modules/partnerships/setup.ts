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
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { User, Role, RoleAcl, UserRole, UserAcl, RoleSidebarPreference } from '@open-mercato/core/modules/auth/data/entities'
import { SIDEBAR_PREFERENCES_VERSION } from '@open-mercato/shared/modules/navigation/sidebarPreferences'
import { ensureCustomFieldDefinitions } from '@open-mercato/core/modules/entities/lib/field-definitions'
import { hashForLookup } from '@open-mercato/shared/lib/encryption/aes'
import { seedDashboardDefaultsForTenant } from '@open-mercato/core/modules/dashboards/cli'
import { hash } from 'bcryptjs'
import { DefaultDataEngine } from '@open-mercato/shared/lib/data/engine'
import { PartnerLicenseDeal, PartnerRfpCampaign, PartnerRfpResponse, RfpSettings, TierAssignment, TierEvaluationState, TierChangeProposal } from './data/entities'
import { E } from '#generated/entities.ids.generated'
import {
  PRM_PIPELINE_NAME,
  PRM_PIPELINE_STAGES,
  AGENCY_PROFILE_FIELDS,
  CASE_STUDY_FIELDS,
  CONTRIBUTION_UNIT_FIELDS,
  WIP_REGISTERED_AT_FIELD,
  GH_USERNAME_FIELD,
  SERVICES_OPTIONS,
  INDUSTRIES_OPTIONS,
  TECHNOLOGIES_OPTIONS,
  VERTICALS_OPTIONS,
  BUDGET_BUCKET_OPTIONS,
  DURATION_BUCKET_OPTIONS,
} from './data/custom-fields'
import type { FieldDefinition } from './data/custom-fields'

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
  fields: FieldDefinition[]
) {
  return fields.map((field) => {
    const opts: Record<string, unknown> = { label: field.label }
    if (field.required) opts.required = true
    if (field.hidden === true) opts.listVisible = false
    if (field.editor) opts.editor = field.editor

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
      case 'dictionary':
        return cf.dictionary(field.key, field.dictionaryId ?? field.key, { ...opts, multi: true })
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
      entity: E.directory.organization,
      fields: mapFieldDefinitions(AGENCY_PROFILE_FIELDS),
    },
    {
      entity: E.auth.user,
      fields: [cf.text(GH_USERNAME_FIELD.key, { label: GH_USERNAME_FIELD.label })],
    },
    {
      entity: 'partnerships:case_study',
      fields: mapFieldDefinitions(CASE_STUDY_FIELDS),
    },
    {
      entity: 'partnerships:contribution_unit',
      fields: mapFieldDefinitions(CONTRIBUTION_UNIT_FIELDS),
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
        isActive: true,
        managerVisibility: 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
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
            createdAt: new Date(),
            updatedAt: new Date(),
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

type DemoAgencyUser = {
  email: string
  name: string
  roleName: string
}

type DemoAgency = {
  name: string
  vertical: string
  teamSize: string
  profile: 'full' | 'minimal'
  customFields?: Record<string, unknown>
  users: DemoAgencyUser[]
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
    users: [
      { email: 'acme-admin@demo.local', name: 'Alice Acme (Admin)', roleName: 'partner_admin' },
      { email: 'acme-bd@demo.local', name: 'Bob Acme (BD)', roleName: 'partner_member' },
      { email: 'acme-contributor@demo.local', name: 'Carol Acme (Contributor)', roleName: 'partner_contributor' },
    ],
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
    users: [
      { email: 'nordic-admin@demo.local', name: 'Nils Nordic (Admin)', roleName: 'partner_admin' },
      { email: 'nordic-bd@demo.local', name: 'Saga Nordic (BD)', roleName: 'partner_member' },
    ],
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
    users: [
      { email: 'cloudbridge-admin@demo.local', name: 'Chris CloudBridge (Admin)', roleName: 'partner_admin' },
    ],
    customFields: undefined,
    caseStudies: [],
    deals: [
      { title: 'CloudBridge: POS Integration', stageName: 'New', status: 'open', valueAmount: 30000 },
      { title: 'CloudBridge: Inventory Sync', stageName: 'Contacted', status: 'open', valueAmount: 45000 },
    ],
  },
]

// ---------------------------------------------------------------------------
// RFP default templates
// ---------------------------------------------------------------------------

const DEFAULT_CAMPAIGN_TEMPLATE =
  'New RFP: [campaign-title]\n\nHi [first-name],\n\nWe have a new opportunity that may match your agency\'s capabilities. Please review the requirements and submit your response before the deadline.\n\nBest regards,\nOpen Mercato Partner Program'

const DEFAULT_AWARD_TEMPLATE =
  'Congratulations [first-name]!\n\nYour agency [agency-name] has been selected for "[campaign-title]". We will be in touch with next steps.\n\nBest regards,\nOpen Mercato Partner Program'

const DEFAULT_REJECTION_TEMPLATE =
  'Hi [first-name],\n\nThank you for your response to "[campaign-title]". After careful evaluation, we have selected another agency for this opportunity. We appreciate your interest and look forward to future collaborations.\n\nBest regards,\nOpen Mercato Partner Program'

async function seedRfpSettings(
  em: import('@mikro-orm/postgresql').EntityManager,
  scope: SeedScope
): Promise<void> {
  const existing = await em.findOne(RfpSettings, { tenantId: scope.tenantId })
  if (existing) return

  em.persist(em.create(RfpSettings, {
    campaignTemplate: DEFAULT_CAMPAIGN_TEMPLATE,
    awardTemplate: DEFAULT_AWARD_TEMPLATE,
    rejectionTemplate: DEFAULT_REJECTION_TEMPLATE,
    tenantId: scope.tenantId,
  }))
  await em.flush()
}

// ---------------------------------------------------------------------------
// PRM roles
// ---------------------------------------------------------------------------

// Baseline features every backend user needs to not get 403 on dashboard load.
// These come from OM core modules' employee defaults — without them, the backend
// shell fails to render (dashboard, messages, attachments, etc. all check features).
const BACKEND_BASELINE_FEATURES = [
  'dashboards.view',
  'dashboards.configure',
  'analytics.view',
  'messages.*',
  'attachments.view',
  'audit_logs.view_self',
  'audit_logs.undo_self',
  'dictionaries.view',
  'perspectives.use',
  'security.profile.manage',
]

const PRM_ROLE_FEATURES: Record<string, string[]> = {
  partner_admin: [
    ...BACKEND_BASELINE_FEATURES,
    'customers.*',
    'entities.records.view',
    'entities.records.manage',
    'partnerships.agency-profile.manage',
    'partnerships.case-studies.manage',
    'partnerships.rfp.respond',
    'partnerships.rfp.view',
    'partnerships.license-deals.view',
    'partnerships.wic.view',
    'partnerships.widgets.onboarding-checklist',
    'partnerships.widgets.wip-count',
    'partnerships.widgets.wic-summary',
    'partnerships.widgets.tier-status',
    'auth.users.*',
    'auth.roles.list',
    'directory.organizations.view',
  ],
  partner_member: [
    ...BACKEND_BASELINE_FEATURES,
    'customers.*',
    'partnerships.case-studies.manage',
    'partnerships.rfp.respond',
    'partnerships.rfp.view',
    'partnerships.license-deals.view',
    'partnerships.wic.view',
    'partnerships.widgets.onboarding-checklist',
    'partnerships.widgets.wip-count',
    'partnerships.widgets.wic-summary',
    'partnerships.widgets.tier-status',
  ],
  partner_contributor: [
    ...BACKEND_BASELINE_FEATURES,
    'partnerships.wic.view',
    'partnerships.widgets.onboarding-checklist',
    'partnerships.widgets.wic-summary',
    'partnerships.widgets.tier-status',
  ],
  partnership_manager: [
    ...BACKEND_BASELINE_FEATURES,
    'customers.*',
    'partnerships.agencies.manage',
    'partnerships.agency-profile.manage',
    'partnerships.case-studies.manage',
    'partnerships.wic.manage',
    'partnerships.wic.view',
    'partnerships.rfp.manage',
    'partnerships.rfp.view',
    'partnerships.rfp.respond',
    'partnerships.license-deals.manage',
    'partnerships.license-deals.view',
    'partnerships.tier.manage',
    'partnerships.widgets.cross-org-wip',
    'partnerships.widgets.wip-count',
    'partnerships.widgets.wic-summary',
    'partnerships.widgets.tier-status',
    'auth.*',
    'directory.organizations.manage',
    'directory.organizations.view',
  ],
}

// Seed PRM roles AND their RoleAcl entries.
// ensureDefaultRoleAcls runs during setupInitialTenant (before seedDefaults),
// so custom roles don't exist yet when it runs. We must create RoleAcl here.
async function seedPrmRoles(
  em: import('@mikro-orm/postgresql').EntityManager,
  scope: SeedScope
): Promise<void> {
  for (const [roleName, features] of Object.entries(PRM_ROLE_FEATURES)) {
    let role = await em.findOne(Role, {
      name: roleName,
      tenantId: scope.tenantId,
      deletedAt: null,
    })
    if (!role) {
      role = em.create(Role, {
        name: roleName,
        tenantId: scope.tenantId,
        createdAt: new Date(),
      })
      em.persist(role)
    }
    await em.flush()

    // Ensure RoleAcl exists with exact features from PRM_ROLE_FEATURES (replace, not merge).
    // PRM roles are fully managed by seed — the feature list is the source of truth.
    const existingAcl = await em.findOne(RoleAcl, { role, tenantId: scope.tenantId })
    if (!existingAcl) {
      em.persist(em.create(RoleAcl, {
        role,
        tenantId: scope.tenantId,
        featuresJson: features,
        isSuperAdmin: false,
        createdAt: new Date(),
      }))
    } else {
      const current = Array.isArray(existingAcl.featuresJson) ? existingAcl.featuresJson as string[] : []
      const sorted = [...features].sort()
      const currentSorted = [...current].sort()
      if (JSON.stringify(sorted) !== JSON.stringify(currentSorted)) {
        existingAcl.featuresJson = features
      }
    }
  }
  await em.flush()

  // Seed RoleSidebarPreference: hide noise nav items for all PRM roles.
  // Attachments standalone page is noise — used inline but not needed in sidebar.
  const PRM_HIDDEN_NAV_ITEMS = ['/backend/storage/attachments']
  for (const roleName of Object.keys(PRM_ROLE_FEATURES)) {
    const role = await em.findOne(Role, { name: roleName, tenantId: scope.tenantId, deletedAt: null })
    if (!role) continue
    const existing = await em.findOne(RoleSidebarPreference, { role, tenantId: scope.tenantId, locale: 'en' })
    if (!existing) {
      em.persist(em.create(RoleSidebarPreference, {
        role,
        tenantId: scope.tenantId,
        locale: 'en',
        settingsJson: {
          version: SIDEBAR_PREFERENCES_VERSION,
          groupOrder: [],
          groupLabels: {},
          itemLabels: {},
          hiddenItems: PRM_HIDDEN_NAV_ITEMS,
        },
        createdAt: new Date(),
      }))
    } else {
      const settings = (existing.settingsJson ?? {}) as Record<string, unknown>
      const currentHidden = Array.isArray(settings.hiddenItems) ? settings.hiddenItems as string[] : []
      const merged = Array.from(new Set([...currentHidden, ...PRM_HIDDEN_NAV_ITEMS]))
      if (merged.length !== currentHidden.length) {
        settings.hiddenItems = merged
        existing.settingsJson = settings
      }
    }
  }
  await em.flush()
}

// ---------------------------------------------------------------------------
// Demo users
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = 'Demo123!'
const BCRYPT_COST = 10

type DemoUser = {
  email: string
  name: string
  roleName: string
}

/**
 * Creates a user with role and optional org restriction.
 * Returns the created User or null if already exists.
 */
async function seedUser(
  em: import('@mikro-orm/postgresql').EntityManager,
  opts: {
    email: string
    name: string
    roleName: string
    organizationId: string
    tenantId: string
    passwordHash: string
    restrictToOrg: boolean // true = UserAcl restricts to own org only
  }
): Promise<User | null> {
  const emailHash = hashForLookup(opts.email)
  const existing = await em.findOne(User, { emailHash, deletedAt: null })
  if (existing) return null

  const user = em.create(User, {
    email: opts.email,
    emailHash,
    passwordHash: opts.passwordHash,
    name: opts.name,
    isConfirmed: true,
    organizationId: opts.organizationId,
    tenantId: opts.tenantId,
    createdAt: new Date(),
  })
  em.persist(user)

  const role = await em.findOne(Role, {
    name: opts.roleName,
    tenantId: opts.tenantId,
    deletedAt: null,
  })
  if (role) {
    em.persist(em.create(UserRole, { user, role, createdAt: new Date() }))
  } else {
    console.warn(`[partnerships.seedExamples] Role "${opts.roleName}" not found — user "${opts.email}" created without role`)
  }

  if (opts.restrictToOrg && role) {
    const roleAcl = await em.findOne(RoleAcl, { role, tenantId: opts.tenantId })
    em.persist(em.create(UserAcl, {
      user,
      tenantId: opts.tenantId,
      organizationsJson: [opts.organizationId],
      featuresJson: roleAcl?.featuresJson ?? [],
      isSuperAdmin: false,
      createdAt: new Date(),
    }))
  }

  return user
}

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
    displayName: DEMO_SENTINEL,
    kind: 'company',
  })
  if (alreadySeeded) return

  const passwordHash = await hash(DEMO_PASSWORD, BCRYPT_COST)
  const dataEngine = new DefaultDataEngine(em, container)
  const customFieldAssignments: Array<() => Promise<void>> = []

  // Step 0: Ensure default org is named per App Spec §6 (US-6.2)
  const defaultOrg = await em.findOne(Organization, { id: scope.organizationId })
  if (defaultOrg && defaultOrg.name !== 'Open Mercato Backoffice') {
    defaultOrg.name = 'Open Mercato Backoffice'
    await em.flush()
  }

  // Step 1: Seed PM user in the default org (Open Mercato Backoffice)
  await seedUser(em, {
    email: 'partnership-manager@demo.local',
    name: 'Dave Manager (PM)',
    roleName: 'partnership_manager',
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    passwordHash,
    restrictToOrg: false, // PM sees all orgs (Program Scope)
  })
  await em.flush()

  // Step 1b: Seed OM core contributors in OM Backoffice (for WIC testing)
  const OM_CORE_CONTRIBUTORS: Array<{ email: string; name: string; ghUsername: string }> = [
    { email: 'pkarw@demo.local', name: 'Piotr Karwatka', ghUsername: 'pkarw' },
    { email: 'matgren@demo.local', name: 'Maciej Greń', ghUsername: 'matgren' },
    { email: 'haxiorz@demo.local', name: 'Haxiorz', ghUsername: 'haxiorz' },
    { email: 'mstaniaszek@demo.local', name: 'Marcin Staniaszek', ghUsername: 'mstaniaszek1998' },
    { email: 'pat-lewczuk@demo.local', name: 'Pat Lewczuk', ghUsername: 'pat-lewczuk' },
    { email: 'fto-aubergine@demo.local', name: 'FTO Aubergine', ghUsername: 'fto-aubergine' },
    { email: 'dpalatynski@demo.local', name: 'Dominik Palatyński', ghUsername: 'dominikpalatynski' },
    { email: 'andrzejewsky@demo.local', name: 'Andrzejewsky', ghUsername: 'andrzejewsky' },
  ]

  for (const contrib of OM_CORE_CONTRIBUTORS) {
    await seedUser(em, {
      email: contrib.email,
      name: contrib.name,
      roleName: 'partner_contributor',
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      passwordHash,
      restrictToOrg: true,
    })
  }
  await em.flush()

  // Set GH usernames on OM core contributors
  for (const contrib of OM_CORE_CONTRIBUTORS) {
    const emailHash = hashForLookup(contrib.email)
    const user = await em.findOne(User, { emailHash, deletedAt: null })
    if (user) {
      try {
        await dataEngine.setCustomFields({
          entityId: E.auth.user,
          recordId: user.id,
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
          values: { [GH_USERNAME_FIELD.key]: contrib.ghUsername },
          notify: false,
        })
      } catch (err) {
        console.warn(`[partnerships.seedExamples] Failed to set GH username on ${contrib.email}`, err)
      }
    }
  }
  console.log(`[partnerships.seedExamples] OM core contributors seeded: ${OM_CORE_CONTRIBUTORS.length} users in OM Backoffice`)

  // Step 2: Create each agency as its own Organization + CRM company + users
  for (const agency of DEMO_AGENCIES) {
    // 2a: Create Organization in directory module
    const orgSlug = agency.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-demo-?$/, '')
    let agencyOrg = await em.findOne(Organization, {
      tenant: scope.tenantId,
      slug: orgSlug,
    })
    if (!agencyOrg) {
      agencyOrg = em.create(Organization, {
        tenant: scope.tenantId,
        name: agency.name.replace(' (Demo)', ''),
        slug: orgSlug,
        isActive: true,
        depth: 0,
        ancestorIds: [],
        childIds: [],
        descendantIds: [],
        parentId: null,
        rootId: null,
        treePath: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      em.persist(agencyOrg)
      await em.flush()
    }
    const agencyOrgId = agencyOrg.id

    // 2b: Seed pipeline for this org (each org needs its own pipeline)
    const existingPipeline = await em.findOne(CustomerPipeline, {
      tenantId: scope.tenantId,
      organizationId: agencyOrgId,
      name: PRM_PIPELINE_NAME,
    })
    if (!existingPipeline) {
      await seedPrmPipeline(em, { tenantId: scope.tenantId, organizationId: agencyOrgId })
    }

    // Resolve pipeline stages for this org
    const pipeline = await em.findOne(CustomerPipeline, {
      tenantId: scope.tenantId,
      organizationId: agencyOrgId,
      name: PRM_PIPELINE_NAME,
    })
    const stages = pipeline
      ? await em.find(CustomerPipelineStage, {
          tenantId: scope.tenantId,
          organizationId: agencyOrgId,
          pipelineId: pipeline.id,
        })
      : []
    const stageByName = new Map(stages.map((s) => [s.label, s]))

    // 2c: Create agency users in the agency org
    for (const agencyUser of agency.users) {
      await seedUser(em, {
        email: agencyUser.email,
        name: agencyUser.name,
        roleName: agencyUser.roleName,
        organizationId: agencyOrgId,
        tenantId: scope.tenantId,
        passwordHash,
        restrictToOrg: true, // agency users see only their own org
      })
    }
    await em.flush()

    // 2d: Create CRM company entity in the agency's org
    const companyEntity = em.create(CustomerEntity, {
      organizationId: agencyOrgId,
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
      organizationId: agencyOrgId,
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
    await em.flush()

    // 2e: Fill agency organization profile with custom fields
    if (agency.customFields && Object.keys(agency.customFields).length > 0) {
      const values = { ...agency.customFields } as Record<string, unknown>
      customFieldAssignments.push(async () => {
        try {
          await dataEngine.setCustomFields({
            entityId: E.directory.organization,
            recordId: agencyOrgId,
            organizationId: agencyOrgId,
            tenantId: scope.tenantId,
            values: values as Record<string, string | number | boolean | null>,
            notify: false,
          })
        } catch (err) {
          console.warn(`[partnerships.seedExamples] Failed to set organization profile custom fields for ${agency.name}`, err)
        }
      })
    }

    // 2f: Create case studies in the agency's org
    for (const cs of agency.caseStudies) {
      const caseStudyValues = { ...cs.values }
      customFieldAssignments.push(async () => {
        try {
          await dataEngine.createCustomEntityRecord({
            entityId: 'partnerships:case_study',
            organizationId: agencyOrgId,
            tenantId: scope.tenantId,
            values: caseStudyValues,
            notify: false,
          })
        } catch (err) {
          console.warn(`[partnerships.seedExamples] Failed to create case study "${cs.title}"`, err)
        }
      })
    }

    // 2g: Create deals in the agency's org
    for (const dealDef of agency.deals) {
      const stage = stageByName.get(dealDef.stageName)
      const deal = em.create(CustomerDeal, {
        organizationId: agencyOrgId,
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

      const companyLink = em.create(CustomerDealCompanyLink, {
        deal,
        company: companyEntity,
        createdAt: new Date(),
      })
      em.persist(companyLink)

      if (dealDef.wipRegisteredAt) {
        customFieldAssignments.push(async () => {
          try {
            await dataEngine.setCustomFields({
              entityId: E.customers.customer_deal,
              recordId: deal.id,
              organizationId: agencyOrgId,
              tenantId: scope.tenantId,
              values: { [WIP_REGISTERED_AT_FIELD.key]: dealDef.wipRegisteredAt },
              notify: false,
            })
          } catch (err) {
            console.warn(`[partnerships.seedExamples] Failed to stamp wip_registered_at on deal "${deal.title}"`, err)
          }
        })
      }
    }

    await em.flush()
    console.log(`[partnerships.seedExamples] Agency "${agency.name}" seeded: org=${agencyOrgId}, ${agency.users.length} users, ${agency.deals.length} deals`)
  }

  // Execute all deferred custom field assignments
  for (const assign of customFieldAssignments) {
    await assign()
  }

  // =========================================================================
  // Phase 2 demo data: tiers, license deals, evaluation states
  // =========================================================================

  // Resolve PM user
  const pmEmailHash = hashForLookup('partnership-manager@demo.local')
  const pmUser = await em.findOneOrFail(User, { emailHash: pmEmailHash, deletedAt: null })
  const pmUserId = pmUser.id
  const { tenantId } = scope

  // Resolve agency orgs + company entities by demo names
  const acmeOrg = await em.findOneOrFail(Organization, { tenant: tenantId, slug: 'acme-digital' })
  const nordicOrg = await em.findOneOrFail(Organization, { tenant: tenantId, slug: 'nordic-ai-labs' })
  const cloudbridgeOrg = await em.findOneOrFail(Organization, { tenant: tenantId, slug: 'cloudbridge-solutions' })
  const acmeOrgId = acmeOrg.id
  const nordicOrgId = nordicOrg.id
  const cloudbridgeOrgId = cloudbridgeOrg.id

  const acmeCompany = await em.findOneOrFail(CustomerEntity, { tenantId, displayName: 'Acme Digital (Demo)', kind: 'company' })
  const nordicCompany = await em.findOneOrFail(CustomerEntity, { tenantId, displayName: 'Nordic AI Labs (Demo)', kind: 'company' })
  const acmeCompanyId = acmeCompany.id
  const nordicCompanyId = nordicCompany.id

  // --- GH Usernames on Contributors ---
  const contributorEmailHash = hashForLookup('acme-contributor@demo.local')
  const contributorUser = await em.findOne(User, { emailHash: contributorEmailHash, deletedAt: null })
  if (contributorUser) {
    try {
      await dataEngine.setCustomFields({
        entityId: E.auth.user,
        recordId: contributorUser.id,
        organizationId: acmeOrgId,
        tenantId,
        values: { [GH_USERNAME_FIELD.key]: 'carol-acme' },
        notify: false,
      })
    } catch (err) {
      console.warn('[partnerships.seedExamples] Failed to set GH username on acme-contributor', err)
    }
  }

  // --- TierAssignments ---
  const tierAssignments = [
    { organizationId: acmeOrgId, tier: 'OM Agency', effectiveDate: new Date('2025-06-01'), approvedBy: pmUserId, reason: 'Initial onboarding', tenantId },
    { organizationId: nordicOrgId, tier: 'OM AI-native Agency', effectiveDate: new Date('2025-10-01'), approvedBy: pmUserId, reason: 'Upgrade from OM Agency', tenantId },
    { organizationId: nordicOrgId, tier: 'OM Agency', effectiveDate: new Date('2025-09-15'), approvedBy: pmUserId, reason: 'Initial onboarding', tenantId },
    { organizationId: cloudbridgeOrgId, tier: 'OM Agency', effectiveDate: new Date('2026-01-15'), approvedBy: pmUserId, reason: 'Initial onboarding', tenantId },
  ]
  for (const ta of tierAssignments) {
    em.persist(em.create(TierAssignment, ta))
  }
  await em.flush()

  // --- PartnerLicenseDeals ---
  const licenseDeals = [
    { organizationId: acmeOrgId, companyId: acmeCompanyId, licenseIdentifier: 'LIC-ACME-001', industryTag: 'Finance', type: 'enterprise', status: 'won', isRenewal: false, startDate: new Date('2026-02-15'), endDate: new Date('2027-02-14'), year: 2026, createdBy: pmUserId, tenantId },
    { organizationId: acmeOrgId, companyId: acmeCompanyId, licenseIdentifier: 'LIC-ACME-002', industryTag: 'Technology', type: 'enterprise', status: 'won', isRenewal: false, startDate: new Date('2026-03-01'), endDate: null, year: 2026, createdBy: pmUserId, tenantId },
    { organizationId: nordicOrgId, companyId: nordicCompanyId, licenseIdentifier: 'LIC-NORDIC-001', industryTag: 'Healthcare', type: 'enterprise', status: 'won', isRenewal: false, startDate: new Date('2025-11-20'), endDate: new Date('2026-11-19'), year: 2025, createdBy: pmUserId, tenantId },
    { organizationId: nordicOrgId, companyId: nordicCompanyId, licenseIdentifier: 'LIC-NORDIC-002', industryTag: 'Healthcare', type: 'enterprise', status: 'won', isRenewal: false, startDate: new Date('2026-01-10'), endDate: new Date('2027-01-09'), year: 2026, createdBy: pmUserId, tenantId },
    { organizationId: nordicOrgId, companyId: nordicCompanyId, licenseIdentifier: 'LIC-NORDIC-003', industryTag: 'Technology', type: 'enterprise', status: 'won', isRenewal: false, startDate: new Date('2026-02-28'), endDate: null, year: 2026, createdBy: pmUserId, tenantId },
  ]
  for (const ld of licenseDeals) {
    em.persist(em.create(PartnerLicenseDeal, ld))
  }
  await em.flush()

  // --- TierEvaluationState ---
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  em.persist(em.create(TierEvaluationState, {
    organizationId: acmeOrgId,
    currentTier: 'OM Agency',
    evaluationMonth: currentMonth,
    status: 'OK',
    tenantId,
  }))
  em.persist(em.create(TierEvaluationState, {
    organizationId: nordicOrgId,
    currentTier: 'OM AI-native Agency',
    evaluationMonth: currentMonth,
    status: 'GracePeriod',
    gracePeriodStartedAt: new Date(),
    tenantId,
  }))
  await em.flush()

  // --- TierChangeProposal ---
  em.persist(em.create(TierChangeProposal, {
    organizationId: acmeOrgId,
    evaluationMonth: currentMonth,
    currentTier: 'OM Agency',
    proposedTier: 'OM AI-native Agency',
    type: 'upgrade',
    status: 'PendingApproval',
    wicSnapshot: 3.5,
    wipSnapshot: 6,
    minSnapshot: 2,
    tenantId,
  }))
  await em.flush()

  console.log(`[partnerships.seedExamples] Phase 2 demo data seeded: ${tierAssignments.length} tier assignments, ${licenseDeals.length} license deals, 2 evaluation states, 1 proposal`)

  // =========================================================================
  // Phase 3 demo data: RFP campaigns + responses
  // =========================================================================

  // Resolve BD users for responses
  const acmeBdHash = hashForLookup('acme-bd@demo.local')
  const nordicBdHash = hashForLookup('nordic-bd@demo.local')
  const acmeBdUser = await em.findOne(User, { emailHash: acmeBdHash, deletedAt: null })
  const nordicBdUser = await em.findOne(User, { emailHash: nordicBdHash, deletedAt: null })

  // Campaign 1: Published, has responses, awarded to Acme
  const campaign1 = em.create(PartnerRfpCampaign, {
    title: 'FinTech Migration Platform — Q2 2026',
    description: 'Looking for an agency to lead the migration of a legacy banking platform to cloud-native microservices. Must have experience with PCI-DSS compliance and real-time transaction processing.',
    deadline: new Date('2026-04-15'),
    audience: 'all',
    status: 'awarded',
    winnerOrganizationId: acmeOrgId,
    organizationId: scope.organizationId,
    createdBy: pmUserId,
    tenantId,
  })
  em.persist(campaign1)
  await em.flush()

  if (acmeBdUser) {
    em.persist(em.create(PartnerRfpResponse, {
      campaignId: campaign1.id,
      organizationId: acmeOrgId,
      responseText: 'Acme Digital has 5+ years of FinTech migration experience. Our team led the CloudBank transformation (2024-2025), migrating 12M accounts to AWS with zero downtime. We hold PCI-DSS Level 1 certification and have dedicated compliance engineers on staff.',
      submittedBy: acmeBdUser.id,
      tenantId,
    }))
  }
  if (nordicBdUser) {
    em.persist(em.create(PartnerRfpResponse, {
      campaignId: campaign1.id,
      organizationId: nordicOrgId,
      responseText: 'Nordic AI Labs specializes in AI-driven financial services. We propose an ML-enhanced migration strategy that uses automated code analysis to identify legacy patterns and generate cloud-native equivalents. Our recent work with Nordea Bank reduced migration time by 40%.',
      submittedBy: nordicBdUser.id,
      tenantId,
    }))
  }
  await em.flush()

  // Campaign 2: Published, deadline in the future, no responses yet
  em.persist(em.create(PartnerRfpCampaign, {
    title: 'Healthcare Data Platform — HIPAA Compliance',
    description: 'Seeking a partner to build a patient data analytics platform with full HIPAA compliance. The platform must support real-time data ingestion from 50+ hospital systems and provide AI-powered diagnostic insights.',
    deadline: new Date('2026-06-01'),
    audience: 'all',
    status: 'published',
    organizationId: scope.organizationId,
    createdBy: pmUserId,
    tenantId,
  }))

  // Campaign 3: Draft, not yet published
  em.persist(em.create(PartnerRfpCampaign, {
    title: 'E-commerce Replatform (Draft)',
    description: 'Replatforming a legacy Magento 1 store to Open Mercato. Need agency with OM certification and experience in catalog migration (50K+ SKUs).',
    deadline: new Date('2026-07-01'),
    audience: 'selected',
    selectedAgencyIds: [acmeOrgId, nordicOrgId],
    status: 'draft',
    organizationId: scope.organizationId,
    createdBy: pmUserId,
    tenantId,
  }))
  await em.flush()

  console.log('[partnerships.seedExamples] Phase 3 demo data seeded: 3 RFP campaigns, 2 responses, 1 awarded')

  console.log(`[partnerships.seedExamples] All demo data seeded (password: ${DEMO_PASSWORD})`)
  console.log(`[partnerships.seedExamples] PM: partnership-manager@demo.local (all orgs)`)
  console.log(`[partnerships.seedExamples] OM Backoffice contributors:`)
  for (const c of OM_CORE_CONTRIBUTORS) {
    console.log(`[partnerships.seedExamples]   ${c.email} (GH: ${c.ghUsername})`)
  }
  for (const agency of DEMO_AGENCIES) {
    for (const u of agency.users) {
      console.log(`[partnerships.seedExamples] ${agency.name}: ${u.email} (${u.roleName})`)
    }
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
    await seedPrmRoles(ctx.em, scope)
    await seedRfpSettings(ctx.em, scope)

    // Replace default OM dashboard widgets with PRM-only widgets.
    // PM gets cross-org management widgets (visible on home org dashboard).
    // Agency roles get per-agency widgets (visible when in agency org).
    // seedDashboardDefaultsForTenant with explicit widgetIds does a full replace.
    const PM_WIDGETS = [
      'partnerships.dashboard.cross-org-wip', // cross-org table for PM
      // Phase 2+: 'partnerships.dashboard.pending-proposals',
    ]
    const AGENCY_WIDGETS = [
      'partnerships.dashboard.onboarding-checklist',
      'partnerships.dashboard.wip-count', // per-org single-number variant
      'partnerships.dashboard.wic-summary', // contributor WIC score summary
      'partnerships.dashboard.tier-status', // tier progress + KPI bars
      // Phase 3+: 'partnerships.dashboard.incoming-rfps',
    ]
    // PM role — management widgets
    await seedDashboardDefaultsForTenant(ctx.em, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      roleNames: ['partnership_manager'],
      widgetIds: PM_WIDGETS,
      logger: () => {},
    })
    // PRM-specific roles — tenant-wide (agencies are in different orgs,
    // so org-specific records for the default org won't apply to them).
    await seedDashboardDefaultsForTenant(ctx.em, {
      tenantId: ctx.tenantId,
      organizationId: null,
      roleNames: ['partner_admin', 'partner_member', 'partner_contributor'],
      widgetIds: AGENCY_WIDGETS,
      logger: () => {},
    })
    // Platform roles in PRM context — org-specific for default org
    await seedDashboardDefaultsForTenant(ctx.em, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      roleNames: ['admin', 'employee'],
      widgetIds: AGENCY_WIDGETS,
      logger: () => {},
    })
  },

  seedExamples: async (ctx) => {
    const scope: SeedScope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    await seedPrmExamples(ctx.em, ctx.container, scope)
  },

  // PRM partners are User roles (not CustomerUser/portal roles).
  // OM core seeds ACL for custom role keys since PR #1040 (merged 2026-03-20).
  // Single source of truth: PRM_ROLE_FEATURES.
  defaultRoleFeatures: PRM_ROLE_FEATURES as Record<string, string[]>,
}

export default setup
