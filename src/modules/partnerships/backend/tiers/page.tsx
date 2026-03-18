'use client'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useQuery } from '@tanstack/react-query'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useRouter } from 'next/navigation'
import { Button } from '@open-mercato/ui/primitives/button'
import Link from 'next/link'
import React from 'react'

type TierRow = {
  id: string
  key: string
  label: string
  wicThreshold: number
  wipThreshold: number
  minThreshold: number
  isActive: boolean
}

export default function TierDefinitionsPage() {
  const t = useT()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()

  const { data, isLoading } = useQuery({
    queryKey: ['partnerships-tiers', scopeVersion],
    queryFn: () => fetchCrudList<TierRow>('partnerships/tiers'),
  })

  const columns = React.useMemo(() => [
    { accessorKey: 'key', header: t('partnerships.tier.key', 'Key') },
    { accessorKey: 'label', header: t('partnerships.tier.label', 'Label') },
    { accessorKey: 'wicThreshold', header: t('partnerships.kpi.wic', 'WIC') },
    { accessorKey: 'wipThreshold', header: t('partnerships.kpi.wip', 'WIP') },
    { accessorKey: 'minThreshold', header: t('partnerships.kpi.min', 'MIN') },
    {
      accessorKey: 'isActive',
      header: t('partnerships.tier.active', 'Active'),
      cell: ({ getValue }: any) => getValue() ? '\u2713' : '\u2014',
    },
  ], [t])

  return (
    <Page>
      <PageHeader title={t('partnerships.tier.title', 'Tier Definitions')} />
      <PageBody>
        <DataTable
          title={t('partnerships.tier.title', 'Tier Definitions')}
          actions={
            <Button asChild>
              <Link href="/backend/tiers/create">{t('partnerships.tier.create', 'Create Tier')}</Link>
            </Button>
          }
          columns={columns}
          data={data?.items || []}
          isLoading={isLoading}
          onRowClick={(row: TierRow) => router.push(`/backend/tiers/${row.id}/edit`)}
          rowActions={(row: TierRow) => (
            <RowActions items={[
              { label: t('edit', 'Edit'), href: `/backend/tiers/${row.id}/edit` },
            ]} />
          )}
        />
      </PageBody>
    </Page>
  )
}
