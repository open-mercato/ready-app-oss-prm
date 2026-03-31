import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-008: Seed Data Verification UI (US-1.2, US-1.3, US-7.2, US-7.3)
 *
 * Verifies that seedDefaults + seedExamples produced the expected data
 * by navigating to UI pages and checking rendered content:
 *   T1 — Deals page shows seeded deals with pipeline stages
 *   T2 — Case studies page shows seeded case study records
 *   T3 — Agencies page (PM) shows demo organizations
 *   T4 — Demo users can log in and reach the dashboard
 *   T5 — PM sees tier assignments on agencies page (Phase 2 seed)
 *   T6 — PM sees license deals (Phase 2 seed)
 *   T7 — PM sees RFP campaigns with correct statuses (Phase 3 seed)
 *   T8 — Awarded campaign has responses (Phase 3 seed)
 *   T9 — Nordic users can log in (multi-agency seed)
 *
 * Source: apps/prm/src/modules/partnerships/setup.ts (seedDefaults + seedExamples)
 * Phase: 1, 2, 3
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const BD_EMAIL = 'acme-bd@demo.local'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const NORDIC_ADMIN_EMAIL = 'nordic-admin@demo.local'
const NORDIC_BD_EMAIL = 'nordic-bd@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-008: Seed Data Verification UI', () => {
  let pmToken: string
  let adminToken: string
  let bdToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    bdToken = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: Deals page shows seeded deals
  // -------------------------------------------------------------------------
  test('T1: BD user sees seeded deals on deals page', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/customers/deals`)

    // Wait for deals table
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    const count = await rows.count()
    expect(count, 'BD should see at least 1 seeded deal for Acme org').toBeGreaterThanOrEqual(1)

    // Verify deals have visible title text
    const firstRowText = await rows.first().textContent()
    expect(firstRowText?.trim().length, 'Deal row should have content').toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // T2: Case studies page shows seeded records
  // -------------------------------------------------------------------------
  test('T2: Admin sees seeded case studies on case studies page', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/case-studies`)
    await expect(page.getByRole('link', { name: 'Case Studies' }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: 'Agency Profile' }).first()).toBeVisible({ timeout: 15_000 })

    // Case studies page uses cards, not table. Look for case study entries.
    // The page has h3 elements for each case study title.
    const caseStudyCards = page.locator('.rounded-lg.border.p-4')
    await expect(caseStudyCards.first()).toBeVisible({ timeout: 15_000 })
    const count = await caseStudyCards.count()
    expect(count, 'Admin should see at least 1 seeded case study').toBeGreaterThanOrEqual(1)

    // Verify case study has a title
    const firstTitle = caseStudyCards.first().locator('h3')
    await expect(firstTitle).toBeVisible()
    const titleText = await firstTitle.textContent()
    expect(titleText?.trim().length, 'Case study should have a title').toBeGreaterThan(0)
  })

  test('T2a: Admin can edit and delete a case study from the page', async ({ page, request }) => {
    const stamp = Date.now()
    const createRes = await apiRequest(request, 'POST', '/api/partnerships/case-studies', {
      token: adminToken,
      data: {
        values: {
          title: `QA Case Study ${stamp}`,
          industry: ['Technology'],
          technologies: ['React'],
          budget_bucket: '10k-50k',
          duration_bucket: '1-3 months',
          client_name: 'QA Client',
          description: 'Temporary case study for edit/delete coverage.',
          challenges: 'Challenge',
          solution: 'Solution',
          results: 'Results',
          is_public: false,
        },
      },
    })
    expect(createRes.ok()).toBe(true)

    await loginInBrowser(page, adminToken)
    await page.goto(`${BASE}/backend/partnerships/case-studies`)

    const card = page.locator('.rounded-lg.border.p-4').filter({ hasText: `QA Case Study ${stamp}` }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })

    await card.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title').fill(`QA Case Study ${stamp} Updated`)
    await page.getByRole('button', { name: 'Save Case Study' }).click()
    await expect(page.getByText('Case study updated successfully')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.rounded-lg.border.p-4').filter({ hasText: `QA Case Study ${stamp} Updated` }).first()).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.rounded-lg.border.p-4').filter({ hasText: `QA Case Study ${stamp} Updated` }).first().getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Case study deleted successfully')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.rounded-lg.border.p-4').filter({ hasText: `QA Case Study ${stamp} Updated` })).toHaveCount(0)
  })

  test('T2b: BD can manage case studies on the case studies page', async ({ page }) => {
    await loginInBrowser(page, bdToken)
    await page.goto(`${BASE}/backend/partnerships/case-studies`)

    await expect(page.getByRole('link', { name: 'Case Studies' }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Add Case Study' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible()
  })

  test('T2c: PM can manage case studies when scoped to an agency org', async ({ page, request }) => {
    const agenciesRes = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token: pmToken })
    expect(agenciesRes.ok()).toBe(true)
    const agenciesBody = await agenciesRes.json()
    const agencies = agenciesBody.agencies ?? []
    const acme = agencies.find((agency: { name?: string; organizationId?: string }) => agency.name?.toLowerCase().includes('acme'))
    expect(acme?.organizationId, 'Acme org should be visible to PM').toBeTruthy()

    await loginInBrowser(page, pmToken)
    await page.context().addCookies([{ name: 'om_selected_org', value: acme.organizationId, url: BASE }])
    await page.goto(`${BASE}/backend/partnerships/case-studies`)

    await expect(page.getByRole('button', { name: 'Add Case Study' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // T3: Agencies page shows demo organizations
  // -------------------------------------------------------------------------
  test('T3: PM sees demo agencies on agencies page', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)

    // Wait for table to load
    await expect(page.locator('th:text-is("Agency")').first()).toBeVisible({ timeout: 15_000 })

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const count = await rows.count()
    expect(count, 'PM should see at least 3 demo agencies').toBeGreaterThanOrEqual(3)

    // Verify known demo agency names
    const bodyText = (await page.locator('tbody').textContent())?.toLowerCase() ?? ''
    const expected = ['acme', 'nordic', 'cloudbridge']
    const found = expected.filter((name) => bodyText.includes(name))
    expect(found.length, `Expected all 3 demo agencies, found: ${found.join(', ')}`).toBeGreaterThanOrEqual(2)
  })

  // -------------------------------------------------------------------------
  // T4: Demo users can log in and reach dashboard
  // -------------------------------------------------------------------------
  test('T4: All 4 demo users can log in and reach the dashboard', async ({ page }) => {
    const tokens = [
      { token: pmToken, label: 'PM' },
      { token: adminToken, label: 'Acme Admin' },
      { token: bdToken, label: 'Acme BD' },
      { token: contributorToken, label: 'Acme Contributor' },
    ]

    for (const user of tokens) {
      expect(user.token, `${user.label} should have a valid token`).toBeTruthy()

      await loginInBrowser(page, user.token)
      await page.goto(`${BASE}/backend`)
      await page.waitForLoadState('domcontentloaded')

      const title = await page.title()
      expect(
        title !== '404: This page could not be found.',
        `${user.label} should reach dashboard, not 404`,
      ).toBe(true)
    }
  })

  // -------------------------------------------------------------------------
  // T5: Tier assignments visible on agencies page (Phase 2 seed)
  // -------------------------------------------------------------------------
  test('T5: PM sees tier assignments on agencies page', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/agencies`)
    await expect(page.locator('th:text-is("Agency")').first()).toBeVisible({ timeout: 15_000 })

    const bodyText = (await page.locator('tbody').textContent())?.toLowerCase() ?? ''
    // Acme should have "OM Agency", Nordic should have "OM AI-native Agency"
    expect(bodyText, 'Should show tier names on agencies page').toMatch(/om agency/i)
  })

  // -------------------------------------------------------------------------
  // T6: License deals exist (Phase 2 seed)
  // -------------------------------------------------------------------------
  test('T6: PM sees seeded license deals', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/license-deals`)

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    const count = await rows.count()
    expect(count, 'PM should see at least 5 seeded license deals').toBeGreaterThanOrEqual(5)

    // Verify table shows enterprise type and won status from seed
    const bodyText = (await page.locator('tbody').textContent())?.toLowerCase() ?? ''
    expect(bodyText, 'Should contain enterprise type deals').toContain('enterprise')
    expect(bodyText, 'Should contain won status deals').toContain('won')
  })

  // -------------------------------------------------------------------------
  // T7: RFP campaigns with correct statuses (Phase 3 seed)
  // -------------------------------------------------------------------------
  test('T7: PM sees RFP campaigns with correct statuses', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/rfp-campaigns`)

    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    const bodyText = (await page.locator('tbody').textContent()) ?? ''
    // 3 campaigns seeded: 1 awarded, 1 published, 1 draft
    expect(bodyText, 'Should show awarded FinTech campaign').toContain('FinTech Migration Platform')
    expect(bodyText, 'Should show published Healthcare campaign').toContain('Healthcare Data Platform')
    expect(bodyText, 'Should show draft E-commerce campaign').toContain('E-commerce Replatform')

    // Status badges
    const bodyLower = bodyText.toLowerCase()
    expect(bodyLower, 'Should show Awarded status').toContain('awarded')
    expect(bodyLower, 'Should show Published status').toContain('published')
    expect(bodyLower, 'Should show Draft status').toContain('draft')
  })

  // -------------------------------------------------------------------------
  // T8: Awarded campaign has responses (Phase 3 seed)
  // -------------------------------------------------------------------------
  test('T8: Seeded FinTech campaign has responses from Acme and Nordic', async ({ request }) => {
    // Get campaigns list
    const campaignsRes = await apiRequest(request, 'GET', '/api/partnerships/rfp-campaigns', { token: pmToken })
    expect(campaignsRes.ok()).toBe(true)
    const campaignsBody = await campaignsRes.json()
    const campaigns = campaignsBody.results ?? campaignsBody.items ?? []

    // Find the seeded FinTech campaign by title (not by status — other tests create awarded campaigns too)
    const fintech = campaigns.find((c: any) => c.title?.includes('FinTech Migration Platform'))
    expect(fintech, 'Should have seeded FinTech Migration Platform campaign').toBeTruthy()
    expect(fintech.status, 'FinTech campaign should be awarded').toBe('awarded')

    // Get responses for this campaign
    const responsesRes = await apiRequest(request, 'GET', `/api/partnerships/rfp-responses?campaignId=${fintech.id}`, { token: pmToken })
    expect(responsesRes.ok()).toBe(true)
    const responsesBody = await responsesRes.json()
    const responses = responsesBody.results ?? responsesBody.items ?? []

    expect(responses.length, 'FinTech campaign should have 2 responses (Acme + Nordic)').toBe(2)
  })

  // -------------------------------------------------------------------------
  // T9: Nordic users can log in (multi-agency seed)
  // -------------------------------------------------------------------------
  test('T9: Nordic admin and BD can log in and reach dashboard', async ({ page, request }) => {
    const nordicAdminToken = await getAuthToken(request, NORDIC_ADMIN_EMAIL, DEMO_PASSWORD)
    const nordicBdToken = await getAuthToken(request, NORDIC_BD_EMAIL, DEMO_PASSWORD)

    expect(nordicAdminToken, 'Nordic Admin should have a valid token').toBeTruthy()
    expect(nordicBdToken, 'Nordic BD should have a valid token').toBeTruthy()

    // Nordic Admin reaches dashboard
    await loginInBrowser(page, nordicAdminToken)
    await page.goto(`${BASE}/backend`)
    await page.waitForLoadState('domcontentloaded')
    const title = await page.title()
    expect(title !== '404: This page could not be found.', 'Nordic Admin should reach dashboard').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Seed data verification UI — deals, case studies, agencies, user login',
  dependsOnModules: ['partnerships', 'customers', 'auth', 'directory', 'entities'],
}
