import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerLicenseDeal } from '../data/entities'
import { createLicenseDealSchema, updateLicenseDealSchema, attributeLicenseDealSchema } from '../data/validators'

const createLicenseDealCommand: CommandHandler<Record<string, unknown>, PartnerLicenseDeal> = {
  id: 'partnerships.partner_license_deal.create',
  isUndoable: true,

  async execute(rawInput, ctx) {
    const parsed = createLicenseDealSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as any
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId
    if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

    const deal = em.create(PartnerLicenseDeal, {
      tenantId, organizationId, ...parsed,
    })
    em.persist(deal)
    await em.flush()
    return deal
  },

  async buildLog({ result }) {
    return { actionLabel: 'License deal created', resourceKind: 'partnerships.partner_license_deal', resourceId: String(result.id) }
  },

  async undo({ logEntry, ctx }) {
    const em = ctx.container.resolve('em') as any
    const deal = await em.findOne(PartnerLicenseDeal, { id: logEntry.resourceId })
    if (deal) { deal.deletedAt = new Date(); await em.flush() }
  },
}

const updateLicenseDealCommand: CommandHandler<Record<string, unknown>, PartnerLicenseDeal> = {
  id: 'partnerships.partner_license_deal.update',
  isUndoable: true,

  async execute(rawInput, ctx) {
    const parsed = updateLicenseDealSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as any
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId
    if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

    const deal = await em.findOne(PartnerLicenseDeal, {
      id: parsed.id, tenantId, organizationId, deletedAt: null,
    })
    if (!deal) throw new CrudHttpError(404, { error: 'License deal not found' })

    if (parsed.status !== undefined) deal.status = parsed.status
    if (parsed.isRenewal !== undefined) deal.isRenewal = parsed.isRenewal
    await em.flush()
    return deal
  },

  async buildLog({ result }) {
    return { actionLabel: 'License deal updated', resourceKind: 'partnerships.partner_license_deal', resourceId: String(result.id) }
  },
}

const attributeLicenseDealCommand: CommandHandler<Record<string, unknown>, PartnerLicenseDeal> = {
  id: 'partnerships.partner_license_deal.attribute',
  isUndoable: true,

  async execute(rawInput, ctx) {
    const parsed = attributeLicenseDealSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as any
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId
    const userId = ctx.auth?.userId
    if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

    const deal = await em.findOne(PartnerLicenseDeal, {
      id: parsed.id, tenantId, organizationId, deletedAt: null,
    })
    if (!deal) throw new CrudHttpError(404, { error: 'License deal not found' })

    deal.partnerAgencyId = parsed.partnerAgencyId
    deal.attributedAt = new Date()
    deal.attributedByUserId = userId ?? null
    await em.flush()
    return deal
  },

  async buildLog({ result }) {
    return {
      actionLabel: `License deal attributed to agency ${result.partnerAgencyId}`,
      resourceKind: 'partnerships.partner_license_deal',
      resourceId: String(result.id),
    }
  },

  async undo({ logEntry, ctx }) {
    const em = ctx.container.resolve('em') as any
    const deal = await em.findOne(PartnerLicenseDeal, { id: logEntry.resourceId })
    if (deal) {
      deal.partnerAgencyId = null
      deal.attributedAt = null
      deal.attributedByUserId = null
      await em.flush()
    }
  },
}

registerCommand(createLicenseDealCommand)
registerCommand(updateLicenseDealCommand)
registerCommand(attributeLicenseDealCommand)

export { createLicenseDealCommand, updateLicenseDealCommand, attributeLicenseDealCommand }
