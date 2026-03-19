import type { EntityManager } from '@mikro-orm/postgresql'
import { Dictionary, DictionaryEntry, type DictionaryManagerVisibility } from '@open-mercato/core/modules/dictionaries/data/entities'
import { CustomFieldDef } from '@open-mercato/core/modules/entities/data/entities'
import taxonomy from '../data/taxonomy-v1.json'

type SeedScope = { tenantId: string; organizationId: string }

async function seedDictionary(
  em: EntityManager,
  scope: SeedScope,
  key: string,
  config: { name: string; description: string; entries: Array<{ value: string; label: string }> },
): Promise<Dictionary> {
  let dictionary = await em.findOne(Dictionary, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    key,
    deletedAt: null,
  })
  if (!dictionary) {
    dictionary = em.create(Dictionary, {
      key,
      name: config.name,
      description: config.description,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      isSystem: true,
      isActive: true,
      managerVisibility: 'default' satisfies DictionaryManagerVisibility,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(dictionary)
    await em.flush()
  }

  const existingEntries = await em.find(DictionaryEntry, {
    dictionary,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  const existingMap = new Map(existingEntries.map((e) => [e.value.toLowerCase(), e]))
  for (const entry of config.entries) {
    const normalized = entry.value.toLowerCase()
    if (existingMap.has(normalized)) continue
    em.persist(em.create(DictionaryEntry, {
      dictionary,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      value: entry.value,
      normalizedValue: normalized,
      label: entry.label,
      color: null,
      icon: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  }
  await em.flush()

  return dictionary
}

async function upsertDictionaryFieldDef(
  em: EntityManager,
  scope: SeedScope,
  entityId: string,
  key: string,
  label: string,
  dictionaryId: string,
  opts: { multi?: boolean; listVisible?: boolean; formEditable?: boolean } = {},
) {
  const existing = await em.findOne(CustomFieldDef, {
    entityId,
    key,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  })
  if (existing) {
    const config = existing.configJson ?? {}
    if (config.dictionaryId !== dictionaryId) {
      existing.configJson = { ...config, dictionaryId, dictionaryInlineCreate: true }
      existing.updatedAt = new Date()
    }
    return
  }

  em.persist(em.create(CustomFieldDef, {
    entityId,
    key,
    kind: 'dictionary',
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    configJson: {
      label,
      multi: opts.multi ?? true,
      dictionaryId,
      dictionaryInlineCreate: true,
      formEditable: opts.formEditable ?? true,
      listVisible: opts.listVisible ?? true,
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
}

export async function seedPrmDataFoundation(em: EntityManager, scope: SeedScope) {
  const dicts: Record<string, Dictionary> = {}
  for (const [key, config] of Object.entries(taxonomy.dictionaries)) {
    dicts[key] = await seedDictionary(em, scope, key, config)
  }

  const companyEntity = 'customers:customer_company_profile'
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'services', 'Services', dicts.services.id)
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'industries', 'Industries', dicts.industries.id)
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'tech_capabilities', 'Tech Capabilities', dicts.tech_capabilities.id)
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'compliance_tags', 'Compliance Tags', dicts.compliance_tags.id)
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'regions', 'Regions', dicts.regions.id, { listVisible: false })
  await upsertDictionaryFieldDef(em, scope, companyEntity, 'languages', 'Languages', dicts.languages.id, { listVisible: false })

  const caseStudyEntity = 'user:case_study'
  await upsertDictionaryFieldDef(em, scope, caseStudyEntity, 'technologies', 'Technologies', dicts.tech_capabilities.id)
  await upsertDictionaryFieldDef(em, scope, caseStudyEntity, 'industry', 'Industry', dicts.industries.id)
  await upsertDictionaryFieldDef(em, scope, caseStudyEntity, 'compliance_tags', 'Compliance Tags', dicts.compliance_tags.id)

  await em.flush()
}
