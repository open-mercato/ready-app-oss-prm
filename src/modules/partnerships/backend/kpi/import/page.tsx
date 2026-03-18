'use client'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import React from 'react'

export default function ImportKpiPage() {
  const t = useT()

  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'partnerAgencyId', label: t('partnerships.kpi.agencyId', 'Agency ID'), type: 'text', required: true },
    { id: 'metricKey', label: t('partnerships.kpi.metricKey', 'Metric'), type: 'select', required: true, options: [
      { value: 'wic', label: 'WIC' },
      { value: 'min', label: 'MIN' },
    ] },
    { id: 'periodStart', label: t('partnerships.kpi.periodStart', 'Period Start'), type: 'date', required: true },
    { id: 'periodEnd', label: t('partnerships.kpi.periodEnd', 'Period End'), type: 'date', required: true },
    { id: 'value', label: t('partnerships.kpi.value', 'Value'), type: 'number', required: true },
    { id: 'source', label: t('partnerships.kpi.source', 'Source'), type: 'select', options: [
      { value: 'manual', label: 'Manual' },
      { value: 'ingest', label: 'Ingest' },
    ] },
  ], [t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    { id: 'metric', title: t('partnerships.kpi.metricDetails', 'Metric Details'), column: 1, fields: ['partnerAgencyId', 'metricKey', 'value', 'source'] },
    { id: 'period', title: t('partnerships.kpi.period', 'Period'), column: 2, fields: ['periodStart', 'periodEnd'] },
  ], [t])

  return (
    <Page>
      <PageHeader title={t('partnerships.kpi.import', 'Import KPIs')} />
      <PageBody>
        <CrudForm
          title={t('partnerships.kpi.import', 'Import KPI Snapshot')}
          backHref="/backend/partnerships/kpi"
          fields={fields}
          groups={groups}
          submitLabel={t('partnerships.kpi.importAction', 'Import')}
          cancelHref="/backend/partnerships/kpi"
          successRedirect={`/backend/partnerships/kpi?flash=${encodeURIComponent(t('partnerships.kpi.imported', 'KPI imported'))}&type=success`}
          onSubmit={async (vals) => { await createCrud('partnerships/kpi/snapshots/import', vals) }}
        />
      </PageBody>
    </Page>
  )
}
