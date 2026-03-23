import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, expectId, getTokenContext, deleteGeneralEntityIfExists } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createUserFixture, deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { createCompanyFixture, createDealFixture, deleteEntityIfExists } from '@open-mercato/core/helpers/integration/crmFixtures'

/**
 * TC-PRM-002: WIP Count KPI Dashboard Widget API
 * Source: apps/prm/docs/specs/2026-03-20-ph1-c3-kpi-dashboard-widget.md
 * Tests: GET /api/partnerships/wip-count?month=YYYY-MM
 *
 * The endpoint counts deals whose wip_registered_at falls within the queried
 * UTC month. The WIP stamp is written by the partnerships API interceptor when
 * a deal is first moved to the SQL stage (order >= 3) of the PRM Pipeline.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return YYYY-MM string for the given Date (defaults to now). */
function toYearMonth(date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Return a YYYY-MM string N months ahead of the given date. */
function monthOffset(base: Date, offsetMonths: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offsetMonths, 1))
  return toYearMonth(d)
}

type PipelineRecord = { id: string; name: string }
type StageRecord = { id: string; label?: string; order?: number }

/** Find the seeded "PRM Pipeline" via GET /api/customers/pipelines. */
async function findPrmPipeline(
  request: import('@playwright/test').APIRequestContext,
  token: string,
): Promise<string> {
  const res = await apiRequest(request, 'GET', '/api/customers/pipelines', { token })
  expect(res.ok(), `GET /api/customers/pipelines failed: ${res.status()}`).toBeTruthy()
  const body = await readJsonSafe<{ items?: PipelineRecord[] }>(res)
  const records: PipelineRecord[] = body?.items ?? []
  const pipeline = records.find((p) => p.name === 'PRM Pipeline')
  expect(pipeline, 'PRM Pipeline not found — run yarn initialize to seed defaults').toBeTruthy()
  return pipeline!.id
}

/** Find the first pipeline stage with order >= 3 (SQL stage) in the given pipeline. */
async function findSqlStage(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  pipelineId: string,
): Promise<string> {
  const res = await apiRequest(
    request,
    'GET',
    `/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`,
    { token },
  )
  expect(res.ok(), `GET /api/customers/pipeline-stages failed: ${res.status()}`).toBeTruthy()
  const body = await readJsonSafe<{ items?: StageRecord[] }>(res)
  const stages: StageRecord[] = body?.items ?? []
  // SQL stage has order 3 per the seed definition in setup.ts
  const sqlStage = stages.find((s) => typeof s.order === 'number' && s.order >= 3)
  expect(sqlStage, `No SQL stage (order >= 3) found in pipeline ${pipelineId}`).toBeTruthy()
  return sqlStage!.id
}

/** Find the first pipeline stage with order < 3 (pre-SQL stage) in the given pipeline. */
async function findPreSqlStage(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  pipelineId: string,
): Promise<string> {
  const res = await apiRequest(
    request,
    'GET',
    `/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`,
    { token },
  )
  expect(res.ok(), `GET /api/customers/pipeline-stages failed: ${res.status()}`).toBeTruthy()
  const body = await readJsonSafe<{ items?: StageRecord[] }>(res)
  const stages: StageRecord[] = body?.items ?? []
  const preSqlStage = stages.find((s) => typeof s.order === 'number' && s.order < 3)
  expect(preSqlStage, `No pre-SQL stage (order < 3) found in pipeline ${pipelineId}`).toBeTruthy()
  return preSqlStage!.id
}

/** Create a company fixture and return its id. */
async function createCompany(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  displayName: string,
): Promise<string> {
  const res = await apiRequest(request, 'POST', '/api/customers/companies', { token, data: { displayName } })
  expect(res.ok(), `POST /api/customers/companies failed: ${res.status()}`).toBeTruthy()
  const body = await readJsonSafe<Record<string, unknown>>(res)
  const id = (body?.id ?? body?.entityId ?? body?.companyId) as string | undefined
  return expectId(id, 'Expected company id in response')
}

/** Create a deal fixture linked to a company and return its id. */
async function createDeal(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  title: string,
  companyId: string,
  pipelineId: string,
  pipelineStageId: string,
): Promise<string> {
  const res = await apiRequest(request, 'POST', '/api/customers/deals', {
    token,
    data: { title, companyIds: [companyId], pipelineId, pipelineStageId },
  })
  expect(res.ok(), `POST /api/customers/deals failed: ${res.status()}`).toBeTruthy()
  const body = await readJsonSafe<Record<string, unknown>>(res)
  const id = (body?.dealId ?? body?.id ?? body?.entityId) as string | undefined
  return expectId(id, 'Expected deal id in response')
}

/** Move a deal to a different pipeline stage via PUT. */
async function moveDealToStage(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  dealId: string,
  pipelineStageId: string,
): Promise<void> {
  const res = await apiRequest(request, 'PUT', '/api/customers/deals', {
    token,
    data: { id: dealId, pipelineStageId },
  })
  expect(res.ok(), `PUT /api/customers/deals (id=${dealId}) failed: ${res.status()}`).toBeTruthy()
}

