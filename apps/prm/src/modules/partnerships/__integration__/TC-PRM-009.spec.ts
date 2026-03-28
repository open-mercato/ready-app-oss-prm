import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-009: WIC Import Page UI
 *
 * Page: /backend/partnerships/wic-import
 * Auth: requireFeatures: ['partnerships.wic.import'] (PM only)
 *
 * Tests:
 * T1 — PM sees import form with agency select, month picker, JSON textarea
 * T2 — PM can submit valid JSON and sees success message
 * T3 — PM submits invalid JSON and sees error message
 * T4 — PM submits with unmatched GH username and sees error
 * T5 — Non-PM user (admin) cannot access WIC import page
 *
 * Source: apps/prm/src/modules/partnerships/backend/partnerships/wic-import/page.tsx
 * Phase: 2, WF3 WIC
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
const GH_USERNAME = 'carol-acme'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-009: WIC Import Page UI', () => {
  let pmToken: string
  let adminToken: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    acmeOrgId = getTokenContext(adminToken).organizationId
  })

  test('T1: PM sees import form with agency select, month picker, JSON textarea', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/wic-import`)

    // Agency select
    await expect(page.locator('#wic-org')).toBeVisible({ timeout: 15_000 })
    const options = await page.locator('#wic-org option').count()
    expect(options, 'Agency select should have at least 1 option').toBeGreaterThanOrEqual(1)

    // Month picker
    await expect(page.locator('#wic-month')).toBeVisible()

    // JSON textarea
    await expect(page.locator('#wic-json')).toBeVisible()

    // Import button
    await expect(page.locator('button:has-text("Import")')).toBeVisible()
  })

  test('T2: PM submits valid JSON and sees success message', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/wic-import`)
    await expect(page.locator('#wic-json')).toBeVisible({ timeout: 15_000 })

    const month = '2098-01'
    await page.locator('#wic-month').fill(month)

    const json = JSON.stringify([{
      contributorGithubUsername: GH_USERNAME,
      prId: `PR-UI-${Date.now()}`,
      month,
      featureKey: 'feat.ui.import.test',
      level: 'L2',
      impactBonus: false,
      bountyApplied: false,
      wicScore: 1.0,
    }])

    await page.locator('#wic-json').fill(json)
    await page.locator('button:has-text("Import")').click()

    // Success message should appear
    await expect(page.locator('text=/Imported \\d+ record/i')).toBeVisible({ timeout: 10_000 })
  })

  test('T3: PM submits invalid JSON and sees error', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/wic-import`)
    await expect(page.locator('#wic-json')).toBeVisible({ timeout: 15_000 })

    await page.locator('#wic-json').fill('not valid json {{{')
    await page.locator('button:has-text("Import")').click()

    // Error message should appear
    await expect(page.locator('text=/Invalid JSON/i')).toBeVisible({ timeout: 5_000 })
  })

  test('T4: PM submits with unmatched GH username and sees error', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/wic-import`)
    await expect(page.locator('#wic-json')).toBeVisible({ timeout: 15_000 })

    const month = '2098-02'
    await page.locator('#wic-month').fill(month)

    const json = JSON.stringify([{
      contributorGithubUsername: `nonexistent-user-${Date.now()}`,
      prId: 'PR-BOGUS-001',
      month,
      featureKey: 'feat.bogus',
      level: 'L1',
      impactBonus: false,
      bountyApplied: false,
      wicScore: 0.5,
    }])

    await page.locator('#wic-json').fill(json)
    await page.locator('button:has-text("Import")').click()

    // Error about unmatched username
    await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 10_000 })
  })

  test('T5: Admin cannot access WIC import page', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/wic-import`)
    await page.waitForTimeout(3_000)

    const formVisible = await page.locator('#wic-json').isVisible().catch(() => false)
    expect(formVisible, 'Admin should not see WIC import form').toBe(false)
  })
})

export const integrationMeta = {
  description: 'WIC Import page UI — form elements, valid/invalid import, unmatched username error, admin RBAC block',
  dependsOnModules: ['partnerships', 'entities', 'auth'],
}
