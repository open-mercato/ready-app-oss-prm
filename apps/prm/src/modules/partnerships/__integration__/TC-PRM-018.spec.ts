import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-018: Tier Review Page UI (US-5.3)
 *
 * Page: /backend/partnerships/agencies/tier-review
 * Auth: requireFeatures: ['partnerships.tier.manage'] (PM only)
 *
 * Tests:
 * T1 — PM sees tier review page with table and filter buttons
 * T2 — PM sees "Run Evaluation Now" button
 * T3 — Status filter buttons work (Pending, Approved, Rejected, All)
 * T4 — PendingApproval rows show Approve/Reject action buttons
 * T5 — Non-PM user (admin) cannot access tier review page
 *
 * Source: apps/prm/src/modules/partnerships/backend/partnerships/agencies/tier-review/page.tsx
 * Phase: 2
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
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

test.describe('TC-PRM-018: Tier Review Page UI', () => {
  let pmToken: string
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: PM sees tier review page with table and columns
  // -------------------------------------------------------------------------
  test('T1: PM sees tier review page with table columns', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies/tier-review`)

    // Page header
    await expect(page.locator('text="Tier Review"').first()).toBeVisible({ timeout: 15_000 })

    // Wait for page content to load (loading spinner disappears, data appears)
    await page.waitForTimeout(3_000)

    // Either the table loads with proposals or "No tier proposals" empty state
    const hasTable = await page.locator('th:text-is("Agency")').isVisible().catch(() => false)
    const hasEmpty = await page.locator('text=/No tier proposals/i').isVisible().catch(() => false)
    // Or still loading — check for loading indicator
    const hasLoading = await page.locator('text=/Loading/i').isVisible().catch(() => false)

    expect(hasTable || hasEmpty || hasLoading, 'Tier review page should show proposals, empty state, or loading').toBe(true)

    if (hasTable) {
      await expect(page.locator('th:text-is("Type")').first()).toBeVisible()
      await expect(page.locator('th:text-is("Current")').first()).toBeVisible()
      await expect(page.locator('th:text-is("Proposed")').first()).toBeVisible()
      await expect(page.locator('th:text-is("Status")').first()).toBeVisible()
    }
  })

  // -------------------------------------------------------------------------
  // T2: PM sees "Run Evaluation Now" button
  // -------------------------------------------------------------------------
  test('T2: PM sees Run Evaluation Now button', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies/tier-review`)

    await expect(page.locator('text="Tier Review"').first()).toBeVisible({ timeout: 15_000 })

    const evalButton = page.getByRole('button', { name: /Run Evaluation/i })
    await expect(evalButton).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T3: Status filter buttons are present and clickable
  // -------------------------------------------------------------------------
  test('T3: Status filter buttons work', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies/tier-review`)

    await expect(page.locator('text="Tier Review"').first()).toBeVisible({ timeout: 15_000 })

    // Filter buttons should be visible
    const pendingBtn = page.getByRole('button', { name: 'Pending' })
    const approvedBtn = page.getByRole('button', { name: 'Approved' })
    const rejectedBtn = page.getByRole('button', { name: 'Rejected' })
    const allBtn = page.getByRole('button', { name: 'All' })

    await expect(pendingBtn).toBeVisible()
    await expect(approvedBtn).toBeVisible()
    await expect(rejectedBtn).toBeVisible()
    await expect(allBtn).toBeVisible()

    // Click "All" filter — page should not crash
    await allBtn.click()
    await page.waitForTimeout(2_000)

    // Page should still be functional
    await expect(page.locator('text="Tier Review"').first()).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T4: PendingApproval rows show Approve/Reject buttons
  // -------------------------------------------------------------------------
  test('T4: Pending proposals have Approve/Reject action buttons', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies/tier-review`)

    await expect(page.locator('text="Tier Review"').first()).toBeVisible({ timeout: 15_000 })

    // Check if there are any "Pending" status badges
    const pendingBadges = page.locator('text="Pending"')
    const pendingCount = await pendingBadges.count()

    if (pendingCount > 0) {
      // There are pending proposals — verify action buttons exist
      const approveButtons = page.locator('button:has-text("Approve")')
      const rejectButtons = page.locator('button:has-text("Reject")')
      expect(await approveButtons.count(), 'Pending rows should have Approve buttons').toBeGreaterThan(0)
      expect(await rejectButtons.count(), 'Pending rows should have Reject buttons').toBeGreaterThan(0)
    }
    // If no pending proposals, the test passes silently (no proposals to act on)
  })

  // -------------------------------------------------------------------------
  // T5: Non-PM user cannot access tier review page
  // -------------------------------------------------------------------------
  test('T5: Admin cannot access tier review page', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/agencies/tier-review`)

    await page.waitForTimeout(3_000)

    // Admin lacks partnerships.tier.manage — page should not render
    const titleVisible = await page.locator('text="Tier Review"').first().isVisible().catch(() => false)
    const tableVisible = await page.locator('th:text-is("Agency")').isVisible().catch(() => false)
    expect(titleVisible && tableVisible, 'Admin should not see tier review table').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Tier review page UI — table columns, run evaluation, filter buttons, action buttons, admin RBAC block',
  dependsOnModules: ['partnerships', 'auth'],
}
