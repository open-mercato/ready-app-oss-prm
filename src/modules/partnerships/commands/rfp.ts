import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerRfpCampaign, PartnerRfpResponse } from '../data/entities'
import { submitRfpResponseSchema } from '../data/validators'
import { emitPartnershipEvent } from '../events'

const respondRfpCommand: CommandHandler<Record<string, unknown>, PartnerRfpResponse> = {
  id: 'partnerships.partner_rfp.respond',
  isUndoable: true,

  async execute(rawInput, ctx) {
    const em = ctx.container.resolve('em') as any
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId

    const parsed = submitRfpResponseSchema.parse(rawInput)

    // Validate campaign exists and is published
    const campaign = await em.findOne(PartnerRfpCampaign, {
      id: parsed.rfpCampaignId,
      tenantId,
      organizationId,
      status: 'published',
      deletedAt: null,
    })
    if (!campaign) {
      throw new CrudHttpError(404, { error: 'RFP campaign not found or not published' })
    }

    // Check for existing response
    let response = await em.findOne(PartnerRfpResponse, {
      tenantId,
      organizationId,
      rfpCampaignId: parsed.rfpCampaignId,
      partnerAgencyId: parsed.partnerAgencyId,
    })

    if (response) {
      // Update existing
      if (parsed.content !== undefined) response.content = parsed.content
      response.status = 'submitted'
      response.submittedAt = new Date()
      response.updatedAt = new Date()
    } else {
      // Create new
      response = em.create(PartnerRfpResponse, {
        tenantId,
        organizationId,
        rfpCampaignId: parsed.rfpCampaignId,
        partnerAgencyId: parsed.partnerAgencyId,
        content: parsed.content ?? null,
        status: 'submitted',
        submittedAt: new Date(),
        createdAt: new Date(),
      })
      em.persist(response)
    }

    await em.flush()

    try {
      await emitPartnershipEvent('partnerships.partner_rfp.responded', {
        id: response.id,
        tenantId,
        organizationId,
        rfpCampaignId: campaign.id,
        partnerAgencyId: parsed.partnerAgencyId,
      })
    } catch {
      // event emission failure must not break the command
    }

    return response
  },

  async captureAfter(_input, result) {
    return { id: result.id, status: result.status }
  },

  async buildLog({ result }) {
    return {
      actionLabel: 'RFP Response submitted',
      resourceKind: 'partnerships.partner_rfp_response',
      resourceId: String(result.id),
    }
  },

  async undo({ logEntry, ctx }) {
    const em = ctx.container.resolve('em') as any
    const response = await em.findOne(PartnerRfpResponse, { id: logEntry.resourceId })
    if (response) {
      response.status = 'draft'
      response.submittedAt = null
      await em.flush()
    }
  },
}

registerCommand(respondRfpCommand)

export { respondRfpCommand }
