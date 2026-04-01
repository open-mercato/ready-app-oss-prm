"use client"

import * as React from 'react'
import Link from 'next/link'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type LicenseDealRow = {
  id: string
  organizationId: string
  organizationName: string | null
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

type FeatureCheckResponse = {
  ok?: boolean
  granted?: string[]
}

export default function LicenseDealsPage() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const [items, setItems] = React.useState<LicenseDealRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [canManage, setCanManage] = React.useState(false)
  const [deleting, setDeleting] = React.useState<string | null>(null)

  async function handleDelete(dealId: string) {
    if (!confirm(t('partnerships.licenseDeals.confirmDelete', 'Are you sure you want to delete this license deal?'))) return
    setDeleting(dealId)
    const call = await apiCall<{ ok: boolean }>('/api/partnerships/partner-license-deals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: dealId }),
    })
    if (call.ok) {
      setItems((prev) => prev.filter((d) => d.id !== dealId))
      flash(t('partnerships.licenseDeals.deleted', 'License deal deleted'))
    }
    setDeleting(null)
  }

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

  React.useEffect(() => {
    let cancelled = false
    async function loadManageAccess() {
      try {
        const call = await apiCall<FeatureCheckResponse>('/api/auth/feature-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features: ['partnerships.license-deals.manage'] }),
        })
        if (cancelled) return
        const granted = Array.isArray(call.result?.granted) ? call.result.granted : []
        setCanManage(call.result?.ok === true || granted.includes('partnerships.license-deals.manage'))
      } catch {
        if (!cancelled) setCanManage(false)
      }
    }
    loadManageAccess()
    return () => {
      cancelled = true
    }
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
            <Button asChild>
              <Link href="/backend/partnerships/license-deals/create">
                {t('partnerships.licenseDeals.addButton', 'Add License Deal')}
              </Link>
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">
              {t('partnerships.licenseDeals.noData', 'No license deals yet.')}
            </p>
            {canManage && (
              <Button asChild>
                <Link href="/backend/partnerships/license-deals/create">
                  {t('partnerships.licenseDeals.addButton', 'Add License Deal')}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">
                    {t('partnerships.licenseDeals.columns.organization', 'Organization')}
                  </th>
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
                    <td className="px-4 py-3 text-muted-foreground">{deal.organizationName ?? deal.organizationId}</td>
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
                        <div className="flex items-center justify-end gap-2">
                          <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                            <Link href={`/backend/partnerships/license-deals/${deal.id}`}>
                              {t('partnerships.licenseDeals.editLink', 'Edit')}
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            disabled={deleting === deal.id}
                            onClick={() => handleDelete(deal.id)}
                            className="h-auto px-0 text-xs text-destructive disabled:opacity-50"
                          >
                            {deleting === deal.id ? '...' : t('partnerships.licenseDeals.deleteLink', 'Delete')}
                          </Button>
                        </div>
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
