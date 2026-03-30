"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type CompanySearchItem = {
  companyId: string
  companyName: string
  organizationId: string
  agencyName: string
  createdAt: string
  dealCount: number
}

export default function CreateLicenseDealPage() {
  const t = useT()
  const router = useRouter()

  // Search state
  const [query, setQuery] = React.useState('')
  const [searching, setSearching] = React.useState(false)
  const [results, setResults] = React.useState<CompanySearchItem[] | null>(null)
  const [searchError, setSearchError] = React.useState<string | null>(null)

  // Selection + form state
  const [selected, setSelected] = React.useState<CompanySearchItem | null>(null)
  const [licenseIdentifier, setLicenseIdentifier] = React.useState('')
  const [industryTag, setIndustryTag] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [closedAt, setClosedAt] = React.useState('')
  const [type, setType] = React.useState('enterprise')
  const [status, setStatus] = React.useState('won')
  const [isRenewal, setIsRenewal] = React.useState(false)

  // Submission state
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  // Debounced search
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQuery(value)
    setResults(null)
    setSearchError(null)
    setSelected(null)
    setSubmitError(null)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (value.trim().length < 2) {
      return
    }

    searchTimeoutRef.current = setTimeout(() => {
      runSearch(value.trim())
    }, 400)
  }

  async function runSearch(q: string) {
    setSearching(true)
    setSearchError(null)
    const call = await apiCall<{ results: CompanySearchItem[] }>(
      `/api/partnerships/company-search?q=${encodeURIComponent(q)}`,
    )
    setSearching(false)
    if (call.ok && call.result) {
      setResults(call.result.results)
    } else {
      const payload = call.result as Record<string, unknown> | null
      setSearchError(
        typeof payload?.error === 'string' ? payload.error : 'Search failed.',
      )
    }
  }

  function handleSelect(company: CompanySearchItem) {
    setSelected(company)
    setResults(null)
    setSubmitError(null)
    setLicenseIdentifier('')
    setIndustryTag('')
    setStartDate('')
    setEndDate('')
    setClosedAt('')
    setType('enterprise')
    setStatus('won')
    setIsRenewal(false)
  }

  function handleClearSelection() {
    setSelected(null)
    setSubmitError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return

    setSubmitting(true)
    setSubmitError(null)

    const call = await apiCall<{ id: string }>('/api/partnerships/partner-license-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: selected.organizationId,
        companyId: selected.companyId,
        licenseIdentifier,
        industryTag,
        startDate,
        endDate: endDate || null,
        closedAt,
        type,
        status,
        isRenewal,
      }),
    })

    setSubmitting(false)

    if (call.ok) {
      flash(t('partnerships.licenseDeals.created', 'License deal created successfully'))
      router.push('/backend/partnerships/license-deals')
    } else {
      const payload = call.result as Record<string, unknown> | null
      setSubmitError(
        typeof payload?.error === 'string' ? payload.error : 'Failed to create license deal.',
      )
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Step 1: Company Search */}
          {!selected && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">
                {t('partnerships.companySearch.title', 'Search Company')}
              </h2>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  placeholder={t('partnerships.companySearch.placeholder', 'Search by company name (min 2 chars)...')}
                  className="w-full rounded-md border px-3 py-2 text-sm pr-10"
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Spinner className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>

              {searchError && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {searchError}
                </div>
              )}

              {results !== null && (
                results.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    {t('partnerships.companySearch.noResults', 'No companies found.')}
                  </p>
                ) : (
                  <div className="rounded-lg border divide-y">
                    {results.map((company) => (
                      <button
                        key={company.companyId}
                        type="button"
                        onClick={() => handleSelect(company)}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{company.companyName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{company.agencyName}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs text-muted-foreground">
                              {company.dealCount} deal{company.dealCount !== 1 ? 's' : ''}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(company.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* Step 2: Attribution Form */}
          {selected && (
            <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border bg-card p-6">
              {/* Selected company summary */}
              <div className="rounded-md bg-muted/40 px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{selected.companyName}</p>
                  <p className="text-xs text-muted-foreground">{selected.agencyName}</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  {t('partnerships.companySearch.change', 'Change')}
                </button>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium mb-1">
                    {t('partnerships.licenseDeals.fields.startDate', 'Start Date')}
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium mb-1">
                    {t('partnerships.licenseDeals.fields.endDate', 'End Date')}
                    <span className="text-muted-foreground font-normal ml-1">
                      {t('partnerships.licenseDeals.fields.endDateHint', '(blank = perpetual)')}
                    </span>
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
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

              {submitError && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    {t('partnerships.licenseDeals.submitting', 'Creating...')}
                  </>
                ) : (
                  t('partnerships.licenseDeals.submitButton', 'Create License Deal')
                )}
              </button>
            </form>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
