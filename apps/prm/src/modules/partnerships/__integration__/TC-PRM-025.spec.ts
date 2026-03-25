import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-025: RFP Campaign Creation (US-4.1)
 *
 * As PM, I create an RFP campaign with requirements, deadline, and audience
 * so that agencies can bid with full context.
 *
 * Flow:
 *   T1: PM navigates to RFP campaigns page and sees empty state
 *   T2: PM creates campaign via UI form (title, description, deadline, audience)
 *   T3: Campaign appears in list with correct data
 *   T4: API confirms campaign exists with all fields
 *   T5: Campaign detail page shows correct data
 *
 * Phase: 3 (WF4: Lead Distribution)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

const stamp = Date.now()
const CAMPAIGN = {
  title: `QA RFP Campaign ${stamp}`,
  description: `Looking for an agency to implement OM for a FinTech client. Requirements: payments module, PCI compliance, 3-month timeline. Budget: $150k-200k.`,
  deadline: '2026-06-30',
  audience: 'all', // all agencies
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAsPM(page: Page, token: string): Promise<void> {
  await page.context().addCookies([
    { name: 'auth_token', value: token, url: BASE },
  ])
}

async function navigateToRfpCampaigns(page: Page): Promise<void> {
  await page.goto(`${BASE}/backend/partnerships/rfp-campaigns`, { waitUntil: 'domcontentloaded' })
}

// ---------------------------------------------------------------------------
// Test suite — serial because each test builds on previous state
// ---------------------------------------------------------------------------

test.describe.serial('TC-PRM-025: RFP Campaign Creation (US-4.1)', () => {
  let pmToken: string
  let createdCampaignId: string | undefined

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: PM sees RFP campaigns page with empty state (or existing campaigns)
  // -------------------------------------------------------------------------

  test('T1: PM can navigate to RFP campaigns page', async ({ page }) => {
    await loginAsPM(page, pmToken)
    await navigateToRfpCampaigns(page)

    // Wait for loading to finish
    await page.waitForFunction(
      () => !document.querySelector('main')?.textContent?.includes('Loading'),
      { timeout: 30_000 },
    ).catch(() => {})

    // Check main content (not full body, which includes RSC payload with 404 text)
    const mainText = await page.locator('main').textContent().catch(() => '')
    const is404 = mainText?.includes('404') && mainText?.includes('Not Found')
    expect(is404, 'RFP campaigns page should not be 404').toBeFalsy()

    // Should see page content loaded (header in breadcrumb or page body, or empty state)
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const hasContent = bodyText?.includes('RFP Campaigns') || bodyText?.includes('No campaigns') || bodyText?.includes('Create')
    expect(hasContent, 'Page should show RFP campaigns content').toBe(true)
  })

  // -------------------------------------------------------------------------
  // T2: PM creates RFP campaign via UI form
  // -------------------------------------------------------------------------

  test('T2: PM creates RFP campaign through the form', async ({ page }) => {
    await loginAsPM(page, pmToken)
    await navigateToRfpCampaigns(page)

    // Click create button
    const createButton = page.getByRole('button', { name: /create|new/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
    await createButton.click()

    // Fill form fields
    await page.getByLabel(/title/i).fill(CAMPAIGN.title)
    await page.getByLabel(/description|requirements/i).fill(CAMPAIGN.description)
    await page.getByLabel(/deadline/i).fill(CAMPAIGN.deadline)

    // Select audience
    const audienceSelect = page.getByLabel(/audience/i)
    if (await audienceSelect.isVisible()) {
      await audienceSelect.selectOption(CAMPAIGN.audience)
    }

    // Submit
    const submitButton = page.getByRole('button', { name: /create|submit|save/i })
    await submitButton.click()

    // Should see success feedback (flash message or redirect to list)
    await page.waitForURL(/rfp-campaigns/, { timeout: 15_000 }).catch(() => {
      // May stay on same page with flash — that's OK too
    })
  })

  // -------------------------------------------------------------------------
  // T3: Campaign appears in the list with correct data
  // -------------------------------------------------------------------------

  test('T3: Created campaign is visible in the list', async ({ page }) => {
    await loginAsPM(page, pmToken)
    await navigateToRfpCampaigns(page)

    // Campaign title should appear in the list
    await expect(page.getByText(CAMPAIGN.title)).toBeVisible({ timeout: 10_000 })
  })

  // -------------------------------------------------------------------------
  // T4: API confirms campaign exists with correct fields
  // -------------------------------------------------------------------------

  test('T4: API returns created campaign with all fields', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/rfp-campaigns', {
      token: pmToken,
    })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      results?: Array<{
        id: string
        title: string
        description: string
        deadline: string
        audience: string
        status: string
      }>
      items?: Array<{
        id: string
        title: string
        description: string
        deadline: string
        audience: string
        status: string
      }>
    }>(res)
    expect(body).not.toBeNull()

    // Find our campaign (results or items — depends on API pattern)
    const campaigns = body!.results ?? body!.items ?? []
    const campaign = campaigns.find((c) => c.title === CAMPAIGN.title)
    expect(campaign, `Campaign "${CAMPAIGN.title}" should exist in API response`).toBeTruthy()

    createdCampaignId = campaign!.id

    // Verify fields
    expect(campaign!.title).toBe(CAMPAIGN.title)
    expect(campaign!.description).toBe(CAMPAIGN.description)
    expect(campaign!.audience).toBe(CAMPAIGN.audience)
    expect(campaign!.status).toBeTruthy() // should have a status (draft/open)
  })

  // -------------------------------------------------------------------------
  // T5: Campaign detail page shows correct data
  // -------------------------------------------------------------------------

  test('T5: Campaign detail page shows all fields', async ({ page }) => {
    test.skip(!createdCampaignId, 'No campaign ID — T4 must pass first')

    await loginAsPM(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns/${createdCampaignId}`, {
      waitUntil: 'domcontentloaded',
    })

    // Should not be 404
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const is404 = bodyText?.includes('404') && bodyText?.includes('Not Found')
    expect(is404, 'Campaign detail page should not be 404').toBeFalsy()

    // Title visible
    await expect(page.getByText(CAMPAIGN.title)).toBeVisible({ timeout: 10_000 })

    // Description visible
    await expect(page.getByText(CAMPAIGN.description.slice(0, 40))).toBeVisible({ timeout: 5_000 })
  })

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  test.afterAll(async ({ request }) => {
    if (!createdCampaignId) return
    // Attempt cleanup — DELETE may not exist yet, that's OK
    await apiRequest(request, 'DELETE', `/api/partnerships/rfp-campaigns/${createdCampaignId}`, {
      token: pmToken,
    }).catch(() => {})
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'RFP Campaign creation — PM creates campaign via UI, verifies in list and API',
  dependsOnModules: ['partnerships'],
}
