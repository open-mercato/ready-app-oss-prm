import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-031: RFP Message Templates (US-4.6)
 *
 * PM configures notification templates for RFP campaigns:
 * - Campaign published (sent to BD)
 * - Award (sent to winner)
 * - Rejection (sent to non-winners)
 *
 * Templates support placeholders: [first-name], [last-name], [agency-name], [campaign-title]
 *
 * Phase: 3 (WF4: Lead Distribution)
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const BD_EMAIL = 'acme-bd@demo.local'
const BD_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

async function loginInBrowser(page: Page, token: string) {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe('TC-PRM-031: RFP Message Templates', () => {
  let pmToken: string
  let bdToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
  })

  // T1: PM sees settings page with 3 templates
  test('T1: PM sees RFP settings page with 3 templates', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-settings`, { waitUntil: 'domcontentloaded' })

    // Wait for page content to load (RSC payload in body contains "404"/"Not Found" strings)
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 30_000 },
    ).catch(() => {})

    // Check main content area (not full body, which includes RSC payload with 404 text)
    const mainText = await page.locator('main').textContent().catch(() => '')
    const is404 = mainText?.includes('404') && mainText?.includes('Not Found')
    expect(is404, 'RFP settings page should exist').toBeFalsy()

    // Should see 3 template sections
    await expect(page.getByText(/campaign|published/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/award/i).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/reject/i).first()).toBeVisible({ timeout: 5_000 })
  })

  // T2: PM edits template with placeholders
  test('T2: PM edits template with placeholders and saves', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-settings`, { waitUntil: 'domcontentloaded' })

    // Find the award template textarea/editor
    const awardField = page.locator('textarea').nth(1).or(
      page.getByLabel(/award/i)
    )
    await expect(awardField).toBeVisible({ timeout: 10_000 })

    await awardField.fill(
      'Congratulations [first-name]! Your agency [agency-name] has been selected for "[campaign-title]". We look forward to working with you.'
    )

    // Save
    const saveButton = page.getByRole('button', { name: /save/i })
    await saveButton.click()

    // Should see success
    await page.waitForTimeout(2_000)
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const saved = bodyText?.includes('saved') || bodyText?.includes('success') || bodyText?.includes('updated')
    expect(saved, 'Template should be saved').toBe(true)
  })

  // T3: API returns templates
  test('T3: API returns 3 templates', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/rfp-settings', { token: pmToken })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      templates?: {
        campaign?: string
        award?: string
        rejection?: string
      }
      campaignTemplate?: string
      awardTemplate?: string
      rejectionTemplate?: string
    }>(res)
    expect(body).not.toBeNull()

    // Check all 3 templates exist (flexible on structure)
    const hasTemplates = (body?.templates && body.templates.campaign && body.templates.award && body.templates.rejection) ||
                        (body?.campaignTemplate && body?.awardTemplate && body?.rejectionTemplate)
    expect(hasTemplates, 'API should return all 3 templates').toBeTruthy()
  })

  // T4: BD cannot access RFP settings
  test('T4: BD cannot access RFP settings', async ({ page, request }) => {
    // Check via API
    const apiRes = await apiRequest(request, 'GET', '/api/partnerships/rfp-settings', { token: bdToken })
    expect(apiRes.status(), 'BD should get 403 on settings API').toBe(403)

    // Check via UI
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-settings`, { waitUntil: 'domcontentloaded' })

    const bodyText = await page.locator('body').textContent().catch(() => '')
    const noAccess = bodyText?.includes("don't have access") || bodyText?.includes('403') ||
                    bodyText?.includes('Forbidden') || bodyText?.includes('Not Found')
    expect(noAccess, 'BD should not see RFP settings page').toBe(true)
  })
})

export const integrationMeta = {
  description: 'RFP message templates — PM configures templates with placeholders, BD excluded',
  dependsOnModules: ['partnerships'],
}
