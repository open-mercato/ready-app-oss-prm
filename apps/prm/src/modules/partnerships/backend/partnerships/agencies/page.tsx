"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type AgencyListItem = {
  organizationId: string
  name: string
  adminEmail: string | null
  wipCount: number
  createdAt: string
}

export default function AgenciesPage() {
  const t = useT()
  const [agencies, setAgencies] = React.useState<AgencyListItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      const call = await apiCall<{ agencies: AgencyListItem[] }>('/api/partnerships/agencies')
      if (call.ok && call.result) {
        setAgencies(call.result.agencies)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-64 items-center justify-center">
            <Spinner className="h-8 w-8 text-muted-foreground" />
          </div>
        </PageBody>
      </Page>
    )
  }

  if (agencies.length === 0) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">No agencies yet. Add your first agency to start the partner program.</p>
            <a
              href="/backend/partnerships/add-agency"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add Agency
            </a>
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{agencies.length} Agencies</h2>
          <a
            href="/backend/partnerships/add-agency"
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Agency
          </a>
        </div>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Agency</th>
                <th className="px-4 py-3 text-left font-medium">Admin Email</th>
                <th className="px-4 py-3 text-right font-medium">WIP (this month)</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((agency) => (
                <tr key={agency.organizationId} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{agency.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{agency.adminEmail ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{agency.wipCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(agency.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </Page>
  )
}
