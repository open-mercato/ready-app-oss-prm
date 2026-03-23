import { StartPageContent } from '@/components/StartPageContent'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'PRM — Partner Relationship Management',
    description: 'Manage partner agencies, track KPIs (WIC/WIP/MIN), and govern tiers on Open Mercato.',
  }
}

export default async function Home() {
  const cookieStore = await cookies()
  const showStartPageCookie = cookieStore.get('show_start_page')
  const showStartPage = showStartPageCookie?.value !== 'false'

  let agencyCount = 0
  let dealCount = 0
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    // Count organizations (excluding the default OM backoffice org)
    const totalOrgs = await em.count('Organization', {})
    agencyCount = Math.max(0, totalOrgs - 1)
    dealCount = await em.count('CustomerDeal', {})
  } catch {
    // Database not available — show zeros
  }

  return (
    <main className="min-h-svh w-full p-8 flex flex-col gap-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        <Image
          src="/open-mercato.svg"
          alt="Open Mercato"
          width={40}
          height={40}
          priority
        />
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">PRM — Partner Relationship Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage partner agencies, track KPIs, and govern tier levels. Built on Open Mercato.
          </p>
        </div>
        <Link
          href="/login"
          className="text-sm font-medium text-primary hover:underline transition-colors"
        >
          Go to Login &rarr;
        </Link>
      </header>

      <StartPageContent
        showStartPage={showStartPage}
        agencyCount={agencyCount}
        dealCount={dealCount}
      />

      <footer className="text-xs text-muted-foreground text-center">
        PRM is a reference application for Open Mercato — demonstrating RBAC, CRM, UMES interceptors, widget injection, and custom entities.
      </footer>
    </main>
  )
}
