"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type AgencyListItem = {
  organizationId: string
  name: string
  adminEmail: string | null
  wipCount: number
  wicScore: number
  minCount: number
  createdAt: string
}

type AgenciesResponse = {
  agencies: AgencyListItem[]
  month: string
  year: number
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

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-')
  if (!year || !monthNum) return month
  const date = new Date(Number(year), Number(monthNum) - 1, 1)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

const CrossOrgWipWidget: React.FC<DashboardWidgetComponentProps> = ({
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const [selectedMonth, setSelectedMonth] = React.useState<string>(currentYearMonth)
  const [agencies, setAgencies] = React.useState<AgencyListItem[]>([])
  const [year, setYear] = React.useState<number>(new Date().getFullYear())
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const call = await apiCall<AgenciesResponse>(
        `/api/partnerships/agencies?month=${encodeURIComponent(selectedMonth)}`,
      )
      if (call.ok && call.result) {
        setAgencies(call.result.agencies)
        setYear(call.result.year)
      } else {
        setError('Failed to load agencies')
      }
    } catch (err) {
      console.error('Failed to load cross-org pipeline data', err)
      setError('Failed to load agencies')
    } finally {
      setLoading(false)
      onRefreshStateChange?.(false)
    }
  }, [selectedMonth, onRefreshStateChange])

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

  if (agencies.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">No agencies yet</p>
        <a
          href="/backend/partnerships/agencies/add"
          className="text-sm font-medium text-primary hover:underline"
        >
          Add Agency
        </a>
      </div>
    )
  }

  const monthLabel = formatMonthLabel(selectedMonth)

  return (
    <div className="flex flex-col gap-3">
      {/* Month switcher */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setSelectedMonth((prev) => offsetMonth(prev, -1))}
          className="rounded p-1 hover:bg-muted/50 transition-colors"
          aria-label="Previous month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-muted-foreground" aria-hidden="true">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="text-xs font-medium text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setSelectedMonth((prev) => offsetMonth(prev, 1))}
          className="rounded p-1 hover:bg-muted/50 transition-colors"
          aria-label="Next month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-muted-foreground" aria-hidden="true">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Agency</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">WIP</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">WIC</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                MIN <span className="text-[10px] font-normal">({year})</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((agency) => (
              <tr key={agency.organizationId} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer">
                <td className="px-3 py-2 font-medium">{agency.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{agency.wipCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {agency.wicScore % 1 !== 0 ? agency.wicScore.toFixed(1) : agency.wicScore}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{agency.minCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default CrossOrgWipWidget
