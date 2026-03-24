import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-019: Onboarding Checklist UI — Fresh Agency Admin
 *
 * Creates a brand-new agency (no demo data) and verifies the onboarding
 * checklist widget renders correctly in the browser:
 *   - All 4 items unchecked on first login
 *   - Each item checks off as its action is completed
 *   - Widget disappears when all items are done
 *
 * This is a UI test (uses `page`), not just an API contract test.
 * Data creation uses API calls; verification happens in the browser.
 *
 * Depends on: bug fix for org-scoped invite_bd/invite_contributor checks
 * (countUsersWithRoleInOrg instead of tenant-wide countUsersWithRole).
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([
    { name: 'auth_token', value: token, url: BASE },
  ])
  await page.goto(`${BASE}/backend`)
}

/** Wait for widget spinner to disappear and checklist content to load. */
async function waitForChecklist(page: Page): Promise<void> {
  // Wait for at least one checklist item OR the widget title to appear
  await page.waitForLoadState('networkidle', { timeout: 15_000 })
}

/** Assert that a checklist item exists and return whether it is checked. */
async function isItemChecked(page: Page, label: string): Promise<boolean> {
  const item = page.locator(`a:has(span:text-is("${label}"))`).first()
  await expect(item).toBeVisible({ timeout: 10_000 })
  const textSpan = item.locator('span').last()
  const cls = await textSpan.getAttribute('class') ?? ''
  return cls.includes('line-through')
}

/** Assert all 4 items are visible and return their checked states. */
async function getChecklistState(page: Page): Promise<Record<string, boolean>> {
  const state: Record<string, boolean> = {}
  for (const [id, label] of Object.entries(ITEMS)) {
    state[id] = await isItemChecked(page, label)
  }
  return state
}

// ---------------------------------------------------------------------------
// Test suite — serial because each test builds on previous state
// ---------------------------------------------------------------------------

