import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-013: Cross-Org Company Search UI
 *
 * Page: /backend/partnerships/license-deals/create
 * The company search is embedded in the license deal creation flow.
 * Auth: GET requireFeatures: ['partnerships.license-deals.view'], writes requireFeatures: ['partnerships.license-deals.manage'] (PM only)
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

const PM_EMAIL = 'partnership-manager@demo.local'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
const CREATE_URL = `${BASE}/backend/partnerships/license-deals/create`

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

/** Navigate to create page, select an agency, and wait for enabled search input. */
async function gotoCreatePage(page: Page, token: string): Promise<void> {
  await loginInBrowser(page, token)
  await page.goto(CREATE_URL)

  await page.getByLabel('Agency / Organization').selectOption({ label: 'Acme Digital' })
  const searchInput = page.locator('input[type="text"]').first()
  await expect(searchInput).toBeEnabled({ timeout: 15_000 })
}

test.describe('TC-PRM-013: Cross-Org Company Search UI', () => {
  let pmToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
  })

  test('T1: PM can search companies and results appear', async ({ page }) => {
    await gotoCreatePage(page, pmToken)

    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill('Demo')

    const resultButton = page.locator('button.w-full.text-left').first()
    await expect(resultButton).toBeVisible({ timeout: 10_000 })

    const companyName = resultButton.locator('span.font-medium')
    await expect(companyName).toBeVisible()
    const nameText = await companyName.textContent()
    expect(nameText?.trim().length, 'Company name should not be empty').toBeGreaterThan(0)
  })

  test('T2: No results returns "No companies found" message', async ({ page }) => {
    await gotoCreatePage(page, pmToken)

    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill('zzz_nonexistent_99999')

    await expect(page.locator('text=/No companies found/i')).toBeVisible({ timeout: 10_000 })
  })

  test('T3: Single character does not trigger search', async ({ page }) => {
    await gotoCreatePage(page, pmToken)

    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill('a')
    await page.waitForTimeout(1_000)

    const hasResults = await page.locator('button.w-full.text-left').isVisible().catch(() => false)
    const hasNoResults = await page.locator('text=/No companies found/i').isVisible().catch(() => false)
    expect(hasResults || hasNoResults, 'Single char should not trigger search').toBe(false)
  })

  test('T4: Selecting a company shows the attribution form', async ({ page }) => {
    await gotoCreatePage(page, pmToken)

    const searchInput = page.locator('input[type="text"]').first()
    await searchInput.fill('Demo')

    const resultButton = page.locator('button.w-full.text-left').first()
    await expect(resultButton).toBeVisible({ timeout: 10_000 })
    await resultButton.click()

    await expect(page.locator('#licenseIdentifier')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#industryTag')).toBeVisible()
    await expect(page.locator('#startDate')).toBeVisible()
    await expect(page.locator('#endDate')).toBeVisible()
  })

  test('T5: Contributor cannot access license deal create page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(CREATE_URL)
    await page.waitForTimeout(3_000)

    const searchVisible = await page.locator('input[type="text"]').first().isVisible().catch(() => false)
    expect(searchVisible, 'Contributor should not see company search form').toBe(false)
  })
})

export const integrationMeta = {
  description: 'Cross-org company search UI — search results, empty state, short query, form transition, RBAC',
  dependsOnModules: ['partnerships', 'customers', 'directory', 'auth'],
}
