"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
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

type SelectedCompany = CompanySearchItem

export default function AttributeLicenseDealPage() {
  const t = useT()

  // Search state
  const [query, setQuery] = React.useState('')
  const [searching, setSearching] = React.useState(false)
  const [results, setResults] = React.useState<CompanySearchItem[] | null>(null)
  const [searchError, setSearchError] = React.useState<string | null>(null)

  // Selection + attribution form state
  const [selected, setSelected] = React.useState<SelectedCompany | null>(null)
  const [licenseIdentifier, setLicenseIdentifier] = React.useState('')
  const [industryTag, setIndustryTag] = React.useState('')
  const [closedAt, setClosedAt] = React.useState('')

  // Submission state
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = React.useState(false)

  // Debounced search
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQuery(value)
    setResults(null)
    setSearchError(null)
    setSelected(null)
    setSubmitSuccess(false)
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
    setSubmitSuccess(false)
    setSubmitError(null)
    setLicenseIdentifier('')
    setIndustryTag('')
    setClosedAt('')
  }

  function handleClearSelection() {
    setSelected(null)
    setSubmitSuccess(false)
    setSubmitError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return

    setSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(false)

    const call = await apiCall<{ id: string }>('/api/partnerships/partner-license-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: selected.organizationId,
        companyId: selected.companyId,
        licenseIdentifier,
        industryTag,
        closedAt,
        type: 'enterprise',
        status: 'won',
        isRenewal: false,
      }),
    })

    setSubmitting(false)

    if (call.ok) {
      setSubmitSuccess(true)
      setSelected(null)
      setQuery('')
      setLicenseIdentifier('')
      setIndustryTag('')
      setClosedAt('')
    } else {
      const payload = call.result as Record<string, unknown> | null
      setSubmitError(
        typeof payload?.error === 'string' ? payload.error : 'Failed to attribute license deal.',
      )
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-2xl space-y-6">
          <h2 className="text-lg font-semibold">{t('partnerships.companySearch.title')}</h2>

          {/* Search box */}
          {!selected && (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  placeholder={t('partnerships.companySearch.placeholder')}
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

              {/* Results list */}
              {results !== null && (
                results.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    {t('partnerships.companySearch.noResults')}
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

          {/* Attribution form */}
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
                  Change
                </button>
              </div>

              {/* License identifier */}
              <div>
                <label htmlFor="attr-license" className="block text-sm font-medium mb-1">
                  License Identifier
                </label>
                <input
                  id="attr-license"
                  type="text"
                  required
                  value={licenseIdentifier}
                  onChange={(e) => setLicenseIdentifier(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="e.g. LIC-ACME-2026-001"
                />
              </div>

              {/* Industry tag */}
              <div>
                <label htmlFor="attr-industry" className="block text-sm font-medium mb-1">
                  Industry Tag
                </label>
                <input
                  id="attr-industry"
                  type="text"
                  required
                  value={industryTag}
                  onChange={(e) => setIndustryTag(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="e.g. FinTech"
                />
              </div>

              {/* Closed at */}
              <div>
                <label htmlFor="attr-closed-at" className="block text-sm font-medium mb-1">
                  Closed Date
                </label>
                <input
                  id="attr-closed-at"
                  type="date"
                  required
                  value={closedAt}
                  onChange={(e) => setClosedAt(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
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
                    Attributing...
                  </>
                ) : (
                  t('partnerships.companySearch.confirmButton')
                )}
              </button>
            </form>
          )}

          {/* Success feedback */}
          {submitSuccess && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              {t('partnerships.companySearch.success')}
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
