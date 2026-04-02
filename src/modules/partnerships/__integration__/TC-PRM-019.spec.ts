import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import { loginInBrowser } from './helpers/login'

/**
 * TC-PRM-019: Onboarding Checklist UI — Fresh Agency Admin
 *
 * Creates a brand-new agency (no demo data) and verifies the onboarding
 * checklist widget renders correctly in the browser:
 *   - All 4 items unchecked on first login (proves org-scoped fix)
 *   - Each completable item checks off as its action is completed
 *   - Widget disappears when all items are done
 *
 * Data creation uses API calls; verification happens in the browser.
 *
 * Note: fill_profile uses the dedicated PRM agency profile route rather than
 * the core directory organizations edit page. This keeps the permission model
 * narrow: agency admins edit only their own profile, without organization
 * management rights.
 *
 * Phase: 1
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

const stamp = Date.now()
const AGENCY_NAME = `QA Onboard ${stamp}`
const ADMIN_EMAIL = `qa-onboard-${stamp}@test.local`

// Checklist item labels (from i18n en.json)
const ITEMS = {
  fill_profile: 'Fill your agency profile',
  add_case_study: 'Add a case study',
  invite_bd: 'Invite a Business Developer',
  invite_contributor: 'Invite a Contributor',
} as const

type ItemId = keyof typeof ITEMS

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to backend dashboard after setting auth cookie. */
async function loginAndGotoDashboard(page: Page, token: string): Promise<void> {
  await loginInBrowser(page, token)
  await page.goto(`${BASE}/backend`)
}

/** Check if a specific checklist item is visible and return its checked state. */
async function isItemChecked(page: Page, label: string): Promise<boolean> {
  const item = page.locator(`a:has(span:text-is("${label}"))`).first()
  await expect(item).toBeVisible({ timeout: 10_000 })
  const textSpan = item.locator('span').last()
  const cls = await textSpan.getAttribute('class') ?? ''
  return cls.includes('line-through')
}

/** Get checked states for all visible items. */
async function getChecklistState(page: Page): Promise<Record<string, boolean>> {
  const state: Record<string, boolean> = {}
  for (const [id, label] of Object.entries(ITEMS)) {
    state[id] = await isItemChecked(page, label)
  }
  return state
}

/** Wait for checklist widget to load (any item visible). */
async function waitForAnyItem(page: Page): Promise<void> {
  // Wait for any of the 4 item texts to appear
  const labels = Object.values(ITEMS)
  const locators = labels.map((l) => page.locator(`text="${l}"`))
  await Promise.race(locators.map((l) => l.waitFor({ state: 'visible', timeout: 15_000 })))
}

// ---------------------------------------------------------------------------
// Test suite — serial because each test builds on previous state
// ---------------------------------------------------------------------------

