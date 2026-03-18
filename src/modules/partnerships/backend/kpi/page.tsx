'use client'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useQuery } from '@tanstack/react-query'
import { useOrganizationScopeVersion } from '@open-mercato/ui/backend/utils/scope'
import { Button } from '@open-mercato/ui/primitives/button'
import Link from 'next/link'
import React from 'react'

type DashboardRow = {
  agencyId: string
  agencyOrganizationId: string
  status: string
  currentTier: string | null
  wic: number
  wip: number
  min: number
}

export default function KpiDashboardPage() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()

  const { data, isLoading } = useQuery({
    queryKey: ['partnerships-kpi-dashboard', scopeVersion],
    queryFn: () => fetchCrudList<DashboardRow>('partnerships/kpi/dashboard'),
  })

  const columns = React.useMemo(() => [
    { accessorKey: 'agencyOrganizationId', header: t('partnerships.agency.orgId', 'Agency') },
    { accessorKey: 'currentTier', header: t('partnerships.tier.current', 'Current Tier'), cell: ({ getValue }: any) => getValue() || '\u2014' },
    { accessorKey: 'wic', header: t('partnerships.kpi.wic', 'WIC') },
    { accessorKey: 'wip', header: t('partnerships.kpi.wip', 'WIP') },
    { accessorKey: 'min', header: t('partnerships.kpi.min', 'MIN') },
    { accessorKey: 'status', header: t('partnerships.agency.status', 'Status') },
  ], [t])

  return (
    <Page>
      <PageHeader
        title={t('partnerships.kpi.title', 'KPI Dashboard')}
        description={t('partnerships.kpi.description', 'Partner performance metrics overview')}
      />
      <PageBody>
        <DataTable
          title={t('partnerships.kpi.title', 'KPI Dashboard')}
          actions={
            <Button asChild>
              <Link href="/backend/partnerships/kpi/import">{t('partnerships.kpi.import', 'Import KPIs')}</Link>
            </Button>
          }
          columns={columns}
          data={data?.items || []}
          isLoading={isLoading}
        />
      </PageBody>
    </Page>
  )
}
