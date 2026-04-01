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

type ContributorInfo = {
  name: string
  githubUsername: string
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
  const [fileName, setFileName] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [contributors, setContributors] = React.useState<ContributorInfo[]>([])
  const [loadingContributors, setLoadingContributors] = React.useState(false)

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

  // Load contributors when agency changes — auth/users API returns cf_github_username inline
  React.useEffect(() => {
    if (!selectedOrgId) { setContributors([]); return }
    let cancelled = false
    async function loadContributors() {
      setLoadingContributors(true)
      const call = await apiCall<{ items: Array<{ name?: string; email: string; cf_github_username?: string }> }>(
        `/api/auth/users?organizationId=${selectedOrgId}&pageSize=100`,
      )
      if (cancelled) return
      if (!call.ok || !call.result) { setContributors([]); setLoadingContributors(false); return }

      const withGh = (call.result.items ?? [])
        .filter((u) => u.cf_github_username)
        .map((u) => ({ name: u.name || u.email, githubUsername: u.cf_github_username! }))
      setContributors(withGh)
      setLoadingContributors(false)
    }
    loadContributors()
    return () => { cancelled = true }
  }, [selectedOrgId])

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
      setFileName(null)
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
              <label className="block text-sm font-medium mb-1">
                {t('partnerships.wicImport.jsonInput')}
              </label>
              <div
                className="w-full rounded-md border-2 border-dashed px-6 py-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const file = e.dataTransfer.files[0]
                  if (file) {
                    setFileName(file.name)
                    file.text().then((text) => setJsonInput(text))
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  id="wic-json-file"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setFileName(file.name)
                      file.text().then((text) => setJsonInput(text))
                    }
                  }}
                />
                {fileName ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{t('partnerships.wicImport.changeFile', 'Click or drop to change file')}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{t('partnerships.wicImport.dropFile', 'Drop a .json file here or click to browse')}</p>
                  </div>
                )}
              </div>
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

          {/* Agentic IDE helper — suggested command */}
          {contributors.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50/50 p-4 text-sm dark:border-blue-800 dark:bg-blue-950/30">
              <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                {t('partnerships.wicImport.agenticHelper', 'Agentic IDE Helper')}
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-200 mb-3">
                {t('partnerships.wicImport.agenticHelperDesc', 'Paste this prompt in your AI coding assistant (Claude Code, Cursor) to generate the WIC JSON:')}
              </p>
              <pre className="whitespace-pre-wrap rounded-md bg-blue-100 dark:bg-blue-900/50 p-3 text-xs font-mono text-blue-900 dark:text-blue-100 select-all cursor-pointer">
{`Użyj WIC Assessment Guide i oblicz WIC score dla poniższych kont GitHub za okres ${selectedMonth} na repozytorium open-mercato/open-mercato.

Konta (${agencies.find(a => a.organizationId === selectedOrgId)?.name ?? 'selected agency'}):
${contributors.map(c => `  - ${c.githubUsername} (${c.name})`).join('\n')}

Wygeneruj rezultat w postaci JSON array:
[
  {
    "contributorGithubUsername": "<gh-username>",
    "month": "${selectedMonth}",
    "wicScore": <suma base+impact+bounty>,
    "level": "L1|L2|L3|L4|routine",
    "impactBonus": <0|0.25|0.5>,
    "bountyBonus": <wartość liczbowa bonusu>,
    "whyBonus": "<tytuł bounty lub pusty string>",
    "included": "<co zaliczono i dlaczego>",
    "excluded": "<co odrzucono i dlaczego>",
    "scriptVersion": "1.0-agent"
  }
]

Output ONLY the JSON array, no explanation.`}
              </pre>
              <button
                type="button"
                onClick={() => {
                  const text = document.querySelector<HTMLPreElement>('.select-all')?.textContent ?? ''
                  navigator.clipboard.writeText(text)
                }}
                className="mt-2 text-xs text-blue-700 dark:text-blue-300 underline hover:no-underline"
              >
                {t('partnerships.wicImport.copyPrompt', 'Copy to clipboard')}
              </button>
            </div>
          )}
          {loadingContributors && (
            <p className="text-xs text-muted-foreground">{t('partnerships.wicImport.loadingContributors', 'Loading contributors...')}</p>
          )}
          {!loadingContributors && selectedOrgId && contributors.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('partnerships.wicImport.noContributors', 'No contributors with GitHub usernames found for this agency.')}</p>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