test.describe.serial('TC-PRM-019: Onboarding Checklist UI — Fresh Agency', () => {
  let pmToken: string
  let adminToken: string
  let orgId: string

  // -------------------------------------------------------------------------
  // Setup: PM creates fresh agency with no demo data
  // -------------------------------------------------------------------------

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)

    const res = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
      token: pmToken,
      data: { agencyName: AGENCY_NAME, adminEmail: ADMIN_EMAIL, seedDemoData: false },
    })
    expect(res.status(), `Failed to create agency: ${res.status()}`).toBe(201)

    const body = await readJsonSafe<{
      organizationId: string
      adminUserId: string
      inviteMessage: string
    }>(res)
    expect(body).not.toBeNull()
    orgId = body!.organizationId

    // Parse password from inviteMessage
    const pwLine = body!.inviteMessage.split('\n').find((l) => l.startsWith('Password:'))
    expect(pwLine, 'inviteMessage must contain Password line').toBeTruthy()
    const adminPassword = pwLine!.replace('Password:', '').trim()

    adminToken = await getAuthToken(request, ADMIN_EMAIL, adminPassword)
  })

  // -------------------------------------------------------------------------
  // T1: Fresh admin sees 4 unchecked items — proves org-scoped fix
  // -------------------------------------------------------------------------

  test('T1: Fresh admin dashboard shows 4 unchecked onboarding items', async ({ page }) => {
    await loginAndGotoDashboard(page, adminToken)
    await waitForAnyItem(page)

    const state = await getChecklistState(page)
    expect(state.fill_profile, 'fill_profile should be unchecked').toBe(false)
    expect(state.add_case_study, 'add_case_study should be unchecked').toBe(false)
    expect(state.invite_bd, 'invite_bd should be unchecked').toBe(false)
    expect(state.invite_contributor, 'invite_contributor should be unchecked').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T1b: Every checklist link navigates to a real page (no 404/crash)
  // -------------------------------------------------------------------------

  test('T1b: Every checklist link leads to a working page', async ({ page }) => {
    await loginAndGotoDashboard(page, adminToken)
    await waitForAnyItem(page)

    for (const [, label] of Object.entries(ITEMS)) {
      const link = page.locator(`a:has(span:text-is("${label}"))`).first()
      await expect(link).toBeVisible({ timeout: 5_000 })
      const href = await link.getAttribute('href')
      expect(href, `${label} should have an href`).toBeTruthy()

      // Navigate to the link target
      await page.goto(`${BASE}${href}`)

      // Wait for page to settle
      await page.waitForLoadState('domcontentloaded')

      // Page should not be a Next.js error page or access denied
      const title = await page.title()
      const isErrorPage = title === '404: This page could not be found.' || title === '404'
      const mainText = await page.getByRole('main').textContent().catch(() => '')
      const noAccess = mainText?.includes("don't have access") || mainText?.includes('Forbidden')
      expect(isErrorPage, `"${label}" link (${href}) leads to 404 page`).toBe(false)
      expect(noAccess, `"${label}" link (${href}) leads to access denied`).toBeFalsy()

      // Navigate back to dashboard for next check
      await loginAndGotoDashboard(page, adminToken)
      await page.goto(`${BASE}/backend`, { waitUntil: 'domcontentloaded' })
      await waitForAnyItem(page)
    }
  })

  // -------------------------------------------------------------------------
  // T2: Add case study → add_case_study checks off
  // -------------------------------------------------------------------------

  test('T2: After adding case study, add_case_study item is checked', async ({ page, request }) => {
    const res = await apiRequest(request, 'POST', '/api/entities/records', {
      token: adminToken,
      data: {
        entityId: 'partnerships:case_study',
        values: { title: `QA Case Study ${stamp}` },
      },
    })
    expect([200, 201].includes(res.status()), `Create case study failed: ${res.status()}`).toBe(true)

    await loginAndGotoDashboard(page, adminToken)
    await waitForAnyItem(page)

    expect(await isItemChecked(page, ITEMS.add_case_study), 'add_case_study should now be checked').toBe(true)
    expect(await isItemChecked(page, ITEMS.invite_bd), 'invite_bd should still be unchecked').toBe(false)
    expect(await isItemChecked(page, ITEMS.invite_contributor), 'invite_contributor should still be unchecked').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T3: Invite BD → invite_bd checks off
  // -------------------------------------------------------------------------

  test('T3: After inviting BD, invite_bd item is checked', async ({ page, request }) => {
    const res = await apiRequest(request, 'POST', '/api/auth/users', {
      token: adminToken,
      data: {
        email: `qa-bd-${stamp}@test.local`,
        name: `QA BD ${stamp}`,
        password: 'TestPass123!',
        organizationId: orgId,
        roles: ['agency_business_developer'],
      },
    })
    expect([200, 201].includes(res.status()), `Create BD user failed: ${res.status()}`).toBe(true)

    await loginAndGotoDashboard(page, adminToken)
    await waitForAnyItem(page)

    expect(await isItemChecked(page, ITEMS.invite_bd), 'invite_bd should now be checked').toBe(true)
    expect(await isItemChecked(page, ITEMS.invite_contributor), 'invite_contributor should still be unchecked').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T4: Invite Contributor → invite_contributor checks off
  // -------------------------------------------------------------------------

  test('T4: After inviting Contributor, invite_contributor is checked', async ({ page, request }) => {
    const res = await apiRequest(request, 'POST', '/api/auth/users', {
      token: adminToken,
      data: {
        email: `qa-contrib-${stamp}@test.local`,
        name: `QA Contributor ${stamp}`,
        password: 'TestPass123!',
        organizationId: orgId,
        roles: ['agency_developer'],
      },
    })
    expect([200, 201].includes(res.status()), `Create Contributor failed: ${res.status()}`).toBe(true)

    await loginAndGotoDashboard(page, adminToken)
    await waitForAnyItem(page)

    expect(await isItemChecked(page, ITEMS.invite_contributor), 'invite_contributor should now be checked').toBe(true)
  })

  // -------------------------------------------------------------------------
  // T5: Fill profile via dedicated agency-profile route → all done, widget gone
  // -------------------------------------------------------------------------

  test('T5: After admin fills profile, all items done and widget disappears', async ({ page, request }) => {
    const res = await apiRequest(request, 'PUT', '/api/partnerships/agency-profile', {
      token: adminToken,
      data: { values: { services: ['Consulting'] } },
    })
    expect([200, 201].includes(res.status()), `Admin set agency profile failed: ${res.status()}`).toBe(true)

    const checkRes = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token: adminToken })
    const checkBody = await readJsonSafe<{ items: Array<{ id: string; completed: boolean }>; allCompleted: boolean }>(checkRes)
    const fillProfileDone = checkBody?.items?.find((i) => i.id === 'fill_profile')?.completed ?? false
    expect(fillProfileDone, 'fill_profile should be completed after agency-profile update').toBe(true)

    // If fill_profile IS done, widget should disappear in the UI
    await loginAndGotoDashboard(page, adminToken)
    // Give widget time to load — if all done, it renders null
    await page.waitForTimeout(3_000)
    for (const label of Object.values(ITEMS)) {
      await expect(page.locator(`text="${label}"`)).toBeHidden({ timeout: 5_000 })
    }
  })

  // -------------------------------------------------------------------------
  // T6: API contract — verify individual item states
  // -------------------------------------------------------------------------

  test('T6: API confirms 3 of 4 items completed (case_study, bd, contributor)', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token: adminToken })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      role: string
      items: Array<{ id: string; completed: boolean }>
      allCompleted: boolean
    }>(res)

    expect(body!.role).toBe('agency_admin')
    expect(body!.items).toHaveLength(4)

    const byId = Object.fromEntries(body!.items.map((i) => [i.id, i.completed]))
    expect(byId.add_case_study, 'add_case_study should be completed').toBe(true)
    expect(byId.invite_bd, 'invite_bd should be completed').toBe(true)
    expect(byId.invite_contributor, 'invite_contributor should be completed').toBe(true)
    expect(byId.fill_profile, 'fill_profile should be completed').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Onboarding checklist UI — fresh agency, org-scoped checks, item completion in browser',
  dependsOnModules: ['partnerships', 'customers', 'auth', 'entities', 'directory'],
}
