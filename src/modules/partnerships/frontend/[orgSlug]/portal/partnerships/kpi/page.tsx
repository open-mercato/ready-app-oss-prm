"use client"
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader, PortalStatRow, PortalCardDivider } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type Metric = { metricKey: string; value: number; periodStart: string; periodEnd: string; source: string }
type WicContribution = { ghProfile: string; monthKey: string; featureKey: string; baseScore: number; wicFinal: number; wicLevel: string }
type LicenseDeal = { id: string; dealType: string; status: string; isRenewal: boolean; attributedAt: string | null }

type KpiData = {
  metrics: Metric[]
  wicContributions: WicContribution[]
  licenseDeals: LicenseDeal[]
  page: number
  pageSize: number
}

export default function KpiDetailPage({ params }: { params: { orgSlug: string } }) {
  const t = useT()
  const router = useRouter()
  const { auth, orgSlug } = usePortalContext()
  const [data, setData] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.replace(`/${orgSlug}/portal/login`)
      return
    }
    if (auth.loading) return

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { ok, result } = await apiCall<{ ok: boolean; data: KpiData }>('/api/partnerships/portal/kpi')
      if (cancelled) return
      if (ok && result?.data) {
        setData(result.data)
      } else {
        setError('Failed to load KPI data')
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [auth.loading, auth.user, orgSlug, router])

  if (auth.loading || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive py-8 text-center">{error}</p>
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <PortalPageHeader title={t('partnerships.portal.kpiDetail', 'KPI Details')} />

      <PortalCard>
        <PortalCardHeader title={t('partnerships.kpi.wic', 'WIC Contributions')} />
        {data.wicContributions.length === 0 ? (
          <PortalEmptyState title="No WIC contributions yet" />
        ) : (
          <div className="divide-y">
            {data.wicContributions.map((c, i) => (
              <div key={i} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{c.ghProfile}</p>
                  <p className="text-xs text-muted-foreground">{c.featureKey} — {c.monthKey}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{c.wicFinal}</p>
                  <p className="text-xs text-muted-foreground">{c.wicLevel}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title={t('partnerships.kpi.min', 'MIN License Deals')} />
        {data.licenseDeals.length === 0 ? (
          <PortalEmptyState title="No license deals attributed yet" />
        ) : (
          <div className="divide-y">
            {data.licenseDeals.map((d) => (
              <div key={d.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{d.dealType}</p>
                  <p className="text-xs text-muted-foreground">{d.isRenewal ? 'Renewal' : 'New'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{d.status}</p>
                  {d.attributedAt && (
                    <p className="text-xs text-muted-foreground">{new Date(d.attributedAt).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title={t('partnerships.kpi.title', 'KPI Snapshots')} />
        {data.metrics.length === 0 ? (
          <PortalEmptyState title="No metric snapshots yet" />
        ) : (
          <div>
            {data.metrics.map((m, i) => (
              <React.Fragment key={i}>
                {i > 0 && <PortalCardDivider />}
                <PortalStatRow label={`${m.metricKey.toUpperCase()} (${m.periodEnd.slice(0, 7)})`} value={m.value} />
              </React.Fragment>
            ))}
          </div>
        )}
      </PortalCard>
    </div>
  )
}
