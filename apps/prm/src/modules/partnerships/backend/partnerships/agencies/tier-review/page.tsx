"use client"

import * as React from 'react'
import { Page, PageBody, PageHeader } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type Proposal = {
  id: string
  organizationId: string
  organizationName: string
  evaluationMonth: string
  currentTier: string
  proposedTier: string
  type: string
  status: string
  wicSnapshot: number
  wipSnapshot: number
  minSnapshot: number
  rejectionReason: string | null
  resolvedAt: string | null
  createdAt: string
}

function TypeBadge({ type }: { type: string }) {
  const isUpgrade = type === 'upgrade'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isUpgrade
          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      }`}
    >
      {isUpgrade ? 'Upgrade' : 'Downgrade'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PendingApproval: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    Approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    Rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status === 'PendingApproval' ? 'Pending' : status}
    </span>
  )
}

function ActionDialog({
  proposal,
  action,
  onClose,
  onDone,
}: {
  proposal: Proposal
  action: 'approve' | 'reject'
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const isReject = action === 'reject'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isReject && !reason.trim()) {
      setError(t('partnerships.tierReview.reasonRequiredError', 'Reason is required when rejecting'))
      return
    }
    setSubmitting(true)
    setError(null)
    const call = await apiCall<{ ok: boolean; error?: string }>(
      '/api/partnerships/tier-proposals/action',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          action,
          reason: reason.trim() || undefined,
        }),
      },
    )
    setSubmitting(false)
    if (call.ok) {
      onDone()
    } else {
      const msg = (call.result as Record<string, unknown>)?.error
      setError(typeof msg === 'string' ? msg : t('partnerships.tierReview.actionFailed', 'Action failed'))
    }
  }

  const dialogTitle = isReject
    ? t('partnerships.tierReview.rejectProposal', 'Reject Proposal')
    : t('partnerships.tierReview.approveProposal', 'Approve Proposal')

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {proposal.organizationName}: {proposal.currentTier} &rarr; {proposal.proposedTier}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="reason">
              {isReject
                ? t('partnerships.tierReview.reasonRequired', 'Reason (required)')
                : t('partnerships.tierReview.reasonOptional', 'Reason (optional)')}
            </label>
            <textarea
              id="reason"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isReject
                ? t('partnerships.tierReview.rejectPlaceholder', 'Why is this proposal being rejected?')
                : t('partnerships.tierReview.approvePlaceholder', 'Optional note for the approval')}
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
              variant={isReject ? 'destructive' : 'default'}
              disabled={submitting}
            >
              {submitting
                ? t('partnerships.tierReview.submitting', 'Submitting...')
                : isReject
                  ? t('partnerships.tierReview.reject', 'Reject')
                  : t('partnerships.tierReview.confirm', 'Confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function TierReviewPage() {
  const t = useT()
  const [proposals, setProposals] = React.useState<Proposal[]>([])
  const [lastEvaluatedAt, setLastEvaluatedAt] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [evaluationRunning, setEvaluationRunning] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState('PendingApproval')
  const [dialog, setDialog] = React.useState<{ proposal: Proposal; action: 'approve' | 'reject' } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const query = statusFilter ? `?status=${statusFilter}` : ''
    const call = await apiCall<{ proposals: Proposal[]; lastEvaluatedAt: string | null }>(`/api/partnerships/tier-proposals${query}`)
    if (call.ok && call.result) {
      setProposals(call.result.proposals)
      setLastEvaluatedAt(call.result.lastEvaluatedAt ?? null)
    }
    setLoading(false)
  }, [statusFilter])

  React.useEffect(() => {
    load()
  }, [load])

  function handleDone() {
    setDialog(null)
    load()
  }

  const lastEval = lastEvaluatedAt ? new Date(lastEvaluatedAt) : null
  const daysSinceEval = lastEval ? Math.floor((Date.now() - lastEval.getTime()) / (1000 * 60 * 60 * 24)) : null
  const isOverdue = daysSinceEval !== null && daysSinceEval > 35
  const isNever = lastEval === null

  async function handleRunEvaluation() {
    setEvaluationRunning(true)
    const call = await apiCall<{ evaluated: number; proposals: number; month: string; errors?: string[] }>(
      '/api/partnerships/enqueue-tier-evaluation',
      { method: 'POST' },
    )
    if (call.ok && call.result) {
      const { evaluated, proposals, month, errors } = call.result
      if (errors?.length) {
        flash(t('partnerships.tierReview.evalWarning', { count: evaluated, month, failed: errors.length, firstError: errors[0] }), 'warning')
      } else if (proposals > 0) {
        flash(t('partnerships.tierReview.evalSuccess', { count: evaluated, month, proposals }), 'success')
      } else {
        flash(t('partnerships.tierReview.evalNoChanges', { count: evaluated, month }), 'info')
      }
      load()
    } else {
      flash(t('partnerships.tierReview.evalFailed', 'Evaluation failed'), 'error')
    }
    setEvaluationRunning(false)
  }

  const filterLabels: Record<string, string> = {
    '': t('partnerships.tierReview.filterAll', 'All'),
    PendingApproval: t('partnerships.tierReview.filterPending', 'Pending'),
    Approved: t('partnerships.tierReview.filterApproved', 'Approved'),
    Rejected: t('partnerships.tierReview.filterRejected', 'Rejected'),
  }

  return (
    <Page>
      <PageHeader title={t('partnerships.tierReview.title', 'Tier Review')} />
      <PageBody>
        <div className={`flex items-center justify-between rounded-md border px-4 py-2 mb-4 text-sm ${isOverdue ? 'border-yellow-400 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200' : isNever ? 'border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200' : 'border-border bg-muted/40 text-muted-foreground'}`}>
          <span>
            {isNever
              ? t('partnerships.tierReview.evaluationNever', 'Auto-evaluation has not run yet')
              : `${t('partnerships.tierReview.lastEvaluation', 'Last auto-evaluation')}: ${lastEval!.toLocaleDateString()}${isOverdue ? ` — ${t('partnerships.tierReview.overdue', 'Overdue')}` : ''}`}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRunEvaluation}
            disabled={evaluationRunning}
          >
            {evaluationRunning
              ? t('partnerships.tierReview.evaluationRunning', 'Evaluation running...')
              : t('partnerships.tierReview.runEvaluation', 'Run Evaluation Now')}
          </Button>
        </div>

        <div className="flex items-center justify-end mb-4">
          <div className="flex gap-1">
            {(['PendingApproval', 'Approved', 'Rejected', ''] as const).map((s) => (
              <Button
                key={s}
                type="button"
                variant={statusFilter === s ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {filterLabels[s]}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingMessage label={t('common.loading', 'Loading...')} />
        ) : proposals.length === 0 ? (
          <EmptyState title={t('partnerships.tierReview.noProposals', 'No tier proposals')} />
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">{t('partnerships.tierReview.agency', 'Agency')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('partnerships.tierReview.type', 'Type')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('partnerships.tierReview.current', 'Current')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('partnerships.tierReview.proposed', 'Proposed')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('partnerships.tierReview.period', 'Period')}</th>
                  <th className="px-4 py-3 text-right font-medium">WIC</th>
                  <th className="px-4 py-3 text-right font-medium">WIP</th>
                  <th className="px-4 py-3 text-right font-medium">MIN</th>
                  <th className="px-4 py-3 text-left font-medium">{t('partnerships.tierReview.status', 'Status')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('partnerships.tierReview.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{p.organizationName}</td>
                    <td className="px-4 py-3"><TypeBadge type={p.type} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{p.currentTier}</td>
                    <td className="px-4 py-3">{p.proposedTier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.evaluationMonth}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.wicSnapshot}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.wipSnapshot}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.minSnapshot}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {p.status === 'PendingApproval' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDialog({ proposal: p, action: 'approve' })}
                          >
                            {t('partnerships.tierReview.approve', 'Approve')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDialog({ proposal: p, action: 'reject' })}
                          >
                            {t('partnerships.tierReview.reject', 'Reject')}
                          </Button>
                        </div>
                      ) : p.rejectionReason ? (
                        <span className="text-xs text-muted-foreground" title={p.rejectionReason}>
                          {p.rejectionReason.length > 30 ? `${p.rejectionReason.slice(0, 30)}...` : p.rejectionReason}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dialog && (
          <ActionDialog
            proposal={dialog.proposal}
            action={dialog.action}
            onClose={() => setDialog(null)}
            onDone={handleDone}
          />
        )}
      </PageBody>
    </Page>
  )
}
