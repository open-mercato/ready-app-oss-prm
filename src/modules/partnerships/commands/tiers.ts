import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerTierDefinition, PartnerTierAssignment, PartnerAgency } from '../data/entities'
import { createTierDefinitionSchema, updateTierDefinitionSchema, assignTierSchema, downgradeTierSchema } from '../data/validators'
import { emitPartnershipEvent } from '../events'
import { getCurrentTierAssignment } from '../lib/tier-lifecycle'

const TIER_VALIDITY_MONTHS = parseInt(process.env.PARTNERSHIP_TIER_VALIDITY_MONTHS_DEFAULT || '12', 10)

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

// ── Define Tier ───────────────────────────────────────────────

const defineTierCommand: CommandHandler<Record<string, unknown>, PartnerTierDefinition> = {
  id: 'partnerships.partner_tier.define',
  isUndoable: true,

  async execute(rawInput, ctx) {
    const parsed = createTierDefinitionSchema.parse(rawInput)
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId

    if (!tenantId || !organizationId) {
      throw new CrudHttpError(403, { error: 'Missing tenant or organization context' })
    }

    const em = ctx.container.resolve('em') as any
    const existing = await em.findOne(PartnerTierDefinition, {
      tenantId, organizationId, key: parsed.key, deletedAt: null,
    })
    if (existing) {
      throw new CrudHttpError(409, { error: `Tier key "${parsed.key}" already exists` })
    }

    const tier = em.create(PartnerTierDefinition, {
      tenantId,
      organizationId,
      key: parsed.key,
      label: parsed.label,
      wicThreshold: parsed.wicThreshold,
      wipThreshold: parsed.wipThreshold,
      minThreshold: parsed.minThreshold,
      isActive: parsed.isActive,
    })
    em.persist(tier)
    await em.flush()

    return tier
  },

  async captureAfter(_input, result) {
    return { id: result.id, key: result.key }
  },

  async buildLog({ result }) {
    return {
      actionLabel: 'Tier defined',
      resourceKind: 'partnerships.partner_tier_definition',
      resourceId: String(result.id),
    }
  },

  async undo({ logEntry, ctx }) {
    const em = ctx.container.resolve('em') as any
    const tier = await em.findOne(PartnerTierDefinition, { id: logEntry.resourceId })
    if (tier) {
      tier.deletedAt = new Date()
      tier.isActive = false
      await em.flush()
    }
  },
}

// ── Update Tier ───────────────────────────────────────────────

const updateTierCommand: CommandHandler<Record<string, unknown>, PartnerTierDefinition> = {
  id: 'partnerships.partner_tier.update',
  isUndoable: false,

  async execute(rawInput, ctx) {
    const parsed = updateTierDefinitionSchema.parse(rawInput)
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId

    if (!tenantId || !organizationId) {
      throw new CrudHttpError(403, { error: 'Missing tenant or organization context' })
    }

    const em = ctx.container.resolve('em') as any
    const tier = await em.findOne(PartnerTierDefinition, {
      id: parsed.id, tenantId, organizationId, deletedAt: null,
    })
    if (!tier) {
      throw new CrudHttpError(404, { error: 'Tier definition not found' })
    }

    if (parsed.label !== undefined) tier.label = parsed.label
    if (parsed.wicThreshold !== undefined) tier.wicThreshold = parsed.wicThreshold
    if (parsed.wipThreshold !== undefined) tier.wipThreshold = parsed.wipThreshold
    if (parsed.minThreshold !== undefined) tier.minThreshold = parsed.minThreshold
    if (parsed.isActive !== undefined) tier.isActive = parsed.isActive

    await em.flush()
    return tier
  },

  async captureAfter(_input, result) {
    return { id: result.id, key: result.key }
  },

  async buildLog({ result }) {
    return {
      actionLabel: 'Tier updated',
      resourceKind: 'partnerships.partner_tier_definition',
      resourceId: String(result.id),
    }
  },
}

// ── Assign Tier ───────────────────────────────────────────────

