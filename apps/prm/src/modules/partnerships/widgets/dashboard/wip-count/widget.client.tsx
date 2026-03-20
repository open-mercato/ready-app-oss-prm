"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type WipCountResponse = {
  month: string
  count: number
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-')
  if (!year || !monthNum) return month
  const date = new Date(Number(year), Number(monthNum) - 1, 1)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function currentYearMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function offsetMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

async function loadWipCount(month: string): Promise<WipCountResponse> {
  const call = await apiCall<WipCountResponse>(`/api/partnerships/wip-count?month=${encodeURIComponent(month)}`)
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
    return { month, count: 0 }
  }
  return result
}

const WipCountWidget: React.FC<DashboardWidgetComponentProps> = ({
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const [selectedMonth, setSelectedMonth] = React.useState<string>(currentYearMonth)
  const [data, setData] = React.useState<WipCountResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadWipCount(selectedMonth)
      setData(result)
    } catch (err) {
      console.error('Failed to load WIP count widget data', err)
      setError(t('partnerships.widgets.wipCount.noData'))
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [selectedMonth, onRefreshStateChange, t])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh, refreshToken])

  const handlePrevMonth = React.useCallback(() => {
    setSelectedMonth((prev) => offsetMonth(prev, -1))
  }, [])

  const handleNextMonth = React.useCallback(() => {
    setSelectedMonth((prev) => offsetMonth(prev, 1))
  }, [])

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

  const monthLabel = formatMonthLabel(data?.month ?? selectedMonth)

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-5xl font-bold tabular-nums text-foreground">{data?.count ?? 0}</p>
      <p className="text-sm text-muted-foreground">
        {t('partnerships.widgets.wipCount.subtitle', { month: monthLabel })}
      </p>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="rounded p-1 hover:bg-muted/50 transition-colors"
          aria-label="Previous month"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <span className="text-xs font-medium text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={handleNextMonth}
          className="rounded p-1 hover:bg-muted/50 transition-colors"
          aria-label="Next month"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <p className="text-xs text-muted-foreground/60">{t('partnerships.widgets.wipCount.wicPlaceholder')} <span className="italic">(available in Phase 2)</span></p>
    </div>
  )
}

export default WipCountWidget
