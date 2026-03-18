import type { EntityManager } from '@mikro-orm/postgresql'
import { PartnerAgency, PartnerRfpCampaign } from '../data/entities'

export const metadata = {
  event: 'partnerships.partner_rfp.issued',
  persistent: true,
  id: 'partnerships:notify-agencies-on-rfp',
}

export default async function handle(
  payload: unknown,
  ctx: { resolve: <T>(name: string) => T },
): Promise<void> {
  const data = payload as {
    id?: string
    tenantId?: string
    organizationId?: string
  }

  if (!data.id || !data.tenantId || !data.organizationId) return

  const em = ctx.resolve<EntityManager>('em')

  const campaign = await em.findOne(PartnerRfpCampaign, {
    id: data.id,
    tenantId: data.tenantId,
    deletedAt: null,
  })
  if (!campaign) return

  let agencies: PartnerAgency[]
  if (campaign.audience === 'all') {
    agencies = await em.find(PartnerAgency, {
      tenantId: data.tenantId,
      organizationId: data.organizationId,
      status: 'active',
      deletedAt: null,
    })
  } else {
    const agencyIds: string[] = campaign.invitedAgencyIds ?? []
    if (agencyIds.length === 0) return
    agencies = await em.find(PartnerAgency, {
      id: { $in: agencyIds },
      tenantId: data.tenantId,
      deletedAt: null,
    })
  }

  if (agencies.length === 0) return

  const { CustomerUser } = await import(
    '@open-mercato/core/modules/customer_accounts/data/entities'
  )

  const agencyCompanyIds = agencies.map((a) => a.agencyOrganizationId)
  const users = await em.find(CustomerUser, {
    tenantId: data.tenantId,
    customerEntityId: { $in: agencyCompanyIds },
    isActive: true,
    deletedAt: null,
  })

  if (users.length === 0) return

  try {
    const eventBus = ctx.resolve<any>('eventBus')
    for (const user of users) {
      await eventBus.emit('notifications.create', {
        tenantId: data.tenantId,
        organizationId: data.organizationId,
        type: 'partnerships.rfp.invitation',
        recipientType: 'customer_user',
        recipientId: user.id,
        sourceEntityId: campaign.id,
        data: { campaignTitle: campaign.title },
      })
    }
  } catch {
    // Notifications module may not be available — fail gracefully
  }
}
