import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-021: Agencies List + Change Tier UI
 *
 * Page: /backend/partnerships/agencies
 * Auth: requireFeatures: ['partnerships.agencies.manage'] (PM only)
 *
 * Tests:
 * T1 — PM sees agencies list with tier column
 * T2 — PM can change agency tier via dialog
 * T3 — Contributor cannot access agencies page
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

test.describe.serial('TC-PRM-021: Agencies List + Change Tier UI', () => {
  let pmToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: PM sees agencies list with tier column
  // -------------------------------------------------------------------------

  test('T1: PM sees agencies list with tier column and Change Tier buttons', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    // Page title
    await expect(page.locator('text="Agencies"').first()).toBeVisible({ timeout: 15_000 })

    // Table headers
    await expect(page.locator('th:text-is("Agency")')).toBeVisible()
    await expect(page.locator('th:has-text("Current Tier")')).toBeVisible()
    await expect(page.locator('th:text-is("Admin Email")')).toBeVisible()

    // Demo data: at least 3 agencies
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const count = await rows.count()
    expect(count, 'Demo data should have at least 3 agencies').toBeGreaterThanOrEqual(3)

    // Each row should have a "Change Tier" button
    const changeTierButtons = page.locator('button:has-text("Change Tier")')
    const buttonCount = await changeTierButtons.count()
    expect(buttonCount, 'Each agency should have a Change Tier button').toBeGreaterThanOrEqual(3)

    // Tier column should show tier values (at least one non-empty)
    const tierCells = rows.locator('td:nth-child(2)')
    const firstTier = await tierCells.first().textContent()
    expect(firstTier?.trim().length, 'Tier column should have content').toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // T2: PM can change agency tier via dialog
  // -------------------------------------------------------------------------

  test('T2: PM can change agency tier via dialog', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    // Wait for table to load
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    // Remember first agency's current tier
    const firstRow = page.locator('tbody tr').first()
    const agencyName = await firstRow.locator('td').first().textContent()
    expect(agencyName?.trim().length).toBeGreaterThan(0)

    // Click "Change Tier" on first agency
    await firstRow.locator('button:has-text("Change Tier")').click()

    // Dialog should open
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Dialog title should contain the agency name
    await expect(dialog.locator('h2, [class*="DialogTitle"]')).toContainText(agencyName!.trim())

    // Tier select should be visible with options
    const tierSelect = dialog.locator('select')
    await expect(tierSelect).toBeVisible()
    const options = await tierSelect.locator('option').allTextContents()
    expect(options.length, 'Tier select should have tier options').toBeGreaterThanOrEqual(2)

    // Select a different tier
    const currentValue = await tierSelect.inputValue()
    const newTier = options.find((o) => o.trim() !== currentValue.trim() && o.trim().length > 0)
    expect(newTier, 'Should have at least one different tier to select').toBeTruthy()
    await tierSelect.selectOption({ label: newTier! })

    // Fill reason (required)
    const reasonField = dialog.locator('textarea')
    await expect(reasonField).toBeVisible()
    await reasonField.fill('QA test tier change')

    // Submit
    await dialog.locator('button[type="submit"]').click()

    // Dialog should close
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    // Table should show updated tier for the first agency
    await page.waitForTimeout(1_000) // wait for refresh
    const updatedTier = await page.locator('tbody tr').first().locator('td:nth-child(2)').textContent()
    expect(updatedTier?.trim(), 'Tier should be updated in the table').toBe(newTier!.trim())
  })

  // -------------------------------------------------------------------------
  // T3: Contributor cannot access agencies page
  // -------------------------------------------------------------------------

  test('T3: Contributor cannot access agencies page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    // Contributor lacks partnerships.agencies.manage — page should not render agency data.
    const tableHeaders = page.locator('th:text-is("Agency")')

    await page.waitForTimeout(3_000)

    const visible = await tableHeaders.isVisible().catch(() => false)
    expect(visible, 'Contributor should not see agencies table').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Agencies list UI — tier column, Change Tier dialog, contributor RBAC block',
  dependsOnModules: ['partnerships', 'auth'],
}
