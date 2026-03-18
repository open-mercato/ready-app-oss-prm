"use client"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'

export default function CaseStudiesPage({ params }: { params: { orgSlug: string } }) {
  const t = useT()
  const router = useRouter()
  const { auth, orgSlug } = usePortalContext()

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.replace(`/${orgSlug}/portal/login`)
    }
  }, [auth.loading, auth.user, orgSlug, router])

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader title={t('partnerships.portal.caseStudies', 'Case Studies')} />
      <PortalEmptyState
        title="Case Studies — Coming Soon"
        description="Case study management will be available in a future update (SPEC-053a)."
      />
    </div>
  )
}
