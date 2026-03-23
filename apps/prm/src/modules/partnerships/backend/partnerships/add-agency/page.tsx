"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

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
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<CreateAgencyResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const call = await apiCall<CreateAgencyResponse>('/api/partnerships/agencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agencyName, adminEmail, seedDemoData }),
    })

    setSubmitting(false)

    if (!call.ok) {
      const payload = call.result as Record<string, unknown> | null
      setError(typeof payload?.error === 'string' ? payload.error : 'Failed to create agency')
      return
    }

    setResult(call.result)
    flash(`Agency "${agencyName}" created successfully`)
  }

  const handleCopy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.inviteMessage)
    flash('Invite message copied to clipboard')
  }

  if (result) {
    return (
      <Page>
        <PageBody>
          <div className="mx-auto max-w-lg space-y-6">
            <div className="rounded-lg border bg-card p-6">
              <h2 className="text-lg font-semibold mb-4">Agency Created</h2>
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm font-mono">
                {result.inviteMessage}
              </pre>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Copy Invite Message
                </button>
                <button
                  onClick={() => router.push('/backend/partnerships/agencies')}
                  className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Go to Agency List
                </button>
              </div>
            </div>
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border bg-card p-6">
            <div>
              <label htmlFor="agencyName" className="block text-sm font-medium mb-1">
                Agency Name
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
                Admin Email
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
                Create demo data (sample prospects, deals, case studies)
              </label>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Agency'}
            </button>
          </form>
        </div>
      </PageBody>
    </Page>
  )
}
