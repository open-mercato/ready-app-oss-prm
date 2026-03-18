'use client'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import React from 'react'

export default function CreateTierPage() {
  const t = useT()

  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'key', label: t('partnerships.tier.key', 'Key'), type: 'text', required: true, placeholder: 'e.g. platinum' },
    { id: 'label', label: t('partnerships.tier.label', 'Label'), type: 'text', required: true },
    { id: 'wicThreshold', label: t('partnerships.kpi.wic', 'WIC Threshold'), type: 'number', required: true },
    { id: 'wipThreshold', label: t('partnerships.kpi.wip', 'WIP Threshold'), type: 'number', required: true },
    { id: 'minThreshold', label: t('partnerships.kpi.min', 'MIN Threshold'), type: 'number', required: true },
    { id: 'isActive', label: t('partnerships.tier.active', 'Active'), type: 'checkbox' },
  ], [t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    { id: 'identity', title: t('partnerships.tier.identity', 'Identity'), column: 1, fields: ['key', 'label'] },
    { id: 'thresholds', title: t('partnerships.tier.thresholds', 'Thresholds'), column: 1, fields: ['wicThreshold', 'wipThreshold', 'minThreshold'] },
    { id: 'settings', title: t('partnerships.tier.settings', 'Settings'), column: 2, fields: ['isActive'] },
  ], [t])

  return (
    <Page>
      <PageBody>
        <CrudForm
          title={t('partnerships.tier.create', 'Create Tier')}
          backHref="/backend/partnerships/tiers"
          fields={fields}
          groups={groups}
          submitLabel={t('create', 'Create')}
          cancelHref="/backend/partnerships/tiers"
          successRedirect={`/backend/partnerships/tiers?flash=${encodeURIComponent(t('created', 'Created'))}&type=success`}
          onSubmit={async (vals) => { await createCrud('partnerships/tiers', vals) }}
        />
      </PageBody>
    </Page>
  )
}
