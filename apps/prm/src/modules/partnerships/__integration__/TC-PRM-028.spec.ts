import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-028: BD Submits RFP Response (US-4.3)
 *
 * Verifies response submission, editing, deadline enforcement, and access control.
 * One response per agency per campaign, editable until deadline.
 *
 * Phase: 3 (WF4: Lead Distribution)
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const BD_EMAIL = 'acme-bd@demo.local'
const BD_PASSWORD = 'Demo123!'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const CONTRIBUTOR_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

const stamp = Date.now()

async function loginInBrowser(page: import('@playwright/test').Page, token: string) {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe.serial('TC-PRM-028: BD Submits RFP Response', () => {
  let pmToken: string
  let bdToken: string
  let contributorToken: string
  let campaignId: string
  let expiredCampaignId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)

    // Create an open campaign with future deadline
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Response Campaign ${stamp}`,
        description: 'Looking for a FinTech implementation partner with PCI compliance experience.',
        deadline: '2026-12-31',
        audience: 'all',
      },
    })
    expect([200, 201].includes(res.status())).toBe(true)
    const body = await readJsonSafe<{ id: string }>(res)
    campaignId = body!.id

    // Create an expired campaign (deadline in the past — via direct DB or special API)
    const expRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Expired Campaign ${stamp}`,
        description: 'This campaign has expired',
        deadline: '2025-01-01',
        audience: 'all',
      },
    })
    if ([200, 201].includes(expRes.status())) {
      const expBody = await readJsonSafe<{ id: string }>(expRes)
      expiredCampaignId = expBody!.id
    }
  })

  // T1: BD sees RFP detail with requirements and deadline
  test('T1: BD sees RFP detail page', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${campaignId}`, {
      waitUntil: 'domcontentloaded',
    })

    // Wait for page content to load
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    await expect(page.getByText(`QA Response Campaign ${stamp}`)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/FinTech|PCI/)).toBeVisible({ timeout: 5_000 })
  })

  // T2: BD submits response
  test('T2: BD submits response via form', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${campaignId}`, {
      waitUntil: 'domcontentloaded',
    })

    // Wait for campaign data to load (title visible = page loaded)
    await expect(page.getByText(`QA Response Campaign ${stamp}`)).toBeVisible({ timeout: 15_000 })

    // Find and fill response form/textarea (use locator('textarea') directly)
    const responseField = page.locator('textarea').first()
    await expect(responseField).toBeVisible({ timeout: 10_000 })
    await responseField.fill('We have 5 years of PCI compliance experience and delivered 3 FinTech projects. Timeline: 10 weeks. Budget: $180k.')

    const submitButton = page.getByRole('button', { name: /submit|send|respond/i })
    await submitButton.click()

    // Should see success feedback
    await page.waitForTimeout(2_000)
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const success = bodyText?.includes('submitted') || bodyText?.includes('saved') || bodyText?.includes('success')
    expect(success, 'Should see success feedback after submitting response').toBe(true)
  })

  // T3: Response visible in API
  test('T3: API returns submitted response', async ({ request }) => {
    const res = await apiRequest(request, 'GET', `/api/partnerships/rfp-responses?campaignId=${campaignId}`, {
      token: pmToken,
    })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      results?: Array<{ responseText: string; organizationId: string }>
      items?: Array<{ responseText: string; organizationId: string }>
    }>(res)

    const responses = body?.results ?? body?.items ?? []
    expect(responses.length).toBeGreaterThanOrEqual(1)
    const acmeResponse = responses.find((r) => r.responseText?.includes('PCI compliance'))
    expect(acmeResponse, 'Acme response should exist').toBeTruthy()
  })

  // T4: PM sees response on campaign page
  test('T4: PM sees response on campaign page', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${campaignId}`, {
      waitUntil: 'domcontentloaded',
    })

    // Wait for page content to load
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    await expect(page.getByText(/PCI compliance/)).toBeVisible({ timeout: 10_000 })
  })

  // T5: Second agency responds to same campaign
  test('T5: Second agency can respond to same campaign', async ({ request }) => {
    // Use Nordic BD if available, otherwise create via PM
    const nordicBdToken = await getAuthToken(request, 'nordic-bd@demo.local', PM_PASSWORD).catch(() => null)

    if (nordicBdToken) {
      const res = await apiRequest(request, 'POST', `/api/partnerships/rfp-responses`, {
        token: nordicBdToken,
        data: {
          campaignId,
          responseText: 'Nordic AI Labs specializes in HealthTech but has cross-domain FinTech experience.',
        },
      })
      expect([200, 201].includes(res.status()), `Nordic response failed: ${res.status()}`).toBe(true)

      // Verify both responses exist
      const listRes = await apiRequest(request, 'GET', `/api/partnerships/rfp-responses?campaignId=${campaignId}`, {
        token: pmToken,
      })
      const listBody = await readJsonSafe<{ results?: unknown[]; items?: unknown[] }>(listRes)
      const responses = listBody?.results ?? listBody?.items ?? []
      expect(responses.length).toBeGreaterThanOrEqual(2)
    }
  })

  // T6: Submit after deadline → rejected
  test('T6: Response after deadline is rejected', async ({ request }) => {
    test.skip(!expiredCampaignId, 'No expired campaign created')

    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
      token: bdToken,
      data: {
        campaignId: expiredCampaignId,
        responseText: 'Late response',
      },
    })
    expect(res.status(), 'Late response should be rejected').toBe(422)
  })

  // T7: BD submits again → overwrites previous response
  test('T7: Second submission overwrites previous response', async ({ request }) => {
    const res = await apiRequest(request, 'PUT', `/api/partnerships/rfp-responses`, {
      token: bdToken,
      data: {
        campaignId,
        responseText: 'UPDATED: We now have 6 years of PCI experience and a dedicated FinTech team of 12.',
      },
    })
    expect([200, 201].includes(res.status()), `Update failed: ${res.status()}`).toBe(true)

    // Verify the response was updated
    const listRes = await apiRequest(request, 'GET', `/api/partnerships/rfp-responses?campaignId=${campaignId}`, {
      token: pmToken,
    })
    const listBody = await readJsonSafe<{
      results?: Array<{ responseText: string; organizationId: string }>
      items?: Array<{ responseText: string; organizationId: string }>
    }>(listRes)
    const responses = listBody?.results ?? listBody?.items ?? []
    const acmeResponse = responses.find((r) => r.responseText?.includes('UPDATED'))
    expect(acmeResponse, 'Response should be updated, not duplicated').toBeTruthy()
  })

  // T7b: Edit response after deadline → rejected
  test('T7b: Edit response after deadline is rejected', async ({ request }) => {
    test.skip(!expiredCampaignId, 'No expired campaign created')

    const res = await apiRequest(request, 'PUT', '/api/partnerships/rfp-responses', {
      token: bdToken,
      data: {
        campaignId: expiredCampaignId,
        responseText: 'Trying to edit after deadline',
      },
    })
    expect(res.status(), 'Edit after deadline should be rejected').toBe(422)
  })

  // T8: Contributor cannot submit response
  test('T8: Contributor cannot submit response', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
      token: contributorToken,
      data: {
        campaignId,
        responseText: 'Contributor trying to respond',
      },
    })
    expect(res.status(), 'Contributor should get 403').toBe(403)
  })

  // T9: Empty response rejected
  test('T9: Empty response text is rejected', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
      token: bdToken,
      data: {
        campaignId,
        responseText: '',
      },
    })
    expect([400, 422].includes(res.status()), 'Empty response should be rejected').toBe(true)
  })

  test.afterAll(async ({ request }) => {
    for (const id of [campaignId, expiredCampaignId]) {
      if (!id) continue
      await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${id}`, {
        token: pmToken,
      }).catch(() => {})
    }
  })
})

export const integrationMeta = {
  description: 'RFP response submission — submit, edit, deadline enforcement, access control',
  dependsOnModules: ['partnerships'],
}
