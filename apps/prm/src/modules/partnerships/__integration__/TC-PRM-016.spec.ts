import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-016: Tier Status Widget API
 *
 * Route: GET /api/partnerships/tier-status
 * Auth:  requireAuth (any authenticated user with org context)
 *
 * Tests:
 * T1 — Agency admin gets tier status with full KPI data + progress
 * T2 — Contributor gets tier status (200, should not 403)
 * T3 — BD user gets tier status (200)
 * T4 — Unauthenticated request returns 401
 *
 * Source: apps/prm/src/modules/partnerships/api/get/tier-status.ts
 * Phase: 2, WF5 Tier Governance
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const CONTRIBUTOR_PASSWORD = 'Demo123!'
const BD_EMAIL = 'acme-bd@demo.local'
const BD_PASSWORD = 'Demo123!'

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
// Shape assertion helper
// ---------------------------------------------------------------------------

function assertTierStatusShape(body: unknown): asserts body is TierStatusResponse {
  expect(typeof body === 'object' && body !== null, 'response body must be an object').toBe(true)
  const b = body as Record<string, unknown>

  // tier: string | null
  expect(
    b.tier === null || typeof b.tier === 'string',
    'tier must be null or a string',
  ).toBe(true)

  // kpis
  expect(typeof b.kpis === 'object' && b.kpis !== null, 'kpis must be an object').toBe(true)
  const kpis = b.kpis as Record<string, unknown>
  expect(typeof kpis.wic, 'kpis.wic must be a number').toBe('number')
  expect(typeof kpis.wip, 'kpis.wip must be a number').toBe('number')
  expect(typeof kpis.min, 'kpis.min must be a number').toBe('number')
  expect(typeof kpis.wicThreshold, 'kpis.wicThreshold must be a number').toBe('number')
  expect(typeof kpis.wipThreshold, 'kpis.wipThreshold must be a number').toBe('number')
  expect(typeof kpis.minThreshold, 'kpis.minThreshold must be a number').toBe('number')

  // gracePeriod, pendingProposal
  expect(typeof b.gracePeriod, 'gracePeriod must be a boolean').toBe('boolean')
  expect(typeof b.pendingProposal, 'pendingProposal must be a boolean').toBe('boolean')

  // progressPercent
  expect(typeof b.progressPercent === 'object' && b.progressPercent !== null, 'progressPercent must be an object').toBe(true)
  const pp = b.progressPercent as Record<string, unknown>
  expect(typeof pp.wic, 'progressPercent.wic must be a number').toBe('number')
  expect(typeof pp.wip, 'progressPercent.wip must be a number').toBe('number')
  expect(typeof pp.min, 'progressPercent.min must be a number').toBe('number')

  // Range checks on progress (0..100)
  expect(pp.wic as number).toBeGreaterThanOrEqual(0)
  expect(pp.wic as number).toBeLessThanOrEqual(100)
  expect(pp.wip as number).toBeGreaterThanOrEqual(0)
  expect(pp.wip as number).toBeLessThanOrEqual(100)
  expect(pp.min as number).toBeGreaterThanOrEqual(0)
  expect(pp.min as number).toBeLessThanOrEqual(100)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-016: Tier Status Widget API', () => {
  // -------------------------------------------------------------------------
  // T1: Agency admin gets tier status with full KPI data
  // -------------------------------------------------------------------------
  test('T1: Agency admin gets tier status with full KPI data + progress', async ({ request }) => {
    const token = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)

    const res = await apiRequest(request, 'GET', '/api/partnerships/tier-status', { token })
    expect(res.status(), 'GET /api/partnerships/tier-status should return 200').toBe(200)

    const body = await readJsonSafe<TierStatusResponse>(res)
    assertTierStatusShape(body)

    // KPI thresholds must be positive (defined by tier-thresholds.ts)
    expect(body.kpis.wicThreshold, 'wicThreshold must be > 0').toBeGreaterThan(0)
    expect(body.kpis.wipThreshold, 'wipThreshold must be > 0').toBeGreaterThan(0)
    expect(body.kpis.minThreshold, 'minThreshold must be > 0').toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // T2: Contributor gets tier status (should not 403)
  // -------------------------------------------------------------------------
  test('T2: Contributor gets tier status (200, not 403)', async ({ request }) => {
    const token = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)

    const res = await apiRequest(request, 'GET', '/api/partnerships/tier-status', { token })
    expect(res.status(), 'Contributor should get 200 for tier-status, not 403').toBe(200)

    const body = await readJsonSafe<TierStatusResponse>(res)
    assertTierStatusShape(body)
  })

  // -------------------------------------------------------------------------
  // T3: BD user gets tier status
  // -------------------------------------------------------------------------
  test('T3: BD user gets tier status (200)', async ({ request }) => {
    const token = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)

    const res = await apiRequest(request, 'GET', '/api/partnerships/tier-status', { token })
    expect(res.status(), 'BD user should get 200 for tier-status').toBe(200)

    const body = await readJsonSafe<TierStatusResponse>(res)
    assertTierStatusShape(body)
  })

  // -------------------------------------------------------------------------
  // T4: Unauthenticated request returns 401
  // -------------------------------------------------------------------------
  test('T4: Unauthenticated request returns 401', async ({ request }) => {
    const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
    const res = await request.get(`${baseUrl}/api/partnerships/tier-status`)
    expect(res.status(), 'Unauthenticated request should return 401').toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Tier status widget API — agency admin, contributor, BD, unauthenticated',
  dependsOnModules: ['partnerships', 'auth'],
}
