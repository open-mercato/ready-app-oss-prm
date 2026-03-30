import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-024: WIC Import + My WIC UI
 *
 * Pages:
 *   /backend/partnerships/wic-import   (PM — import WIC scores)
 *   /backend/partnerships/my-wic       (Agency — view WIC scores)
 *
 * Auth:
 *   wic-import: requireFeatures: ['partnerships.wic.import'] (PM only)
 *   my-wic: requireFeatures: ['partnerships.wic.view'] (agency roles)
 *
 * Tests:
 * T1 — PM sees WIC import form with agency select and JSON textarea
 * T2 — Agency admin sees My WIC page with month picker
 * T3 — Contributor cannot access WIC import page
 *
 * Phase: 2
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const CONTRIBUTOR_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-024: WIC Import + My WIC UI', () => {
  let pmToken: string
  let adminToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
  })

  test('T1: PM sees WIC import form with agency select and JSON textarea', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/wic-import`)

    const agencySelect = page.locator('select').first()
    await expect(agencySelect).toBeVisible({ timeout: 15_000 })
    await expect(agencySelect.locator('option')).not.toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('input[type="month"]')).toBeVisible()
    await expect(page.locator('textarea')).toBeVisible()
    await expect(page.locator('button[type="submit"], button:has-text("Import")')).toBeVisible()
  })

  test('T2: Agency admin sees My WIC page with month picker', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic`)

    await expect(page.locator('input[type="month"]')).toBeVisible({ timeout: 15_000 })
    const mainText = await page.getByRole('main').textContent()
    expect(mainText?.toLowerCase()).toContain('wic')
  })

  test('T3: Contributor cannot access WIC import page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/wic-import`)
    await page.waitForTimeout(3_000)
    const visible = await page.locator('textarea').isVisible().catch(() => false)
    expect(visible, 'Contributor should not see WIC import form').toBe(false)
  })
})

export const integrationMeta = {
  description: 'WIC Import + My WIC UI — import form, agency WIC view, contributor RBAC block',
  dependsOnModules: ['partnerships', 'auth'],
}
