"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const ENTITY_ID = 'partnerships:case_study'

type CaseStudyRecord = {
  id: string
  values: Record<string, unknown>
  createdAt: string
}

type ListResponse = {
  items: CaseStudyRecord[]
  total: number
}

type CreateResponse = {
  id: string
}

export default function CaseStudiesPage() {
  const t = useT()
  const [records, setRecords] = React.useState<CaseStudyRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [title, setTitle] = React.useState('')

  const loadRecords = React.useCallback(async () => {
    setLoading(true)
    const call = await apiCall<ListResponse>(
      `/api/entities/records?entityId=${encodeURIComponent(ENTITY_ID)}&pageSize=100`,
    )
    if (call.ok && call.result) {
      setRecords(call.result.items ?? [])
    }
    setLoading(false)
  }, [])

  React.useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const call = await apiCall<CreateResponse>('/api/entities/records', {
      method: 'POST',
      body: JSON.stringify({
        entityId: ENTITY_ID,
        values: { title: title.trim() },
      }),
    })
    if (call.ok) {
      setTitle('')
      setShowForm(false)
      await loadRecords()
    }
    setSaving(false)
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

  return (
    <Page>
      <PageBody>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {t('partnerships.caseStudies.title')}
          </h2>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t('partnerships.caseStudies.add')}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 rounded-lg border p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="cs-title" className="mb-1 block text-sm font-medium">
                  Title
                </label>
                <input
                  id="cs-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="e.g. E-commerce Platform Migration"
                  autoFocus
                  required
                />
              </div>
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setTitle('') }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {records.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">{t('partnerships.caseStudies.empty')}</p>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('partnerships.caseStudies.addFirst')}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {(record.values?.title as string) ?? record.id}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(record.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </Page>
  )
}
