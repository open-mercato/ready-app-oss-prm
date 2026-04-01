import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-035: My WIC page pagination
 *
 * Verifies that the my-wic page paginates results when there are more
 * records than pageSize (20).
 *
 * T1 — Import 25 records → page shows pagination controls
 * T2 — Click Next → page 2 shows remaining records
 *
 * Phase: 2, WF3 WIC
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
const GH_USERNAME = 'carol-acme'
const TEST_MONTH = '2097-11'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-035: My WIC page pagination', () => {
  let pmToken: string
  let adminToken: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    acmeOrgId = getTokenContext(adminToken).organizationId

    // Import 25 records to trigger pagination (pageSize=20)
    const records = Array.from({ length: 25 }, (_, i) => ({
      contributorGithubUsername: GH_USERNAME,
      prId: `PR-PAGE-${Date.now()}-${i}`,
      month: TEST_MONTH,
      featureKey: `feat.pagination.test.${i}`,
      level: 'L2' as const,
      impactBonus: false,
      bountyApplied: false,
      wicScore: 1.0,
    }))

    const res = await apiRequest(request, 'POST', '/api/partnerships/wic/import', {
      token: pmToken,
      data: {
        organizationId: acmeOrgId,
        month: TEST_MONTH,
        source: 'manual_import',
        records,
      },
    })
    expect(res.ok(), `Seeding 25 records should succeed, got ${res.status()}`).toBe(true)
  })

  test('T1: Page shows pagination controls with 25 records', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)
    await expect(page.locator('input[type="month"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('input[type="month"]').fill(TEST_MONTH)

    // Wait for table
    await expect(page.locator('th:text-is("Score")')).toBeVisible({ timeout: 10_000 })

    // Pagination controls should be visible
    await expect(page.locator('text=/Page 1 of/')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('[data-testid="pagination-next"]')).toBeVisible()
    await expect(page.locator('[data-testid="pagination-next"]')).toBeEnabled()
  })

  test('T2: Clicking Next shows page 2', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)
    await expect(page.locator('input[type="month"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('input[type="month"]').fill(TEST_MONTH)

    await expect(page.locator('text=/Page 1 of/')).toBeVisible({ timeout: 10_000 })

    // Click Next
    await page.locator('[data-testid="pagination-next"]').click()

    // Should show Page 2
    await expect(page.locator('text=/Page 2 of/')).toBeVisible({ timeout: 5_000 })

    // Previous button should be enabled
    await expect(page.locator('[data-testid="pagination-prev"]')).toBeEnabled()
  })
})

export const integrationMeta = {
  description: 'My WIC page pagination — controls appear with >20 records, navigation works',
  dependsOnModules: ['partnerships', 'entities', 'auth'],
}
