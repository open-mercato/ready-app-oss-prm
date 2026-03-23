"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type LicenseDealRow = {
  id: string
  organization_id: string
  company_id: string
  license_identifier: string
  industry_tag: string
  type: string
  status: string
  is_renewal: boolean
  year: number
  closed_at: string | null
  created_at: string | null
}

export default function LicenseDealsPage() {
  const t = useT()
  const [items, setItems] = React.useState<LicenseDealRow[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      const call = await apiCall<{ items: LicenseDealRow[] }>('/api/partnerships/partner-license-deals')
      if (call.ok && call.result?.items) {
        setItems(call.result.items)
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

  return (
    <Page>
      <PageBody>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {t('partnerships.licenseDeals.title', 'License Deals')} ({items.length})
          </h2>
          <a
            href="/backend/partnerships/license-deals/create"
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('partnerships.licenseDeals.addButton', 'Add License Deal')}
          </a>
        </div>

        {items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">
              {t('partnerships.licenseDeals.noData', 'No license deals yet.')}
            </p>
            <a
              href="/backend/partnerships/license-deals/create"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('partnerships.licenseDeals.addButton', 'Add License Deal')}
            </a>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">
                    {t('partnerships.licenseDeals.columns.licenseId', 'License ID')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t('partnerships.licenseDeals.columns.industry', 'Industry')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('partnerships.licenseDeals.columns.year', 'Year')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t('partnerships.licenseDeals.columns.type', 'Type')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t('partnerships.licenseDeals.columns.status', 'Status')}
                  </th>
                  <th className="px-4 py-3 text-center font-medium">
                    {t('partnerships.licenseDeals.columns.renewal', 'Renewal')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t('partnerships.licenseDeals.columns.closedAt', 'Closed')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((deal) => (
                  <tr key={deal.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{deal.license_identifier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{deal.industry_tag}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{deal.year}</td>
                    <td className="px-4 py-3">{deal.type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        deal.status === 'won'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                      }`}>
                        {deal.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{deal.is_renewal ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {deal.closed_at ? new Date(deal.closed_at).toLocaleDateString() : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </Page>
  )
}
