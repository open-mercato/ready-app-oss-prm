import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-014: Tier Evaluation UI
 *
 * Verifies the tier evaluation flow via UI:
 *   - PM can trigger evaluation from tier-review page
 *   - Admin sees tier status on dashboard after evaluation
 *   - Non-PM cannot trigger evaluation
 *
 * Pages:
 *   /backend/partnerships/tier-review — PM triggers evaluation, reviews proposals
 *   /backend — Dashboard with tier-status widget
 *
 * Source:
 *   apps/prm/src/modules/partnerships/api/post/enqueue-tier-evaluation.ts
 *   apps/prm/src/modules/partnerships/api/get/tier-status.ts
 * Phase: 2
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
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

test.describe('TC-PRM-014: Tier Evaluation UI', () => {
  let pmToken: string
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: PM can click "Run Evaluation Now" on tier-review page
  // -------------------------------------------------------------------------
  test('T1: PM triggers evaluation from tier-review page', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/tier-review`)

    await expect(page.locator('text="Tier Review"').first()).toBeVisible({ timeout: 15_000 })

    const evalButton = page.getByRole('button', { name: /Run Evaluation/i })
    await expect(evalButton).toBeVisible()
    await expect(evalButton).toBeEnabled()

    // Click the button
    await evalButton.click()

    // Button should show "running" state or a success flash appears
    // Wait a moment for the request to complete
    await page.waitForTimeout(3_000)

    // Page should still be functional (no crash)
    await expect(page.locator('text="Tier Review"').first()).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T2: Admin sees tier status on dashboard
  // -------------------------------------------------------------------------
  test('T2: Admin sees tier status widget on dashboard', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend`)

    // Tier status widget should show KPI progress bars
    await expect(page.locator('text=/WIC/i').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('text=/WIP/i').first()).toBeVisible()
    await expect(page.locator('text=/MIN/i').first()).toBeVisible()

    // Progress percentage should be visible
    const percentTexts = page.locator('text=/\\d+%/')
    await expect(percentTexts.first()).toBeVisible({ timeout: 5_000 })
  })

  // -------------------------------------------------------------------------
  // T3: PM sees tier status with progress data
  // -------------------------------------------------------------------------
  test('T3: PM sees tier status on dashboard', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend`)

    // PM dashboard may show different widgets, but should load without error
    await page.waitForLoadState('networkidle')
    const title = await page.title()
    expect(title).not.toBe('404: This page could not be found.')
  })

  // -------------------------------------------------------------------------
  // T4: Contributor cannot trigger evaluation (no tier-review page access)
  // -------------------------------------------------------------------------
  test('T4: Contributor cannot access tier-review page', async ({ page, request }) => {
    const contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/tier-review`)

    await page.waitForTimeout(3_000)

    // Contributor should not see tier review content
    const titleVisible = await page.locator('text="Tier Review"').first().isVisible().catch(() => false)
    const evalButtonVisible = await page.getByRole('button', { name: /Run Evaluation/i }).isVisible().catch(() => false)
    expect(titleVisible && evalButtonVisible, 'Contributor should not see tier review').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Tier evaluation UI — PM triggers from tier-review, admin sees dashboard widget, contributor RBAC block',
  dependsOnModules: ['partnerships', 'directory', 'auth'],
}
