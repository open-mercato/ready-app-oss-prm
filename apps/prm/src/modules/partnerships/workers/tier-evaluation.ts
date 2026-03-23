import type { JobContext, QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import {
  TierEvaluationState,
  TierChangeProposal,
  TierAssignment,
  PartnerLicenseDeal,
} from '../data/entities'
import { computeTierEligibility, tierOrder } from '../data/tier-thresholds'

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: WorkerMeta = {
  queue: 'partnerships',
  id: 'partnerships:tier-evaluation',
  concurrency: 2,
}

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

type TierEvaluationPayload = {
  organizationId: string
  evaluationMonth: string // YYYY-MM
  tenantId: string
}

// ---------------------------------------------------------------------------
// DI context (resolve injected at runtime by the worker runner)
// ---------------------------------------------------------------------------

type HandlerContext = JobContext & {
  resolve: <T = unknown>(name: string) => T
}

// ---------------------------------------------------------------------------
// Constants (match entity IDs used by WIC import + WIP count routes)
// ---------------------------------------------------------------------------

const CU_ENTITY_ID = 'partnerships:contribution_unit'
const DEAL_ENTITY_ID = 'customers:customer_deal'
const WIP_FIELD_KEY = 'wip_registered_at'

// ---------------------------------------------------------------------------
// KPI Readers
// ---------------------------------------------------------------------------

/**
 * WIC: SUM of wic_score CFVs for contribution_unit records in the given
 * org + month.
 */
async function readWic(
  em: EntityManager,
  organizationId: string,
  month: string,
  tenantId: string,
): Promise<number> {
  // 1. Find all recordIds for this org + month
  const monthCfvs = await em.find(CustomFieldValue, {
    entityId: CU_ENTITY_ID,
    fieldKey: 'month',
    valueText: month,
    organizationId,
    tenantId,
    deletedAt: null,
  })

  const recordIds = [...new Set(monthCfvs.map((c) => c.recordId))]
  if (recordIds.length === 0) return 0

  // 2. Get wic_score CFVs for those records
  const scoreCfvs = await em.find(CustomFieldValue, {
    entityId: CU_ENTITY_ID,
    fieldKey: 'wic_score',
    recordId: { $in: recordIds },
    tenantId,
    deletedAt: null,
  })

  return scoreCfvs.reduce((sum, cfv) => sum + parseFloat(cfv.valueText ?? '0'), 0)
}

/**
 * WIP: COUNT of wip_registered_at CFVs for customer_deal records whose
 * registered date falls within the evaluation month.
 */
async function readWip(
  em: EntityManager,
  organizationId: string,
  month: string,
  tenantId: string,
): Promise<number> {
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthStr, 10) - 1
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0))

  return em.count(CustomFieldValue, {
    entityId: DEAL_ENTITY_ID,
    fieldKey: WIP_FIELD_KEY,
    tenantId,
    organizationId,
    deletedAt: null,
    valueText: { $gte: start.toISOString(), $lt: end.toISOString() },
  })
}

/**
 * MIN: COUNT of PartnerLicenseDeal for org, type=enterprise, status=won,
 * is_renewal=false, year = current calendar year.
 */
async function readMin(
  em: EntityManager,
  organizationId: string,
  tenantId: string,
): Promise<number> {
  const currentYear = new Date().getUTCFullYear()

  return em.count(PartnerLicenseDeal, {
    organizationId,
    tenantId,
    type: 'enterprise',
    status: 'won',
    isRenewal: false,
    year: currentYear,
  })
}

// ---------------------------------------------------------------------------
// Grace Period State Machine
// ---------------------------------------------------------------------------

/**
 * Returns the previous evaluation month in YYYY-MM format.
 */