const assignTierCommand: CommandHandler<Record<string, unknown>, PartnerTierAssignment> = {
  id: 'partnerships.partner_tier.assign',
  isUndoable: true,

  async execute(rawInput, ctx) {
    const parsed = assignTierSchema.parse(rawInput)
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId

    if (!tenantId || !organizationId) {
      throw new CrudHttpError(403, { error: 'Missing tenant or organization context' })
    }

    const em = ctx.container.resolve('em') as any

    // Verify agency exists
    const agency = await em.findOne(PartnerAgency, {
      tenantId, organizationId, id: parsed.partnerAgencyId, deletedAt: null,
    })
    if (!agency) {
      throw new CrudHttpError(404, { error: 'Partner agency not found' })
    }

    // Verify tier key exists
    const tierDef = await em.findOne(PartnerTierDefinition, {
      tenantId, organizationId, key: parsed.tierKey, isActive: true, deletedAt: null,
    })
    if (!tierDef) {
      throw new CrudHttpError(404, { error: `Active tier definition "${parsed.tierKey}" not found` })
    }

    // Expire current assignment if any
    const scope = { tenantId, organizationId }
    const current = await getCurrentTierAssignment(em, scope, parsed.partnerAgencyId)
    if (current) {
      current.validUntil = new Date()
      current.reason = current.reason ? `${current.reason} [superseded]` : '[superseded]'
    }

    const now = new Date()
    const validUntil = parsed.validUntil ? new Date(parsed.validUntil) : addMonths(now, TIER_VALIDITY_MONTHS)

    const assignment = em.create(PartnerTierAssignment, {
      tenantId,
      organizationId,
      partnerAgencyId: parsed.partnerAgencyId,
      tierKey: parsed.tierKey,
      grantedAt: now,
      validUntil,
      reason: parsed.reason ?? null,
      assignedByUserId: ctx.auth?.userId ?? null,
    })
    em.persist(assignment)
    await em.flush()

    try {
      await emitPartnershipEvent('partnerships.partner_tier.assigned', {
        id: assignment.id,
        tenantId,
        organizationId,
        partnerAgencyId: parsed.partnerAgencyId,
        tierKey: parsed.tierKey,
      })
    } catch {
      // event emission failure must not break the command
    }

    return assignment
  },

  async captureAfter(_input, result) {
    return { id: result.id, tierKey: result.tierKey, partnerAgencyId: result.partnerAgencyId }
  },

  async buildLog({ result }) {
    return {
      actionLabel: 'Tier assigned',
      resourceKind: 'partnerships.partner_tier_assignment',
      resourceId: String(result.id),
    }
  },

  async undo({ logEntry, ctx }) {
    const em = ctx.container.resolve('em') as any
    const assignment = await em.findOne(PartnerTierAssignment, { id: logEntry.resourceId })
    if (assignment) {
      assignment.validUntil = new Date()
      assignment.reason = assignment.reason ? `${assignment.reason} [UNDO]` : '[UNDO]'
      await em.flush()
    }
  },
}

// ── Downgrade Tier ────────────────────────────────────────────

const downgradeTierCommand: CommandHandler<Record<string, unknown>, PartnerTierAssignment> = {
  id: 'partnerships.partner_tier.downgrade',
  isUndoable: false,

  async execute(rawInput, ctx) {
    const parsed = downgradeTierSchema.parse(rawInput)
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId

    if (!tenantId || !organizationId) {
      throw new CrudHttpError(403, { error: 'Missing tenant or organization context' })
    }

    const em = ctx.container.resolve('em') as any

    // Verify agency exists
    const agency = await em.findOne(PartnerAgency, {
      tenantId, organizationId, id: parsed.partnerAgencyId, deletedAt: null,
    })
    if (!agency) {
      throw new CrudHttpError(404, { error: 'Partner agency not found' })
    }

    // Verify new tier key exists
    const tierDef = await em.findOne(PartnerTierDefinition, {
      tenantId, organizationId, key: parsed.newTierKey, isActive: true, deletedAt: null,
    })
    if (!tierDef) {
      throw new CrudHttpError(404, { error: `Active tier definition "${parsed.newTierKey}" not found` })
    }

    // Expire current assignment
    const scope = { tenantId, organizationId }
    const current = await getCurrentTierAssignment(em, scope, parsed.partnerAgencyId)
    if (current) {
      current.validUntil = new Date()
      current.reason = current.reason ? `${current.reason} [downgraded]` : '[downgraded]'
    }

    const now = new Date()
    const assignment = em.create(PartnerTierAssignment, {
      tenantId,
      organizationId,
      partnerAgencyId: parsed.partnerAgencyId,
      tierKey: parsed.newTierKey,
      grantedAt: now,
      validUntil: addMonths(now, TIER_VALIDITY_MONTHS),
      reason: parsed.reason,
      assignedByUserId: ctx.auth?.userId ?? null,
    })
    em.persist(assignment)
    await em.flush()

    try {
      await emitPartnershipEvent('partnerships.partner_tier.downgraded', {
        id: assignment.id,
        tenantId,
        organizationId,
        partnerAgencyId: parsed.partnerAgencyId,
        previousTierKey: current?.tierKey ?? null,
        newTierKey: parsed.newTierKey,
        reason: parsed.reason,
      })
    } catch {
      // event emission failure must not break the command
    }

    return assignment
  },

  async captureAfter(_input, result) {
    return { id: result.id, tierKey: result.tierKey, partnerAgencyId: result.partnerAgencyId }
  },

  async buildLog({ result }) {
    return {
      actionLabel: 'Tier downgraded',
      resourceKind: 'partnerships.partner_tier_assignment',
      resourceId: String(result.id),
    }
  },
}

registerCommand(defineTierCommand)
registerCommand(updateTierCommand)
registerCommand(assignTierCommand)
registerCommand(downgradeTierCommand)

export { defineTierCommand, updateTierCommand, assignTierCommand, downgradeTierCommand }
