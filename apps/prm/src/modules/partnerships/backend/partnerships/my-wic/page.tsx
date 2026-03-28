"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type WicScoreRecord = {
  recordId: string
  contributorGithubUsername: string
  prId: string
  month: string
  featureKey: string
  level: string
  impactBonus: boolean
  bountyApplied: boolean
  wicScore: number
  assessmentSource: string
}

type WicScoresResponse = {
  records: WicScoreRecord[]
  month: string
  totalWicScore: number
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function currentYearMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-')
  if (!year || !monthNum) return month
  const date = new Date(Number(year), Number(monthNum) - 1, 1)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function SourceBadge({ source, t }: { source: string; t: (key: string, fallback?: string) => string }) {
  const isAutomated = source === 'automated_pipeline'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isAutomated
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
      }`}
    >
      {isAutomated ? t('partnerships.myWic.sourceAutomated') : t('partnerships.myWic.sourceManual')}
    </span>
  )
}

export default function MyWicPage() {
  const t = useT()
  const [selectedMonth, setSelectedMonth] = React.useState<string>(currentYearMonth)
  const [currentPage, setCurrentPage] = React.useState(1)
  const [data, setData] = React.useState<WicScoresResponse | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      const call = await apiCall<WicScoresResponse>(
        `/api/partnerships/wic-scores?month=${encodeURIComponent(selectedMonth)}&page=${currentPage}&pageSize=20`,
      )
      if (call.ok && call.result) {
        setData(call.result)
      } else {
        setData(null)
      }
      setLoading(false)
    }
    load()
  }, [selectedMonth, currentPage])

  function handleMonthChange(value: string) {
    setSelectedMonth(value)
    setCurrentPage(1)
  }

  if (loading) {
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

  const records = data?.records ?? []
  const totalWicScore = data?.totalWicScore ?? 0

  return (
    <Page>
      <PageBody>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {t('partnerships.myWic.title')} — {formatMonthLabel(selectedMonth)}
          </h2>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm"
          />
        </div>

        {records.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">{t('partnerships.myWic.noData')}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              {t('partnerships.myWic.totalScore')} <span className="font-semibold text-foreground tabular-nums">{totalWicScore.toFixed(2)}</span>
            </div>
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colContributor')}</th>
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colPr')}</th>
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colFeature')}</th>
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colLevel')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('partnerships.myWic.colScore')}</th>
                    <th className="px-4 py-3 text-center font-medium">{t('partnerships.myWic.colBounty')}</th>
                    <th className="px-4 py-3 text-left font-medium">{t('partnerships.myWic.colSource')}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.recordId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{record.contributorGithubUsername}</td>
                      <td className="px-4 py-3 text-muted-foreground">{record.prId}</td>
                      <td className="px-4 py-3 text-muted-foreground">{record.featureKey}</td>
                      <td className="px-4 py-3">{record.level}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{record.wicScore.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">{record.bountyApplied ? t('partnerships.myWic.bountyYes') : t('partnerships.myWic.bountyNo')}</td>
                      <td className="px-4 py-3"><SourceBadge source={record.assessmentSource} t={t} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <p className="text-muted-foreground">
                  {t('partnerships.myWic.paginationInfo', `Page ${data.page} of ${data.totalPages} (${data.total} records)`)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={data.page <= 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="rounded-md border px-3 py-1 text-sm hover:bg-muted/50 disabled:opacity-50"
                    data-testid="pagination-prev"
                  >
                    {t('partnerships.myWic.paginationPrev')}
                  </button>
                  <button
                    type="button"
                    disabled={data.page >= data.totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="rounded-md border px-3 py-1 text-sm hover:bg-muted/50 disabled:opacity-50"
                    data-testid="pagination-next"
                  >
                    {t('partnerships.myWic.paginationNext')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </PageBody>
    </Page>
  )
}
