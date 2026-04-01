import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-026: RFP Campaign Creation — Negative (US-4.1)
 *
 * Verifies that invalid inputs are rejected and non-PM users cannot create campaigns.
 *
 * Phase: 3 (WF4: Lead Distribution)
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const BD_EMAIL = 'acme-bd@demo.local'
const BD_PASSWORD = 'Demo123!'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

async function loginInBrowser(page: import('@playwright/test').Page, token: string) {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-026: RFP Campaign Creation — Negative', () => {
  let pmToken: string
  let bdToken: string
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  // T1: Submit without title → validation error
  test('T1: Submit without title shows validation error', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns`, { waitUntil: 'domcontentloaded' })

    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    const createLink = page.getByRole('link', { name: /create/i }).or(page.getByRole('button', { name: /create|new/i }))
    await expect(createLink.first()).toBeVisible({ timeout: 10_000 })
    await createLink.first().click()

    // Fill description but NOT title
    await page.getByLabel(/description|requirements/i).fill('Some requirements')
    await page.getByLabel(/deadline/i).fill('2026-12-31')

    const submitButton = page.getByRole('button', { name: /create|submit|save/i })
    await submitButton.click()

    // Should show validation error or stay on form (not redirect to list)
    await page.waitForTimeout(1_000)
    const url = page.url()
    const hasError = await page.locator('[class*="error"], [class*="destructive"], [role="alert"]').isVisible().catch(() => false)
    const stayedOnForm = url.includes('create') || url.includes('new') || hasError
    expect(stayedOnForm, 'Form should not submit without title').toBe(true)
  })

  // T2: Submit with deadline in the past → error
  test('T2: Submit with past deadline is rejected', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: 'Past Deadline Campaign',
        description: 'Test',
        deadline: '2020-01-01',
        audience: 'all',
      },
    })
    expect([400, 422].includes(res.status()), `Past deadline should be rejected, got ${res.status()}`).toBe(true)
  })

  // T3: BD cannot see PM-only controls on RFP campaigns page
  test('T3: BD has no access to create campaigns or audience column', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns`, { waitUntil: 'domcontentloaded' })

    // Either page is inaccessible (403/redirect) or Create button is absent
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const noAccess = bodyText?.includes("don't have access") || bodyText?.includes('403') || bodyText?.includes('Forbidden')
    const main = page.locator('main')
    const createButton = page.getByRole('button', { name: /create|new/i })
    const hasCreateButton = await createButton.isVisible().catch(() => false)
    const audienceHeaderVisible = await main.getByRole('columnheader', { name: /audience/i }).isVisible().catch(() => false)

    expect(noAccess || !hasCreateButton, 'BD should not be able to create campaigns').toBe(true)
    expect(noAccess || !audienceHeaderVisible, 'BD should not see the Audience column').toBe(true)
  })

  // T4: Agency Admin cannot create campaign via API
  test('T4: Agency Admin gets 403 when creating campaign via API', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: adminToken,
      data: {
        title: 'Unauthorized Campaign',
        description: 'Should fail',
        deadline: '2026-12-31',
        audience: 'all',
      },
    })
    expect(res.status(), 'Agency Admin should get 403').toBe(403)
  })

  test('T4b: Agency Admin cannot see audience column on campaigns page', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns`, { waitUntil: 'domcontentloaded' })

    const bodyText = await page.locator('body').textContent().catch(() => '')
    const noAccess = bodyText?.includes("don't have access") || bodyText?.includes('403') || bodyText?.includes('Forbidden')
    const main = page.locator('main')
    const audienceHeaderVisible = await main.getByRole('columnheader', { name: /audience/i }).isVisible().catch(() => false)

    expect(noAccess || !audienceHeaderVisible, 'Agency Admin should not see the Audience column').toBe(true)
  })
})

export const integrationMeta = {
  description: 'RFP Campaign creation — negative cases: validation, auth, access control',
  dependsOnModules: ['partnerships', 'auth'],
}
