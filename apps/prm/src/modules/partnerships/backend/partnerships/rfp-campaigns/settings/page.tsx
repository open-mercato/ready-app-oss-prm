"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type Templates = {
  campaignTemplate: string
  awardTemplate: string
  rejectionTemplate: string
}

export default function RfpSettingsPage() {
  const t = useT()

  const [campaignTemplate, setCampaignTemplate] = React.useState('')
  const [awardTemplate, setAwardTemplate] = React.useState('')
  const [rejectionTemplate, setRejectionTemplate] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    apiCall<Templates>('/api/partnerships/rfp-settings')
      .then((call) => {
        if (call.ok && call.result) {
          setCampaignTemplate(call.result.campaignTemplate ?? '')
          setAwardTemplate(call.result.awardTemplate ?? '')
          setRejectionTemplate(call.result.rejectionTemplate ?? '')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const call = await apiCall<Templates>('/api/partnerships/rfp-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignTemplate, awardTemplate, rejectionTemplate }),
    })

    setSaving(false)

    if (call.ok) {
      flash(t('partnerships.rfpSettings.saved', 'Templates saved successfully'))
    } else {
      flash(t('partnerships.rfpSettings.saveError', 'Failed to save templates'), 'error')
    }
  }

  if (loading) {
    return (
      <Page>
        <PageBody>
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-2xl">
          <form onSubmit={handleSave} className="space-y-6 rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              {t('partnerships.rfpSettings.placeholderHint', 'Available placeholders: [first-name], [last-name], [agency-name], [campaign-title]')}
            </p>

            <div>
              <label htmlFor="campaignTemplate" className="block text-sm font-medium mb-1">
                {t('partnerships.rfpSettings.campaignTemplate', 'Campaign Published Template')}
              </label>
              <textarea
                id="campaignTemplate"
                rows={6}
                value={campaignTemplate}
                onChange={(e) => setCampaignTemplate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t('partnerships.rfpSettings.campaignPlaceholder', 'Template sent to BD users when a campaign is published...')}
              />
            </div>

            <div>
              <label htmlFor="awardTemplate" className="block text-sm font-medium mb-1">
                {t('partnerships.rfpSettings.awardTemplate', 'Award Template')}
              </label>
              <textarea
                id="awardTemplate"
                rows={6}
                value={awardTemplate}
                onChange={(e) => setAwardTemplate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t('partnerships.rfpSettings.awardPlaceholder', 'Template sent to the winning agency...')}
              />
            </div>

            <div>
              <label htmlFor="rejectionTemplate" className="block text-sm font-medium mb-1">
                {t('partnerships.rfpSettings.rejectionTemplate', 'Rejection Template')}
              </label>
              <textarea
                id="rejectionTemplate"
                rows={6}
                value={rejectionTemplate}
                onChange={(e) => setRejectionTemplate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t('partnerships.rfpSettings.rejectionPlaceholder', 'Template sent to non-winning agencies...')}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {t('partnerships.rfpSettings.saving', 'Saving...')}
                </>
              ) : (
                t('partnerships.rfpSettings.saveButton', 'Save Templates')
              )}
            </button>
          </form>
        </div>
      </PageBody>
    </Page>
  )
}