test.describe.serial('TC-PRM-019: Onboarding Checklist UI — Fresh Agency', () => {
  let pmToken: string
  let adminToken: string
  let adminPassword: string
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

    // Parse password from inviteMessage (line: "Password: <value>")
    const pwLine = body!.inviteMessage.split('\n').find((l) => l.startsWith('Password:'))
    expect(pwLine, 'inviteMessage must contain Password line').toBeTruthy()
    adminPassword = pwLine!.replace('Password:', '').trim()

    adminToken = await getAuthToken(request, ADMIN_EMAIL, adminPassword)
  })

  // -------------------------------------------------------------------------
  // T1: Fresh admin sees 4 unchecked items
  // -------------------------------------------------------------------------

  test('T1: Fresh admin dashboard shows onboarding checklist with 4 unchecked items', async ({ page }) => {
    await loginInBrowser(page, adminToken)
    await waitForChecklist(page)

    const state = await getChecklistState(page)

    expect(state.fill_profile, 'fill_profile should be unchecked').toBe(false)
    expect(state.add_case_study, 'add_case_study should be unchecked').toBe(false)
    expect(state.invite_bd, 'invite_bd should be unchecked').toBe(false)
    expect(state.invite_contributor, 'invite_contributor should be unchecked').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T2: Fill agency profile → fill_profile checked
  // -------------------------------------------------------------------------

  test('T2: After filling agency profile, fill_profile item is checked', async ({ page, request }) => {
    // Set services custom field on the org via entities API
    const res = await apiRequest(request, 'PUT', '/api/entities/records', {
      token: adminToken,
      data: {
        entityId: 'directory:organization',
        recordId: orgId,
        customFields: { services: 'Consulting' },
      },
    })
    expect([200, 201].includes(res.status()), `Set org profile failed: ${res.status()}`).toBe(true)

    await loginInBrowser(page, adminToken)
    await waitForChecklist(page)

    const state = await getChecklistState(page)
    expect(state.fill_profile, 'fill_profile should now be checked').toBe(true)
    expect(state.add_case_study, 'add_case_study should still be unchecked').toBe(false)
    expect(state.invite_bd, 'invite_bd should still be unchecked').toBe(false)
    expect(state.invite_contributor, 'invite_contributor should still be unchecked').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T3: Add case study → add_case_study checked
  // -------------------------------------------------------------------------

  test('T3: After adding case study, add_case_study item is checked', async ({ page, request }) => {
    const res = await apiRequest(request, 'POST', '/api/entities/records', {
      token: adminToken,
      data: {
        entityId: 'partnerships:case_study',
        values: { title: `QA Case Study ${stamp}` },
      },
    })
    expect([200, 201].includes(res.status()), `Create case study failed: ${res.status()}`).toBe(true)

    await loginInBrowser(page, adminToken)
    await waitForChecklist(page)

    const state = await getChecklistState(page)
    expect(state.fill_profile, 'fill_profile should still be checked').toBe(true)
    expect(state.add_case_study, 'add_case_study should now be checked').toBe(true)
    expect(state.invite_bd, 'invite_bd should still be unchecked').toBe(false)
    expect(state.invite_contributor, 'invite_contributor should still be unchecked').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T4: Invite BD user → invite_bd checked
  // -------------------------------------------------------------------------

  test('T4: After inviting BD, invite_bd item is checked', async ({ page, request }) => {
    const bdEmail = `qa-bd-${stamp}@test.local`
    const res = await apiRequest(request, 'POST', '/api/auth/users', {
      token: adminToken,
      data: {
        email: bdEmail,
        name: `QA BD ${stamp}`,
        password: 'TestPass123!',
        roleName: 'partner_member',
      },
    })
    expect([200, 201].includes(res.status()), `Create BD user failed: ${res.status()}`).toBe(true)

    await loginInBrowser(page, adminToken)
    await waitForChecklist(page)

    const state = await getChecklistState(page)
    expect(state.fill_profile, 'fill_profile should still be checked').toBe(true)
    expect(state.add_case_study, 'add_case_study should still be checked').toBe(true)
    expect(state.invite_bd, 'invite_bd should now be checked').toBe(true)
    expect(state.invite_contributor, 'invite_contributor should still be unchecked').toBe(false)
  })

  // -------------------------------------------------------------------------
  // T5: Invite Contributor → all done, widget disappears
  // -------------------------------------------------------------------------

  test('T5: After inviting Contributor, all items done and widget disappears', async ({ page, request }) => {
    const contribEmail = `qa-contrib-${stamp}@test.local`
    const res = await apiRequest(request, 'POST', '/api/auth/users', {
      token: adminToken,
      data: {
        email: contribEmail,
        name: `QA Contributor ${stamp}`,
        password: 'TestPass123!',
        roleName: 'partner_contributor',
      },
    })
    expect([200, 201].includes(res.status()), `Create Contributor failed: ${res.status()}`).toBe(true)

    await loginInBrowser(page, adminToken)
    await waitForChecklist(page)

    // When allCompleted=true, the widget renders null — checklist items should not be visible
    for (const label of Object.values(ITEMS)) {
      const item = page.locator(`text="${label}"`)
      await expect(item).toBeHidden({ timeout: 10_000 })
    }
  })

  // -------------------------------------------------------------------------
  // T6: Verify via API that allCompleted is true
  // -------------------------------------------------------------------------

  test('T6: API confirms allCompleted=true after all items done', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', {
      token: adminToken,
    })
    expect(res.status()).toBe(200)

    const body = await readJsonSafe<{
      role: string
      items: Array<{ id: string; completed: boolean }>
      allCompleted: boolean
    }>(res)

    expect(body!.role).toBe('partner_admin')
    expect(body!.items).toHaveLength(4)
    expect(body!.allCompleted).toBe(true)

    for (const item of body!.items) {
      expect(item.completed, `${item.id} should be completed`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Onboarding checklist UI — fresh agency admin completes all 4 items, widget disappears',
  dependsOnModules: ['partnerships', 'customers', 'auth', 'entities', 'directory'],
}
