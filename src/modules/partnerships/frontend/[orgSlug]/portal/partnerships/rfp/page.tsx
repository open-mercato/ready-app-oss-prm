"use client"
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type RfpItem = {
  id: string
  title: string
  status: string
  deadline: string | null
  hasResponded: boolean
  responseStatus: string | null
}

type RfpListData = {
  items: RfpItem[]
  page: number
  pageSize: number
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  published: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-700',
  draft: 'bg-yellow-100 text-yellow-800',
  withdrawn: 'bg-red-100 text-red-700',
}

const RESPONSE_BADGE_CLASS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800',
  selected: 'bg-purple-100 text-purple-800',
  invited: 'bg-orange-100 text-orange-800',
}

export default function RfpInboxPage({ params }: { params: { orgSlug: string } }) {
  const t = useT()
  const router = useRouter()
  const { auth, orgSlug } = usePortalContext()
  const [data, setData] = useState<RfpListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const { ok, result } = await apiCall<{ ok: boolean; data: RfpListData }>('/api/partnerships/portal/rfp')
      if (cancelled) return
      if (ok && result?.data) {
        setData(result.data)
      } else {
        setError('Failed to load RFP campaigns')
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [auth.loading, auth.user, orgSlug, router])

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

  return (
    <div className="space-y-6">
      <PortalPageHeader title={t('partnerships.portal.rfpInbox', 'RFP Campaigns')} />

      <PortalCard>
        <PortalCardHeader title={t('partnerships.rfp.title', 'RFP Campaigns')} />
        {data.items.length === 0 ? (
          <PortalEmptyState title="No RFP campaigns available" description="New campaigns will appear here when published." />
        ) : (
          <div className="divide-y">
            {data.items.map((rfp) => (
              <Link
                key={rfp.id}
                href={`/${orgSlug}/portal/partnerships/rfp/${rfp.id}`}
                className="flex items-center justify-between gap-4 py-3 hover:bg-accent/50 -mx-2 px-2 rounded transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{rfp.title}</p>
                  {rfp.deadline && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deadline: {new Date(rfp.deadline).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[rfp.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {rfp.status}
                  </span>
                  {rfp.hasResponded && rfp.responseStatus && (
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${RESPONSE_BADGE_CLASS[rfp.responseStatus] ?? 'bg-muted text-muted-foreground'}`}>
                      {rfp.responseStatus}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </PortalCard>
    </div>
  )
}
