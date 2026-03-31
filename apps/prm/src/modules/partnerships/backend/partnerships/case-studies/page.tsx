"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { CaseStudyValuesInput } from '../../../data/validators'

const API_PATH = '/api/partnerships/case-studies'

const INDUSTRY_SUGGESTIONS = [
  'Finance', 'Healthcare', 'Retail', 'Manufacturing',
  'Technology', 'Education', 'Government', 'Energy', 'Logistics',
]

const TECH_SUGGESTIONS = [
  'React', 'Node.js', 'Python', 'TypeScript', 'PostgreSQL',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
]

const BUDGET_OPTIONS = [
  { label: '<10k', value: '<10k' },
  { label: '10k-50k', value: '10k-50k' },
  { label: '50k-200k', value: '50k-200k' },
  { label: '200k-500k', value: '200k-500k' },
  { label: '500k+', value: '500k+' },
]

const DURATION_OPTIONS = [
  { label: '<1 month', value: '<1 month' },
  { label: '1-3 months', value: '1-3 months' },
  { label: '3-6 months', value: '3-6 months' },
  { label: '6-12 months', value: '6-12 months' },
  { label: '12+ months', value: '12+ months' },
]

// ---------------------------------------------------------------------------
// Types — OM entities API returns flat records for custom entities
// ---------------------------------------------------------------------------

type CaseStudyRecord = Record<string, unknown> & {
  id: string
  title: string
  industry?: string | string[]
  technologies?: string | string[]
  budget_bucket: string
  duration_bucket: string
  client_name?: string | null
  description?: string
  challenges?: string | null
  solution?: string | null
  results?: string | null
  is_public?: boolean
  created_at?: string | null
}

type ListResponse = {
  items: CaseStudyRecord[]
  total: number
}

