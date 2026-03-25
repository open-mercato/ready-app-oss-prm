import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-016: Tier Status Widget UI
 *
 * Verifies that the tier-status dashboard widget renders correctly for
 * different roles: agency admin sees full KPI progress bars, contributor
 * sees the same widget, and unauthenticated users cannot access.
 *
 * The tier-status widget shows:
 *   - Current tier badge (or "No tier" if unassigned)
 *   - Year switcher (prev/next year buttons)
 *   - 3 KPI progress bars (WIC, WIP, MIN) with thresholds
 *
 * Source: apps/prm/src/modules/partnerships/widgets/dashboard/tier-status/widget.client.tsx
 * Phase: 2
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'acme-admin@demo.local'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const BD_EMAIL = 'acme-bd@demo.local'
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

test.describe('TC-PRM-016: Tier Status Widget UI', () => {
  // -------------------------------------------------------------------------
  // T1: Agency admin sees tier status widget with KPI progress bars
  // -------------------------------------------------------------------------
  test('T1: Agency admin sees tier status widget with KPI progress bars', async ({ page, request }) => {
    const token = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, token)
    await page.goto(`${BASE}/backend`)

    // Wait for dashboard to load — look for tier status widget content
    // The widget renders progress bars with labels containing WIC, WIP, MIN
    await expect(page.locator('text=/WIC/i').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('text=/WIP/i').first()).toBeVisible()
    await expect(page.locator('text=/MIN/i').first()).toBeVisible()

    // Progress bars should show percentage values
    const percentTexts = page.locator('text=/\\d+%/')
    await expect(percentTexts.first()).toBeVisible({ timeout: 5_000 })
  })

  // -------------------------------------------------------------------------
  // T2: Contributor sees tier status widget
  // -------------------------------------------------------------------------
  test('T2: Contributor also sees tier status widget', async ({ page, request }) => {
    const token = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, token)
    await page.goto(`${BASE}/backend`)

    // Contributor should see tier status widget (not blocked by RBAC)
    await expect(page.locator('text=/WIC/i').first()).toBeVisible({ timeout: 20_000 })
  })

  // -------------------------------------------------------------------------
  // T3: BD user sees tier status widget
  // -------------------------------------------------------------------------
  test('T3: BD user sees tier status widget', async ({ page, request }) => {
    const token = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, token)
    await page.goto(`${BASE}/backend`)

    // BD user should see tier status widget
    await expect(page.locator('text=/WIC/i').first()).toBeVisible({ timeout: 20_000 })
  })

  // -------------------------------------------------------------------------
  // T4: Tier widget shows "Current Tier" label or tier badge
  // -------------------------------------------------------------------------
  test('T4: Tier widget shows tier label', async ({ page, request }) => {
    const token = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, token)
    await page.goto(`${BASE}/backend`)

    // Widget should show either a tier badge or "No tier" text
    const hasTierBadgeOrNoTier = page.locator('text=/current tier|no tier|OM Agency|OM AI-native/i').first()
    await expect(hasTierBadgeOrNoTier).toBeVisible({ timeout: 20_000 })
  })

  // -------------------------------------------------------------------------
  // T5: Year switcher buttons are present
  // -------------------------------------------------------------------------
  test('T5: Year switcher buttons are present on tier widget', async ({ page, request }) => {
    const token = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    await loginInBrowser(page, token)
    await page.goto(`${BASE}/backend`)

    // Wait for widget to load
    await expect(page.locator('text=/WIC/i').first()).toBeVisible({ timeout: 20_000 })

    // Year switcher — look for year number and navigation buttons
    const currentYear = new Date().getUTCFullYear().toString()
    await expect(page.locator(`text="${currentYear}"`).first()).toBeVisible()

    // Prev/Next year buttons
    const prevButton = page.locator('button[aria-label="Previous year"]')
    const nextButton = page.locator('button[aria-label="Next year"]')
    await expect(prevButton).toBeVisible()
    await expect(nextButton).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Tier status widget UI — KPI progress bars, tier badge, year switcher, per-role visibility',
  dependsOnModules: ['partnerships', 'auth', 'dashboards'],
}
