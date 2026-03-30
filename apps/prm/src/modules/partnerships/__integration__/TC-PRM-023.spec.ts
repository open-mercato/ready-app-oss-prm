import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-023: Tier Review UI
 *
 * Page: /backend/partnerships/tier-review
 * Auth: requireFeatures: ['partnerships.tier.manage'] (PM only)
 *
 * Tests:
 * T1 — PM sees tier review page with evaluation status and proposals
 * T2 — PM can trigger evaluation via Run Now button
 * T3 — Contributor cannot access tier review page
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

test.describe('TC-PRM-023: Tier Review UI', () => {
  let pmToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
  })

  test('T1: PM sees evaluation status banner and proposals table', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/tier-review`)

    await expect(page.locator('text="Tier Review"').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('button:has-text("Run Evaluation Now"), button:has-text("Run Now")')).toBeVisible({ timeout: 10_000 })

    const statusText = await page.getByRole('main').textContent()
    const hasEvalStatus = statusText?.includes('auto-evaluation') || statusText?.includes('evaluation')
    expect(hasEvalStatus, 'Should show evaluation status info').toBe(true)

    await expect(page.locator('button:has-text("All")')).toBeVisible()
  })

  test('T2: PM can trigger evaluation via Run Now button', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/tier-review`)

    const runButton = page.locator('button:has-text("Run Evaluation Now"), button:has-text("Run Now")')
    await expect(runButton).toBeVisible({ timeout: 15_000 })
    await expect(runButton).toBeEnabled()
    await runButton.click()
    await expect(runButton).toBeEnabled({ timeout: 10_000 })
  })

  test('T3: Contributor cannot access tier review page', async ({ page }) => {
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/tier-review`)
    await page.waitForTimeout(3_000)
    const visible = await page.locator('button:has-text("Run Evaluation Now"), button:has-text("Run Now")').isVisible().catch(() => false)
    expect(visible, 'Contributor should not see tier review controls').toBe(false)
  })
})

export const integrationMeta = {
  description: 'Tier Review UI — evaluation banner, Run Now button, contributor RBAC block',
  dependsOnModules: ['partnerships', 'auth'],
}
