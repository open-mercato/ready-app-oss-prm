"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type AgencyListItem = {
  organizationId: string
  name: string
}

type ImportResult = {
  imported: number
  archived: number
  assessmentId: string
}

function currentYearMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export default function WicImportPage() {
  const t = useT()
  const [agencies, setAgencies] = React.useState<AgencyListItem[]>([])
  const [loadingAgencies, setLoadingAgencies] = React.useState(true)
  const [selectedOrgId, setSelectedOrgId] = React.useState('')
  const [selectedMonth, setSelectedMonth] = React.useState(currentYearMonth)
  const [jsonInput, setJsonInput] = React.useState('')
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function loadAgencies() {
      const call = await apiCall<{ agencies: AgencyListItem[] }>('/api/partnerships/agencies')
      if (call.ok && call.result) {
        setAgencies(call.result.agencies)
        if (call.result.agencies.length > 0) {
          setSelectedOrgId(call.result.agencies[0].organizationId)
        }
      }
      setLoadingAgencies(false)
    }
    loadAgencies()
  }, [])

  async function handleImport() {
    setError(null)
    setResult(null)

    if (!selectedOrgId) {
      setError('Please select an agency.')
      return
    }

    let parsedRecords: unknown
    try {
      parsedRecords = JSON.parse(jsonInput)
    } catch {
      setError('Invalid JSON. Please check the input.')
      return
    }

    if (!Array.isArray(parsedRecords)) {
      setError('JSON must be an array of WIC scoring results.')
      return
    }

    setImporting(true)

    const body = {
      organizationId: selectedOrgId,
      month: selectedMonth,
      source: 'manual_import' as const,
      records: parsedRecords,
    }

    const call = await apiCall<ImportResult>('/api/partnerships/wic/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (call.ok && call.result) {
      setResult(call.result)
      setJsonInput('')
    } else {
      const payload = call.result as Record<string, unknown> | null
      const message =
        typeof payload?.error === 'string'
          ? payload.error
          : `Import failed with status ${call.status}`
      setError(message)
    }

    setImporting(false)
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
        <div className="mx-auto max-w-2xl space-y-6">
          <h2 className="text-lg font-semibold">{t('partnerships.wicImport.title')}</h2>

          <p className="text-xs text-muted-foreground">
            App Spec mentions CSV/markdown — JSON chosen because the external script outputs JSON directly.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="wic-org" className="block text-sm font-medium mb-1">
                {t('partnerships.wicImport.organization')}
              </label>
              <select
                id="wic-org"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                {agencies.map((agency) => (
                  <option key={agency.organizationId} value={agency.organizationId}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="wic-month" className="block text-sm font-medium mb-1">
                {t('partnerships.wicImport.month')}
              </label>
              <input
                id="wic-month"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="wic-json" className="block text-sm font-medium mb-1">
                {t('partnerships.wicImport.jsonInput')}
              </label>
              <textarea
                id="wic-json"
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={12}
                className="w-full rounded-md border px-3 py-2 font-mono text-sm"
                placeholder={`[\n  {\n    "contributorGithubUsername": "octocat",\n    "prId": "OM-1234",\n    "month": "${selectedMonth}",\n    "featureKey": "feat/my-feature",\n    "level": "L3",\n    "impactBonus": false,\n    "bountyApplied": false,\n    "wicScore": 0.5\n  }\n]`}
              />
            </div>

            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !jsonInput.trim()}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Importing...
                </>
              ) : (
                t('partnerships.wicImport.importButton')
              )}
            </button>
          </div>

          {result && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              Imported {result.imported} records (archived {result.archived} previous).
              Assessment ID: <code className="text-xs">{result.assessmentId}</code>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
