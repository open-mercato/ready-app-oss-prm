import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-034: Role-scoped tier status widget
 *
 * Verifies that the tier-status dashboard widget shows different views
 * based on user role:
 * - Contributor: tier badge only (no KPI progress bars)
 * - Admin/BD: full view with KPI progress bars
 *
 * Phase: 2, WF5 Tier Governance
 */

const ADMIN_EMAIL = 'acme-admin@demo.local'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const BD_EMAIL = 'acme-bd@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-034: Role-scoped tier status widget', () => {
  let adminToken: string
  let bdToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
  })

  test('T1: Admin sees full tier widget with KPI progress bars', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend`)

    // Wait for dashboard to load — look for tier badge or tier status text
    const tierWidget = page.locator('text=/Current Tier|Tier Status/i').first()
    await expect(tierWidget).toBeVisible({ timeout: 15_000 })

    // Admin should see KPI progress bars (i18n labels: "WIC Score", "WIP Count", "MIN Count")
    const wicLabel = page.locator('text=/WIC Score/').first()
    const wipLabel = page.locator('text=/WIP Count/').first()
    const minLabel = page.locator('text=/MIN Count/').first()

    // At least one KPI label should be visible for full view
    const hasWic = await wicLabel.isVisible({ timeout: 5_000 }).catch(() => false)
    const hasWip = await wipLabel.isVisible({ timeout: 2_000 }).catch(() => false)
    const hasMin = await minLabel.isVisible({ timeout: 2_000 }).catch(() => false)

    expect(hasWic || hasWip || hasMin, 'Admin should see at least one KPI progress bar').toBe(true)
  })

  test('T2: Contributor sees tier badge but no KPI progress bars', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend`)

    // Wait for dashboard to load
    const tierWidget = page.locator('text=/Current Tier|Tier Status/i').first()
    await expect(tierWidget).toBeVisible({ timeout: 15_000 })

    // Contributor should NOT see tier KPI progress bars (WIP Count, MIN Count).
    // Note: "WIC Score" text may appear from the wic-summary widget — that's expected.
    const wipLabel = page.locator('text=/WIP Count/').first()
    const minLabel = page.locator('text=/MIN Count/').first()

    const hasWip = await wipLabel.isVisible({ timeout: 3_000 }).catch(() => false)
    const hasMin = await minLabel.isVisible({ timeout: 1_000 }).catch(() => false)

    expect(hasWip || hasMin, 'Contributor should NOT see tier KPI progress bars (WIP/MIN)').toBe(false)

    // But tier badge should still be visible
    const tierBadge = page.locator('.rounded-full.bg-primary\\/10').first()
    const hasBadge = await tierBadge.isVisible({ timeout: 3_000 }).catch(() => false)
    // Badge presence depends on whether the agency has a tier assignment
    // If no tier, "No tier" message should be visible instead
    const noTier = page.locator('text=/no tier/i').first()
    const hasNoTier = await noTier.isVisible({ timeout: 2_000 }).catch(() => false)

    expect(hasBadge || hasNoTier, 'Contributor should see tier badge or "no tier" message').toBe(true)
  })

  test('T3: BD sees full tier widget with KPI progress bars', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend`)

    const tierWidget = page.locator('text=/Current Tier|Tier Status/i').first()
    await expect(tierWidget).toBeVisible({ timeout: 15_000 })

    await expect(page.locator('text=/WIP Count/').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=/MIN Count/').first()).toBeVisible()
  })
})

export const integrationMeta = {
  description: 'Role-scoped tier widget — contributor sees badge only, admin sees full KPI view',
  dependsOnModules: ['partnerships', 'auth'],
}
