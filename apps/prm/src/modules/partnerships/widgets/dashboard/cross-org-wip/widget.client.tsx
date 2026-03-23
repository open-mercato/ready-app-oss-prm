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
  createdAt: string
}

const CrossOrgWipWidget: React.FC<DashboardWidgetComponentProps> = ({
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const [agencies, setAgencies] = React.useState<AgencyListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    onRefreshStateChange?.(true)
    setLoading(true)
    setError(null)
    try {
      const call = await apiCall<{ agencies: AgencyListItem[] }>('/api/partnerships/agencies')
      if (call.ok && call.result) {
        setAgencies(call.result.agencies)
      } else {
        setError('Failed to load agencies')
      }
    } catch (err) {
      console.error('Failed to load cross-org WIP data', err)
      setError('Failed to load agencies')
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
          href="/backend/partnerships/add-agency"
          className="text-sm font-medium text-primary hover:underline"
        >
          Add Agency
        </a>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Agency</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">WIP</th>
          </tr>
        </thead>
        <tbody>
          {agencies.map((agency) => (
            <tr key={agency.organizationId} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer">
              <td className="px-3 py-2 font-medium">{agency.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{agency.wipCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default CrossOrgWipWidget