function previousMonth(yyyyMm: string): string {
  const [yearStr, monthStr] = yyyyMm.split('-')
  let year = parseInt(yearStr, 10)
  let month = parseInt(monthStr, 10) - 1 // 0-based
  if (month === 0) {
    month = 12
    year -= 1
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handle(
  job: QueuedJob<TierEvaluationPayload>,
  ctx: HandlerContext,
): Promise<void> {
  const { organizationId, evaluationMonth, tenantId } = job.payload
  const em = ctx.resolve<EntityManager>('em').fork()

  // -----------------------------------------------------------------------
  // 1. Idempotency: if a ProposedDowngrade state already exists, skip
  // -----------------------------------------------------------------------
  const existingState = await em.findOne(TierEvaluationState, {
    organizationId,
    evaluationMonth,
    tenantId,
  })

  if (existingState?.status === 'ProposedDowngrade') {
    return // already processed — proposal was created in a prior run
  }

  // -----------------------------------------------------------------------
  // 2. Read KPIs
  // -----------------------------------------------------------------------
  const [wic, wip, min] = await Promise.all([
    readWic(em, organizationId, evaluationMonth, tenantId),
    readWip(em, organizationId, evaluationMonth, tenantId),
    readMin(em, organizationId, tenantId),
  ])

  // -----------------------------------------------------------------------
  // 3. Compute eligibility
  // -----------------------------------------------------------------------
  const eligibleTier = computeTierEligibility(wic, wip, min)

  // -----------------------------------------------------------------------
  // 4. Load current tier assignment (latest by effectiveDate)
  // -----------------------------------------------------------------------
  const currentAssignment = await em.findOne(
    TierAssignment,
    { organizationId, tenantId },
    { orderBy: { effectiveDate: 'DESC' } },
  )

  const currentTierName = currentAssignment?.tier ?? 'OM Agency'
  const currentOrder = tierOrder(currentTierName)
  const eligibleOrder = eligibleTier ? tierOrder(eligibleTier) : 0

  // -----------------------------------------------------------------------
  // 5. Load or create TierEvaluationState for this month
  // -----------------------------------------------------------------------
  let evalState = existingState
  if (!evalState) {
    evalState = em.create(TierEvaluationState, {
      organizationId,
      evaluationMonth,
      currentTier: currentTierName,
      tenantId,
    })
  } else {
    evalState.currentTier = currentTierName
  }

  // -----------------------------------------------------------------------
  // 6. Check for open proposals (guard against duplicates)
  // -----------------------------------------------------------------------
  const openProposal = await em.findOne(TierChangeProposal, {
    organizationId,
    evaluationMonth,
    tenantId,
    status: 'PendingApproval',
  })

  if (openProposal) {
    // An open proposal already exists — nothing to do
    await em.flush()
    return
  }

  // -----------------------------------------------------------------------
  // 7. Apply grace period state machine
  // -----------------------------------------------------------------------
  if (eligibleOrder > 0 && eligibleOrder > currentOrder) {
    // --- UPGRADE path ---
    evalState.status = 'OK'
    evalState.gracePeriodStartedAt = null

    em.create(TierChangeProposal, {
      organizationId,
      evaluationMonth,
      currentTier: currentTierName,
      proposedTier: eligibleTier!,
      type: 'upgrade',
      wicSnapshot: wic,
      wipSnapshot: wip,
      minSnapshot: min,
      tenantId,
    })
  } else if (eligibleOrder < currentOrder) {
    // --- DOWNGRADE path (grace period) ---
    // Look up the previous month's eval state to know if we're already in grace
    const prevMonth = previousMonth(evaluationMonth)
    const prevState = await em.findOne(TierEvaluationState, {
      organizationId,
      evaluationMonth: prevMonth,
      tenantId,
    })

    if (prevState?.status === 'GracePeriod') {
      // Second consecutive miss -> propose downgrade
      evalState.status = 'ProposedDowngrade'
      evalState.gracePeriodStartedAt = prevState.gracePeriodStartedAt ?? new Date()

      em.create(TierChangeProposal, {
        organizationId,
        evaluationMonth,
        currentTier: currentTierName,
        proposedTier: eligibleTier ?? 'OM Agency',
        type: 'downgrade',
        wicSnapshot: wic,
        wipSnapshot: wip,
        minSnapshot: min,
        tenantId,
      })
    } else {
      // First miss -> enter grace period
      evalState.status = 'GracePeriod'
      evalState.gracePeriodStartedAt = new Date()
    }
  } else {
    // --- HOLD or RECOVERY path ---
    if (evalState.status === 'GracePeriod') {
      // KPIs recovered — reset grace period
      evalState.status = 'OK'
      evalState.gracePeriodStartedAt = null
    }
    // else: already OK, nothing to do
  }

  // -----------------------------------------------------------------------
  // 8. Persist
  // -----------------------------------------------------------------------
  try {
    await em.flush()
  } catch (err) {
    em.clear()
    throw err
  }
}
