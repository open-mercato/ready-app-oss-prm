"use client"
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Button } from '@open-mercato/ui/primitives/button'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type RfpResponse = {
  id: string
  status: string
  content: string | null
  submittedAt: string | null
}

type RfpDetail = {
  id: string
  title: string
  description: string | null
  status: string
  deadline: string | null
  createdAt: string
  response: RfpResponse | null
}

export default function RfpResponsePage({ params }: { params: { orgSlug: string; id: string } }) {
  const t = useT()
  const router = useRouter()
  const { auth, orgSlug } = usePortalContext()
  const [data, setData] = useState<RfpDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.replace(`/${orgSlug}/portal/login`)
      return
    }
    if (auth.loading) return

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { ok, result } = await apiCall<{ ok: boolean; data: RfpDetail }>(`/api/partnerships/portal/rfp/${params.id}`)
      if (cancelled) return
      if (ok && result?.data) {
        setData(result.data)
        if (result.data.response?.content) {
          setContent(result.data.response.content)
        }
      } else {
        setError('Failed to load RFP details')
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [auth.loading, auth.user, orgSlug, router, params.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    const { ok, result } = await apiCall<{ ok: boolean; data: RfpResponse }>(
      `/api/partnerships/portal/rfp/${params.id}/respond`,
      { method: 'POST', body: JSON.stringify({ content }) }
    )
    setSubmitting(false)
    if (ok && result?.data) {
      setSubmitted(true)
      setData((prev) => prev ? { ...prev, response: result!.data } : prev)
    } else {
      setSubmitError('Failed to submit response. Please try again.')
    }
  }

  if (auth.loading || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive py-8 text-center">{error}</p>
  }

  if (!data) return null

  const alreadySubmitted = submitted || (data.response?.status === 'submitted' || data.response?.status === 'selected')
  const isClosed = data.status === 'closed' || data.status === 'withdrawn'

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={data.title}
        description={data.deadline ? `Deadline: ${new Date(data.deadline).toLocaleDateString()}` : undefined}
      />

      {data.description && (
        <PortalCard>
          <PortalCardHeader title="Campaign Details" />
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.description}</p>
        </PortalCard>
      )}

      <PortalCard>
        <PortalCardHeader title={t('partnerships.portal.rfpResponse', 'Your Response')} />

        {alreadySubmitted && !submitted && (
          <div className="mb-4 rounded-lg bg-muted px-4 py-3">
            <p className="text-sm font-medium">Response submitted</p>
            {data.response?.submittedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Submitted {new Date(data.response.submittedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {submitted && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm font-medium text-green-800">Your response has been submitted successfully.</p>
          </div>
        )}

        {isClosed ? (
          <p className="text-sm text-muted-foreground">This campaign is closed and no longer accepting responses.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              className="w-full min-h-[160px] rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder={t('partnerships.portal.rfpResponsePlaceholder', "Write your agency's response to this RFP...")}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={submitting}
            />
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting || !content.trim()}>
                {submitting ? <Spinner /> : alreadySubmitted ? 'Update Response' : 'Submit Response'}
              </Button>
            </div>
          </form>
        )}
      </PortalCard>
    </div>
  )
}
