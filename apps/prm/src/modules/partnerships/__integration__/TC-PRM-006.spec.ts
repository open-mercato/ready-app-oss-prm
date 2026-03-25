import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-006: Agencies Page UI (US-2.3 PM view)
 *
 * Page: /backend/partnerships/agencies
 * Auth: requireFeatures: ['partnerships.manage'] (PM only)
 *
 * Tests:
 * T1 — PM sees agencies table with correct columns and demo data
 * T2 — PM sees "Add Agency" button
 * T3 — Agency rows show KPI data (WIP column)
 * T4 — Agency list excludes PM's home org (no "Open Mercato" row)
 * T5 — Non-PM user (BD) cannot access agencies page
 * T6 — Each agency row has a "Change Tier" button
 *
 * Source: apps/prm/src/modules/partnerships/backend/partnerships/agencies/page.tsx
 * Phase: 2
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
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

test.describe('TC-PRM-006: Agencies Page UI', () => {
  let pmToken: string
  let bdToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: PM sees agencies table with correct columns
  // -------------------------------------------------------------------------
  test('T1: PM sees agencies table with correct columns and demo data', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    // Table headers
    await expect(page.locator('th:text-is("Agency")').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('th:text-is("Admin Email")').first()).toBeVisible()
    await expect(page.locator('th:has-text("WIP")').first()).toBeVisible()
    await expect(page.locator('th:text-is("Created")').first()).toBeVisible()
    await expect(page.locator('th:has-text("Current Tier")').first()).toBeVisible()

    // Demo data — at least 1 agency row
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const count = await rows.count()
    expect(count, 'Demo data should have at least 1 agency').toBeGreaterThanOrEqual(1)
  })

  // -------------------------------------------------------------------------
  // T2: PM sees "Add Agency" button
  // -------------------------------------------------------------------------
  test('T2: PM sees Add Agency button', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    await expect(page.locator('th:text-is("Agency")').first()).toBeVisible({ timeout: 15_000 })

    const addButton = page.getByRole('button', { name: 'Add Agency' })
    await expect(addButton).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T3: Agency rows show WIP numbers
  // -------------------------------------------------------------------------
  test('T3: Agency rows contain WIP count data', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // WIP column cells should contain numeric values (tabular-nums class)
    const wipCells = page.locator('tbody tr td.tabular-nums, tbody tr td:has(.tabular-nums)')
    const firstWipCell = wipCells.first()
    await expect(firstWipCell).toBeVisible()
    const text = await firstWipCell.textContent()
    // Should be a numeric value
    expect(text?.trim()).toMatch(/^\d+$/)
  })

  // -------------------------------------------------------------------------
  // T4: Agency list excludes PM's home org
  // -------------------------------------------------------------------------
  test('T4: Agency list does not include Open Mercato (PM home org)', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    const bodyText = await page.locator('tbody').textContent()
    expect(
      bodyText?.toLowerCase().includes('open mercato'),
      'PM home org "Open Mercato" should not appear in agencies list',
    ).toBe(false)
  })

  // -------------------------------------------------------------------------
  // T5: Non-PM user cannot access agencies page
  // -------------------------------------------------------------------------
  test('T5: BD user cannot access agencies page', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    await page.waitForTimeout(3_000)

    // BD lacks partnerships.manage — table should not render
    const tableVisible = await page.locator('th:text-is("Agency")').isVisible().catch(() => false)
    expect(tableVisible, 'BD should not see agencies table').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T6: Each agency row has "Change Tier" button
  // -------------------------------------------------------------------------
  test('T6: Each agency row has a Change Tier button', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    const changeTierButtons = page.locator('tbody tr').locator('button:has-text("Change Tier")')
    const rows = page.locator('tbody tr')
    const rowCount = await rows.count()
    const buttonCount = await changeTierButtons.count()

    expect(buttonCount, 'Each agency row should have a Change Tier button').toBe(rowCount)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Agencies page UI — table rendering, columns, PM access, BD rejected, tier change buttons',
  dependsOnModules: ['partnerships', 'auth', 'directory'],
}
