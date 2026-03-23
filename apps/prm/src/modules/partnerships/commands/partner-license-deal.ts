import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, requireId } from '@open-mercato/shared/lib/commands/helpers'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { PartnerLicenseDeal } from '../data/entities'
import {
  partnerLicenseDealCreateSchema,
  partnerLicenseDealUpdateSchema,
  type PartnerLicenseDealCreateInput,
} from '../data/validators'
import type { CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'

const pldCrudEvents: CrudEventsConfig = {
  module: 'partnerships',
  entity: 'license-deal',
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    organizationId: ctx.identifiers.organizationId,
    tenantId: ctx.identifiers.tenantId,
  }),
}

function computeYear(closedAt: Date): number {
  return closedAt.getUTCFullYear()
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const createPldCommand: CommandHandler<PartnerLicenseDealCreateInput, { id: string }> = {
  id: 'partnerships.license-deals.create',
  async execute(input, ctx) {
    const parsed = partnerLicenseDealCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const year = computeYear(parsed.closedAt)

    // Check unique constraint: (licenseIdentifier, year)
    const existing = await em.findOne(PartnerLicenseDeal, {
      licenseIdentifier: parsed.licenseIdentifier,
      year,
    })
    if (existing) {
      throw new CrudHttpError(409, {
        error: `License deal with identifier "${parsed.licenseIdentifier}" already exists for year ${year}`,
      })
    }

    const record = em.create(PartnerLicenseDeal, {
      organizationId: parsed.organizationId,
      companyId: parsed.companyId,
      licenseIdentifier: parsed.licenseIdentifier,
      industryTag: parsed.industryTag,
      type: parsed.type,
      status: parsed.status,
      isRenewal: parsed.isRenewal,
      closedAt: parsed.closedAt,
      year,
      createdBy: parsed.createdBy,
      tenantId: parsed.tenantId,
    })

    em.persist(record)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: record,
      identifiers: {
        id: record.id,
        organizationId: record.organizationId,
        tenantId: record.tenantId,
      },
      events: pldCrudEvents,
    })

    return { id: record.id }
  },
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const updatePldCommand: CommandHandler<Record<string, unknown>, { id: string }> = {
  id: 'partnerships.license-deals.update',
  async execute(input, ctx) {
    const parsed = partnerLicenseDealUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const record = await em.findOne(PartnerLicenseDeal, { id: parsed.id })
    if (!record) throw new CrudHttpError(404, { error: 'Partner license deal not found' })

    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.licenseIdentifier !== undefined) record.licenseIdentifier = parsed.licenseIdentifier
    if (parsed.industryTag !== undefined) record.industryTag = parsed.industryTag
    if (parsed.type !== undefined) record.type = parsed.type
    if (parsed.status !== undefined) record.status = parsed.status
    if (parsed.isRenewal !== undefined) record.isRenewal = parsed.isRenewal
    if (parsed.closedAt !== undefined) {
      record.closedAt = parsed.closedAt
      record.year = computeYear(parsed.closedAt)
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: {
        id: record.id,
        organizationId: record.organizationId,
        tenantId: record.tenantId,
      },
      events: pldCrudEvents,
    })

    return { id: record.id }
  },
}

// ---------------------------------------------------------------------------
// Delete (hard delete — no soft-delete field on this entity)
// ---------------------------------------------------------------------------

const deletePldCommand: CommandHandler<{ id?: string }, { id: string }> = {
  id: 'partnerships.license-deals.delete',
  async execute(input, ctx) {
    const id = requireId(input, 'Partner license deal id is required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const record = await em.findOne(PartnerLicenseDeal, { id })
    if (!record) throw new CrudHttpError(404, { error: 'Partner license deal not found' })

    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    await em.remove(record).flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: record,
      identifiers: {
        id: record.id,
        organizationId: record.organizationId,
        tenantId: record.tenantId,
      },
      events: pldCrudEvents,
    })

    return { id }
  },
}

registerCommand(createPldCommand)
registerCommand(updatePldCommand)
registerCommand(deletePldCommand)
