"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type TierStatusResponse = {
  tier: string | null
  validUntil: string | null
  isExpiring: boolean
  isExpired: boolean
}

const TierExpiryBannerWidget: React.FC<DashboardWidgetComponentProps> = ({
  refreshToken,
}) => {
  const t = useT()
  const [data, setData] = React.useState<TierStatusResponse | null>(null)

  React.useEffect(() => {
    async function load() {
      const call = await apiCall<TierStatusResponse>('/api/partnerships/tier-status')
      if (call.ok && call.result) {
        setData(call.result)
      }
    }
    load().catch(() => {})
  }, [refreshToken])

  if (!data || (!data.isExpiring && !data.isExpired)) {
    return null
  }

  const reviewDate = data.validUntil
    ? new Date(data.validUntil).toLocaleDateString()
    : null

  if (data.isExpired) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
        {t('partnerships.tierStatus.overdueBanner', 'Your partnership tier review is overdue. Please contact your Partnership Manager.')}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
      {t('partnerships.tierStatus.expiringBanner', {
        tier: data.tier ?? '',
        date: reviewDate ?? '',
        defaultValue: `Your partnership tier ${data.tier} is due for review on ${reviewDate}. Your partnership is being evaluated.`,
      })}
    </div>
  )
}

export default TierExpiryBannerWidget
