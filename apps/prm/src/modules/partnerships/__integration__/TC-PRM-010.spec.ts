import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenScope, getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-010: WIC Score Display
 *
 * Route: GET /api/partnerships/wic-scores
 * Auth:  requireAuth (no specific feature required)
 * Query: ?month=YYYY-MM&organizationId=UUID (both optional)
 *
 * Tests:
 * T1 — PM sees all org scores after import
 * T2 — Contributor sees only own scores
 * T3 — Month filter works (querying empty month returns 0)
 *
 * Source: apps/prm/src/modules/partnerships/api/get/wic-scores.ts
 * Phase: 2, WF3 WIC
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const CONTRIBUTOR_PASSWORD = 'Demo123!'

type WicScoreRecord = {
  recordId: string
  contributorGithubUsername: string
  prId: string
  month: string
  featureKey: string
  level: string
  impactBonus: boolean
  bountyApplied: boolean
  wicScore: number
  assessmentSource: string
}

type WicScoresResponse = {
  records: WicScoreRecord[]
  month: string
  totalWicScore: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set a GH username on a user via entities/records PUT. */
async function setGhUsername(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  userId: string,
  username: string,
): Promise<void> {
  const res = await apiRequest(request, 'PUT', '/api/entities/records', {
    token,
    data: {
      entityId: 'auth:user',
      recordId: userId,
      values: { github_username: username },
    },
  })
  expect(
    res.ok(),
    `PUT /api/entities/records (set GH username) failed: ${res.status()} — user ${userId}`,
  ).toBeTruthy()
}

/** Import WIC data for a contributor, returns assessmentId. */
async function importWicData(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  opts: {
    organizationId: string
    month: string
    ghUsername: string
    prId: string
    featureKey: string
  },
): Promise<string> {
  const res = await apiRequest(request, 'POST', '/api/partnerships/wic/import', {
    token,
    data: {
      organizationId: opts.organizationId,
      month: opts.month,
      source: 'manual_import',
      records: [
        {
          contributorGithubUsername: opts.ghUsername,
          prId: opts.prId,
          month: opts.month,
          featureKey: opts.featureKey,
          level: 'L3',
          impactBonus: false,
          bountyApplied: false,
        },
      ],
    },
  })
  expect(res.ok(), `WIC import failed: ${res.status()}`).toBeTruthy()
  const body = await readJsonSafe<{ assessmentId: string }>(res)
  return body!.assessmentId
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-010: WIC Score Display', () => {
  // Use a unique month per test suite run to avoid collisions
  const DISPLAY_MONTH = '2098-06'
  const GH_USERNAME = `qa-display-${Date.now()}`

  let pmToken: string
  let adminToken: string
  let contributorToken: string
  let contributorUserId: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
    contributorUserId = getTokenScope(contributorToken).userId
    acmeOrgId = getTokenContext(adminToken).organizationId

    // Set GH username on contributor
    await setGhUsername(request, adminToken, contributorUserId, GH_USERNAME)

    // Import WIC data so there's something to display
    await importWicData(request, pmToken, {
      organizationId: acmeOrgId,
      month: DISPLAY_MONTH,
      ghUsername: GH_USERNAME,
      prId: 'PR-DISPLAY-001',
      featureKey: 'feat.display.test',
    })
  })

  // -------------------------------------------------------------------------
  // T1: PM sees all org scores
  // -------------------------------------------------------------------------
  test('T1: PM sees all org scores after import', async ({ request }) => {
    const res = await apiRequest(
      request,
      'GET',
      `/api/partnerships/wic-scores?month=${DISPLAY_MONTH}&organizationId=${encodeURIComponent(acmeOrgId)}`,
      { token: pmToken },
    )
    expect(res.ok(), `GET /api/partnerships/wic-scores failed: ${res.status()}`).toBeTruthy()

    const body = await readJsonSafe<WicScoresResponse>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(body!.records.length, 'PM should see at least 1 record').toBeGreaterThanOrEqual(1)
    expect(body!.totalWicScore, 'totalWicScore should be > 0').toBeGreaterThan(0)
    expect(body!.month, 'month field must match query').toBe(DISPLAY_MONTH)

    // Verify record structure
    for (const record of body!.records) {
      expect(typeof record.recordId, 'recordId must be a string').toBe('string')
      expect(typeof record.contributorGithubUsername, 'contributorGithubUsername must be a string').toBe('string')
      expect(typeof record.prId, 'prId must be a string').toBe('string')
      expect(typeof record.month, 'month must be a string').toBe('string')
      expect(typeof record.featureKey, 'featureKey must be a string').toBe('string')
      expect(typeof record.level, 'level must be a string').toBe('string')
      expect(typeof record.impactBonus, 'impactBonus must be a boolean').toBe('boolean')
      expect(typeof record.bountyApplied, 'bountyApplied must be a boolean').toBe('boolean')
      expect(typeof record.wicScore, 'wicScore must be a number').toBe('number')
      expect(typeof record.assessmentSource, 'assessmentSource must be a string').toBe('string')
    }
  })

  // -------------------------------------------------------------------------
  // T2: Contributor sees only own scores
  // -------------------------------------------------------------------------
  test('T2: Contributor sees only own scores', async ({ request }) => {
    const res = await apiRequest(
      request,
      'GET',
      `/api/partnerships/wic-scores?month=${DISPLAY_MONTH}`,
      { token: contributorToken },
    )
    expect(res.ok(), `GET /api/partnerships/wic-scores (contributor) failed: ${res.status()}`).toBeTruthy()

    const body = await readJsonSafe<WicScoresResponse>(res)
    expect(body, 'response body must not be null').not.toBeNull()

    // Contributor should see only records matching their GH username
    // If the contributor has WIC data, all records must belong to them
    for (const record of body!.records) {
      expect(
        record.contributorGithubUsername,
        `Contributor should only see own records, found: ${record.contributorGithubUsername}`,
      ).toBe(GH_USERNAME)
    }
  })

  // -------------------------------------------------------------------------
  // T3: Month filter works
  // -------------------------------------------------------------------------
  test('T3: Querying an empty month returns 0 records', async ({ request }) => {
    // Query a month with no data
    const emptyMonth = '2025-01'
    const res = await apiRequest(
      request,
      'GET',
      `/api/partnerships/wic-scores?month=${emptyMonth}&organizationId=${encodeURIComponent(acmeOrgId)}`,
      { token: pmToken },
    )
    expect(res.ok(), `GET /api/partnerships/wic-scores (empty month) failed: ${res.status()}`).toBeTruthy()

    const body = await readJsonSafe<WicScoresResponse>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(body!.records.length, 'Empty month should have 0 records').toBe(0)
    expect(body!.totalWicScore, 'Empty month totalWicScore should be 0').toBe(0)
    expect(body!.month, 'month field must match query').toBe(emptyMonth)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'WIC Score Display — org scoping, role filtering, month filter (GET /api/partnerships/wic-scores)',
  dependsOnModules: ['partnerships', 'entities', 'auth'],
}
