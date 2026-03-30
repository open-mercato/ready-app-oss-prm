"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody, PageHeader } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { TIER_THRESHOLDS } from '../../../../data/tier-thresholds'

type CreateAgencyResponse = {
  organizationId: string
  adminUserId: string
  agencyName: string
  adminEmail: string
  inviteMessage: string
  demoDataSeeded: boolean
}

export default function AddAgencyPage() {
  const t = useT()
  const router = useRouter()
  const [agencyName, setAgencyName] = React.useState('')
  const [adminEmail, setAdminEmail] = React.useState('')
  const [seedDemoData, setSeedDemoData] = React.useState(true)
  const [initialTier, setInitialTier] = React.useState('OM Agency')
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<CreateAgencyResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const call = await apiCall<CreateAgencyResponse>('/api/partnerships/agencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyName, adminEmail, seedDemoData, initialTier }),
      })

      if (!call.ok) {
        const payload = call.result as Record<string, unknown> | null
        setError(typeof payload?.error === 'string' ? payload.error : 'Failed to create agency')
        return
      }

      setResult(call.result)
      flash(t('partnerships.addAgency.created', 'Agency Created'), 'success')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.inviteMessage)
    flash(t('partnerships.addAgency.copyInvite', 'Copy Invite Message'), 'success')
  }

  if (result) {
    return (
      <Page>
        <PageHeader title={t('partnerships.addAgency.title', 'Add Agency')} />
        <PageBody>
          <div className="mx-auto max-w-lg space-y-6">
            <div className="rounded-lg border bg-card p-6">
              <h2 className="text-lg font-semibold mb-4">{t('partnerships.addAgency.created', 'Agency Created')}</h2>
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm font-mono">
                {result.inviteMessage}
              </pre>
              <div className="mt-4 flex gap-3">
                <Button onClick={handleCopy}>
                  {t('partnerships.addAgency.copyInvite', 'Copy Invite Message')}
                </Button>
                <Button variant="outline" onClick={() => router.push('/backend/partnerships/agencies')}>
                  {t('partnerships.addAgency.goToList', 'Go to Agency List')}
                </Button>
              </div>
            </div>
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader title={t('partnerships.addAgency.title', 'Add Agency')} />
      <PageBody>
        <div className="mx-auto max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border bg-card p-6">
            <div>
              <label htmlFor="agencyName" className="block text-sm font-medium mb-1">
                {t('partnerships.addAgency.agencyName', 'Agency Name')}
              </label>
              <input
                id="agencyName"
                type="text"
                required
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. Acme Digital"
              />
            </div>

            <div>
              <label htmlFor="adminEmail" className="block text-sm font-medium mb-1">
                {t('partnerships.addAgency.adminEmail', 'Admin Email')}
              </label>
              <input
                id="adminEmail"
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="admin@agency.com"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="seedDemoData"
                type="checkbox"
                checked={seedDemoData}
                onChange={(e) => setSeedDemoData(e.target.checked)}
                className="rounded border"
              />
              <label htmlFor="seedDemoData" className="text-sm">
                {t('partnerships.addAgency.seedDemoData', 'Seed Demo Data')}
              </label>
            </div>

            <div>
              <label htmlFor="initialTier" className="block text-sm font-medium mb-1">
                {t('partnerships.addAgency.initialTier')}
              </label>
              <select
                id="initialTier"
                value={initialTier}
                onChange={(e) => setInitialTier(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                {TIER_THRESHOLDS.map((threshold) => (
                  <option key={threshold.tier} value={threshold.tier}>{threshold.tier}</option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? t('partnerships.addAgency.creating', 'Creating...') : t('partnerships.addAgency.submit', 'Create Agency')}
            </Button>
          </form>
        </div>
      </PageBody>
    </Page>
  )
}
