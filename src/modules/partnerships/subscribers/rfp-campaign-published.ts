import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { User, Role, UserRole } from '@open-mercato/core/modules/auth/data/entities'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { notificationTypes } from '../notifications'
import { RfpSettings } from '../data/entities'

export const metadata = {
  event: 'partnerships.rfp_campaign.published',
  persistent: true,
  id: 'partnerships:rfp-campaign-published-notification',
}

type CampaignPublishedPayload = {
  campaignId: string
  title: string
  audience: string
  selectedAgencyIds?: string[] | null
  deadline: string
  tenantId: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

const BD_ROLE_NAMES = ['partner_member', 'partner_admin']

export default async function handle(payload: CampaignPublishedPayload, ctx: ResolverContext) {
  try {
    const em = ctx.resolve('em') as EntityManager
    const tenantId = payload.tenantId

    // Find target agency org IDs
    let agencyOrgIds: string[]

    if (payload.audience === 'selected' && payload.selectedAgencyIds?.length) {
      agencyOrgIds = payload.selectedAgencyIds
    } else if (payload.audience === 'selected') {
      // Selected but no agencies = nobody gets notified
      return
    } else {
      // audience = 'all' → all agency orgs (exclude the backoffice org)
      const allOrgs = await em.find(Organization, { tenant: tenantId })
      // Agencies are non-root orgs (slug != first org). We identify PM's org by looking for
      // the org without slug pattern of an agency. Simpler: get all orgs, exclude the one
      // that the PM belongs to (the backoffice). We just get all orgs.
      agencyOrgIds = allOrgs.map((o) => o.id)
    }

    if (agencyOrgIds.length === 0) return

    // Find BD roles
    const bdRoles = await em.find(Role, {
      name: { $in: BD_ROLE_NAMES },
      tenantId,
      deletedAt: null,
    })
    if (bdRoles.length === 0) return

    const bdRoleIds = bdRoles.map((r) => r.id)

    // Find users with BD roles in target agencies
    const userRoles = await em.find(UserRole, {
      role: { $in: bdRoleIds },
    }, { populate: ['user'] })

    const recipientUserIds: string[] = []
    for (const ur of userRoles) {
      const user = ur.user as User
      if (
        user &&
        !user.deletedAt &&
        user.organizationId &&
        agencyOrgIds.includes(user.organizationId) &&
        user.tenantId === tenantId
      ) {
        recipientUserIds.push(user.id)
      }
    }

    if (recipientUserIds.length === 0) return

    // Read template from RfpSettings (for body text)
    const settings = await em.findOne(RfpSettings, { tenantId })
    const bodyText = settings?.campaignTemplate
      ? settings.campaignTemplate
          .replace(/\[campaign-title\]/g, payload.title)
      : `New RFP Campaign: ${payload.title}`

    // Create notifications
    const notificationService = resolveNotificationService(ctx)
    const typeDef = notificationTypes.find((t) => t.type === 'partnerships.rfp.campaign_published')
    if (!typeDef) return

    await notificationService.createBatch({
      recipientUserIds: [...new Set(recipientUserIds)],
      type: typeDef.type,
      titleKey: typeDef.titleKey,
      bodyKey: typeDef.bodyKey,
      titleVariables: { campaignTitle: payload.title },
      bodyVariables: { campaignTitle: payload.title },
      title: `New RFP: ${payload.title}`,
      body: bodyText,
      icon: typeDef.icon,
      severity: typeDef.severity ?? 'info',
      sourceModule: 'partnerships',
      sourceEntityType: 'partnerships:rfp_campaign',
      sourceEntityId: payload.campaignId,
      linkHref: `/backend/partnerships/rfp-campaigns/${payload.campaignId}`,
      groupKey: `rfp-campaign-published:${payload.campaignId}`,
    }, {
      tenantId,
      organizationId: null, // cross-org notification
    })
  } catch (err) {
    console.error('[partnerships:rfp-campaign-published] Failed to create notifications:', err)
  }
}
