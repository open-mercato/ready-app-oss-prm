import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-032: WIC import accepts wic_score from payload
 *
 * Verifies that the WIC import API stores the wic_score provided in the
 * payload rather than computing it server-side. This allows the external
 * assessment tool (wic_assessment.mjs) to control scoring, including L1
 * sub-levels (0.25 vs 0.5) that the server cannot determine.
 *
 * T1 — Import with explicit wic_score: 0.25 → my-wic table shows 0.25
 * T2 — Import with explicit wic_score: 1.75 (bounty) → table shows 1.75
 * T3 — Import without wic_score → API rejects with 422
 *
 * Phase: 2, WF3 WIC
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
const GH_USERNAME = 'carol-acme'

// Use a far-future month to avoid collisions with other tests
const TEST_MONTH = '2098-06'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-032: WIC import accepts wic_score from payload', () => {
  let pmToken: string
  let adminToken: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    acmeOrgId = getTokenContext(adminToken).organizationId
  })

  test('T1: Import with explicit wic_score 0.25 shows 0.25 in my-wic table', async ({ page, request }) => {
    // Import a record with L1 + no impact bonus + explicit wic_score 0.25
    const res = await apiRequest(request, 'POST', '/api/partnerships/wic/import', {
      token: pmToken,
      data: {
        organizationId: acmeOrgId,
        month: TEST_MONTH,
        source: 'manual_import',
        records: [{
          contributorGithubUsername: GH_USERNAME,
          prId: `PR-SCORE-025-${Date.now()}`,
          month: TEST_MONTH,
          featureKey: 'feat.score.test.025',
          level: 'L1',
          impactBonus: false,
          bountyApplied: false,
          wicScore: 0.25,
        }],
      },
    })
    expect(res.ok(), `Import should succeed, got ${res.status()}`).toBe(true)

    // Navigate to my-wic as admin and set the test month
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)
    await expect(page.locator('input[type="month"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('input[type="month"]').fill(TEST_MONTH)

    // Wait for table to load
    await expect(page.locator('th:text-is("Score")')).toBeVisible({ timeout: 10_000 })

    // Verify the score cell shows 0.25
    const scoreCell = page.locator('td.text-right.tabular-nums').first()
    await expect(scoreCell).toHaveText('0.25')
  })

  test('T2: Import with explicit wic_score 1.75 shows 1.75 in my-wic table', async ({ page, request }) => {
    const testMonth = '2098-07'
    const res = await apiRequest(request, 'POST', '/api/partnerships/wic/import', {
      token: pmToken,
      data: {
        organizationId: acmeOrgId,
        month: testMonth,
        source: 'manual_import',
        records: [{
          contributorGithubUsername: GH_USERNAME,
          prId: `PR-SCORE-175-${Date.now()}`,
          month: testMonth,
          featureKey: 'feat.score.test.175',
          level: 'L2',
          impactBonus: true,
          bountyApplied: true,
          wicScore: 1.75,
        }],
      },
    })
    expect(res.ok(), `Import should succeed, got ${res.status()}`).toBe(true)

    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)
    await expect(page.locator('input[type="month"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('input[type="month"]').fill(testMonth)

    await expect(page.locator('th:text-is("Score")')).toBeVisible({ timeout: 10_000 })

    const scoreCell = page.locator('td.text-right.tabular-nums').first()
    await expect(scoreCell).toHaveText('1.75')
  })

  test('T3: Import without wic_score is rejected with 422', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/wic/import', {
      token: pmToken,
      data: {
        organizationId: acmeOrgId,
        month: '2098-08',
        source: 'manual_import',
        records: [{
          contributorGithubUsername: GH_USERNAME,
          prId: `PR-NOSCORE-${Date.now()}`,
          month: '2098-08',
          featureKey: 'feat.score.missing',
          level: 'L2',
          impactBonus: false,
          bountyApplied: false,
          // wicScore intentionally omitted
        }],
      },
    })
    expect(res.status()).toBe(422)
  })
})

export const integrationMeta = {
  description: 'WIC import accepts wic_score from payload — score passthrough, not server-computed',
  dependsOnModules: ['partnerships', 'entities', 'auth'],
}
