"use client"

import * as React from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type RfpCampaign = {
  id: string
  title: string
  description: string
  deadline: string
  audience: string
  selectedAgencyIds?: string[] | null
  selected_agency_ids?: string[] | null
  status: string
  winnerOrganizationId?: string | null
  winner_organization_id?: string | null
  organizationId: string
  organization_id?: string
  createdBy: string
  created_by?: string
  createdAt: string
  created_at?: string
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  published: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  awarded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
}

export default function RfpCampaignDetailPage() {
  const t = useT()
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const campaignId = (params?.id as string) ?? pathname.split('/').filter(Boolean).at(-1) ?? ''

  const [campaign, setCampaign] = React.useState<RfpCampaign | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [publishing, setPublishing] = React.useState(false)
  const [canManage, setCanManage] = React.useState(false)
  const [canRespond, setCanRespond] = React.useState(false)

  // Responses state
  const [responses, setResponses] = React.useState<Array<{ id: string; organizationId: string; responseText: string; submittedBy: string; createdAt: string; agencyName?: string }>>([])
  const [responseText, setResponseText] = React.useState('')
  const [submittingResponse, setSubmittingResponse] = React.useState(false)
  const [responseSubmitted, setResponseSubmitted] = React.useState(false)
  const [awarding, setAwarding] = React.useState(false)

  React.useEffect(() => {
    if (!campaignId) return

    async function load() {
      try {
        const res = await fetch(`/api/partnerships/rfp-campaigns?id=${campaignId}`)
        if (res.ok) {
          const data = await res.json()
          if (data?.items?.length) {
            setCampaign(data.items[0])
          } else {
            setError(t('partnerships.rfpCampaigns.notFound', 'Campaign not found'))
          }
        } else {
          setError(t('partnerships.rfpCampaigns.loadError', 'Failed to load campaign'))
        }
      } catch {
        setError(t('partnerships.rfpCampaigns.loadError', 'Failed to load campaign'))
      }
      setLoading(false)
    }
    load()
  }, [campaignId, t])

  // Load responses + agency names
  React.useEffect(() => {
    if (!campaignId || loading) return

    fetch(`/api/partnerships/rfp-responses?campaignId=${campaignId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.items) setResponses(data.items)
      })
      .catch(() => {})
  }, [campaignId, loading, responseSubmitted])

  React.useEffect(() => {
    let cancelled = false

    async function loadCapabilities() {
      try {
        const [manageCall, respondCall] = await Promise.all([
          apiCall<{ ok?: boolean; granted?: string[] }>('/api/auth/feature-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ features: ['partnerships.rfp.manage'] }),
          }),
          apiCall<{ ok?: boolean; granted?: string[] }>('/api/auth/feature-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ features: ['partnerships.rfp.respond'] }),
          }),
        ])

        if (cancelled) return

        const manageGranted = Array.isArray(manageCall.result?.granted)
          ? manageCall.result.granted.includes('partnerships.rfp.manage')
          : manageCall.result?.ok === true
        const respondGranted = Array.isArray(respondCall.result?.granted)
          ? respondCall.result.granted.includes('partnerships.rfp.respond')
          : respondCall.result?.ok === true

        setCanManage(manageGranted)
        setCanRespond(respondGranted)
      } catch {
        if (!cancelled) {
          setCanManage(false)
          setCanRespond(false)
        }
      }
    }

    loadCapabilities()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmitResponse(e: React.FormEvent) {
    e.preventDefault()
    if (!campaign) return
    setSubmittingResponse(true)

    // Try PUT first (upsert), fall back to POST
    const existingResponse = responses.length > 0
    const method = existingResponse ? 'PUT' : 'POST'

    const call = await apiCall<{ ok: boolean }>('/api/partnerships/rfp-responses', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: campaign.id, responseText }),
    })

    setSubmittingResponse(false)

    if (call.ok) {
      flash(t('partnerships.rfpResponses.submitted', 'Response submitted successfully'))
      setResponseSubmitted((prev) => !prev)
    } else {
      const result = call.result as Record<string, unknown> | null
      flash(typeof result?.error === 'string' ? result.error : t('partnerships.rfpResponses.submitError', 'Failed to submit response'), 'error')
    }
  }

  async function handleAward(winnerOrgId: string) {
    if (!campaign) return
    setAwarding(true)

    const call = await apiCall<{ ok: boolean }>(`/api/partnerships/rfp-campaigns/${campaign.id}/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerOrganizationId: winnerOrgId }),
    })

    setAwarding(false)

    if (call.ok) {
      flash(t('partnerships.rfpCampaigns.awarded', 'Campaign awarded successfully'))
      setCampaign({ ...campaign, status: 'awarded', winnerOrganizationId: winnerOrgId })
    } else {
      const result = call.result as Record<string, unknown> | null
      flash(typeof result?.error === 'string' ? result.error : t('partnerships.rfpCampaigns.awardError', 'Failed to award campaign'), 'error')
    }
  }

  async function handlePublish() {
    if (!campaign) return
    setPublishing(true)

    const call = await apiCall<{ ok: boolean }>(`/api/partnerships/rfp-campaigns/${campaign.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    setPublishing(false)

    if (call.ok) {
      flash(t('partnerships.rfpCampaigns.published', 'Campaign published successfully'))
      setCampaign({ ...campaign, status: 'published' })
    } else {
      const result = call.result as Record<string, unknown> | null
      flash(typeof result?.error === 'string' ? result.error : t('partnerships.rfpCampaigns.publishError', 'Failed to publish campaign'))
    }
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

  if (error || !campaign) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">{error ?? t('partnerships.rfpCampaigns.notFound', 'Campaign not found')}</p>
            <a
              href="/backend/partnerships/rfp-campaigns"
              className="text-sm text-primary hover:underline"
            >
              {t('partnerships.rfpCampaigns.backToList', 'Back to Campaigns')}
            </a>
          </div>
        </PageBody>
      </Page>
    )
  }

  const deadlineDate = campaign.deadline ? new Date(campaign.deadline) : null
  const createdDate = campaign.createdAt || campaign.created_at
  const agencyIds = campaign.selectedAgencyIds ?? campaign.selected_agency_ids
  const winnerId = campaign.winnerOrganizationId ?? campaign.winner_organization_id
  const showResponseForm = canRespond && !canManage
  const isActiveCampaign = campaign.status === 'published' || campaign.status === 'open'

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{campaign.title}</h2>
              <div className="mt-1 flex items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  STATUS_BADGE[campaign.status] ?? STATUS_BADGE.draft
                }`}>
                  {t(`partnerships.rfpCampaigns.status.${campaign.status}`, campaign.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManage && campaign.status === 'draft' && (
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {publishing ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      {t('partnerships.rfpCampaigns.publishing', 'Publishing...')}
                    </>
                  ) : (
                    t('partnerships.rfpCampaigns.publishButton', 'Publish')
                  )}
                </button>
              )}
              <a
                href="/backend/partnerships/rfp-campaigns"
                className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted/50"
              >
                {t('partnerships.rfpCampaigns.backToList', 'Back to Campaigns')}
              </a>
            </div>
          </div>

          {/* Awarded banner */}
          {campaign.status === 'awarded' && winnerId && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
              {t('partnerships.rfpCampaigns.awardedBanner', 'This campaign has been awarded.')}
            </div>
          )}

          {/* Details */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                {t('partnerships.rfpCampaigns.fields.description', 'Description')}
              </h3>
              <p className="text-sm whitespace-pre-wrap">{campaign.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {t('partnerships.rfpCampaigns.fields.deadline', 'Deadline')}
                </h3>
                <p className="text-sm">
                  {deadlineDate ? deadlineDate.toLocaleDateString() : '\u2014'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {t('partnerships.rfpCampaigns.fields.audience', 'Audience')}
                </h3>
                <p className="text-sm">
                  {t(`partnerships.rfpCampaigns.audience.${campaign.audience}`, campaign.audience)}
                  {campaign.audience === 'selected' && agencyIds && (
                    <span className="text-muted-foreground ml-1">
                      ({agencyIds.length} {t('partnerships.rfpCampaigns.agenciesSelected', 'agencies')})
                    </span>
                  )}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {t('partnerships.rfpCampaigns.fields.created', 'Created')}
                </h3>
                <p className="text-sm">
                  {createdDate ? new Date(createdDate).toLocaleDateString() : '\u2014'}
                </p>
              </div>
            </div>
          </div>

          {/* Response submit/edit form (BD view) */}
          {showResponseForm && isActiveCampaign && deadlineDate && deadlineDate > new Date() && (
            <div className="rounded-lg border bg-card p-6">
              <h3 className="text-sm font-semibold mb-3">
                {t('partnerships.rfpResponses.yourResponse', 'Your Response')}
              </h3>
              <form onSubmit={handleSubmitResponse} className="space-y-3">
                <textarea
                  aria-label="response"
                  rows={5}
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder={t('partnerships.rfpResponses.placeholder', 'Describe your proposal...')}
                />
                <button
                  type="submit"
                  disabled={submittingResponse || !responseText.trim()}
                  className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submittingResponse ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      {t('partnerships.rfpResponses.submitting', 'Submitting...')}
                    </>
                  ) : (
                    t('partnerships.rfpResponses.submitButton', 'Submit Response')
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Responses list */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-3">
              {t('partnerships.rfpCampaigns.responses', 'Responses')} ({responses.length})
            </h3>
            {responses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('partnerships.rfpCampaigns.noResponses', 'No responses yet.')}
              </p>
            ) : (
              <div className="space-y-4">
                {responses.map((r) => (
                  <div key={r.id} className="rounded-md border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {r.agencyName || 'Agency'}
                      </span>
                      {canManage && isActiveCampaign && (
                        <button
                          onClick={() => handleAward(r.organizationId)}
                          disabled={awarding}
                          className="inline-flex items-center rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {awarding ? t('partnerships.rfpCampaigns.awarding', 'Awarding...') : t('partnerships.rfpCampaigns.awardButton', 'Award')}
                        </button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.responseText}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
