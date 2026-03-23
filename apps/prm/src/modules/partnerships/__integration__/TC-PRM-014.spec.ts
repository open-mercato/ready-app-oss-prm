import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-014: Tier Evaluation — Enqueue + Tier Status API
 *
 * Routes:
 *   POST /api/partnerships/enqueue-tier-evaluation
 *     Auth: requireAuth + requireFeatures: ['partnerships.manage'] (PM only)
 *   GET  /api/partnerships/tier-status
 *     Auth: requireAuth (any authenticated user with org context)
 *
 * Tests:
 * T1 — PM enqueues tier evaluation (200, jobsEnqueued >= 0)
 * T2 — Admin (agency user) gets tier status with expected shape
 * T3 — PM also gets tier status (200)
 * T4 — Non-PM cannot enqueue evaluation (403)
 *
 * Source:
 *   apps/prm/src/modules/partnerships/api/post/enqueue-tier-evaluation.ts
 *   apps/prm/src/modules/partnerships/api/get/tier-status.ts
 * Phase: 2, WF5 Tier Governance
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'

type JsonRecord = Record<string, unknown>

type TierStatusResponse = {
  tier: string | null
  kpis: {
    wic: number
    wip: number
    min: number
    wicThreshold: number
    wipThreshold: number
    minThreshold: number
  }
  gracePeriod: boolean
  pendingProposal: boolean
  progressPercent: {
    wic: number
    wip: number
    min: number
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-014: Tier Evaluation — Enqueue + Tier Status API', () => {
  let pmToken: string
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: PM enqueues tier evaluation
  // -------------------------------------------------------------------------
  test('T1: PM enqueues tier evaluation — returns jobsEnqueued', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/enqueue-tier-evaluation', {
      token: pmToken,
    })

    expect(res.status(), `POST /api/partnerships/enqueue-tier-evaluation should return 200, got ${res.status()}`).toBe(200)

    const body = await readJsonSafe<{ jobsEnqueued: number; message?: string }>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(typeof body!.jobsEnqueued, 'jobsEnqueued must be a number').toBe('number')
    expect(body!.jobsEnqueued, 'jobsEnqueued must be >= 0').toBeGreaterThanOrEqual(0)
  })

  // -------------------------------------------------------------------------
  // T2: Admin (agency user) gets tier status with expected shape
  // -------------------------------------------------------------------------
  test('T2: Admin (agency user) gets tier status with expected shape', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/tier-status', {
      token: adminToken,
    })

    expect(res.status(), 'GET /api/partnerships/tier-status should return 200').toBe(200)

    const body = await readJsonSafe<TierStatusResponse>(res)
    expect(body, 'response body must not be null').not.toBeNull()

    // Tier can be null (no assignment yet) or a string
    expect(
      body!.tier === null || typeof body!.tier === 'string',
      'tier must be null or a string',
    ).toBe(true)

    // KPIs shape
    expect(typeof body!.kpis, 'kpis must be an object').toBe('object')
    expect(typeof body!.kpis.wic, 'kpis.wic must be a number').toBe('number')
    expect(typeof body!.kpis.wip, 'kpis.wip must be a number').toBe('number')
    expect(typeof body!.kpis.min, 'kpis.min must be a number').toBe('number')
    expect(typeof body!.kpis.wicThreshold, 'kpis.wicThreshold must be a number').toBe('number')
    expect(typeof body!.kpis.wipThreshold, 'kpis.wipThreshold must be a number').toBe('number')
    expect(typeof body!.kpis.minThreshold, 'kpis.minThreshold must be a number').toBe('number')

    // Boolean fields
    expect(typeof body!.gracePeriod, 'gracePeriod must be a boolean').toBe('boolean')
    expect(typeof body!.pendingProposal, 'pendingProposal must be a boolean').toBe('boolean')

    // Progress percent shape
    expect(typeof body!.progressPercent, 'progressPercent must be an object').toBe('object')
    expect(typeof body!.progressPercent.wic, 'progressPercent.wic must be a number').toBe('number')
    expect(typeof body!.progressPercent.wip, 'progressPercent.wip must be a number').toBe('number')
    expect(typeof body!.progressPercent.min, 'progressPercent.min must be a number').toBe('number')

    // Progress values should be 0..100
    expect(body!.progressPercent.wic).toBeGreaterThanOrEqual(0)
    expect(body!.progressPercent.wic).toBeLessThanOrEqual(100)
    expect(body!.progressPercent.wip).toBeGreaterThanOrEqual(0)
    expect(body!.progressPercent.wip).toBeLessThanOrEqual(100)
    expect(body!.progressPercent.min).toBeGreaterThanOrEqual(0)
    expect(body!.progressPercent.min).toBeLessThanOrEqual(100)
  })

  // -------------------------------------------------------------------------
  // T3: PM also gets tier status
  // -------------------------------------------------------------------------
  test('T3: PM gets tier status (200)', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/tier-status', {
      token: pmToken,
    })

    expect(res.status(), 'GET /api/partnerships/tier-status for PM should return 200').toBe(200)

    const body = await readJsonSafe<TierStatusResponse>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(typeof body!.kpis, 'kpis must be an object').toBe('object')
    expect(typeof body!.gracePeriod, 'gracePeriod must be a boolean').toBe('boolean')
    expect(typeof body!.pendingProposal, 'pendingProposal must be a boolean').toBe('boolean')
  })

  // -------------------------------------------------------------------------
  // T4: Non-PM cannot enqueue evaluation (403)
  // -------------------------------------------------------------------------
  test('T4: Non-PM (admin) cannot enqueue tier evaluation — 403', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/enqueue-tier-evaluation', {
      token: adminToken,
    })

    expect(res.status(), 'Non-PM user should get 403 for enqueue').toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Tier evaluation — enqueue API (PM-only), tier status API (any auth user)',
  dependsOnModules: ['partnerships', 'directory', 'auth'],
}
