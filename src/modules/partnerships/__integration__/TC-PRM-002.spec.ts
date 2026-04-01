import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-002: WIP Count KPI Dashboard Widget UI
 *
 * The WIP count widget ("WIP This Month") renders on the agency dashboard
 * and shows the number of deals that entered SQL+ stage in the queried month.
 *
 * T1 — BD user sees dashboard with WIP data rendered
 * T2 — Admin sees dashboard with numeric WIP count
 * T3 — Month navigation buttons are clickable and change content
 *
 * Source: apps/prm/src/modules/partnerships/widgets/dashboard/wip-count/widget.client.tsx
 * Phase: 1
 */

const BD_EMAIL = 'acme-bd@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-002: WIP Count KPI Dashboard Widget UI', () => {
  let bdToken: string
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    bdToken = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
  })

  test('T1: BD user sees dashboard with WIP count and month nav', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend`)

    // Wait for any "Previous month" button — proves month-navigable widget loaded
    const prevButtons = page.locator('button[aria-label="Previous month"]')
    await expect(prevButtons.first()).toBeVisible({ timeout: 20_000 })

    // Dashboard should show at least one large number (WIP or WIC)
    const bigNumbers = page.locator('.text-5xl')
    await expect(bigNumbers.first()).toBeVisible()
  })

  test('T2: Admin sees dashboard with numeric WIP count', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend`)

    // Wait for dashboard widgets to load
    const bigNumbers = page.locator('.text-5xl')
    await expect(bigNumbers.first()).toBeVisible({ timeout: 20_000 })

    // At least one big number should be a valid number
    const firstText = await bigNumbers.first().textContent()
    const parsed = parseFloat(firstText?.trim() ?? '')
    expect(Number.isNaN(parsed), 'Dashboard should show a valid number').toBe(false)
    expect(parsed, 'Number should be non-negative').toBeGreaterThanOrEqual(0)
  })

  test('T3: Month navigation buttons change content', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend`)

    const prevButton = page.locator('button[aria-label="Previous month"]').first()
    await expect(prevButton).toBeVisible({ timeout: 20_000 })

    // Capture page text before clicking
    const beforeText = await page.locator('main').textContent()

    // Click previous month
    await prevButton.click()
    await page.waitForTimeout(2_000)

    // Page content should have changed (different month label at minimum)
    const afterText = await page.locator('main').textContent()
    expect(afterText, 'Content should change after month navigation').not.toBe(beforeText)
  })
})

export const integrationMeta = {
  description: 'WIP Count KPI dashboard widget UI — numeric count, month navigation, per-role visibility',
  dependsOnModules: ['partnerships', 'customers', 'auth', 'dashboards'],
}
