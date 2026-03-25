import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-013: Cross-Org Company Search UI
 *
 * Page: /backend/partnerships/license-deals/create
 * The company search is embedded in the license deal creation flow.
 * Auth: requireFeatures: ['partnerships.manage'] (PM only)
 *
 * Tests:
 * T1 — PM can search companies on create page (results appear)
 * T2 — No results returns "No companies found" message
 * T3 — Short search term (< 2 chars) does not trigger search
 * T4 — Selecting a company shows the attribution form
 * T5 — Non-PM user (contributor) cannot access the create page
 *
 * Source: apps/prm/src/modules/partnerships/backend/partnerships/license-deals/create/page.tsx
 * Phase: 2
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
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

test.describe('TC-PRM-013: Cross-Org Company Search UI', () => {
  let pmToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: PM can search companies — results appear
  // -------------------------------------------------------------------------
  test('T1: PM can search companies and results appear', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals/create`)

    // Search input should be visible
    const searchInput = page.locator('input[type="text"]').first()
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    // Type a search term likely to match demo data
    await searchInput.fill('Demo')

    // Wait for search results to appear (debounced)
    const resultButton = page.locator('button.w-full.text-left').first()
    await expect(resultButton).toBeVisible({ timeout: 10_000 })

    // Verify result has company name and agency name
    const companyName = resultButton.locator('p.font-medium')
    await expect(companyName).toBeVisible()
    const nameText = await companyName.textContent()
    expect(nameText?.trim().length, 'Company name should not be empty').toBeGreaterThan(0)

    // Agency name should also be visible
    const agencyName = resultButton.locator('.text-muted-foreground').first()
    await expect(agencyName).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T2: No results shows empty message
  // -------------------------------------------------------------------------
  test('T2: No results returns "No companies found" message', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals/create`)

    const searchInput = page.locator('input[type="text"]').first()
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    // Type a term that won't match anything
    await searchInput.fill('zzz_nonexistent_99999')

    // Wait for the "no results" message (debounced search)
    await expect(page.locator('text=/No companies found/i')).toBeVisible({ timeout: 10_000 })
  })

  // -------------------------------------------------------------------------
  // T3: Short search term does not trigger search
  // -------------------------------------------------------------------------
  test('T3: Single character does not trigger search', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals/create`)

    const searchInput = page.locator('input[type="text"]').first()
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    // Type a single character
    await searchInput.fill('a')
    await page.waitForTimeout(1_000)

    // No results and no "No companies found" should appear
    const hasResults = await page.locator('button.w-full.text-left').isVisible().catch(() => false)
    const hasNoResults = await page.locator('text=/No companies found/i').isVisible().catch(() => false)
    expect(hasResults || hasNoResults, 'Single char should not trigger search').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T4: Selecting a company shows the form
  // -------------------------------------------------------------------------
  test('T4: Selecting a company shows the attribution form', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals/create`)

    const searchInput = page.locator('input[type="text"]').first()
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    await searchInput.fill('Demo')

    const resultButton = page.locator('button.w-full.text-left').first()
    await expect(resultButton).toBeVisible({ timeout: 10_000 })

    // Click the first result
    await resultButton.click()

    // Attribution form should appear with License Identifier input
    await expect(page.locator('#licenseIdentifier')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#industryTag')).toBeVisible()
    await expect(page.locator('#closedAt')).toBeVisible()

    // "Change" link should be visible to go back to search
    await expect(page.locator('text=/Change/i')).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T5: Non-PM user cannot access create page
  // -------------------------------------------------------------------------
  test('T5: Contributor cannot access license deal create page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals/create`)

    await page.waitForTimeout(3_000)

    // Contributor should not see the search form
    const searchVisible = await page.locator('input[type="text"]').first().isVisible().catch(() => false)
    expect(searchVisible, 'Contributor should not see company search form').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Cross-org company search UI — search results, empty state, short query, form transition, RBAC',
  dependsOnModules: ['partnerships', 'customers', 'directory', 'auth'],
}
