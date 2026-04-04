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

const RFP_ACCEPT_EXTENSIONS = ['md', 'jpg', 'jpeg', 'png', 'gif', 'webp']
const RFP_MAX_SIZE_MB = 25
const RFP_ACCEPT_STRING = '.md,.jpg,.jpeg,.png,.gif,.webp'

function humanSize(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let x = n
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++ }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

type AttachmentItem = { id: string; url: string; fileName: string; fileSize: number }

function AttachmentSection({ entityId, recordId }: { entityId: string; recordId: string }) {
  const t = useT()
  const [items, setItems] = React.useState<AttachmentItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)

  const loadAttachments = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/partnerships/rfp-attachments?entityId=${encodeURIComponent(entityId)}&recordId=${encodeURIComponent(recordId)}`)
      if (res.ok) {
        const data = await res.json()
        setItems(Array.isArray(data.items) ? data.items : [])
      }
    } catch {}
  }, [entityId, recordId])

  React.useEffect(() => { loadAttachments() }, [loadAttachments])

  async function handleUpload(files: FileList | null) {
    if (!files) return
    setError(null)
    setUploading(true)
    for (const file of Array.from(files)) {
      const ext = (file.name || '').split('.').pop()?.toLowerCase() || ''
      if (!RFP_ACCEPT_EXTENSIONS.includes(ext)) {
        setError(t('partnerships.rfp.attachments.typeNotAllowed', 'File type not allowed. Accepted: ') + RFP_ACCEPT_EXTENSIONS.join(', '))
        continue
      }
      if (file.size > RFP_MAX_SIZE_MB * 1024 * 1024) {
        setError(t('partnerships.rfp.attachments.tooLarge', `File exceeds ${RFP_MAX_SIZE_MB} MB limit`))
        continue
      }
      const fd = new FormData()
      fd.set('entityId', entityId)
      fd.set('recordId', recordId)
      fd.set('partitionCode', 'rfp')
      fd.set('file', file)
      const res = await fetch('/api/attachments', { method: 'POST', body: fd })
      if (!res.ok) {
        setError(t('partnerships.rfp.attachments.uploadFailed', 'Upload failed'))
        break
      }
    }
    setUploading(false)
    await loadAttachments()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="file"
          multiple
          accept={RFP_ACCEPT_STRING}
          onChange={(e) => handleUpload(e.target.files)}
          disabled={uploading}
          className="text-sm"
        />
        {uploading && <Spinner className="h-4 w-4" />}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.id} className="text-sm">
              <a className="underline hover:text-primary" href={it.url} target="_blank" rel="noreferrer">{it.fileName}</a>
              <span className="text-xs text-muted-foreground ml-1">{humanSize(it.fileSize)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CreateRfpCampaignPage() {
  const t = useT()
  const router = useRouter()

  // Pre-generate UUID so attachments can be uploaded before form submit
  const [campaignId] = React.useState(() => crypto.randomUUID())

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [deadline, setDeadline] = React.useState('')
  const [audience, setAudience] = React.useState<'all' | 'selected'>('all')
  const [selectedAgencyIds, setSelectedAgencyIds] = React.useState<string[]>([])

  const [agencies, setAgencies] = React.useState<AgencyOption[]>([])
  const [loadingAgencies, setLoadingAgencies] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (audience === 'selected' && agencies.length === 0) {
      setLoadingAgencies(true)
      apiCall<{ agencies: AgencyOption[] }>('/api/partnerships/agencies')
        .then((call) => {
          if (call.ok && call.result?.agencies) {
            setAgencies(call.result.agencies)
          }
        })
        .finally(() => setLoadingAgencies(false))
    }
  }, [audience, agencies.length])

  function toggleAgency(orgId: string) {
    setSelectedAgencyIds((prev) =>
      prev.includes(orgId)
        ? prev.filter((id) => id !== orgId)
        : [...prev, orgId]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const payload: Record<string, unknown> = {
      id: campaignId,
      title,
      description,
      deadline,
      audience,
    }
    if (audience === 'selected') {
      payload.selectedAgencyIds = selectedAgencyIds
    }

    const call = await apiCall<{ id: string }>('/api/partnerships/rfp-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setSubmitting(false)

    if (call.ok) {
      flash(t('partnerships.rfpCampaigns.created', 'RFP campaign created successfully'))
      router.push(`/backend/partnerships/rfp-campaigns/${campaignId}`)
    } else {
      const result = call.result as Record<string, unknown> | null
      setSubmitError(
        typeof result?.error === 'string' ? result.error : t('partnerships.rfpCampaigns.createError', 'Failed to create campaign.')
      )
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border bg-card p-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1">
                {t('partnerships.rfpCampaigns.fields.title', 'Title')}
              </label>
              <input
                id="title"
                type="text"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t('partnerships.rfpCampaigns.fields.titlePlaceholder', 'Campaign title...')}
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1">
                {t('partnerships.rfpCampaigns.fields.description', 'Description')}
              </label>
              <textarea
                id="description"
                required
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t('partnerships.rfpCampaigns.fields.descriptionPlaceholder', 'Describe the project requirements...')}
              />
            </div>

            <div>
              <label htmlFor="deadline" className="block text-sm font-medium mb-1">
                {t('partnerships.rfpCampaigns.fields.deadline', 'Deadline')}
              </label>
              <input
                id="deadline"
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="audience" className="block text-sm font-medium mb-1">
                {t('partnerships.rfpCampaigns.fields.audience', 'Audience')}
              </label>
              <select
                id="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as 'all' | 'selected')}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="all">{t('partnerships.rfpCampaigns.audience.all', 'All Agencies')}</option>
                <option value="selected">{t('partnerships.rfpCampaigns.audience.selected', 'Selected Agencies')}</option>
              </select>
            </div>

            {audience === 'selected' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('partnerships.rfpCampaigns.fields.selectAgencies', 'Select Agencies')}
                </label>
                {loadingAgencies ? (
                  <div className="flex items-center gap-2 py-2">
                    <Spinner className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {t('partnerships.rfpCampaigns.loadingAgencies', 'Loading agencies...')}
                    </span>
                  </div>
                ) : agencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('partnerships.rfpCampaigns.noAgencies', 'No agencies found.')}
                  </p>
                ) : (
                  <div className="space-y-2 rounded-md border p-3">
                    {agencies.map((agency) => (
                      <label key={agency.organizationId} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAgencyIds.includes(agency.organizationId)}
                          onChange={() => toggleAgency(agency.organizationId)}
                          className="rounded border"
                        />
                        {agency.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Attachments — upload during creation */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('partnerships.rfpCampaigns.attachments', 'Attachments')}
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                {t('partnerships.rfpCampaigns.attachmentsHint', 'Briefs, requirements, reference materials. Accepted: .md, images (max 25 MB).')}
              </p>
              <AttachmentSection entityId="partnerships:rfp_campaign" recordId={campaignId} />
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
                  {t('partnerships.rfpCampaigns.submitting', 'Creating...')}
                </>
              ) : (
                t('partnerships.rfpCampaigns.submitButton', 'Create Campaign')
              )}
            </button>
          </form>
        </div>
      </PageBody>
    </Page>
  )
}
