"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type AgencyOption = {
  organizationId: string
  name: string
}

export default function CreateLicenseDealPage() {
  const t = useT()
  const router = useRouter()

  const [agencies, setAgencies] = React.useState<AgencyOption[]>([])
  const [loadingAgencies, setLoadingAgencies] = React.useState(true)

  const [organizationId, setOrganizationId] = React.useState('')
  const [companyId, setCompanyId] = React.useState('')
  const [licenseIdentifier, setLicenseIdentifier] = React.useState('')
  const [industryTag, setIndustryTag] = React.useState('')
  const [closedAt, setClosedAt] = React.useState('')
  const [type, setType] = React.useState('enterprise')
  const [status, setStatus] = React.useState('won')
  const [isRenewal, setIsRenewal] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function loadAgencies() {
      const call = await apiCall<{ agencies: AgencyOption[] }>('/api/partnerships/agencies')
      if (call.ok && call.result?.agencies) {
        setAgencies(call.result.agencies)
      }
      setLoadingAgencies(false)
    }
    loadAgencies()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const call = await apiCall<{ id: string }>('/api/partnerships/partner-license-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId,
        companyId,
        licenseIdentifier,
        industryTag,
        closedAt,
        type,
        status,
        isRenewal,
      }),
    })

    setSubmitting(false)

    if (!call.ok) {
      const payload = call.result as Record<string, unknown> | null
      setError(typeof payload?.error === 'string' ? payload.error : 'Failed to create license deal')
      return
    }

    flash(t('partnerships.licenseDeals.created', 'License deal created successfully'))
    router.push('/backend/partnerships/license-deals')
  }

  if (loadingAgencies) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-64 items-center justify-center">
            <Spinner className="h-8 w-8 text-muted-foreground" />
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
              <label htmlFor="organizationId" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.agency', 'Agency (Organization)')}
              </label>
              <select
                id="organizationId"
                required
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">{t('partnerships.licenseDeals.fields.selectAgency', 'Select an agency...')}</option>
                {agencies.map((a) => (
                  <option key={a.organizationId} value={a.organizationId}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="companyId" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.companyId', 'Company ID')}
              </label>
              <input
                id="companyId"
                type="text"
                required
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="UUID of the customer company"
              />
            </div>

            <div>
              <label htmlFor="licenseIdentifier" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.licenseId', 'License Identifier')}
              </label>
              <input
                id="licenseIdentifier"
                type="text"
                required
                value={licenseIdentifier}
                onChange={(e) => setLicenseIdentifier(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. LIC-ACME-2026-001"
              />
            </div>

            <div>
              <label htmlFor="industryTag" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.industry', 'Industry Tag')}
              </label>
              <input
                id="industryTag"
                type="text"
                required
                value={industryTag}
                onChange={(e) => setIndustryTag(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. FinTech"
              />
            </div>

            <div>
              <label htmlFor="closedAt" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.closedAt', 'Closed Date')}
              </label>
              <input
                id="closedAt"
                type="date"
                required
                value={closedAt}
                onChange={(e) => setClosedAt(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium mb-1">
                  {t('partnerships.licenseDeals.fields.type', 'Type')}
                </label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="enterprise">Enterprise</option>
                  <option value="smb">SMB</option>
                  <option value="startup">Startup</option>
                </select>
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium mb-1">
                  {t('partnerships.licenseDeals.fields.status', 'Status')}
                </label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="won">Won</option>
                  <option value="pending">Pending</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="isRenewal"
                type="checkbox"
                checked={isRenewal}
                onChange={(e) => setIsRenewal(e.target.checked)}
                className="rounded border"
              />
              <label htmlFor="isRenewal" className="text-sm">
                {t('partnerships.licenseDeals.fields.isRenewal', 'This is a renewal')}
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
              {submitting
                ? t('partnerships.licenseDeals.submitting', 'Creating...')
                : t('partnerships.licenseDeals.submitButton', 'Create License Deal')}
            </button>
          </form>
        </div>
      </PageBody>
    </Page>
  )
}
