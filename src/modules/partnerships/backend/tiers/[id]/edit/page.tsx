'use client'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { fetchCrudDetail, patchCrud } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import React from 'react'

export default function EditTierPage({ params }: { params?: { id?: string } }) {
  const t = useT()
  const id = params?.id
  const [initial, setInitial] = React.useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = React.useState(true)

  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'label', label: t('partnerships.tier.label', 'Label'), type: 'text', required: true },
    { id: 'wicThreshold', label: t('partnerships.kpi.wic', 'WIC Threshold'), type: 'number' },
    { id: 'wipThreshold', label: t('partnerships.kpi.wip', 'WIP Threshold'), type: 'number' },
    { id: 'minThreshold', label: t('partnerships.kpi.min', 'MIN Threshold'), type: 'number' },
    { id: 'isActive', label: t('partnerships.tier.active', 'Active'), type: 'checkbox' },
  ], [t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    { id: 'details', title: t('partnerships.tier.details', 'Details'), column: 1, fields: ['label'] },
    { id: 'thresholds', title: t('partnerships.tier.thresholds', 'Thresholds'), column: 1, fields: ['wicThreshold', 'wipThreshold', 'minThreshold'] },
    { id: 'settings', title: t('partnerships.tier.settings', 'Settings'), column: 2, fields: ['isActive'] },
  ], [t])

  React.useEffect(() => {
    async function load() {
      if (!id) return
      try {
        const item = await fetchCrudDetail(`partnerships/tiers/${id}`)
        if (item) setInitial({ id: item.id, label: item.label, wicThreshold: item.wicThreshold, wipThreshold: item.wipThreshold, minThreshold: item.minThreshold, isActive: item.isActive })
      } finally { setLoading(false) }
    }
    load()
  }, [id])

  return (
    <Page>
      <PageBody>
        <CrudForm
          title={t('partnerships.tier.edit', 'Edit Tier')}
          backHref="/backend/partnerships/tiers"
          fields={fields}
          groups={groups}
          initialValues={initial ?? {}}
          isLoading={loading}
          submitLabel={t('save', 'Save')}
          cancelHref="/backend/partnerships/tiers"
          successRedirect={`/backend/partnerships/tiers?flash=${encodeURIComponent(t('saved', 'Saved'))}&type=success`}
          onSubmit={async (vals) => { await patchCrud(`partnerships/tiers/${id}`, vals) }}
        />
      </PageBody>
    </Page>
  )
}
