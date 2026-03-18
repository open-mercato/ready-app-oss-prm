'use client'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useQuery } from '@tanstack/react-query'
import { useOrganizationScopeVersion } from '@open-mercato/ui/backend/utils/scope'
import React from 'react'

type AgencyRow = {
  id: string
  agencyOrganizationId: string
  status: string
  onboardedAt: string | null
  createdAt: string
}

export default function AgenciesPage() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['partnerships-agencies', page, scopeVersion],
    queryFn: () => fetchCrudList<AgencyRow>('partnerships/agencies', { page: String(page), pageSize: '50' }),
  })

  const columns = React.useMemo(() => [
    { accessorKey: 'agencyOrganizationId', header: t('partnerships.agency.orgId', 'Organization ID') },
    { accessorKey: 'status', header: t('partnerships.agency.status', 'Status') },
    { accessorKey: 'onboardedAt', header: t('partnerships.agency.onboardedAt', 'Onboarded At') },
    { accessorKey: 'createdAt', header: t('partnerships.agency.createdAt', 'Created') },
  ], [t])

  return (
    <Page>
      <PageHeader title={t('partnerships.agency.title', 'Agencies')} />
      <PageBody>
        <DataTable
          title={t('partnerships.agency.title', 'Agencies')}
          columns={columns}
          data={data?.items || []}
          isLoading={isLoading}
          pagination={{
            page,
            pageSize: 50,
            total: data?.total || 0,
            totalPages: data?.totalPages || 0,
            onPageChange: setPage,
          }}
        />
      </PageBody>
    </Page>
  )
}
