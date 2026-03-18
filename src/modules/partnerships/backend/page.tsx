'use client'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'

export default function PartnershipsDashboard() {
  const t = useT()
  return (
    <Page>
      <PageHeader
        title={t('partnerships.pageTitle', 'Partnerships')}
        description={t('partnerships.description', 'B2B Partner Relationship Management — agencies, tiers, KPIs, RFPs.')}
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <DashboardCard href="/backend/agencies" title={t('partnerships.agency.title', 'Agencies')} description={t('partnerships.agency.dashCard', 'Manage partner agencies')} />
          <DashboardCard href="/backend/tiers" title={t('partnerships.tier.title', 'Tier Definitions')} description={t('partnerships.tier.dashCard', 'Configure tier thresholds')} />
          <DashboardCard href="/backend/kpi" title={t('partnerships.kpi.title', 'KPI Dashboard')} description={t('partnerships.kpi.dashCard', 'View partner performance')} />
          <DashboardCard href="/backend/min" title={t('partnerships.min.title', 'MIN Attribution')} description={t('partnerships.min.dashCard', 'Attribute license deals')} />
        </div>
      </PageBody>
    </Page>
  )
}

function DashboardCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-lg border p-4 hover:bg-accent transition-colors">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </Link>
  )
}
