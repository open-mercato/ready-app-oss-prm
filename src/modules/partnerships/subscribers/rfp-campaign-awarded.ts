import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { User, Role, UserRole } from '@open-mercato/core/modules/auth/data/entities'
import { notificationTypes } from '../notifications'

export const metadata = {
  event: 'partnerships.rfp_campaign.awarded',
  persistent: true,
  id: 'partnerships:rfp-campaign-awarded-notification',
}

type AwardedPayload = {
  campaignId: string
  title: string
  winnerOrganizationId: string
  respondentOrganizationIds: string[]
  tenantId: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

const BD_ROLE_NAMES = ['partner_member', 'partner_admin']

async function findBdUserIds(
  em: EntityManager,
  organizationIds: string[],
  tenantId: string,
): Promise<string[]> {
  if (organizationIds.length === 0) return []

  const bdRoles = await em.find(Role, {
    name: { $in: BD_ROLE_NAMES },
    tenantId,
    deletedAt: null,
  })
  if (bdRoles.length === 0) return []

  const userRoles = await em.find(UserRole, {
    role: { $in: bdRoles.map((r) => r.id) },
  }, { populate: ['user'] })

  const userIds: string[] = []
  for (const ur of userRoles) {
    const user = ur.user as User
    if (
      user &&
      !user.deletedAt &&
      user.organizationId &&
      organizationIds.includes(user.organizationId) &&
      user.tenantId === tenantId
    ) {
      userIds.push(user.id)
    }
  }
  return [...new Set(userIds)]
}

export default async function handle(payload: AwardedPayload, ctx: ResolverContext) {
  try {
    const em = ctx.resolve('em') as EntityManager
    const notificationService = resolveNotificationService(ctx)
    const { tenantId, campaignId, title, winnerOrganizationId, respondentOrganizationIds } = payload

    // Award notification to winner
    const awardType = notificationTypes.find((t) => t.type === 'partnerships.rfp.awarded')
    if (awardType) {
      const winnerUserIds = await findBdUserIds(em, [winnerOrganizationId], tenantId)
      if (winnerUserIds.length > 0) {
        await notificationService.createBatch({
          recipientUserIds: winnerUserIds,
          type: awardType.type,
          titleKey: awardType.titleKey,
          bodyKey: awardType.bodyKey,
          titleVariables: { campaignTitle: title },
          bodyVariables: { campaignTitle: title },
          title: `RFP Awarded: ${title}`,
          body: `Your agency has been selected for "${title}". Congratulations!`,
          icon: awardType.icon,
          severity: awardType.severity ?? 'success',
          sourceModule: 'partnerships',
          sourceEntityType: 'partnerships:rfp_campaign',
          sourceEntityId: campaignId,
          linkHref: `/backend/partnerships/rfp-campaigns/${campaignId}`,
          groupKey: `rfp-campaign-awarded:${campaignId}`,
        }, { tenantId, organizationId: null })
      }
    }

    // Rejection notification to losers (respondents who didn't win)
    const rejectType = notificationTypes.find((t) => t.type === 'partnerships.rfp.rejected')
    if (rejectType) {
      const loserOrgIds = respondentOrganizationIds.filter((id) => id !== winnerOrganizationId)
      const loserUserIds = await findBdUserIds(em, loserOrgIds, tenantId)
      if (loserUserIds.length > 0) {
        await notificationService.createBatch({
          recipientUserIds: loserUserIds,
          type: rejectType.type,
          titleKey: rejectType.titleKey,
          bodyKey: rejectType.bodyKey,
          titleVariables: { campaignTitle: title },
          bodyVariables: { campaignTitle: title },
          title: `RFP Not Selected: ${title}`,
          body: `Another agency was selected for "${title}". Thank you for your response.`,
          icon: rejectType.icon,
          severity: rejectType.severity ?? 'info',
          sourceModule: 'partnerships',
          sourceEntityType: 'partnerships:rfp_campaign',
          sourceEntityId: campaignId,
          linkHref: `/backend/partnerships/rfp-campaigns/${campaignId}`,
          groupKey: `rfp-campaign-rejected:${campaignId}`,
        }, { tenantId, organizationId: null })
      }
    }
  } catch (err) {
    console.error('[partnerships:rfp-campaign-awarded] Failed to create notifications:', err)
  }
}
