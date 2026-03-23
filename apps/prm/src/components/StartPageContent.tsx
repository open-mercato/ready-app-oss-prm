'use client'

import React, { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Shield, Users, Briefcase, Code, ArrowRight, Info } from 'lucide-react'

function LoginButton({ email, password, title, variant = 'default' }: {
  email: string
  password: string
  title: string
  variant?: 'default' | 'secondary' | 'outline'
}) {
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    try {
      const form = new FormData()
      form.set('email', email)
      form.set('password', password)
      const res = await fetch('/api/auth/login', { method: 'POST', body: form })
      if (res.ok) {
        window.location.href = '/backend'
      }
    } catch {
      setLoading(false)
    }
  }

  return (
    <Button type="button" variant={variant} className="w-full" disabled={loading} onClick={handleLogin}>
      {loading ? 'Logging in...' : `Login as ${title}`}
      {!loading && <ArrowRight className="size-4 ml-1" />}
    </Button>
  )
}

interface RoleTileProps {
  icon: ReactNode
  title: string
  description: string
  features: string[]
  email: string
  password: string
  variant?: 'default' | 'secondary' | 'outline'
}

function RoleTile({
  icon,
  title,
  description,
  features,
  email,
  password,
  variant = 'default',
}: RoleTileProps) {
  return (
    <div className="rounded-lg border bg-card p-6 flex flex-col gap-4 transition-all hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>

      <div className="flex-1">
        <div className="text-xs font-medium text-muted-foreground mb-2">What they can do:</div>
        <ul className="space-y-1.5">
          {features.map((feature, idx) => (
            <li key={idx} className="text-sm flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded bg-muted/50 p-3 text-xs space-y-1">
        <div><span className="text-muted-foreground">Email:</span> <code className="font-mono">{email}</code></div>
        <div><span className="text-muted-foreground">Password:</span> <code className="font-mono">{password}</code></div>
      </div>

      <LoginButton email={email} password={password} title={title} variant={variant} />
    </div>
  )
}

interface StartPageContentProps {
  showStartPage: boolean
  agencyCount: number
  dealCount: number
}

export function StartPageContent({ showStartPage: initialShowStartPage, agencyCount, dealCount }: StartPageContentProps) {
  const [showStartPage, setShowStartPage] = useState(initialShowStartPage)

  const handleCheckboxChange = (checked: boolean) => {
    setShowStartPage(checked)
    document.cookie = `show_start_page=${checked}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`
  }

  return (
    <>
      <section className="rounded-lg border bg-gradient-to-br from-background to-muted/20 p-8">
        <h2 className="text-2xl font-semibold mb-3">What is PRM?</h2>
        <p className="text-muted-foreground max-w-3xl mb-6">
          PRM (Partner Relationship Management) helps Open Mercato manage its network of partner agencies.
          Agencies contribute code, prospect clients, and close deals. PRM tracks all of this and governs
          the tier program that determines each agency's visibility and lead priority.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-bold text-primary">{agencyCount}</div>
            <div className="text-sm text-muted-foreground">Partner Agencies</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-bold text-primary">{dealCount}</div>
            <div className="text-sm text-muted-foreground">Deals in Pipeline</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-bold text-primary">4</div>
            <div className="text-sm text-muted-foreground">Tier Levels</div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 p-5">
        <div className="flex items-start gap-3">
          <Info className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">The Flywheel</h3>
            <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <p>Agency joins program &rarr; contributes code (<strong>WIC</strong>) &rarr; prospects clients (<strong>WIP</strong>) &rarr; closes deals (<strong>MIN</strong>)</p>
              <p>&rarr; higher tier &rarr; more visibility &rarr; more leads from OM &rarr; more sales &rarr; agency invests more &rarr; flywheel accelerates</p>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded bg-blue-100 dark:bg-blue-900/40 p-2">
                <div className="font-semibold text-blue-900 dark:text-blue-100">WIC</div>
                <div className="text-blue-700 dark:text-blue-300">Wildly Important Contributions — code PRs scored L1-L4</div>
              </div>
              <div className="rounded bg-blue-100 dark:bg-blue-900/40 p-2">
                <div className="font-semibold text-blue-900 dark:text-blue-100">WIP</div>
                <div className="text-blue-700 dark:text-blue-300">Work In Progress — deals reaching Sales Qualified stage</div>
              </div>
              <div className="rounded bg-blue-100 dark:bg-blue-900/40 p-2">
                <div className="font-semibold text-blue-900 dark:text-blue-100">MIN</div>
                <div className="text-blue-700 dark:text-blue-300">Minimum Implementations — enterprise license deals closed</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Try It Out</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Log in as any persona to explore PRM from their perspective. Each role sees different data and capabilities.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <RoleTile
            icon={<Shield className="size-6" />}
            title="Partnership Manager"
            description="OM employee who runs the partner program"
            features={[
              'Add new agencies (one-step onboarding)',
              'Import WIC scores from assessments',
              'Attribute license deals (MIN) to agencies',
              'Evaluate and approve tier changes',
              'Cross-org CRM view of all agencies',
            ]}
            email="partnership-manager@demo.local"
            password="Demo123!"
          />

          <RoleTile
            icon={<Users className="size-6" />}
            title="Agency Admin"
            description="Manages the agency's team and profile"
            features={[
              'Full CRM access (companies, deals, pipeline)',
              'Edit organization profile and case studies',
              'Create BD and Contributor accounts',
              'View tier status and KPI progress',
              'Respond to RFP campaigns',
            ]}
            email="acme-admin@demo.local"
            password="Demo123!"
            variant="secondary"
          />

          <RoleTile
            icon={<Briefcase className="size-6" />}
            title="Business Developer"
            description="Prospects clients and builds pipeline"
            features={[
              'Create companies and deals in CRM',
              'Move deals through pipeline stages',
              'WIP auto-tracked at SQL stage',
              'View agency WIP count and tier',
              'Respond to RFP campaigns',
            ]}
            email="acme-bd@demo.local"
            password="Demo123!"
            variant="outline"
          />

          <RoleTile
            icon={<Code className="size-6" />}
            title="Contributor"
            description="Contributes code to the OM platform"
            features={[
              'Set GitHub username on profile',
              'View personal WIC score breakdown',
              'See agency tier status',
              'Onboarding checklist guidance',
            ]}
            email="acme-contributor@demo.local"
            password="Demo123!"
            variant="outline"
          />
        </div>
      </section>

      <section className="rounded-lg border p-4 flex items-center justify-center gap-3">
        <Checkbox
          id="show-start-page"
          checked={showStartPage}
          onCheckedChange={handleCheckboxChange}
        />
        <label
          htmlFor="show-start-page"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          Display this start page next time
        </label>
      </section>
    </>
  )
}
