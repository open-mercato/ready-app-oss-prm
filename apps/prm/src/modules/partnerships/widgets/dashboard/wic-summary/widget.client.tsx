"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type WicScoresResponse = {
  records: Array<{ assessmentSource: string }>
  month: string
  totalWicScore: number
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

async function loadWicScores(month: string): Promise<WicScoresResponse> {
  const call = await apiCall<WicScoresResponse>(
    `/api/partnerships/wic-scores?month=${encodeURIComponent(month)}`,
  )
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
    return { records: [], month, totalWicScore: 0 }
  }
  return result
}

function sourceBadge(source: string) {
  const isAutomated = source === 'automated_pipeline'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isAutomated
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
      }`}
    >
      {isAutomated ? 'Automated' : 'Manual'}
    </span>
  )
}

const WicSummaryWidget: React.FC<DashboardWidgetComponentProps> = ({
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const [data, setData] = React.useState<WicScoresResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const month = React.useMemo(() => currentYearMonth(), [])

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadWicScores(month)
      setData(result)
    } catch (err) {
      console.error('Failed to load WIC summary widget data', err)
      setError(t('partnerships.widgets.wicSummary.noData'))
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [month, onRefreshStateChange, t])

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

  const totalScore = data?.totalWicScore ?? 0
  const monthLabel = formatMonthLabel(data?.month ?? month)

  // Determine dominant source from records
  const sources = data?.records?.map((r) => r.assessmentSource) ?? []
  const dominantSource =
    sources.length > 0
      ? sources.filter((s) => s === 'automated_pipeline').length > sources.length / 2
        ? 'automated_pipeline'
        : 'manual_import'
      : null

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-5xl font-bold tabular-nums text-foreground">
        {totalScore.toFixed(1)}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('partnerships.widgets.wicSummary.subtitle', { month: monthLabel })}
      </p>
      {dominantSource && (
        <div className="pt-1">{sourceBadge(dominantSource)}</div>
      )}
      <a
        href="/backend/partnerships/my-wic"
        className="mt-1 text-xs text-primary hover:underline"
      >
        {t('partnerships.widgets.wicSummary.viewDetails')}
      </a>
    </div>
  )
}

export default WicSummaryWidget
