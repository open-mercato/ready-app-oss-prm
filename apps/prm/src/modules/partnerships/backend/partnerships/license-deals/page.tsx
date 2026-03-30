"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type LicenseDealRow = {
  id: string
  organizationId: string
  companyId: string
  licenseIdentifier: string
  industryTag: string
  type: string
  status: string
  isRenewal: boolean
  year: number
  startDate: string | null
  endDate: string | null
  createdAt: string | null
}

type LicenseDealsResponse = {
  items: LicenseDealRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export default function LicenseDealsPage() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const [items, setItems] = React.useState<LicenseDealRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [canManage, setCanManage] = React.useState(false)

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      const call = await apiCall<LicenseDealsResponse>('/api/partnerships/partner-license-deals')
      if (call.ok && call.result?.items) {
        setItems(call.result.items)
      } else {
        setItems([])
      }
      setLoading(false)
    }
    load()
  }, [scopeVersion])

  // Probe POST permission — 403 = no manage, anything else = has manage
  React.useEffect(() => {
    fetch('/api/partnerships/partner-license-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).then((res) => {
      // 403 = forbidden (no feature), 422 = validation error (has feature but bad input)
      setCanManage(res.status !== 403)
    }).catch(() => {})
  }, [scopeVersion])

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
          {canManage && (
            <a
              href="/backend/partnerships/license-deals/create"
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('partnerships.licenseDeals.addButton', 'Add License Deal')}
            </a>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">
              {t('partnerships.licenseDeals.noData', 'No license deals yet.')}
            </p>
            {canManage && (
              <a
                href="/backend/partnerships/license-deals/create"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t('partnerships.licenseDeals.addButton', 'Add License Deal')}
              </a>
            )}
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
                    {t('partnerships.licenseDeals.columns.startDate', 'Start')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t('partnerships.licenseDeals.columns.endDate', 'End')}
                  </th>
                  {canManage && (
                    <th className="px-4 py-3 text-right font-medium w-20" />
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((deal) => (
                  <tr key={deal.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{deal.licenseIdentifier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{deal.industryTag}</td>
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
                    <td className="px-4 py-3 text-center">{deal.isRenewal ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {deal.startDate ? new Date(deal.startDate).toLocaleDateString() : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {deal.endDate ? new Date(deal.endDate).toLocaleDateString() : t('partnerships.licenseDeals.perpetual', 'Perpetual')}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/backend/partnerships/license-deals/${deal.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {t('partnerships.licenseDeals.editLink', 'Edit')}
                        </a>
                      </td>
                    )}
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
