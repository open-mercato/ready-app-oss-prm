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
const NORDIC_BD_EMAIL = 'nordic-bd@demo.local'
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
  let nordicBdToken: string | null
  let contributorToken: string
  let campaignId: string
  let expiredCampaignId: string
  let selectedCampaignId: string
  let draftCampaignId: string
  let nordicOrgId: string | null

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    nordicBdToken = await getAuthToken(request, NORDIC_BD_EMAIL, PM_PASSWORD).catch(() => null)
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
    await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${campaignId}/publish`, {
      token: pmToken,
    }).catch(() => {})

    // Create a campaign with a near-future deadline, then wait for it to expire
    const nearDeadline = new Date(Date.now() + 3_000).toISOString()
    const expRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Expired Campaign ${stamp}`,
        description: 'This campaign will expire in seconds',
        deadline: nearDeadline,
        audience: 'all',
      },
    })
    if ([200, 201].includes(expRes.status())) {
      const expBody = await readJsonSafe<{ id: string }>(expRes)
      expiredCampaignId = expBody!.id
      await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${expiredCampaignId}/publish`, {
        token: pmToken,
      }).catch(() => {})
      // Wait for the deadline to pass
      await new Promise((resolve) => setTimeout(resolve, 4_000))
    }

    const agenciesRes = await apiRequest(request, 'GET', '/api/partnerships/agencies', {
      token: pmToken,
    })
    expect(agenciesRes.status()).toBe(200)
    const agenciesBody = await readJsonSafe<{
      agencies?: Array<{ organizationId: string; name: string }>
    }>(agenciesRes)
    nordicOrgId =
      agenciesBody?.agencies?.find((agency) => agency.name.toLowerCase().includes('nordic'))?.organizationId ??
      null
    expect(nordicOrgId, 'Nordic org should exist in demo data').toBeTruthy()

    const selectedRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Selected Campaign ${stamp}`,
        description: 'Only Nordic should be able to view or respond to this campaign.',
        deadline: '2026-12-31',
        audience: 'selected',
        selectedAgencyIds: nordicOrgId ? [nordicOrgId] : [],
      },
    })
    expect([200, 201].includes(selectedRes.status())).toBe(true)
    const selectedBody = await readJsonSafe<{ id: string }>(selectedRes)
    selectedCampaignId = selectedBody!.id

    await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${selectedCampaignId}/publish`, {
      token: pmToken,
    }).catch(() => {})

    const draftRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Draft Campaign ${stamp}`,
        description: 'Draft campaign should stay invisible to agencies.',
        deadline: '2026-12-31',
        audience: 'all',
      },
    })
    expect([200, 201].includes(draftRes.status())).toBe(true)
    const draftBody = await readJsonSafe<{ id: string }>(draftRes)
    draftCampaignId = draftBody!.id
  })

  // T1+T2: BD sees campaign detail and submits response (single page session)
  test('T1+T2: BD sees RFP detail and submits response', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${campaignId}`, {
      waitUntil: 'domcontentloaded',
    })

    // Wait for page content to load
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    // T1: BD sees campaign title and description
    await expect(page.getByText(`QA Response Campaign ${stamp}`)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/FinTech|PCI/)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('body')).not.toContainText('partnerships.agencies.manage')
    await expect(page.locator('body')).not.toContainText('Forbidden')

    // T2: BD fills and submits response
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
    await expect(page.getByRole('button', { name: /award/i })).toHaveCount(0)
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
    if (nordicBdToken) {
      const res = await apiRequest(request, 'POST', `/api/partnerships/rfp-responses`, {
        token: nordicBdToken,
        data: {
          campaignId,
          responseText: 'Nordic AI Labs specializes in HealthTech but has cross-domain FinTech experience.',
        },
      })
      expect([200, 201].includes(res.status()), `Nordic response failed: ${res.status()}`).toBe(true)

      const acmeListRes = await apiRequest(request, 'GET', `/api/partnerships/rfp-responses?campaignId=${campaignId}`, {
        token: bdToken,
      })
      expect(acmeListRes.status()).toBe(200)
      const acmeListBody = await readJsonSafe<{
        results?: Array<{ responseText: string }>
        items?: Array<{ responseText: string }>
      }>(acmeListRes)
      const acmeResponses = acmeListBody?.results ?? acmeListBody?.items ?? []
      expect(acmeResponses.length, 'Agency user should see only its own response').toBe(1)
      expect(acmeResponses[0]?.responseText ?? '').not.toContain('Nordic AI Labs')

      // Verify both responses exist
      const listRes = await apiRequest(request, 'GET', `/api/partnerships/rfp-responses?campaignId=${campaignId}`, {
        token: pmToken,
      })
      const listBody = await readJsonSafe<{ results?: unknown[]; items?: unknown[] }>(listRes)
      const responses = listBody?.results ?? listBody?.items ?? []
      expect(responses.length).toBeGreaterThanOrEqual(2)
    }
  })

  test('T5b: Non-invited agency cannot list, open, or respond to selected-audience campaign', async ({ request }) => {
    const campaignsRes = await apiRequest(request, 'GET', '/api/partnerships/rfp-campaigns', {
      token: bdToken,
    })
    expect(campaignsRes.status()).toBe(200)
    const campaignsBody = await readJsonSafe<{
      results?: Array<{ id: string }>
      items?: Array<{ id: string }>
    }>(campaignsRes)
    const campaigns = campaignsBody?.results ?? campaignsBody?.items ?? []
    expect(campaigns.some((campaign) => campaign.id === selectedCampaignId)).toBe(false)

    const detailRes = await apiRequest(request, 'GET', `/api/partnerships/rfp-campaigns/${selectedCampaignId}`, {
      token: bdToken,
    })
    expect([403, 404].includes(detailRes.status()), `Expected hidden selected campaign, got ${detailRes.status()}`).toBe(true)

    const respondRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
      token: bdToken,
      data: {
        campaignId: selectedCampaignId,
        responseText: 'Acme should not be allowed to answer this selected campaign.',
      },
    })
    expect([403, 404, 422].includes(respondRes.status()), `Expected selected-campaign submit to fail, got ${respondRes.status()}`).toBe(true)
  })

  test('T5c: Agency cannot see unpublished draft campaign', async ({ request }) => {
    const campaignsRes = await apiRequest(request, 'GET', '/api/partnerships/rfp-campaigns', {
      token: bdToken,
    })
    expect(campaignsRes.status()).toBe(200)
    const campaignsBody = await readJsonSafe<{
      results?: Array<{ id: string }>
      items?: Array<{ id: string }>
    }>(campaignsRes)
    const campaigns = campaignsBody?.results ?? campaignsBody?.items ?? []
    expect(campaigns.some((campaign) => campaign.id === draftCampaignId)).toBe(false)

    const detailRes = await apiRequest(request, 'GET', `/api/partnerships/rfp-campaigns/${draftCampaignId}`, {
      token: bdToken,
    })
    expect([403, 404].includes(detailRes.status()), `Expected hidden draft campaign, got ${detailRes.status()}`).toBe(true)
  })

  // T6: Submit after deadline → rejected
  test('T6: Response after deadline is rejected', async ({ request }) => {

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
    for (const id of [campaignId, expiredCampaignId, selectedCampaignId, draftCampaignId]) {
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
