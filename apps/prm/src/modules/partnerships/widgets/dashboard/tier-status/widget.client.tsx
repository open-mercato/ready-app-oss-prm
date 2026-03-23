"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type TierStatusResponse = {
  tier: string | null
  kpis: {
    wic: number
    wip: number
    min: number
    wicThreshold: number
    wipThreshold: number
    minThreshold: number
  }
  gracePeriod: boolean
  pendingProposal: boolean
  progressPercent: {
    wic: number
    wip: number
    min: number
  }
}

async function loadTierStatus(): Promise<TierStatusResponse> {
  const call = await apiCall<TierStatusResponse>('/api/partnerships/tier-status')
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
    throw new Error('Invalid response')
  }
  return result
}

// ---------------------------------------------------------------------------
// Progress bar component
// ---------------------------------------------------------------------------

function ProgressBar({
  label,
  value,
  threshold,
  percent,
}: {
  label: string
  value: number
  threshold: number
  percent: number
}) {
  const met = percent >= 100
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value}/{threshold}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            met
              ? 'bg-green-500 dark:bg-green-400'
              : 'bg-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-right text-[10px] tabular-nums text-muted-foreground/70">
        {percent}%
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tier badge
// ---------------------------------------------------------------------------

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) {
    return null
  }
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
      {tier}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

const TierStatusWidget: React.FC<DashboardWidgetComponentProps> = ({
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const [data, setData] = React.useState<TierStatusResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const result = await loadTierStatus()
      setData(result)
    } catch (err) {
      console.error('Failed to load tier status widget data', err)
      setError(
        err instanceof Error ? err.message : 'Failed to load tier status',
      )
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [onRefreshStateChange])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh, refreshToken])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!data) {
    return null
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* Tier badge */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('partnerships.tierStatus.currentTier')}
        </p>
        {data.tier ? (
          <TierBadge tier={data.tier} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t('partnerships.tierStatus.noTier')}
          </p>
        )}
      </div>

      {/* Grace period warning */}
      {data.gracePeriod && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200">
          {t('partnerships.tierStatus.gracePeriod')}
        </div>
      )}

      {/* Pending proposal notice */}
      {data.pendingProposal && (
        <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          {t('partnerships.tierStatus.pendingApproval')}
        </div>
      )}

      {/* KPI progress bars */}
      <div className="space-y-3">
        <ProgressBar
          label={t('partnerships.tierStatus.wic')}
          value={data.kpis.wic}
          threshold={data.kpis.wicThreshold}
          percent={data.progressPercent.wic}
        />
        <ProgressBar
          label={t('partnerships.tierStatus.wip')}
          value={data.kpis.wip}
          threshold={data.kpis.wipThreshold}
          percent={data.progressPercent.wip}
        />
        <ProgressBar
          label={t('partnerships.tierStatus.min')}
          value={data.kpis.min}
          threshold={data.kpis.minThreshold}
          percent={data.progressPercent.min}
        />
      </div>
    </div>
  )
}

export default TierStatusWidget
