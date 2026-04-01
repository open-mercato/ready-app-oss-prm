import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-027: BD Notification on RFP Published (US-4.2)
 *
 * Verifies that BD receives in-app notification when PM publishes an RFP campaign,
 * and that audience filtering works (selected agencies only).
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

async function loginInBrowser(page: Page, token: string) {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

test.describe.serial('TC-PRM-027: BD Notification on RFP Published', () => {
  let pmToken: string
  let bdToken: string
  let contributorToken: string
  let campaignId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)

    // PM creates and publishes a campaign (audience: all)
    const res = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Notif Campaign ${stamp}`,
        description: 'Testing notifications',
        deadline: '2026-12-31',
        audience: 'all',
      },
    })
    expect([200, 201].includes(res.status()), `Create campaign failed: ${res.status()}`).toBe(true)
    const body = await readJsonSafe<{ id: string }>(res)
    campaignId = body!.id

    // Publish the campaign (if separate action needed)
    await apiRequest(request, 'POST', `/api/partnerships/rfp-campaigns/${campaignId}/publish`, {
      token: pmToken,
    }).catch(() => {
      // publish might happen on create — that's OK
    })
  })

  // T1: BD sees notification in bell
  test('T1: BD sees RFP notification in bell icon', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend`, { waitUntil: 'domcontentloaded' })

    // Wait for page to fully load
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    // Look for notification bell with unread count
    const bell = page.getByRole('button', { name: /notification/i })
    await expect(bell).toBeVisible({ timeout: 15_000 })

    // Force-click bell (bypassing any overlays)
    await bell.click({ force: true })

    // Wait for notification panel dialog
    const dialog = page.getByRole('dialog', { name: /notification/i })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Should see notification about the RFP campaign (in body text)
    await expect(page.getByText(/QA Notif Campaign/).first()).toBeVisible({ timeout: 10_000 })
  })

  // T2: Clicking notification leads to RFP detail
  test('T2: Clicking notification navigates to RFP detail', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend`, { waitUntil: 'domcontentloaded' })

    // Wait for page load then open bell
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 15_000 },
    ).catch(() => {})

    const bell = page.getByRole('button', { name: /notification/i })
    await bell.click({ force: true })

    // Wait for dialog
    await page.getByRole('dialog', { name: /notification/i }).waitFor({ timeout: 5_000 })

    const notifLink = page.getByText(/QA Notif Campaign/).first()
    await notifLink.click()

    // Should navigate to campaign detail or RFP page
    await page.waitForURL(/rfp-campaigns/, { timeout: 10_000 }).catch(() => {})
    const bodyText = await page.locator('body').textContent().catch(() => '')
    expect(bodyText).toContain('QA Notif Campaign')
  })

  // T3: API returns notification
  test('T3: API returns RFP notification for BD', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/notifications', { token: bdToken })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      results?: Array<{ type: string; data?: Record<string, unknown> }>
      items?: Array<{ type: string; data?: Record<string, unknown> }>
    }>(res)

    const notifications = body?.results ?? body?.items ?? []
    const rfpNotif = notifications.find(
      (n) => n.type === 'partnerships.rfp.campaign_published' ||
             (n.data && typeof n.data === 'object' && 'campaignId' in n.data)
    )
    expect(rfpNotif, 'BD should have an RFP notification').toBeTruthy()
  })

  // T4: Selected audience — BD from non-selected agency does NOT see notification
  test('T4: BD from non-selected agency does not see notification', async ({ request }) => {
    // Create a campaign targeting only a specific org (not Acme)
    const selectRes = await apiRequest(request, 'POST', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
      data: {
        title: `QA Selected Only ${stamp}`,
        description: 'Selected audience test',
        deadline: '2026-12-31',
        audience: 'selected',
        selectedAgencyIds: [], // empty = no agencies selected
      },
    })

    if ([200, 201].includes(selectRes.status())) {
      // Check BD (Acme) does NOT have this notification
      const notifRes = await apiRequest(request, 'GET', '/api/notifications', { token: bdToken })
      const notifBody = await readJsonSafe<{
        results?: Array<{ data?: Record<string, unknown> }>
        items?: Array<{ data?: Record<string, unknown> }>
      }>(notifRes)

      const notifications = notifBody?.results ?? notifBody?.items ?? []
      const selectedNotif = notifications.find(
        (n) => n.data && typeof n.data === 'object' && (n.data as Record<string, string>).title?.includes('QA Selected Only')
      )
      expect(selectedNotif, 'BD from non-selected agency should NOT see this notification').toBeFalsy()
    }
  })

  // T5: Contributor does NOT see RFP notification
  test('T5: Contributor does not receive RFP notification', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/notifications', { token: contributorToken })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      results?: Array<{ type: string }>
      items?: Array<{ type: string }>
    }>(res)

    const notifications = body?.results ?? body?.items ?? []
    const rfpNotif = notifications.find((n) => n.type === 'partnerships.rfp.campaign_published')
    expect(rfpNotif, 'Contributor should NOT have RFP notification').toBeFalsy()
  })

  test.afterAll(async ({ request }) => {
    if (!campaignId) return
    await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${campaignId}`, {
      token: pmToken,
    }).catch(() => {})
  })
})

export const integrationMeta = {
  description: 'RFP notification — BD sees in-app notification, audience filtering, contributor excluded',
  dependsOnModules: ['partnerships', 'notifications'],
}