const EMPTY_FORM_VALUES: CaseStudyValuesInput = {
  title: '',
  industry: [],
  technologies: [],
  budget_bucket: '',
  duration_bucket: '',
  client_name: '',
  description: '',
  challenges: '',
  solution: '',
  results: '',
  is_public: false,
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

const formFields: CrudField[] = [
  { id: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. E-commerce Platform Migration' },
  { id: 'industry', label: 'Industries', type: 'tags', suggestions: INDUSTRY_SUGGESTIONS, placeholder: 'Type or pick industries...' },
  { id: 'technologies', label: 'Technologies', type: 'tags', suggestions: TECH_SUGGESTIONS, placeholder: 'Type or pick technologies...' },
  { id: 'budget_bucket', label: 'Budget', type: 'select', required: true, options: BUDGET_OPTIONS },
  { id: 'duration_bucket', label: 'Duration', type: 'select', required: true, options: DURATION_OPTIONS },
  { id: 'client_name', label: 'Client Name', type: 'text', placeholder: 'Optional' },
  { id: 'description', label: 'Description', type: 'textarea', placeholder: 'Brief project overview...' },
  { id: 'challenges', label: 'Challenges', type: 'textarea', placeholder: 'What problems were solved?' },
  { id: 'solution', label: 'Solution', type: 'textarea', placeholder: 'How was it solved?' },
  { id: 'results', label: 'Results', type: 'textarea', placeholder: 'Measurable outcomes...' },
  { id: 'is_public', label: 'Public', type: 'checkbox', description: 'When enabled, this case study may appear on your agency profile at openmercato.com' },
]

const formGroups: CrudFormGroup[] = [
  { id: 'basics', title: 'Basics', fields: ['title', 'industry', 'technologies', 'budget_bucket', 'duration_bucket'] },
  { id: 'client', title: 'Client', fields: ['client_name'] },
  { id: 'narrative', title: 'Project Details', fields: ['description', 'challenges', 'solution', 'results'] },
  { id: 'visibility', title: 'Visibility', fields: ['is_public'] },
]

// ---------------------------------------------------------------------------
// Tag display helper
// ---------------------------------------------------------------------------

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

function toFormValues(record?: CaseStudyRecord | null): CaseStudyValuesInput {
  if (!record) return { ...EMPTY_FORM_VALUES }
  return {
    title: record.title ?? '',
    industry: parseTags(record.industry),
    technologies: parseTags(record.technologies),
    budget_bucket: record.budget_bucket ?? '',
    duration_bucket: record.duration_bucket ?? '',
    client_name: record.client_name ?? '',
    description: record.description ?? '',
    challenges: record.challenges ?? '',
    solution: record.solution ?? '',
    results: record.results ?? '',
    is_public: Boolean(record.is_public),
  }
}

function TagCell({ values, variant }: { values: unknown; variant?: 'secondary' | 'outline' }) {
  const tags = parseTags(values)
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => (
        <Badge key={tag} variant={variant ?? 'secondary'} className="text-xs">{tag}</Badge>
      ))}
      {tags.length > 3 && <Badge variant="outline" className="text-xs">+{tags.length - 3}</Badge>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CaseStudiesPage() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const [records, setRecords] = React.useState<CaseStudyRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingRecord, setEditingRecord] = React.useState<CaseStudyRecord | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const loadRecords = React.useCallback(async () => {
    setLoading(true)
    const call = await apiCall<ListResponse>(
      API_PATH,
    )
    if (call.ok && call.result) {
      setRecords(call.result.items ?? [])
    }
    setLoading(false)
  }, [])

  React.useEffect(() => {
    loadRecords()
  }, [loadRecords, scopeVersion])

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingRecord(null)
  }

  const openCreateDialog = () => {
    setEditingRecord(null)
    setDialogOpen(true)
  }

  const openEditDialog = (record: CaseStudyRecord) => {
    setEditingRecord(record)
    setDialogOpen(true)
  }

  const handleSubmit = async (values: CaseStudyValuesInput) => {
    const call = await apiCall<{ ok: boolean; item?: CaseStudyRecord }>(API_PATH, {
      method: editingRecord ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values,
        ...(editingRecord ? { recordId: editingRecord.id } : {}),
      }),
    })
    if (call.ok) {
      flash(
        editingRecord
          ? t('partnerships.caseStudies.updated')
          : t('partnerships.caseStudies.created'),
        'success',
      )
      closeDialog()
      await loadRecords()
    } else {
      flash(
        editingRecord
          ? t('partnerships.caseStudies.updateError')
          : t('partnerships.caseStudies.createError'),
        'error',
      )
    }
  }

  const handleDelete = async (record: CaseStudyRecord) => {
    if (!confirm(t('partnerships.caseStudies.confirmDelete'))) {
      return
    }

    setDeletingId(record.id)
    const call = await apiCall<{ ok: boolean }>(API_PATH, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId: record.id }),
    })

    if (call.ok) {
      flash(t('partnerships.caseStudies.deleted'), 'success')
      setRecords((prev) => prev.filter((item) => item.id !== record.id))
    } else {
      flash(t('partnerships.caseStudies.deleteError'), 'error')
    }
    setDeletingId(null)
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
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">{t('partnerships.caseStudies.title')}</h2>
          <Button type="button" onClick={openCreateDialog}>
            {t('partnerships.caseStudies.add')}
          </Button>
        </div>

        {records.length === 0 ? (
          <EmptyState
            title={t('partnerships.caseStudies.empty')}
            description={t('partnerships.caseStudies.emptyDescription')}
            action={{ label: t('partnerships.caseStudies.addFirst'), onClick: openCreateDialog }}
          />
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div key={record.id} className="rounded-lg border p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-foreground">
                      {record.title ?? '—'}
                    </h3>
                    {typeof record.description === 'string' && record.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {record.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <TagCell values={record.industry} />
                      <TagCell values={record.technologies} variant="outline" />
                      {typeof record.budget_bucket === 'string' && (
                        <span className="text-xs text-muted-foreground">{record.budget_bucket}</span>
                      )}
                      {typeof record.duration_bucket === 'string' && (
                        <span className="text-xs text-muted-foreground">{record.duration_bucket}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-xs text-muted-foreground">
                      {record.created_at ? new Date(record.created_at).toLocaleDateString() : ''}
                    </span>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 text-xs"
                        onClick={() => openEditDialog(record)}
                      >
                        {t('partnerships.caseStudies.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        disabled={deletingId === record.id}
                        className="h-auto px-0 text-xs text-destructive disabled:opacity-50"
                        onClick={() => handleDelete(record)}
                      >
                        {deletingId === record.id ? '...' : t('partnerships.caseStudies.delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) closeDialog()
          else setDialogOpen(true)
        }}>
          <DialogContent className="sm:max-w-2xl [&_.grid]:!grid-cols-1">
            <DialogHeader>
              <DialogTitle>
                {editingRecord
                  ? t('partnerships.caseStudies.editTitle')
                  : t('partnerships.caseStudies.add')}
              </DialogTitle>
            </DialogHeader>
            <CrudForm<CaseStudyValuesInput>
              key={editingRecord ? editingRecord.id : 'create'}
              fields={formFields}
              groups={formGroups}
              initialValues={toFormValues(editingRecord)}
              onSubmit={handleSubmit}
              embedded={true}
              submitLabel={editingRecord
                ? t('partnerships.caseStudies.saveButton')
                : t('partnerships.caseStudies.submitButton')}
            />
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
