import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerAgency } from '../data/entities'
import { onboardAgencySchema } from '../data/validators'
import { emitPartnershipEvent } from '../events'

const selfOnboardCommand: CommandHandler<Record<string, unknown>, PartnerAgency> = {
  id: 'partnerships.partner_agency.self_onboard',
  isUndoable: true,

  async execute(rawInput, ctx) {
    const parsed = onboardAgencySchema.parse(rawInput)
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId

    if (!tenantId || !organizationId) {
      throw new CrudHttpError(403, { error: 'Missing tenant or organization context' })
    }

    const em = ctx.container.resolve('em') as any
    const existing = await em.findOne(PartnerAgency, {
      tenantId,
      organizationId,
      agencyOrganizationId: parsed.agencyOrganizationId,
      deletedAt: null,
    })
    if (existing) {
      throw new CrudHttpError(409, { error: 'Agency already onboarded' })
    }

    const agency = em.create(PartnerAgency, {
      tenantId,
      organizationId,
      agencyOrganizationId: parsed.agencyOrganizationId,
      status: 'active',
      onboardedAt: new Date(),
    })
    em.persist(agency)
    await em.flush()

    try {
      await emitPartnershipEvent('partnerships.partner_agency.self_onboarded', {
        id: agency.id,
        tenantId,
        organizationId,
        agencyOrganizationId: agency.agencyOrganizationId,
      })
    } catch {
      // event emission failure must not break the command
    }

    return agency
  },

  async captureAfter(_input, result) {
    return { id: result.id, status: result.status }
  },

  async buildLog({ result }) {
    return {
      actionLabel: 'Agency self-onboarded',
      resourceKind: 'partnerships.partner_agency',
      resourceId: String(result.id),
    }
  },

  async undo({ logEntry, ctx }) {
    const em = ctx.container.resolve('em') as any
    const agency = await em.findOne(PartnerAgency, { id: logEntry.resourceId })
    if (agency) {
      agency.status = 'inactive'
      agency.deletedAt = new Date()
      await em.flush()
    }
  },
}

registerCommand(selfOnboardCommand)

export { selfOnboardCommand }
