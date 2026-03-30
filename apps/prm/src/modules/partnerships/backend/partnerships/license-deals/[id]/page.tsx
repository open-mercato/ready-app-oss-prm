"use client"

import * as React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type LicenseDeal = {
  id: string
  organizationId: string
  companyId: string
  licenseIdentifier: string
  industryTag: string
  type: string
  status: string
  isRenewal: boolean
  startDate: string | null
  endDate: string | null
  year: number
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

export default function EditLicenseDealPage() {
  const t = useT()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = React.useState(true)
  const [notFound, setNotFound] = React.useState(false)

  const [licenseIdentifier, setLicenseIdentifier] = React.useState('')
  const [industryTag, setIndustryTag] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [type, setType] = React.useState('enterprise')
  const [status, setStatus] = React.useState('won')
  const [isRenewal, setIsRenewal] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!id) return
    async function load() {
      const call = await apiCall<LicenseDeal>(`/api/partnerships/partner-license-deals/${id}`)
      if (call.ok && call.result) {
        const d = call.result
        setLicenseIdentifier(d.licenseIdentifier ?? '')
        setIndustryTag(d.industryTag ?? '')
        setStartDate(toDateInput(d.startDate))
        setEndDate(toDateInput(d.endDate))
        setType(d.type ?? 'enterprise')
        setStatus(d.status ?? 'won')
        setIsRenewal(d.isRenewal ?? false)
      } else {
        setNotFound(true)
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const call = await apiCall<{ ok: boolean }>('/api/partnerships/partner-license-deals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        licenseIdentifier,
        industryTag,
        startDate,
        endDate: endDate || null,
        type,
        status,
        isRenewal,
      }),
    })
    setSubmitting(false)

    if (call.ok) {
      flash(t('partnerships.licenseDeals.updated', 'License deal updated successfully'))
      router.push('/backend/partnerships/license-deals')
    } else {
      const payload = call.result as Record<string, unknown> | null
      setSubmitError(typeof payload?.error === 'string' ? payload.error : 'Failed to update license deal.')
    }
  }

  if (loading) {
    return <Page><PageBody><div className="flex h-64 items-center justify-center"><Spinner className="h-8 w-8 text-muted-foreground" /></div></PageBody></Page>
  }

  if (notFound) {
    return <Page><PageBody><div className="flex h-64 items-center justify-center"><p className="text-muted-foreground">License deal not found.</p></div></PageBody></Page>
  }

  return (
    <Page>
      <PageBody>
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5 rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold">{t('partnerships.licenseDeals.editTitle', 'Edit License Deal')}</h2>

          <div>
            <label htmlFor="licenseIdentifier" className="block text-sm font-medium mb-1">
              {t('partnerships.licenseDeals.fields.licenseId', 'License Identifier')}
            </label>
            <input id="licenseIdentifier" type="text" required value={licenseIdentifier}
              onChange={(e) => setLicenseIdentifier(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div>
            <label htmlFor="industryTag" className="block text-sm font-medium mb-1">
              {t('partnerships.licenseDeals.fields.industry', 'Industry Tag')}
            </label>
            <input id="industryTag" type="text" required value={industryTag}
              onChange={(e) => setIndustryTag(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.startDate', 'Start Date')}
              </label>
              <input id="startDate" type="date" required value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.endDate', 'End Date')}
                <span className="text-muted-foreground font-normal ml-1">{t('partnerships.licenseDeals.fields.endDateHint', '(blank = perpetual)')}</span>
              </label>
              <input id="endDate" type="date" value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.type', 'Type')}
              </label>
              <select id="type" value={type} onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="enterprise">Enterprise</option>
                <option value="smb">SMB</option>
                <option value="startup">Startup</option>
              </select>
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.status', 'Status')}
              </label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="won">Won</option>
                <option value="pending">Pending</option>
                <option value="lost">Lost</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="isRenewal" type="checkbox" checked={isRenewal}
              onChange={(e) => setIsRenewal(e.target.checked)} className="rounded border" />
            <label htmlFor="isRenewal" className="text-sm">
              {t('partnerships.licenseDeals.fields.isRenewal', 'This is a renewal')}
            </label>
          </div>

          {submitError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{submitError}</div>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="flex-1 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {submitting ? <><Spinner className="mr-2 h-4 w-4" />{t('partnerships.licenseDeals.saving', 'Saving...')}</> : t('partnerships.licenseDeals.saveButton', 'Save Changes')}
            </button>
            <button type="button" onClick={() => router.push('/backend/partnerships/license-deals')}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted/50">
              {t('partnerships.licenseDeals.cancel', 'Cancel')}
            </button>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}
