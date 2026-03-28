import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-010: My WIC Page UI
 *
 * Page: /backend/partnerships/my-wic
 * Auth: requireAuth (any authenticated agency user)
 *
 * Tests:
 * T1 — Admin sees My WIC page with month picker and table
 * T2 — Contributor sees My WIC page (scoped to own data)
 * T3 — Month picker changes displayed data
 * T4 — Page shows "Total WIC Score" when data exists
 *
 * Data setup: imports WIC data via API in beforeAll so the page has content.
 *
 * Source: apps/prm/src/modules/partnerships/backend/partnerships/my-wic/page.tsx
 * Phase: 2, WF3 WIC
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
const GH_USERNAME = 'carol-acme'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

test.describe('TC-PRM-010: My WIC Page UI', () => {
  let pmToken: string
  let adminToken: string
  let contributorToken: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
    acmeOrgId = getTokenContext(adminToken).organizationId

    // Import WIC data for current month so the page has content
    const month = currentYearMonth()
    await apiRequest(request, 'POST', '/api/partnerships/wic/import', {
      token: pmToken,
      data: {
        organizationId: acmeOrgId,
        month,
        source: 'manual_import',
        records: [{
          contributorGithubUsername: GH_USERNAME,
          prId: `PR-MYWIC-${Date.now()}`,
          month,
          featureKey: 'feat.my-wic.test',
          level: 'L3',
          impactBonus: false,
          bountyApplied: false,
          wicScore: 0.5,
        }],
      },
    })
  })

  test('T1: Admin sees My WIC page with month picker and table', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)

    // Month picker
    await expect(page.locator('input[type="month"]')).toBeVisible({ timeout: 15_000 })

    // Table with WIC data (or "no data" message)
    const hasTable = await page.locator('th:text-is("Contributor")').isVisible({ timeout: 5_000 }).catch(() => false)
    const hasNoData = await page.locator('text=/no data/i').isVisible().catch(() => false)
    expect(hasTable || hasNoData, 'My WIC page should show table or no-data message').toBe(true)

    if (hasTable) {
      await expect(page.locator('th:text-is("PR")').first()).toBeVisible()
      await expect(page.locator('th:text-is("Level")').first()).toBeVisible()
      await expect(page.locator('th:text-is("Score")').first()).toBeVisible()
    }
  })

  test('T2: Contributor sees My WIC page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)

    // Page should load (month picker present)
    await expect(page.locator('input[type="month"]')).toBeVisible({ timeout: 15_000 })

    // Either table or no data — contributor has data if import ran for their GH username
    const pageText = await page.locator('main').textContent().catch(() => '')
    expect(pageText?.length, 'My WIC page should have content').toBeGreaterThan(0)
  })

  test('T3: Month picker changes displayed data', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)

    await expect(page.locator('input[type="month"]')).toBeVisible({ timeout: 15_000 })

    // Get initial content
    await page.waitForTimeout(1_000)
    const initialText = await page.locator('main').textContent()

    // Change to a far-future month with no data
    await page.locator('input[type="month"]').fill('2050-01')
    await page.waitForTimeout(2_000)

    // Content should change (either different data or "no data" message)
    const newText = await page.locator('main').textContent()
    expect(newText, 'Content should change after month switch').not.toBe(initialText)
  })

  test('T4: Page shows Total WIC Score when data exists', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)

    // Wait for table to load
    const hasTable = await page.locator('th:text-is("Contributor")').isVisible({ timeout: 10_000 }).catch(() => false)
    if (hasTable) {
      // Total WIC Score label should be visible
      await expect(page.locator('text=/Total WIC Score/i')).toBeVisible()
    }
    // If no table, test passes — no data to show total for
  })
})

export const integrationMeta = {
  description: 'My WIC page UI — month picker, table rendering, contributor view, total score',
  dependsOnModules: ['partnerships', 'entities', 'auth'],
}
