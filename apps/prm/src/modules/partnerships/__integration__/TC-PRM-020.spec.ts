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
 * Auth: requireFeatures: ['partnerships.license-deals.manage'] (PM only)
 *
 * Tests:
 * T1 — PM sees license deals list with demo data
 * T2 — PM can create a license deal via form
 * T3 — Contributor cannot access license deals page
 *
 * Phase: 2
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
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
  let contributorToken: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
    acmeOrgId = getTokenContext(
      await getAuthToken(request, 'acme-admin@demo.local', 'Demo123!'),
    ).organizationId
  })

  // -------------------------------------------------------------------------
  // T1: PM sees license deals list with demo data
  // -------------------------------------------------------------------------

  test('T1: PM sees license deals list with demo data', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals`)

    // Page title
    await expect(page.locator('text="License Deals"').first()).toBeVisible({ timeout: 15_000 })

    // Table headers
    await expect(page.locator('th:text-is("License ID")')).toBeVisible()
    await expect(page.locator('th:text-is("Year")')).toBeVisible()
    await expect(page.locator('th:text-is("Status")')).toBeVisible()

    // Demo data should have seeded license deals — at least one row
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const count = await rows.count()
    expect(count, 'Demo data should contain at least 1 license deal').toBeGreaterThanOrEqual(1)

    // "Add License Deal" button visible (scoped to main to avoid sidebar duplicate)
    await expect(page.getByRole('main').getByRole('link', { name: 'Add License Deal' })).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T2: PM can create a license deal via form
  // -------------------------------------------------------------------------

  test('T2: PM can create a license deal via form', async ({ page, request }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals/create`)

    // Wait for form to load (agency select should have options)
    await expect(page.locator('select').first()).toBeVisible({ timeout: 15_000 })

    // Fill the form
    const ts = Date.now()
    const licenseId = `QA-UI-${ts}`

    // Select first agency (id="organizationId")
    const agencySelect = page.locator('#organizationId')
    await agencySelect.waitFor({ state: 'visible' })
    // Wait for agency options to load beyond the placeholder
    await expect(agencySelect.locator('option')).not.toHaveCount(1, { timeout: 10_000 })
    const options = await agencySelect.locator('option').allTextContents()
    const firstAgencyOption = options.find((o) => o !== 'Select an agency...' && o.trim() !== '')
    expect(firstAgencyOption, 'Agency select must have at least one agency option').toBeTruthy()
    await agencySelect.selectOption({ label: firstAgencyOption! })

    // Company ID — get a valid UUID from Acme's org via company search API
    const searchRes = await apiRequest(
      request, 'GET',
      '/api/partnerships/company-search?q=Demo',
      { token: pmToken },
    )
    const searchBody = await readJsonSafe<{ results: Array<{ companyId: string }> }>(searchRes)
    const companyId = searchBody?.results?.[0]?.companyId
    expect(companyId, 'Company search must return at least one result').toBeTruthy()
    await page.locator('#companyId').fill(companyId!)

    // License Identifier
    await page.locator('#licenseIdentifier').fill(licenseId)

    // Industry Tag
    await page.locator('#industryTag').fill('fintech')

    // Closed Date
    await page.locator('#closedAt').fill('2098-06-15')

    // Type and Status have defaults (enterprise, won) — no action needed

    // Submit
    await page.locator('button[type="submit"]').click()

    // Check for form error first — if visible, fail with its message
    const errorEl = page.locator('.text-destructive, [class*="error"]')
    const submitBtn = page.locator('button[type="submit"]')

    // Wait for either: navigation away from /create, or error message, or button re-enables
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
  // T3: Contributor cannot access license deals page
  // -------------------------------------------------------------------------

  test('T3: Contributor cannot access license deals page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals`)

    // Contributor lacks partnerships.license-deals.manage — page should not render the table.
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
