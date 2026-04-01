import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-029: PM Evaluates Responses & Awards (US-4.4 + US-4.7)
 *
 * Verifies comparison page, award action, and automatic award/rejection notifications.
 *
 * Phase: 3 (WF4: Lead Distribution)
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const BD_EMAIL = 'acme-bd@demo.local'
const BD_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

const stamp = Date.now()

async function loginInBrowser(page: Page, token: string) {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe.serial('TC-PRM-029: PM Evaluates Responses & Awards', () => {
  let pmToken: string
  let bdToken: string
  let campaignId: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)

    // Create campaign
    const campRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Award Campaign ${stamp}`,
        description: 'Evaluating agencies for FinTech project',
        deadline: '2026-12-31',
        audience: 'all',
      },
    })
    expect([200, 201].includes(campRes.status())).toBe(true)
    const campBody = await readJsonSafe<{ id: string }>(campRes)
    campaignId = campBody!.id

    await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${campaignId}/publish`, {
      token: pmToken,
    }).catch(() => {})

    // Acme BD responds
    const respRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
      token: bdToken,
      data: {
        campaignId,
        responseText: 'Acme has delivered 3 FinTech projects with PCI compliance.',
      },
    })
    expect([200, 201].includes(respRes.status())).toBe(true)
    const respBody = await readJsonSafe<{ organizationId?: string }>(respRes)
    acmeOrgId = respBody?.organizationId ?? ''

    // Nordic BD responds (if available)
    const nordicToken = await getAuthToken(request, 'nordic-bd@demo.local', PM_PASSWORD).catch(() => null)
    if (nordicToken) {
      await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
        token: nordicToken,
        data: { campaignId, responseText: 'Nordic specializes in HealthTech with cross-domain experience.' },
      }).catch(() => {})
    }
  })

  // T1: PM sees comparison page
  test('T1: PM sees comparison page with responses', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${campaignId}`, {
      waitUntil: 'domcontentloaded',
    })

    // Wait for content to load
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    // Should see responses from agencies (scope to main to avoid sidebar/dropdown matches)
    const main = page.locator('main')
    await expect(main.getByText(/Acme/).first()).toBeVisible({ timeout: 10_000 })
    await expect(main.getByText(/FinTech projects/).first()).toBeVisible({ timeout: 5_000 })
  })

  // T2: Comparison shows agency details
  test('T2: Comparison page shows response text, agency name, tier', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${campaignId}`, {
      waitUntil: 'domcontentloaded',
    })

    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    // Response text visible (scope to main)
    const main = page.locator('main')
    await expect(main.getByText(/PCI compliance/).first()).toBeVisible({ timeout: 10_000 })

    // Agency name visible
    await expect(main.getByText(/Acme/).first()).toBeVisible()

    // Tier or agency info visible
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const hasTierOrInfo = bodyText?.includes('OM Agency') || bodyText?.includes('Tier') || bodyText?.includes('Acme Digital')
    expect(hasTierOrInfo, 'Should show agency tier or details').toBe(true)
  })

  // T3: PM awards campaign
  test('T3: PM awards campaign to selected agency', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${campaignId}`, {
      waitUntil: 'domcontentloaded',
    })

    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    // Find Award button for Acme's response
    const awardButton = page.getByRole('button', { name: /award/i }).first()
    await expect(awardButton).toBeVisible({ timeout: 10_000 })
    await awardButton.click()

    // Confirm dialog if present
    const confirmButton = page.getByRole('button', { name: /confirm|yes/i })
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click()
    }

    // Should see success or status change
    await page.waitForTimeout(2_000)
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const awarded = bodyText?.includes('awarded') || bodyText?.includes('Awarded') || bodyText?.includes('success')
    expect(awarded, 'Campaign should be marked as awarded').toBe(true)
  })

  // T4: Winner gets award notification
  test('T4: Winner receives award notification', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/notifications', { token: bdToken })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      results?: Array<{ type: string; message?: string; data?: Record<string, unknown> }>
      items?: Array<{ type: string; message?: string; data?: Record<string, unknown> }>
    }>(res)

    const notifications = body?.results ?? body?.items ?? []
    const awardNotif = notifications.find(
      (n) => n.type === 'partnerships.rfp.awarded' ||
             n.message?.toLowerCase().includes('award') ||
             n.message?.toLowerCase().includes('won') ||
             n.message?.toLowerCase().includes('selected')
    )
    expect(awardNotif, 'Winner should have award notification').toBeTruthy()
  })

  // T4b: Other respondents get rejection notification
  test('T4b: Other respondents receive rejection notification', async ({ request }) => {
    const nordicToken = await getAuthToken(request, 'nordic-bd@demo.local', PM_PASSWORD).catch(() => null)
    test.skip(!nordicToken, 'Nordic BD not available')

    const res = await apiRequest(request, 'GET', '/api/notifications', { token: nordicToken! })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      results?: Array<{ type: string; message?: string }>
      items?: Array<{ type: string; message?: string }>
    }>(res)

    const notifications = body?.results ?? body?.items ?? []
    const rejectNotif = notifications.find(
      (n) => n.type === 'partnerships.rfp.rejected' ||
             n.message?.toLowerCase().includes('not selected') ||
             n.message?.toLowerCase().includes('reject')
    )
    expect(rejectNotif, 'Losing respondent should have rejection notification').toBeTruthy()
  })

  // T4c: Non-responding agencies get nothing
  test('T4c: Non-responding agencies do not receive rejection', async ({ request }) => {
    // CloudBridge didn't respond — should have no award/reject notifications
    const cbToken = await getAuthToken(request, 'cloudbridge-admin@demo.local', PM_PASSWORD).catch(() => null)
    test.skip(!cbToken, 'CloudBridge user not available')

    const res = await apiRequest(request, 'GET', '/api/notifications', { token: cbToken! })
    const body = await readJsonSafe<{
      results?: Array<{ type: string }>
      items?: Array<{ type: string }>
    }>(res)

    const notifications = body?.results ?? body?.items ?? []
    const rfpOutcome = notifications.find(
      (n) => n.type === 'partnerships.rfp.awarded' || n.type === 'partnerships.rfp.rejected'
    )
    expect(rfpOutcome, 'Non-responding agency should NOT get award/rejection').toBeFalsy()
  })

  // T5: Campaign list shows awarded status
  test('T5: Campaign list shows Awarded status', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns`, { waitUntil: 'domcontentloaded' })

    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    // Check that "Awarded" badge appears somewhere on the page for this campaign
    const main = page.locator('main')
    await expect(main.getByText(`QA Award Campaign ${stamp}`)).toBeVisible({ timeout: 10_000 })
    await expect(main.getByText(/Awarded/).first()).toBeVisible({ timeout: 5_000 })
  })

  // T6: Award with no responses → blocked
  test('T6: Cannot award campaign with no responses', async ({ request }) => {
    // Create empty campaign
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Empty Campaign ${stamp}`,
        description: 'No responses expected',
        deadline: '2026-12-31',
        audience: 'all',
      },
    })
    const body = await readJsonSafe<{ id: string }>(res)
    const emptyId = body?.id

    if (emptyId) {
      const awardRes = await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${emptyId}/award`, {
        token: pmToken,
        data: { winnerOrganizationId: 'some-fake-org-id' },
      })
      expect([400, 422].includes(awardRes.status()), 'Award with no responses should fail').toBe(true)

      // Cleanup
      await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${emptyId}`, { token: pmToken }).catch(() => {})
    }
  })

  // T7: Cannot award already-awarded campaign
  test('T7: Cannot award already-awarded campaign', async ({ request }) => {
    const res = await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${campaignId}/award`, {
      token: pmToken,
      data: { winnerOrganizationId: acmeOrgId },
    })
    expect(res.status(), 'Re-awarding should return 422').toBe(422)
  })

  // T8: BD cannot access comparison page
  test('T8: BD cannot access comparison/award functionality', async ({ request }) => {
    const res = await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${campaignId}/award`, {
      token: bdToken,
      data: { winnerOrganizationId: acmeOrgId },
    })
    expect(res.status(), 'BD should get 403 on award').toBe(403)
  })

  // T9: BD cannot submit response after award
  test('T9: Response after award is rejected', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
      token: bdToken,
      data: {
        campaignId,
        responseText: 'Trying to respond after award',
      },
    })
    expect(res.status(), 'Response after award should be rejected').toBe(422)
  })

  test.afterAll(async ({ request }) => {
    if (!campaignId) return
    await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${campaignId}`, {
      token: pmToken,
    }).catch(() => {})
  })
})

export const integrationMeta = {
  description: 'RFP evaluation — comparison page, award, notifications, access control',
  dependsOnModules: ['partnerships', 'notifications'],
}
