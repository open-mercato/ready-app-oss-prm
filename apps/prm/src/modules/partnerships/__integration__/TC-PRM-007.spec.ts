import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'
import { deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'

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
// Helpers
// ---------------------------------------------------------------------------

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

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
          roles: ['partner_member'],
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
          roles: ['partner_contributor'],
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
        roles: ['partner_member'],
      },
    })

    expect(res.status(), 'BD user should get 403 for user creation').toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Admin creates users — BD + Contributor reach dashboard, BD cannot create users',
  dependsOnModules: ['partnerships', 'auth'],
}
