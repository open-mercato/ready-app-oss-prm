'use client'

import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

export const partnershipsNotificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'partnerships.rfp.campaign_published',
    module: 'partnerships',
    titleKey: 'partnerships.notifications.rfp.campaignPublished.title',
    bodyKey: 'partnerships.notifications.rfp.campaignPublished.body',
    icon: 'megaphone',
    severity: 'info',
    actions: [],
    linkHref: '/backend/partnerships/rfp-campaigns/{sourceEntityId}',
  },
  {
    type: 'partnerships.rfp.awarded',
    module: 'partnerships',
    titleKey: 'partnerships.notifications.rfp.awarded.title',
    bodyKey: 'partnerships.notifications.rfp.awarded.body',
    icon: 'trophy',
    severity: 'success',
    actions: [],
    linkHref: '/backend/partnerships/rfp-campaigns/{sourceEntityId}',
  },
  {
    type: 'partnerships.rfp.rejected',
    module: 'partnerships',
    titleKey: 'partnerships.notifications.rfp.rejected.title',
    bodyKey: 'partnerships.notifications.rfp.rejected.body',
    icon: 'x-circle',
    severity: 'info',
    actions: [],
    linkHref: '/backend/partnerships/rfp-campaigns/{sourceEntityId}',
  },
]

export default partnershipsNotificationTypes
