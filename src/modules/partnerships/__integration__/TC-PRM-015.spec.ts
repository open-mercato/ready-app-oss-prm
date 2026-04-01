import { expect, test } from '@playwright/test'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-015: Cron Trigger API
 *
 * Routes:
 *   POST /api/partnerships/trigger-monthly-evaluation
 *     Auth: x-api-key header matching CRON_SECRET env var (not user auth)
 *   POST /api/partnerships/trigger-wic-import
 *     Auth: x-api-key header matching CRON_SECRET env var (not user auth)
 *
 * Tests:
 * T1 — Missing API key rejected (401)
 * T2 — Wrong API key rejected (401)
 * T3 — WIC import trigger without key rejected (401)
 * T4 — WIC import trigger with wrong key rejected (401)
 *
 * Note: CRON_SECRET is not set in the ephemeral test env, so valid-key tests
 * cannot pass unless the env is configured. We focus on the rejection path
 * (missing/wrong key) which is deterministic regardless of CRON_SECRET value.
 *
 * Source:
 *   apps/prm/src/modules/partnerships/api/post/trigger-monthly-evaluation.ts
 *   apps/prm/src/modules/partnerships/api/post/trigger-wic-import.ts
 * Phase: 2, WF5 Tier Governance
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

// ---------------------------------------------------------------------------
// Tests — Monthly Evaluation Trigger
// ---------------------------------------------------------------------------

test.describe('TC-PRM-015: Cron Trigger — Monthly Evaluation', () => {
  // -------------------------------------------------------------------------
  // T1: Missing API key rejected (401)
  // -------------------------------------------------------------------------
  test('T1: Missing x-api-key header rejected with 401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/partnerships/trigger-monthly-evaluation`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    })

    expect(res.status(), 'Missing x-api-key should return 401').toBe(401)

    const body = await readJsonSafe<{ error: string }>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(body!.error, 'error must be "Unauthorized"').toBe('Unauthorized')
  })

  // -------------------------------------------------------------------------
  // T2: Wrong API key rejected (401)
  // -------------------------------------------------------------------------
  test('T2: Wrong x-api-key header rejected with 401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/partnerships/trigger-monthly-evaluation`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'definitely-wrong-key-12345',
      },
      data: {},
    })

    expect(res.status(), 'Wrong x-api-key should return 401').toBe(401)

    const body = await readJsonSafe<{ error: string }>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(body!.error, 'error must be "Unauthorized"').toBe('Unauthorized')
  })
})

// ---------------------------------------------------------------------------
// Tests — WIC Import Trigger
// ---------------------------------------------------------------------------

test.describe('TC-PRM-015: Cron Trigger — WIC Import', () => {
  // -------------------------------------------------------------------------
  // T3: Missing API key rejected (401)
  // -------------------------------------------------------------------------
  test('T3: WIC import trigger — missing x-api-key rejected with 401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/partnerships/trigger-wic-import`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    })

    expect(res.status(), 'Missing x-api-key should return 401').toBe(401)

    const body = await readJsonSafe<{ error: string }>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(body!.error, 'error must be "Unauthorized"').toBe('Unauthorized')
  })

  // -------------------------------------------------------------------------
  // T4: Wrong API key rejected (401)
  // -------------------------------------------------------------------------
  test('T4: WIC import trigger — wrong x-api-key rejected with 401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/partnerships/trigger-wic-import`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'definitely-wrong-key-67890',
      },
      data: {},
    })

    expect(res.status(), 'Wrong x-api-key should return 401').toBe(401)

    const body = await readJsonSafe<{ error: string }>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(body!.error, 'error must be "Unauthorized"').toBe('Unauthorized')
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Cron trigger API — x-api-key auth, missing/wrong key rejection',
  dependsOnModules: ['partnerships'],
}
