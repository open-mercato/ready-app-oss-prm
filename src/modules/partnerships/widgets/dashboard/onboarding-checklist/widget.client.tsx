"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OnboardingChecklistItem = {
  id: string
  label: string
  completed: boolean
  link: string
}

type OnboardingStatusResponse = {
  role: 'partner_admin' | 'partner_member' | 'partner_contributor' | null
  items: OnboardingChecklistItem[]
  allCompleted: boolean
}

async function loadOnboardingStatus(): Promise<OnboardingStatusResponse> {
  const call = await apiCall<OnboardingStatusResponse>('/api/partnerships/onboarding-status')
  if (!call.ok) {
    const payload = call.result as Record<string, unknown> | null
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `Request failed with status ${call.status}`
    throw new Error(message)
  }
  const result = call.result
  if (!result || typeof result !== 'object') {
    return { role: null, items: [], allCompleted: false }
  }
  return result
}

const OnboardingChecklistWidget: React.FC<DashboardWidgetComponentProps> = ({
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const [data, setData] = React.useState<OnboardingStatusResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadOnboardingStatus()
      setData(result)
    } catch (err) {
      console.error('Failed to load onboarding checklist widget data', err)
      setError(t('partnerships.widgets.onboardingChecklist.error'))
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [onRefreshStateChange, t])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh, refreshToken])

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!data || data.allCompleted || data.items.length === 0) {
    return null
  }

  return (
    <ul className="space-y-2">
      {data.items.map((item) => {
        const label = t(item.label) !== item.label ? t(item.label) : item.label
        return (
          <li key={item.id}>
            <a
              href={item.link}
              className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors"
            >
              {item.completed ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30" />
              )}
              <span
                className={
                  item.completed
                    ? 'text-sm text-muted-foreground line-through'
                    : 'text-sm font-semibold text-foreground'
                }
              >
                {label}
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export default OnboardingChecklistWidget
