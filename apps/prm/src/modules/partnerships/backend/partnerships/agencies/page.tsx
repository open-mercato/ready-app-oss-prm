"use client"

import * as React from 'react'
import { Page, PageBody, PageHeader } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { TIER_THRESHOLDS } from '../../../data/tier-thresholds'

type AgencyListItem = {
  organizationId: string
  name: string
  adminEmail: string | null
  wipCount: number
  wicScore: number
  minCount: number
  createdAt: string
  currentTier: string | null
}

function ChangeTierDialog({
  agency,
  onClose,
  onDone,
}: {
  agency: AgencyListItem
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const [selectedTier, setSelectedTier] = React.useState(agency.currentTier ?? TIER_THRESHOLDS[0].tier)
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { runMutation } = useGuardedMutation<{ organizationId: string; tier: string }>({
    contextId: `partnerships.tier-assign.${agency.organizationId}`,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const call = await runMutation({
        operation: () => apiCall<{ success: boolean; error?: string }>(
          '/api/partnerships/tier-assign',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organizationId: agency.organizationId,
              tier: selectedTier,
              reason: reason.trim(),
            }),
          },
        ),
        context: { organizationId: agency.organizationId, tier: selectedTier },
        mutationPayload: { organizationId: agency.organizationId, tier: selectedTier, reason: reason.trim() },
      })
      setSubmitting(false)
      if (call.ok) {
        flash(t('partnerships.agencies.tierChanged', 'Tier updated successfully'), 'success')
        onDone()
      } else {
        const msg = (call.result as Record<string, unknown>)?.error
        setError(typeof msg === 'string' ? msg : 'Failed to update tier')
      }
    } catch {
      setSubmitting(false)
      setError('Failed to update tier')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (reason.trim() && !submitting) {
        handleSubmit(e as unknown as React.FormEvent)
      }
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            {t('partnerships.agencies.changeTier', 'Change Tier')}: {agency.name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('partnerships.agencies.currentTier', 'Current Tier')}: {agency.currentTier ?? t('partnerships.agencies.noTier', 'No tier')}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1" htmlFor="tier-select">
              {t('partnerships.agencies.changeTier', 'Change Tier')}
            </label>
            <select
              id="tier-select"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
            >
              {TIER_THRESHOLDS.map((threshold) => (
                <option key={threshold.tier} value={threshold.tier}>
                  {threshold.tier}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1" htmlFor="tier-reason">
              {t('partnerships.agencies.changeTierReason', 'Reason for tier change')} *
            </label>
            <textarea
              id="tier-reason"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('partnerships.agencies.changeTierReason', 'Reason for tier change')}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitting || !reason.trim()}
            >
              {submitting ? 'Saving...' : t('partnerships.agencies.changeTier', 'Change Tier')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function AgenciesPage() {
  const t = useT()
  const [agencies, setAgencies] = React.useState<AgencyListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [dialogAgency, setDialogAgency] = React.useState<AgencyListItem | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const call = await apiCall<{ agencies: AgencyListItem[] }>('/api/partnerships/agencies')
    if (call.ok && call.result) {
      setAgencies(call.result.agencies)
    } else {
      setError('Failed to load agencies')
    }
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  function handleDone() {
    setDialogAgency(null)
    load()
  }

  if (loading) {
    return (
      <Page>
        <PageHeader title={t('partnerships.agencies.title', 'Agencies')} />
        <PageBody>
          <LoadingMessage label={t('common.loading', 'Loading...')} />
        </PageBody>
      </Page>
    )
  }

  if (error) {
    return (
      <Page>
        <PageHeader title={t('partnerships.agencies.title', 'Agencies')} />
        <PageBody>
          <ErrorMessage label={t('common.errorTitle', 'Something went wrong')} description={error} />
        </PageBody>
      </Page>
    )
  }

  if (agencies.length === 0) {
    return (
      <Page>
        <PageHeader title={t('partnerships.agencies.title', 'Agencies')} />
        <PageBody>
          <EmptyState
            title={t('partnerships.agencies.emptyTitle', 'No agencies yet')}
            description={t('partnerships.agencies.emptyDescription', 'Add your first agency to start the partner program.')}
            actionLabel={t('partnerships.addAgency.title', 'Add Agency')}
            onAction={() => window.location.href = '/backend/partnerships/agencies/add'}
          />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={t('partnerships.agencies.title', 'Agencies')}
        actions={
          <Button onClick={() => window.location.href = '/backend/partnerships/agencies/add'}>
            {t('partnerships.addAgency.title', 'Add Agency')}
          </Button>
        }
      />
      <PageBody>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Agency</th>
                <th className="px-4 py-3 text-left font-medium">{t('partnerships.agencies.currentTier', 'Current Tier')}</th>
                <th className="px-4 py-3 text-left font-medium">Admin Email</th>
                <th className="px-4 py-3 text-right font-medium">WIP (this month)</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((agency) => (
                <tr key={agency.organizationId} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{agency.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {agency.currentTier ?? t('partnerships.agencies.noTier', 'No tier')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{agency.adminEmail ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{agency.wipCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(agency.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDialogAgency(agency)}
                    >
                      {t('partnerships.agencies.changeTier', 'Change Tier')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {dialogAgency && (
          <ChangeTierDialog
            agency={dialogAgency}
            onClose={() => setDialogAgency(null)}
            onDone={handleDone}
          />
        )}
      </PageBody>
    </Page>
  )
}
