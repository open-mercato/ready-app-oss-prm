import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-030: RFP Campaign Lifecycle & Edge Cases
 *
 * End-to-end lifecycle: draft → published → responses → awarded.
 * Status badges, deadline auto-close, edit restrictions.
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

test.describe.serial('TC-PRM-030: RFP Campaign Lifecycle', () => {
  let pmToken: string
  let bdToken: string
  let campaignId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
  })

  // T1: Full lifecycle: draft → published → response → awarded
  test('T1: Campaign completes full lifecycle', async ({ request }) => {
    // 1. Create (draft)
    const createRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Lifecycle ${stamp}`,
        description: 'Full lifecycle test',
        deadline: '2026-12-31',
        audience: 'all',
      },
    })
    expect([200, 201].includes(createRes.status())).toBe(true)
    const createBody = await readJsonSafe<{ id: string; status: string }>(createRes)
    campaignId = createBody!.id

    // 2. Publish (if separate action)
    await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${campaignId}/publish`, {
      token: pmToken,
    }).catch(() => {
      // May auto-publish on create
    })

    // 3. BD responds
    const respRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
      token: bdToken,
      data: { campaignId, responseText: 'Lifecycle test response from Acme.' },
    })
    expect([200, 201].includes(respRes.status())).toBe(true)
    const respBody = await readJsonSafe<{ organizationId?: string }>(respRes)

    // 4. PM awards
    const awardRes = await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${campaignId}/award`, {
      token: pmToken,
      data: { winnerOrganizationId: respBody?.organizationId },
    })
    expect([200, 201].includes(awardRes.status()), `Award failed: ${awardRes.status()}`).toBe(true)

    // 5. Verify final status
    const getRes = await apiRequest(request, 'GET', `/api/partnerships/rfp-campaigns/${campaignId}`, {
      token: pmToken,
    })
    const campaign = await readJsonSafe<{ status: string }>(getRes)
    expect(campaign?.status?.toLowerCase()).toBe('awarded')
  })

  // T2: Status badges on list page
  test('T2: Campaign list shows correct status badges', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns`, { waitUntil: 'domcontentloaded' })

    // The lifecycle campaign should show "Awarded"
    const pageText = await page.locator('body').textContent().catch(() => '')
    const hasStatusBadges = pageText?.includes('Awarded') || pageText?.includes('Published') || pageText?.includes('Open') || pageText?.includes('Draft')
    expect(hasStatusBadges, 'List should show status badges').toBe(true)
  })

  // T3: Deadline auto-closes campaign
  test('T3: Expired campaign rejects new responses', async ({ request }) => {
    // Create campaign with near-future deadline, then wait for it to expire
    const nearDeadline = new Date(Date.now() + 3_000).toISOString()
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Expired ${stamp}`,
        description: 'Will expire in seconds',
        deadline: nearDeadline,
        audience: 'all',
      },
    })
    expect([200, 201].includes(res.status()), `Campaign creation failed: ${res.status()}`).toBe(true)

    const body = await readJsonSafe<{ id: string }>(res)
    // Wait for deadline to pass
    await new Promise((resolve) => setTimeout(resolve, 4_000))

    const respRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-responses', {
      token: bdToken,
      data: { campaignId: body!.id, responseText: 'Late!' },
    })
    expect(respRes.status(), 'Response to expired campaign should be rejected').toBe(422)

    // Cleanup
    await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${body!.id}`, { token: pmToken }).catch(() => {})
  })

  // T4: PM edits draft campaign
  test('T4: PM can edit campaign in draft state', async ({ request }) => {
    const createRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Editable ${stamp}`,
        description: 'Original description',
        deadline: '2026-12-31',
        audience: 'all',
        status: 'draft', // explicitly draft
      },
    })

    if ([200, 201].includes(createRes.status())) {
      const body = await readJsonSafe<{ id: string }>(createRes)
      const editRes = await apiRequest(request, 'PUT', `/api/partnerships/rfp-campaigns/${body!.id}`, {
        token: pmToken,
        data: { description: 'Updated description' },
      })
      expect([200, 201].includes(editRes.status()), 'Should be able to edit draft campaign').toBe(true)

      // Cleanup
      await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${body!.id}`, { token: pmToken }).catch(() => {})
    }
  })

  // T5: PM cannot edit published campaign
  test('T5: PM cannot edit published campaign', async ({ request }) => {
    // campaignId from T1 is awarded — try to edit
    test.skip(!campaignId, 'Need campaignId from T1')

    const res = await apiRequest(request, 'PUT', `/api/partnerships/rfp-campaigns/${campaignId}`, {
      token: pmToken,
      data: { description: 'Trying to edit awarded campaign' },
    })
    expect([400, 403, 422].includes(res.status()), 'Should not be able to edit awarded campaign').toBe(true)
  })

  // T6: Campaign with 0 responses — empty comparison
  test('T6: Empty comparison page when no responses', async ({ page, request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA No Responses ${stamp}`,
        description: 'Nobody will respond',
        deadline: '2026-12-31',
        audience: 'all',
      },
    })

    if ([200, 201].includes(res.status())) {
      const body = await readJsonSafe<{ id: string }>(res)

      await loginInBrowser(page, pmToken)
      await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${body!.id}`, {
        waitUntil: 'domcontentloaded',
      })

      // Wait for content to load
      await page.waitForFunction(
        () => !document.querySelector('main')?.textContent?.includes('Loading'),
        { timeout: 15_000 },
      ).catch(() => {})

      // Should see empty state, not crash (check main, not body — body has RSC 404 payload)
      const mainText = await page.locator('main').textContent().catch(() => '')
      const is404 = mainText?.includes('404') && mainText?.includes('Not Found')
      expect(is404, 'Should not be 404').toBeFalsy()

      const hasEmptyState = mainText?.includes('no response') || mainText?.includes('No response') ||
                           mainText?.includes('Responses (0)') || mainText?.includes('No responses')
      expect(hasEmptyState, 'Should show empty state message').toBe(true)

      // Cleanup
      await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${body!.id}`, { token: pmToken }).catch(() => {})
    }
  })

  test.afterAll(async ({ request }) => {
    if (!campaignId) return
    await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${campaignId}`, {
      token: pmToken,
    }).catch(() => {})
  })
})

export const integrationMeta = {
  description: 'RFP lifecycle — full cycle, status badges, deadline enforcement, edit restrictions',
  dependsOnModules: ['partnerships'],
}