/** Delete a deal by id (best-effort, swallows errors in teardown). */
async function deleteDeal(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  dealId: string | null,
): Promise<void> {
  if (!dealId) return
  try {
    await apiRequest(request, 'DELETE', `/api/customers/deals?id=${encodeURIComponent(dealId)}`, { token })
  } catch {
    // ignore in teardown
  }
}

/** Delete a company by id (best-effort, swallows errors in teardown). */
async function deleteCompany(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  companyId: string | null,
): Promise<void> {
  if (!companyId) return
  try {
    await apiRequest(request, 'DELETE', `/api/customers/companies?id=${encodeURIComponent(companyId)}`, { token })
  } catch {
    // ignore in teardown
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('TC-PRM-002: WIP Count KPI Dashboard Widget API', () => {
  /**
   * T1 — Create 3 deals, move 2 to SQL stage, query for current month.
   * Expected: { count: 2, month: "YYYY-MM" }
   *
   * Note: admin does NOT have partnerships.widgets.wip-count feature.
   * Use admin for setup (create/move deals), BD user for wip-count queries.
   */
  test('T1: counts only deals moved to SQL stage within the queried month', async ({ request }) => {
    let token: string | null = null
    let wipToken: string | null = null
    let pipelineId: string | null = null
    let sqlStageId: string | null = null
    let preSqlStageId: string | null = null
    let companyId: string | null = null
    const dealIds: string[] = []

    try {
      token = await getAuthToken(request, 'admin')
      wipToken = await getAuthToken(request, 'acme-bd@demo.local', 'Demo123!')
      pipelineId = await findPrmPipeline(request, token)
      sqlStageId = await findSqlStage(request, token, pipelineId)
      preSqlStageId = await findPreSqlStage(request, token, pipelineId)

      // Use BD user token for deal creation so deals land in BD user's org
      // (wip-count query scopes by org, so deals must be in the same org)
      companyId = await createCompany(request, wipToken!, `QA TC-PRM-002 T1 Co ${Date.now()}`)
      const ts = Date.now()

      // Create 3 deals, start all at pre-SQL stage
      const deal1 = await createDeal(request, wipToken!, `QA TC-PRM-002 T1 Deal A ${ts}`, companyId, pipelineId, preSqlStageId)
      const deal2 = await createDeal(request, wipToken!, `QA TC-PRM-002 T1 Deal B ${ts}`, companyId, pipelineId, preSqlStageId)
      const deal3 = await createDeal(request, wipToken!, `QA TC-PRM-002 T1 Deal C ${ts}`, companyId, pipelineId, preSqlStageId)
      dealIds.push(deal1, deal2, deal3)

      // Move only 2 deals to SQL stage — triggers wip_registered_at stamp
      await moveDealToStage(request, wipToken!, deal1, sqlStageId)
      await moveDealToStage(request, wipToken!, deal2, sqlStageId)
      // deal3 stays at pre-SQL — no WIP stamp

      const currentMonth = toYearMonth()
      // Use BD user token — has partnerships.widgets.wip-count feature
      const res = await apiRequest(request, 'GET', `/api/partnerships/wip-count?month=${currentMonth}`, { token: wipToken })

      expect(res.ok(), `GET /api/partnerships/wip-count returned ${res.status()}`).toBeTruthy()
      const body = await readJsonSafe<{ count: number; month: string }>(res)
      expect(body, 'Response body must not be null').not.toBeNull()
      expect(body!.count, 'count must be a number').toEqual(expect.any(Number))
      expect(body!.month, 'month field must match queried month').toBe(currentMonth)

      // count must be at least 2 (there may be pre-existing WIP deals from other tests)
      expect(
        body!.count,
        `Expected count >= 2 (the 2 deals we moved to SQL), got ${body!.count}`,
      ).toBeGreaterThanOrEqual(2)
    } finally {
      if (wipToken) {
        for (const id of dealIds) await deleteDeal(request, wipToken, id)
        await deleteCompany(request, wipToken, companyId)
      }
    }
  })

  /**
   * T2 — Create a deal, move to SQL in current month, query for next month.
   * Expected: { count: 0 } (deal not in next month)
   *
   * Note: admin does NOT have partnerships.widgets.wip-count feature.
   * Use admin for setup, BD user for wip-count queries.
   */
  test('T2: deal stamped in current month does not appear in next month count', async ({ request }) => {
    let token: string | null = null
    let wipToken: string | null = null
    let pipelineId: string | null = null
    let sqlStageId: string | null = null
    let preSqlStageId: string | null = null
    let companyId: string | null = null
    let dealId: string | null = null

    try {
      token = await getAuthToken(request, 'admin')
      wipToken = await getAuthToken(request, 'acme-bd@demo.local', 'Demo123!')
      pipelineId = await findPrmPipeline(request, token)
      sqlStageId = await findSqlStage(request, token, pipelineId)
      preSqlStageId = await findPreSqlStage(request, token, pipelineId)

      companyId = await createCompany(request, token, `QA TC-PRM-002 T2 Co ${Date.now()}`)
      dealId = await createDeal(
        request,
        token,
        `QA TC-PRM-002 T2 Deal ${Date.now()}`,
        companyId,
        pipelineId,
        preSqlStageId,
      )

      // Stamp wip_registered_at in current month
      await moveDealToStage(request, token, dealId, sqlStageId)

      // Query for next month — deal should NOT appear
      const nextMonth = monthOffset(new Date(), 1)
      // Use BD user token — has partnerships.widgets.wip-count feature
      const res = await apiRequest(request, 'GET', `/api/partnerships/wip-count?month=${nextMonth}`, { token: wipToken })

      expect(res.ok(), `GET /api/partnerships/wip-count returned ${res.status()}`).toBeTruthy()
      const body = await readJsonSafe<{ count: number; month?: string }>(res)
      expect(body, 'Response body must not be null').not.toBeNull()
      expect(body!.count, `Expected count 0 for next month, got ${body!.count}`).toBe(0)
    } finally {
      if (token) {
        await deleteDeal(request, token, dealId)
        await deleteCompany(request, token, companyId)
      }
    }
  })

  /**
   * T3 — Query without month param.
   * Expected: returns current month's count (not an error).
   *
   * Note: admin does NOT have partnerships.widgets.wip-count feature.
   * Use admin for setup, BD user for wip-count queries.
   */
  test('T3: omitting month param defaults to current month', async ({ request }) => {
    let token: string | null = null
    let wipToken: string | null = null
    let pipelineId: string | null = null
    let sqlStageId: string | null = null
    let preSqlStageId: string | null = null
    let companyId: string | null = null
    let dealId: string | null = null

    try {
      token = await getAuthToken(request, 'admin')
      wipToken = await getAuthToken(request, 'acme-bd@demo.local', 'Demo123!')
      pipelineId = await findPrmPipeline(request, token)
      sqlStageId = await findSqlStage(request, token, pipelineId)
      preSqlStageId = await findPreSqlStage(request, token, pipelineId)

      companyId = await createCompany(request, token, `QA TC-PRM-002 T3 Co ${Date.now()}`)
      dealId = await createDeal(
        request,
        token,
        `QA TC-PRM-002 T3 Deal ${Date.now()}`,
        companyId,
        pipelineId,
        preSqlStageId,
      )

      // Stamp wip_registered_at so we have at least 1 WIP deal this month
      await moveDealToStage(request, token, dealId, sqlStageId)

      // Query without month param — use BD user token (has wip-count feature)
      const resNoMonth = await apiRequest(request, 'GET', '/api/partnerships/wip-count', { token: wipToken })
      expect(resNoMonth.ok(), `GET /api/partnerships/wip-count (no month) returned ${resNoMonth.status()}`).toBeTruthy()
      const bodyNoMonth = await readJsonSafe<{ count: number; month?: string }>(resNoMonth)
      expect(bodyNoMonth, 'Response body must not be null').not.toBeNull()
      expect(typeof bodyNoMonth!.count, 'count must be a number').toBe('number')

      // Query with explicit current month param — results must match
      const currentMonth = toYearMonth()
      const resWithMonth = await apiRequest(request, 'GET', `/api/partnerships/wip-count?month=${currentMonth}`, { token: wipToken })
      expect(resWithMonth.ok(), `GET /api/partnerships/wip-count?month=${currentMonth} returned ${resWithMonth.status()}`).toBeTruthy()
      const bodyWithMonth = await readJsonSafe<{ count: number; month?: string }>(resWithMonth)
      expect(bodyWithMonth, 'Response body must not be null').not.toBeNull()

      expect(
        bodyNoMonth!.count,
        'No-month query must return same count as explicit current-month query',
      ).toBe(bodyWithMonth!.count)
    } finally {
      if (token) {
        await deleteDeal(request, token, dealId)
        await deleteCompany(request, token, companyId)
      }
    }
  })

  /**
   * T4 — Query with invalid month format.
   * Expected: 400 error response.
   *
   * Note: admin does NOT have partnerships.widgets.wip-count feature (would get 403
   * before reaching validation). Use BD user token so the 400 validation is
   * actually exercised.
   */
  test('T4: invalid month format returns 400', async ({ request }) => {
    const wipToken = await getAuthToken(request, 'acme-bd@demo.local', 'Demo123!')

    const invalidMonths = ['2026-3', '2026/03', 'March-2026', 'not-a-date', '2026-00', '2026-13']

    for (const invalid of invalidMonths) {
      const res = await apiRequest(request, 'GET', `/api/partnerships/wip-count?month=${encodeURIComponent(invalid)}`, {
        token: wipToken,
      })
      expect(
        res.status(),
        `Expected 400 for invalid month "${invalid}", got ${res.status()}`,
      ).toBe(400)
    }
  })
})
