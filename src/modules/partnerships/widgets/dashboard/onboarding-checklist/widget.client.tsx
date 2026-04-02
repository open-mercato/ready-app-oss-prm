"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OnboardingChecklistItem = {
  id: string
  label: string
  link: string
}

type OnboardingStatusResponse = {
  role: 'agency_admin' | 'agency_business_developer' | 'agency_developer' | null
  items: OnboardingChecklistItem[]
}

type ChecklistSettings = {
  checkedItems: string[]
}

function hydrateSettings(raw: unknown): ChecklistSettings {
  if (raw && typeof raw === 'object' && 'checkedItems' in raw && Array.isArray((raw as ChecklistSettings).checkedItems)) {
    return raw as ChecklistSettings
  }
  return { checkedItems: [] }
}

async function loadOnboardingItems(): Promise<OnboardingStatusResponse> {
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
    return { role: null, items: [] }
  }
  return result
}

const OnboardingChecklistWidget: React.FC<DashboardWidgetComponentProps<ChecklistSettings>> = ({
  settings,
  onSettingsChange,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const [items, setItems] = React.useState<OnboardingChecklistItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const checkedItems = React.useMemo(() => hydrateSettings(settings).checkedItems, [settings])

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadOnboardingItems()
      setItems(result.items)
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

  function handleToggle(itemId: string) {
    const isChecked = checkedItems.includes(itemId)
    const next = isChecked
      ? checkedItems.filter((id) => id !== itemId)
      : [...checkedItems, itemId]
    onSettingsChange({ checkedItems: next })
  }

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

  if (!items.length) {
    return null
  }

  const allChecked = items.length > 0 && items.every((item) => checkedItems.includes(item.id))
  if (allChecked) {
    return null
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isChecked = checkedItems.includes(item.id)
        const label = t(item.label) !== item.label ? t(item.label) : item.label
        return (
          <li key={item.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors">
            <button
              type="button"
              onClick={() => handleToggle(item.id)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={isChecked ? { backgroundColor: 'var(--color-green-100, #dcfce7)', borderColor: 'var(--color-green-600, #16a34a)' } : undefined}
              aria-label={isChecked ? t('common.uncheck', 'Uncheck') : t('common.check', 'Check')}
            >
              {isChecked && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="var(--color-green-600, #16a34a)"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
            <a
              href={item.link}
              className={
                isChecked
                  ? 'text-sm text-muted-foreground line-through'
                  : 'text-sm font-semibold text-foreground hover:underline'
              }
            >
              {label}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export default OnboardingChecklistWidget
