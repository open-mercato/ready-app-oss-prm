"use client"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'

export default function TeamManagementPage({ params }: { params: { orgSlug: string } }) {
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
      <PortalPageHeader title={t('partnerships.portal.teamManagement', 'Team Management')} />
      <PortalEmptyState
        title="Team Management — Coming Soon"
        description="Team member management will integrate with the customer_accounts portal user management APIs in a future update."
      />
    </div>
  )
}
