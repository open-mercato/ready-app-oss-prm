'use client'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganizationScopeVersion } from '@open-mercato/ui/backend/utils/scope'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import React from 'react'

type LicenseDealRow = {
  id: string
  customerId: string
  dealType: string
  status: string
  isRenewal: boolean
  partnerAgencyId: string | null
  attributedAt: string | null
  createdAt: string
}

export default function MinAttributionPage() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const queryClient = useQueryClient()
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['partnerships-license-deals', page, scopeVersion],
    queryFn: () => fetchCrudList<LicenseDealRow>('partnerships/min/license-deals', { page: String(page), pageSize: '50' }),
  })

  const columns = React.useMemo(() => [
    { accessorKey: 'customerId', header: t('partnerships.min.customerId', 'Customer') },
    { accessorKey: 'dealType', header: t('partnerships.min.dealType', 'Deal Type') },
    { accessorKey: 'status', header: t('partnerships.min.status', 'Status') },
    { accessorKey: 'isRenewal', header: t('partnerships.min.isRenewal', 'Renewal'), cell: ({ getValue }: any) => getValue() ? 'Yes' : 'No' },
    { accessorKey: 'partnerAgencyId', header: t('partnerships.min.attribution', 'Attributed Agency'), cell: ({ getValue }: any) => getValue() || '\u2014' },
    { accessorKey: 'attributedAt', header: t('partnerships.min.attributedAt', 'Attributed At'), cell: ({ getValue }: any) => getValue() || '\u2014' },
  ], [t])

  return (
    <Page>
      <PageHeader
        title={t('partnerships.min.title', 'MIN Attribution')}
        description={t('partnerships.min.description', 'Review and attribute license deals to partner agencies for MIN scoring.')}
      />
      <PageBody>
        <DataTable
          title={t('partnerships.min.title', 'License Deals')}
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
