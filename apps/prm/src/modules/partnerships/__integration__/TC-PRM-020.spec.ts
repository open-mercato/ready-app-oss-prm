import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-020: License Deals UI
 *
 * Pages:
 *   /backend/partnerships/license-deals          (list)
 *   /backend/partnerships/license-deals/create    (create form)
 *
 * Auth: GET requireFeatures: ['partnerships.license-deals.view'], writes requireFeatures: ['partnerships.license-deals.manage'] (PM only)
 *
 * Tests:
 * T1 — PM can open license deals list
 * T2 — PM can create a license deal via form
 * T3 — Agency Admin sees list but not create action
 * T4 — Contributor cannot access license deals page
 *
 * Phase: 2
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const CONTRIBUTOR_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([
    { name: 'auth_token', value: token, url: BASE },
  ])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-020: License Deals UI', () => {
  let pmToken: string
  let adminToken: string
  let contributorToken: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
    acmeOrgId = getTokenContext(adminToken).organizationId
  })

  // -------------------------------------------------------------------------
  // T1: PM can open license deals list
  // -------------------------------------------------------------------------

  test('T1: PM can open license deals list', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals`)

    // Page title
    await expect(page.locator('text="License Deals"').first()).toBeVisible({ timeout: 15_000 })
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading...'),
      { timeout: 15_000 },
    ).catch(() => {})

    const headerVisible = await page.locator('th:text-is("License ID")').isVisible().catch(() => false)
    const emptyVisible = await page.locator('text="No license deals yet."').isVisible().catch(() => false)
    expect(headerVisible || emptyVisible, 'List page should render either table headers or empty state').toBe(true)

    // "Add License Deal" button visible (scoped to main to avoid sidebar duplicate)
    await expect(page.getByRole('main').getByRole('link', { name: 'Add License Deal' }).first()).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T2: PM can create a license deal via form
  // -------------------------------------------------------------------------

  test('T2: PM can create a license deal via search → select → form', async ({ page, request }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals/create`)

    const ts = Date.now()
    const licenseId = `QA-UI-${ts}`

    await page.getByLabel('Agency / Organization').selectOption({ label: 'Acme Digital' })

    // Step 1: Search for a company
    const searchInput = page.locator('input[type="text"]').first()
    await expect(searchInput).toBeEnabled({ timeout: 15_000 })
    await searchInput.fill('Demo')

    // Wait for search results to appear
    const resultButton = page.locator('button.w-full.text-left').first()
    await expect(resultButton).toBeVisible({ timeout: 10_000 })

    // Click first result to select company
    const companyName = await resultButton.locator('span.font-medium').textContent()
    expect(companyName?.trim().length, 'Company name should not be empty').toBeGreaterThan(0)
    await resultButton.click()

    // Step 2: Fill attribution form (should now be visible)
    await expect(page.locator('#licenseIdentifier')).toBeVisible({ timeout: 5_000 })

    // Verify selected company is shown
    await expect(page.locator('#companySearch')).toHaveValue(companyName!.trim())

    await page.locator('#licenseIdentifier').fill(licenseId)
    await page.locator('#industryTag').fill('fintech')
    await page.locator('#startDate').fill('2098-06-15')
    // Type and Status have defaults (enterprise, won) — no action needed

    // Submit
    await page.locator('button[type="submit"]').click()

    // Should redirect to list page
    const errorEl = page.locator('[class*="destructive"]')
    await expect(async () => {
      const url = page.url()
      const leftCreate = url.includes('/license-deals') && !url.includes('/create')
      const hasError = await errorEl.isVisible().catch(() => false)
      if (hasError) {
        const msg = await errorEl.textContent()
        throw new Error(`Form error: ${msg}`)
      }
      expect(leftCreate, `Expected redirect, still at: ${url}`).toBe(true)
    }).toPass({ timeout: 15_000 })

    // Clean up via API
    const listRes = await apiRequest(request, 'GET', '/api/partnerships/partner-license-deals', { token: pmToken })
    const list = await readJsonSafe<{ items: Array<{ id: string; license_identifier?: string; licenseIdentifier?: string }> }>(listRes)
    const created = list?.items?.find((i) => (i.license_identifier ?? i.licenseIdentifier) === licenseId)
    if (created) {
      await apiRequest(request, 'DELETE', `/api/partnerships/partner-license-deals?id=${created.id}`, { token: pmToken })
    }
  })

  // -------------------------------------------------------------------------
  // T3: Agency Admin sees list but not create action
  // -------------------------------------------------------------------------

  test('T3: Agency Admin sees license deals list without create action', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals`)

    await expect(page.locator('text="License Deals"').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('th:text-is("License ID")')).toBeVisible()

    const addButton = page.getByRole('main').getByRole('link', { name: 'Add License Deal' })
    await expect(addButton).toHaveCount(0)
  })

  // -------------------------------------------------------------------------
  // T4: Contributor cannot access license deals page
  // -------------------------------------------------------------------------

  test('T4: Contributor cannot access license deals page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals`)

    // Contributor lacks view access, so the page should not render the table.
    // The platform either redirects to dashboard, shows forbidden, or shows empty.
    // We verify the table with license deal data is NOT visible.
    const tableHeaders = page.locator('th:text-is("License ID")')

    // Wait a moment for the page to settle
    await page.waitForTimeout(3_000)

    // Table should not be visible (403 handled by platform — redirect or blank)
    const visible = await tableHeaders.isVisible().catch(() => false)
    expect(visible, 'Contributor should not see license deals table').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'License Deals UI — list rendering, create form, contributor RBAC block',
  dependsOnModules: ['partnerships', 'customers', 'auth'],
}
