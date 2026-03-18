"use client"
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader, PortalStatRow, PortalCardDivider } from '@open-mercato/ui/portal/components/PortalCard'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type KpiSummary = { wic: number; wip: number; min: number }
type Tier = { key: string; assignedAt: string | null; validUntil: string | null } | null
type Agency = { id: string; name: string; status: string }

type DashboardData = {
  agency: Agency
  tier: Tier
  kpiSummary: KpiSummary
  activeRfpCount: number
}

export default function PartnerDashboardPage({ params }: { params: { orgSlug: string } }) {
  const t = useT()
  const router = useRouter()
  const { auth, orgSlug } = usePortalContext()
  const [data, setData] = useState<DashboardData | null>(null)
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
      const { ok, result } = await apiCall<{ ok: boolean; data: DashboardData }>('/api/partnerships/portal/dashboard')
      if (cancelled) return
      if (ok && result?.data) {
        setData(result.data)
      } else {
        setError('Failed to load dashboard data')
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
      <PortalPageHeader
        title={t('partnerships.portal.dashboard', 'Partner Dashboard')}
        description={data.agency.name}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PortalCard>
          <PortalCardHeader title={t('partnerships.portal.tier', 'Current Tier')} />
          <p className="text-2xl font-bold">
            {data.tier ? data.tier.key.toUpperCase() : t('partnerships.portal.noTier', 'No tier assigned')}
          </p>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('partnerships.kpi.title', 'KPI Summary')} />
          <PortalStatRow label={t('partnerships.kpi.wic', 'WIC')} value={data.kpiSummary.wic} />
          <PortalCardDivider />
          <PortalStatRow label={t('partnerships.kpi.wip', 'WIP')} value={data.kpiSummary.wip} />
          <PortalCardDivider />
          <PortalStatRow label={t('partnerships.kpi.min', 'MIN')} value={data.kpiSummary.min} />
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('partnerships.portal.activeRfps', 'Active RFPs')} />
          <p className="text-2xl font-bold">{data.activeRfpCount}</p>
        </PortalCard>
      </div>
    </div>
  )
}
