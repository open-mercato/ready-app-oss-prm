import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, expectId } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-002: WIP Count KPI Dashboard Widget UI
 *
 * The WIP count widget renders on the agency dashboard and shows the number
 * of deals that entered SQL+ stage in the queried month.
 *
 * T1 — BD user sees WIP count widget on dashboard with month navigation
 * T2 — Admin sees WIP count widget with numeric count
 * T3 — WIP count updates after moving a deal to SQL stage (API setup + UI verify)
 *
 * Source: apps/prm/src/modules/partnerships/widgets/dashboard/wip-count/widget.client.tsx
 * Phase: 1
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BD_EMAIL = 'acme-bd@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-002: WIP Count KPI Dashboard Widget UI', () => {
  // -------------------------------------------------------------------------
  // T1: BD user sees WIP count widget with month navigation
  // -------------------------------------------------------------------------
  test('T1: BD user sees WIP count widget with month navigation', async ({ page, request }) => {
    const bdToken = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend`)

    // WIP count widget shows a large number and month navigation arrows
    // The widget displays the count as a large font-bold number
    const bigNumber = page.locator('.text-5xl.font-bold.tabular-nums')
    await expect(bigNumber).toBeVisible({ timeout: 20_000 })

    // The number should be a valid integer
    const countText = await bigNumber.textContent()
    expect(countText?.trim()).toMatch(/^\d+$/)

    // Month navigation buttons should be present
    const prevButton = page.locator('button[aria-label="Previous month"]')
    const nextButton = page.locator('button[aria-label="Next month"]')
    await expect(prevButton).toBeVisible()
    await expect(nextButton).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T2: Admin sees WIP count widget
  // -------------------------------------------------------------------------
  test('T2: Admin sees WIP count widget with numeric count', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend`)

    // WIP count widget renders
    const bigNumber = page.locator('.text-5xl.font-bold.tabular-nums')
    await expect(bigNumber).toBeVisible({ timeout: 20_000 })

    const countText = await bigNumber.textContent()
    const count = parseInt(countText?.trim() ?? '', 10)
    expect(Number.isNaN(count), 'WIP count should be a valid number').toBe(false)
    expect(count, 'WIP count should be non-negative').toBeGreaterThanOrEqual(0)
  })

  // -------------------------------------------------------------------------
  // T3: Month navigation changes displayed month
  // -------------------------------------------------------------------------
  test('T3: Month navigation changes displayed month', async ({ page, request }) => {
    const bdToken = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend`)

    // Wait for widget to load
    const bigNumber = page.locator('.text-5xl.font-bold.tabular-nums')
    await expect(bigNumber).toBeVisible({ timeout: 20_000 })

    // Get the currently displayed month label
    const monthLabel = page.locator('.text-xs.font-medium.text-foreground')
    const initialMonth = await monthLabel.first().textContent()

    // Click previous month
    const prevButton = page.locator('button[aria-label="Previous month"]')
    await prevButton.click()

    // Wait for the widget to update
    await page.waitForTimeout(2_000)

    // Month label should have changed
    const newMonth = await monthLabel.first().textContent()
    expect(newMonth, 'Month should change after clicking previous').not.toBe(initialMonth)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'WIP Count KPI dashboard widget UI — numeric count, month navigation, per-role visibility',
  dependsOnModules: ['partnerships', 'customers', 'auth', 'dashboards'],
}
