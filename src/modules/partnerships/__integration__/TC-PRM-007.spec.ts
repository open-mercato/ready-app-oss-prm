import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenContext, getTokenScope } from '@open-mercato/core/helpers/integration/generalFixtures'
import { deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { loginInBrowser } from './helpers/login'

/**
 * TC-PRM-007: Admin Creates Users UI (US-1.4 + US-1.5)
 *
 * Verifies that Agency Admin can create BD and Contributor accounts.
 * User creation is done via API (no custom PRM user creation page),
 * but the test verifies the created user can log in and access the
 * dashboard via the browser.
 *
 * T1 — Admin creates a BD user, new user can reach dashboard
 * T2 — Admin creates a Contributor user, new user can reach dashboard
 * T3 — BD user cannot create users (403 via API)
 *
 * Source: apps/prm/src/modules/partnerships/setup.ts (PRM_ROLE_FEATURES)
 * Phase: 1
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'
const BD_EMAIL = 'acme-bd@demo.local'
const BD_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-007: Admin Creates Users UI (US-1.4 + US-1.5)', () => {
  // -------------------------------------------------------------------------
  // T1: Admin creates BD user, new user reaches dashboard
  // -------------------------------------------------------------------------
  test('T1: Admin creates BD user who can access dashboard', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const { organizationId } = getTokenContext(adminToken)
    const stamp = Date.now()
    const testEmail = `test-bd-ui-${stamp}@test.local`
    const testPassword = 'Test123!'
    let createdUserId: string | null = null

    try {
      // Create user via API (no PRM-specific user creation UI)
      const res = await apiRequest(request, 'POST', '/api/auth/users', {
        token: adminToken,
        data: {
          email: testEmail,
          password: testPassword,
          name: 'Test BD UI',
          organizationId,
          roles: ['agency_business_developer'],
        },
      })
      expect([200, 201].includes(res.status()), `User creation failed: ${res.status()}`).toBe(true)
      const body = await readJsonSafe<{ id?: string }>(res)
      createdUserId = body?.id ?? null

      // New user logs in via browser and reaches dashboard
      const newUserToken = await getAuthToken(request, testEmail, testPassword)
      await loginInBrowser(page, newUserToken)
      await page.goto(`${BASE}/backend`)
      await page.waitForLoadState('domcontentloaded')

      const title = await page.title()
      expect(title, 'New BD user should reach dashboard, not 404').not.toBe('404: This page could not be found.')

      // Dashboard should load content
      const mainText = await page.locator('main').textContent().catch(() => '')
      expect(mainText?.length, 'Dashboard should have content for new BD user').toBeGreaterThan(0)
    } finally {
      await deleteUserIfExists(request, adminToken, createdUserId)
    }
  })

  // -------------------------------------------------------------------------
  // T2: Admin creates Contributor user, new user reaches dashboard
  // -------------------------------------------------------------------------
  test('T2: Admin creates Contributor user who can access dashboard', async ({ page, request }) => {
    const adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const { organizationId } = getTokenContext(adminToken)
    const stamp = Date.now()
    const testEmail = `test-contrib-ui-${stamp}@test.local`
    const testPassword = 'Test123!'
    let createdUserId: string | null = null

    try {
      const res = await apiRequest(request, 'POST', '/api/auth/users', {
        token: adminToken,
        data: {
          email: testEmail,
          password: testPassword,
          name: 'Test Contributor UI',
          organizationId,
          roles: ['agency_developer'],
        },
      })
      expect([200, 201].includes(res.status()), `User creation failed: ${res.status()}`).toBe(true)
      const body = await readJsonSafe<{ id?: string }>(res)
      createdUserId = body?.id ?? null

      // New contributor logs in and reaches dashboard
      const newUserToken = await getAuthToken(request, testEmail, testPassword)
      await loginInBrowser(page, newUserToken)
      await page.goto(`${BASE}/backend`)
      await page.waitForLoadState('domcontentloaded')

      const title = await page.title()
      expect(title, 'New Contributor should reach dashboard').not.toBe('404: This page could not be found.')
    } finally {
      await deleteUserIfExists(request, adminToken, createdUserId)
    }
  })

  // -------------------------------------------------------------------------
  // T3: BD user cannot create users
  // -------------------------------------------------------------------------
  test('T3: BD user cannot create users — 403', async ({ request }) => {
    const bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    const { organizationId } = getTokenContext(bdToken)

    const res = await apiRequest(request, 'POST', '/api/auth/users', {
      token: bdToken,
      data: {
        email: `test-denied-${Date.now()}@test.local`,
        password: 'Test123!',
        name: 'Should Not Be Created',
        organizationId,
        roles: ['agency_business_developer'],
      },
    })

    expect(res.status(), 'BD user should get 403 for user creation').toBe(403)
  })
})

// ---------------------------------------------------------------------------
// TC-PRM-007 Part 2: Settings > Users page & auth-route guardrails
// ---------------------------------------------------------------------------

test.describe('TC-PRM-007: Settings > Users page & auth guardrails', () => {
  // Shared tokens — obtained once in the first test to avoid 429 rate limiting.
  // Tests run serially so tokens are available to all subsequent tests.
  test.describe.configure({ mode: 'serial' })
  let adminToken: string
  let bdToken: string
  let adminOrgId: string
  let adminUserId: string

  test('setup: obtain auth tokens', async ({ request }) => {
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const ctx = getTokenContext(adminToken)
    adminOrgId = ctx.organizationId
    const scope = getTokenScope(adminToken)
    adminUserId = scope.userId
    bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    expect(adminToken).toBeTruthy()
    expect(bdToken).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // T1: Admin opens /backend/partnerships/users
  // -------------------------------------------------------------------------
  test('T1: Admin opens Settings > Users page', async ({ page }) => {
    await loginInBrowser(page, adminToken)

    await page.goto(`${BASE}/backend/partnerships/users`)
    await page.waitForLoadState('domcontentloaded')

    // Page renders (not 404)
    const title = await page.title()
    expect(title, 'Users page should render, not 404').not.toBe('404: This page could not be found.')

    // Page is under Settings navigation — look for Settings nav item or breadcrumb
    const settingsNav = page.locator('nav, [role="navigation"]').locator('text=/Settings/i')
    const settingsVisible = await settingsNav.first().isVisible().catch(() => false)
    const breadcrumb = page.locator('text=/Settings/i')
    const breadcrumbVisible = await breadcrumb.first().isVisible().catch(() => false)
    expect(settingsVisible || breadcrumbVisible, 'Settings navigation context should be visible').toBe(true)

    // Wait for bootstrap to finish (loading spinner to disappear)
    await page.locator('text=/Loading/i').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})

    // User list or empty state should be visible
    const content = page.locator('table, [role="table"]').or(page.locator('text=/No users/i'))
    await expect(content.first()).toBeVisible({ timeout: 15_000 })

    // Invite button is visible
    const inviteButton = page.getByRole('button', { name: /invite|create/i })
    await expect(inviteButton.first()).toBeVisible({ timeout: 5_000 })
  })

  // -------------------------------------------------------------------------
  // T2: Admin creates agency_business_developer from PRM page — credential handoff
  // -------------------------------------------------------------------------
  test('T2: Admin creates BD user from PRM page and sees credential handoff', async ({ page, request }) => {
    await loginInBrowser(page, adminToken)
    const stamp = Date.now()
    const testEmail = `test-c8-bd-ui-${stamp}@test.local`
    let createdUserId: string | null = null

    try {
      await page.goto(`${BASE}/backend/partnerships/users`)
      await page.waitForLoadState('domcontentloaded')

      // Wait for page to bootstrap (table or empty state)
      await page.locator('table, [role="table"]').or(page.locator('text=/No users/i')).first().waitFor({ timeout: 15_000 })

      // Click invite button
      const inviteBtn = page.getByRole('button', { name: /invite|create.*credentials/i })
      await expect(inviteBtn.first()).toBeVisible({ timeout: 5_000 })
      await inviteBtn.first().click()

      // Dialog should open
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Fill email
      await dialog.locator('#user-email').fill(testEmail)

      // Select agency_business_developer role
      const roleSelect = dialog.locator('#user-role')
      const options = await roleSelect.locator('option').allTextContents()
      const memberOption = options.find((o) => o.includes('agency_business_developer'))
      if (memberOption) {
        await roleSelect.selectOption({ label: memberOption })
      }

      // Submit
      await dialog.getByRole('button', { name: /create.*credentials|save/i }).click()

      // Credential handoff banner should appear
      const credentialBanner = page.locator('pre')
      await expect(credentialBanner.first()).toBeVisible({ timeout: 10_000 })
      const credentialText = await credentialBanner.first().textContent() ?? ''

      // Verify credential message contains the email and login info
      expect(credentialText, 'Credential message should contain the email').toContain(testEmail)
      expect(credentialText, 'Credential message should contain login URL').toContain('/login')

      // Copy button should be visible
      const copyBtn = page.getByRole('button', { name: /copy invite/i })
      await expect(copyBtn.first()).toBeVisible({ timeout: 3_000 })

      // Find created user ID for cleanup
      const listRes = await apiRequest(request, 'GET', `/api/auth/users?search=${encodeURIComponent(testEmail)}`, { token: adminToken })
      if (listRes.ok()) {
        const body = await readJsonSafe<{ items: Array<{ id: string }> }>(listRes)
        createdUserId = body?.items?.[0]?.id ?? null
      }
    } finally {
      if (createdUserId) {
        await deleteUserIfExists(request, adminToken, createdUserId)
      }
    }
  })

  // -------------------------------------------------------------------------
  // T3: Admin creates agency_developer from PRM page
  // -------------------------------------------------------------------------
  test('T3: Admin creates Contributor from PRM page and sees credential handoff', async ({ page, request }) => {
    await loginInBrowser(page, adminToken)
    const stamp = Date.now()
    const testEmail = `test-c8-contrib-ui-${stamp}@test.local`
    let createdUserId: string | null = null

    try {
      await page.goto(`${BASE}/backend/partnerships/users`)
      await page.waitForLoadState('domcontentloaded')

      await page.locator('table, [role="table"]').or(page.locator('text=/No users/i')).first().waitFor({ timeout: 15_000 })

      // Click invite button
      const inviteBtn = page.getByRole('button', { name: /invite|create.*credentials/i })
      await inviteBtn.first().click()

      // Dialog
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Fill email
      await dialog.locator('#user-email').fill(testEmail)

      // Select agency_developer role
      const roleSelect = dialog.locator('#user-role')
      const options = await roleSelect.locator('option').allTextContents()
      const contribOption = options.find((o) => o.includes('agency_developer'))
      if (contribOption) {
        await roleSelect.selectOption({ label: contribOption })
      }

      // Submit
      await dialog.getByRole('button', { name: /create.*credentials|save/i }).click()

      // Credential handoff banner
      const credentialBanner = page.locator('pre')
      await expect(credentialBanner.first()).toBeVisible({ timeout: 10_000 })
      const credentialText = await credentialBanner.first().textContent() ?? ''

      expect(credentialText, 'Credential message should contain email').toContain(testEmail)
      expect(credentialText, 'Credential message should contain agency_developer').toContain('agency_developer')

      // Cleanup: find created user
      const listRes = await apiRequest(request, 'GET', `/api/auth/users?search=${encodeURIComponent(testEmail)}`, { token: adminToken })
      if (listRes.ok()) {
        const body = await readJsonSafe<{ items: Array<{ id: string }> }>(listRes)
        createdUserId = body?.items?.[0]?.id ?? null
      }
    } finally {
      if (createdUserId) {
        await deleteUserIfExists(request, adminToken, createdUserId)
      }
    }
  })

  // -------------------------------------------------------------------------
  // T5: Admin resets password from PRM page — credential handoff
  // -------------------------------------------------------------------------
  test('T5: Admin resets user password from PRM page and sees credential handoff', async ({ page, request }) => {
    await loginInBrowser(page, adminToken)
    const stamp = Date.now()
    const testEmail = `test-c8-reset-ui-${stamp}@test.local`
    let createdUserId: string | null = null

    try {
      // Create a user via API first
      const createRes = await apiRequest(request, 'POST', '/api/auth/users', {
        token: adminToken,
        data: {
          email: testEmail,
          password: 'Temp123!Abc',
          organizationId: adminOrgId,
          roles: ['agency_business_developer'],
        },
      })
      expect(createRes.ok(), `Setup: user creation failed ${createRes.status()}`).toBeTruthy()
      const createBody = await readJsonSafe<{ id: string }>(createRes)
      createdUserId = createBody?.id ?? null

      // Navigate to users page
      await page.goto(`${BASE}/backend/partnerships/users`)
      await page.waitForLoadState('domcontentloaded')

      // Wait for the user to appear in the table
      await page.locator('table, [role="table"]').first().waitFor({ timeout: 15_000 })
      const userRow = page.locator(`text=${testEmail}`).first()
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // Open row actions — RowActions renders "Open actions" button (IconButton with ⋯)
      const row = page.locator('tr', { has: page.locator(`text=${testEmail}`) })
      const actionsButton = row.getByRole('button', { name: /open actions/i })
      // Focus then press Enter — RowActions opens on keyboard too
      await actionsButton.focus()
      await actionsButton.press('Enter')

      // Wait for menu to appear and click Edit
      const editItem = page.getByRole('menuitem', { name: /edit/i }).first()
      await expect(editItem).toBeVisible({ timeout: 5_000 })
      await editItem.click()

      // Edit dialog should open
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Check the "Reset password" checkbox
      const resetCheckbox = dialog.locator('#reset-password')
      await expect(resetCheckbox).toBeVisible({ timeout: 3_000 })
      await resetCheckbox.check()

      // Submit
      await dialog.getByRole('button', { name: /save/i }).click()

      // Credential handoff banner should appear with new password
      const credentialBanner = page.locator('pre')
      await expect(credentialBanner.first()).toBeVisible({ timeout: 10_000 })
      const credentialText = await credentialBanner.first().textContent() ?? ''

      expect(credentialText, 'Reset credential message should contain email').toContain(testEmail)
      expect(credentialText, 'Reset credential message should contain Password line').toContain('Password')
      expect(credentialText, 'Reset credential message should contain login URL').toContain('/login')
    } finally {
      if (createdUserId) {
        await deleteUserIfExists(request, adminToken, createdUserId)
      }
    }
  })

  // -------------------------------------------------------------------------
  // T7: Agency Admin submits non-agency role via raw API — 403
  // -------------------------------------------------------------------------
  test('T7: Agency Admin cannot assign partnership_manager role via API', async ({ request }) => {

    const res = await apiRequest(request, 'POST', '/api/auth/users', {
      token: adminToken,
      data: {
        email: `test-c8-${Date.now()}@example.com`,
        password: 'Test123!',
        name: 'Bad Role User',
        organizationId: adminOrgId,
        roles: ['partnership_manager'],
      },
    })

    expect(res.status(), 'Non-agency role should be rejected with 403').toBe(403)
  })

  // -------------------------------------------------------------------------
  // T8: Agency Admin submits foreign organizationId via raw API — 403
  // -------------------------------------------------------------------------
  test('T8: Agency Admin cannot create user in foreign org via API', async ({ request }) => {
    const fakeOrgId = '00000000-0000-0000-0000-000000000099'

    const res = await apiRequest(request, 'POST', '/api/auth/users', {
      token: adminToken,
      data: {
        email: `test-c8-${Date.now()}@example.com`,
        password: 'Test123!',
        name: 'Foreign Org User',
        organizationId: fakeOrgId,
        roles: ['agency_business_developer'],
      },
    })

    expect(res.status(), 'Foreign org should be rejected with 403').toBe(403)
  })

  // -------------------------------------------------------------------------
  // T9: Agency Admin loads /api/auth/users — interceptor filters to own org
  // -------------------------------------------------------------------------
  test('T9: PRM agency-users endpoint returns only own-org users', async ({ request }) => {
    // The PRM page uses /api/partnerships/agency-users (scoped endpoint)
    // instead of raw /api/auth/users. Verify only own-org users are returned.
    const res = await apiRequest(request, 'GET', `/api/partnerships/agency-users?organizationId=${adminOrgId}`, {
      token: adminToken,
    })

    expect(res.ok(), `GET /api/partnerships/agency-users failed: ${res.status()}`).toBeTruthy()
    const body = await readJsonSafe<{ items: Array<{ organizationId?: string }> }>(res)
    const items = body?.items ?? []
    expect(items.length).toBeGreaterThan(0)

    for (const user of items) {
      expect(
        user.organizationId,
        'Every returned user must belong to admin org',
      ).toBe(adminOrgId)
    }
  })

  // -------------------------------------------------------------------------
  // T10: Agency Admin tries self-delete — 403
  // -------------------------------------------------------------------------
  test('T10: Agency Admin cannot delete own account', async ({ request }) => {
    const res = await apiRequest(
      request,
      'DELETE',
      `/api/auth/users?id=${encodeURIComponent(adminUserId)}`,
      { token: adminToken },
    )

    expect(res.status(), 'Self-delete should be rejected with 403').toBe(403)
  })

  // -------------------------------------------------------------------------
  // T13: BD user cannot access Settings > Users page
  // -------------------------------------------------------------------------
  test('T13: BD user has no access to Settings > Users page', async ({ page }) => {
    await loginInBrowser(page, bdToken)

    await page.goto(`${BASE}/backend/partnerships/users`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3_000)

    // BD user should not see the users page content — expect 403, redirect, or missing content
    const pageTitle = await page.title()
    const is404 = pageTitle === '404: This page could not be found.'

    // Check if page has a 403 / Access Denied / Forbidden indicator
    const forbiddenText = await page.locator('text=/forbidden|access denied|not authorized|403/i').first().isVisible().catch(() => false)

    // Check if user list table is NOT visible (no access)
    const userListVisible = await page.locator('table, [data-testid="user-list"], [role="table"]').first().isVisible().catch(() => false)

    // Check if redirected away from /partnerships/users
    const currentUrl = page.url()
    const wasRedirected = !currentUrl.includes('/partnerships/users')

    // At least one of: 404, 403 text, no user list, or redirected away
    const noAccess = is404 || forbiddenText || !userListVisible || wasRedirected
    expect(noAccess, 'BD user should not have access to Settings > Users page').toBe(true)
  })

  // -------------------------------------------------------------------------
  // T14: Onboarding checklist links point to PRM users page
  // -------------------------------------------------------------------------
  test('T14: Onboarding checklist invite items link to /backend/partnerships/users', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', {
      token: adminToken,
    })

    expect(res.ok(), `GET /api/partnerships/onboarding-status failed: ${res.status()}`).toBeTruthy()
    const body = await readJsonSafe<{ items: Array<{ id: string; link: string }> }>(res)
    const items = body?.items ?? []

    const inviteBd = items.find((item) => item.id === 'invite_bd')
    const inviteContributor = items.find((item) => item.id === 'invite_contributor')

    expect(inviteBd, 'invite_bd item should exist in onboarding checklist').toBeTruthy()
    expect(inviteContributor, 'invite_contributor item should exist in onboarding checklist').toBeTruthy()

    expect(
      inviteBd!.link,
      'invite_bd link should point to /backend/partnerships/users',
    ).toBe('/backend/partnerships/users')
    expect(
      inviteContributor!.link,
      'invite_contributor link should point to /backend/partnerships/users',
    ).toBe('/backend/partnerships/users')
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Admin creates users — BD + Contributor reach dashboard, BD cannot create users; Settings > Users page + auth guardrails',
  dependsOnModules: ['partnerships', 'auth'],
}
