import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-005: Org Isolation UI (US-6.1 through US-6.4)
 *
 * Verifies that agency users only see their own organization's data
 * in the browser, and that the PM can see cross-org data.
 *
 * Demo users (seeded by seedExamples):
 *   - PM:           partnership-manager@demo.local / Demo123!  (sees all orgs)
 *   - Acme Admin:   acme-admin@demo.local / Demo123!           (Acme org only)
 *   - Acme BD:      acme-bd@demo.local / Demo123!              (Acme org only)
 *   - Nordic Admin: nordic-admin@demo.local / Demo123!          (Nordic org only)
 *
 * Source: apps/prm/src/modules/partnerships/setup.ts (seedExamples)
 * Phase: 1
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const ACME_ADMIN_EMAIL = 'acme-admin@demo.local'
const ACME_BD_EMAIL = 'acme-bd@demo.local'
const NORDIC_ADMIN_EMAIL = 'nordic-admin@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

/** Wait for table data to load (not a loading placeholder) then extract row texts. */
async function getTableRowTexts(page: Page): Promise<string[]> {
  // Wait for a data row that does NOT contain "Loading" — proves real data rendered
  const dataRow = page.locator('tbody tr').filter({ hasNotText: /Loading|loading/ })
  await expect(dataRow.first()).toBeVisible({ timeout: 20_000 })
  const count = await dataRow.count()
  const texts: string[] = []
  for (let i = 0; i < count; i++) {
    texts.push(await dataRow.nth(i).textContent() ?? '')
  }
  return texts
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-005: Org Isolation UI (US-6.1 through US-6.4)', () => {
  let acmeToken: string
  let nordicToken: string
  let bdToken: string
  let pmToken: string

  test.beforeAll(async ({ request }) => {
    acmeToken = await getAuthToken(request, ACME_ADMIN_EMAIL, DEMO_PASSWORD)
    nordicToken = await getAuthToken(request, NORDIC_ADMIN_EMAIL, DEMO_PASSWORD)
    bdToken = await getAuthToken(request, ACME_BD_EMAIL, DEMO_PASSWORD)
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: Acme Admin sees only Acme data on deals page
  // -------------------------------------------------------------------------
  test('T1: Acme Admin sees Acme deals, not Nordic/CloudBridge', async ({ page }) => {
    await loginInBrowser(page, acmeToken)
    await page.goto(`${BASE}/backend/customers/deals`)

    // Wait for deals table to load
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })

    const rowTexts = await getTableRowTexts(page)
    expect(rowTexts.length, 'Acme Admin should see at least 1 deal').toBeGreaterThanOrEqual(1)

    // Verify no Nordic or CloudBridge data leaked
    for (const text of rowTexts) {
      expect(text, 'Acme Admin should not see Nordic deals').not.toMatch(/^Nordic:/i)
      expect(text, 'Acme Admin should not see CloudBridge deals').not.toMatch(/^CloudBridge:/i)
    }
  })

  // -------------------------------------------------------------------------
  // T2: Nordic Admin sees only Nordic data on deals page
  // -------------------------------------------------------------------------
  test('T2: Nordic Admin sees Nordic deals, not Acme/CloudBridge', async ({ page }) => {
    await loginInBrowser(page, nordicToken)
    await page.goto(`${BASE}/backend/customers/deals`)

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })

    const rowTexts = await getTableRowTexts(page)
    expect(rowTexts.length, 'Nordic Admin should see at least 1 deal').toBeGreaterThanOrEqual(1)

    // Verify no Acme data leaked
    for (const text of rowTexts) {
      expect(text, 'Nordic Admin should not see Acme deals').not.toMatch(/^Acme:/i)
    }
  })

  // -------------------------------------------------------------------------
  // T3: Acme and Nordic see disjoint companies on companies page
  // -------------------------------------------------------------------------
  test('T3: Acme and Nordic see disjoint company data', async ({ browser }) => {
    // Use two separate browser contexts to avoid cookie collision
    const acmeContext = await browser.newContext()
    const acmePage = await acmeContext.newPage()
    await acmePage.context().addCookies([{ name: 'auth_token', value: acmeToken, url: BASE }])
    await acmePage.goto(`${BASE}/backend/customers/companies`)

    await expect(acmePage.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
    const acmeTexts = await getTableRowTexts(acmePage)
    expect(acmeTexts.length, 'Acme Admin should see at least 1 company').toBeGreaterThanOrEqual(1)
    await acmeContext.close()

    const nordicContext = await browser.newContext()
    const nordicPage = await nordicContext.newPage()
    await nordicPage.context().addCookies([{ name: 'auth_token', value: nordicToken, url: BASE }])
    await nordicPage.goto(`${BASE}/backend/customers/companies`)

    await expect(nordicPage.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
    const nordicTexts = await getTableRowTexts(nordicPage)
    expect(nordicTexts.length, 'Nordic Admin should see at least 1 company').toBeGreaterThanOrEqual(1)
    await nordicContext.close()

    // Verify no overlap in row content
    for (const nordicRow of nordicTexts) {
      for (const acmeRow of acmeTexts) {
        expect(nordicRow, 'Company row content should be disjoint between orgs').not.toBe(acmeRow)
      }
    }
  })

  // -------------------------------------------------------------------------
  // T4: BD sees deals scoped to own org
  // -------------------------------------------------------------------------
  test('T4: BD user sees only own org deals', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/customers/deals`)

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    const count = await rows.count()
    expect(count, 'Acme BD should see at least 1 deal').toBeGreaterThanOrEqual(1)

    // Verify no non-Acme data
    const rowTexts = await getTableRowTexts(page)
    for (const text of rowTexts) {
      expect(text, 'BD should not see Nordic deals').not.toMatch(/^Nordic:/i)
      expect(text, 'BD should not see CloudBridge deals').not.toMatch(/^CloudBridge:/i)
    }
  })

  // -------------------------------------------------------------------------
  // T5: PM sees agencies list with multiple orgs
  // -------------------------------------------------------------------------
  test('T5: PM sees multiple agencies on agencies page', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    // Table should load with agency data
    await expect(page.locator('th:text-is("Agency")').first()).toBeVisible({ timeout: 15_000 })

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const count = await rows.count()
    expect(count, 'PM should see at least 2 agencies').toBeGreaterThanOrEqual(2)

    // Verify known demo agency names are present
    const pageText = await page.locator('tbody').textContent()
    const knownFragments = ['acme', 'nordic', 'cloudbridge']
    const found = knownFragments.filter((f) => pageText?.toLowerCase().includes(f))
    expect(found.length, `Expected at least 2 known agencies, found: ${found.join(', ')}`).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Org isolation UI — Acme/Nordic see disjoint data, PM sees all agencies',
  dependsOnModules: ['partnerships', 'customers', 'auth', 'directory'],
}
