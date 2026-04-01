import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-022: Add Agency UI
 *
 * Page: /backend/partnerships/agencies/add
 * Auth: requireFeatures: ['partnerships.agencies.manage'] (PM only)
 *
 * Tests:
 * T1 — PM sees add agency form with Initial Tier select
 * T2 — PM can create an agency and sees invite message
 * T3 — Contributor cannot access add agency page
 *
 * Phase: 2
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const CONTRIBUTOR_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-022: Add Agency UI', () => {
  let pmToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
  })

  test('T1: PM sees add agency form with Initial Tier select', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies/add`)

    await expect(page.locator('#agencyName')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('#adminEmail')).toBeVisible()
    await expect(page.locator('#initialTier')).toBeVisible()

    const tierOptions = await page.locator('#initialTier option').allTextContents()
    expect(tierOptions.length).toBeGreaterThanOrEqual(2)

    const defaultValue = await page.locator('#initialTier').inputValue()
    expect(defaultValue).toBe('OM Agency')

    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('T2: PM can create an agency and sees invite message', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies/add`)
    await expect(page.locator('#agencyName')).toBeVisible({ timeout: 15_000 })

    const ts = Date.now()
    await page.locator('#agencyName').fill(`QA Agency ${ts}`)
    await page.locator('#adminEmail').fill(`qa-agency-${ts}@test.local`)

    const seedCheckbox = page.locator('#seedDemoData')
    if (await seedCheckbox.isChecked()) await seedCheckbox.uncheck()

    await page.locator('#initialTier').selectOption('OM AI-native Agency')
    await page.locator('button[type="submit"]').click()

    await expect(page.locator('pre, [class*="success"]').first()).toBeVisible({ timeout: 15_000 })
    const pageText = await page.locator('pre').first().textContent().catch(() => '')
    expect(pageText).toContain(`qa-agency-${ts}@test.local`)
  })

  test('T3: Contributor cannot access add agency page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/agencies/add`)
    await page.waitForTimeout(3_000)
    const formVisible = await page.locator('#agencyName').isVisible().catch(() => false)
    expect(formVisible, 'Contributor should not see add agency form').toBe(false)
  })
})

export const integrationMeta = {
  description: 'Add Agency UI — form with Initial Tier, create + invite, contributor RBAC block',
  dependsOnModules: ['partnerships', 'auth'],
}
