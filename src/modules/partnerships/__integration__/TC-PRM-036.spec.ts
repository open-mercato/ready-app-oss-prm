import { test, expect, type Page } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'
import { deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { loginInBrowser } from './helpers/login'

/**
 * TC-PRM-036: Agency Onboarding E2E — Create Agency, Admin Creates Users
 *
 * Full onboarding flow:
 * T1 — PM creates a new agency via API → admin account is returned
 * T2 — New admin logs in, sees 4-item onboarding checklist
 * T3 — Admin creates BD user via auth API, BD can log in
 * T4 — Admin creates Contributor user via auth API, Contributor can log in
 * T5 — BD user sees 2-item onboarding checklist
 * T6 — Contributor user sees 1-item onboarding checklist
 *
 * Cleanup: all created users and the agency org are deleted in teardown.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

// ---------------------------------------------------------------------------
// Shared state across tests in this file
// ---------------------------------------------------------------------------

let pmToken: string
let agencyOrgId: string | null = null
let adminEmail: string
let adminPassword: string
let bdEmail: string
let bdPassword: string
let contributorEmail: string
let contributorPassword: string
let adminUserId: string | null = null
let bdUserId: string | null = null
let contributorUserId: string | null = null

const ts = Date.now()

test.describe.serial('TC-PRM-036: Agency Onboarding E2E', () => {
  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    adminEmail = `tc036-admin-${ts}@test.local`
    adminPassword = 'Test123!'
    bdEmail = `tc036-bd-${ts}@test.local`
    bdPassword = 'Test123!'
    contributorEmail = `tc036-contrib-${ts}@test.local`
    contributorPassword = 'Test123!'
  })

  test.afterAll(async ({ request }) => {
    // Clean up created users (admin token or PM token)
    const cleanupToken = pmToken
    if (contributorUserId) {
      await deleteUserIfExists(request, cleanupToken, contributorUserId)
    }
    if (bdUserId) {
      await deleteUserIfExists(request, cleanupToken, bdUserId)
    }
    if (adminUserId) {
      await deleteUserIfExists(request, cleanupToken, adminUserId)
    }
    // Clean up the organization
    if (agencyOrgId) {
      await apiRequest(request, 'DELETE', `/api/directory/organizations?id=${agencyOrgId}`, {
        token: cleanupToken,
      })
    }
  })

  // -------------------------------------------------------------------------
  // T1: PM creates a new agency
  // -------------------------------------------------------------------------
  test('T1: PM creates a new agency via API', async ({ request }) => {
    const agencyName = `TC-036 Agency ${ts}`

    const response = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
      token: pmToken,
      data: {
        agencyName,
        adminEmail,
        seedDemoData: false,
      },
    })

    expect(response.ok(), `POST /api/partnerships/agencies failed: ${response.status()}`).toBe(true)

    const body = await readJsonSafe<{
      organizationId?: string
      adminUserId?: string
      inviteMessage?: string
    }>(response)

    expect(body).not.toBeNull()
    expect(body!.organizationId, 'Response must include organizationId').toBeTruthy()
    expect(body!.adminUserId, 'Response must include adminUserId').toBeTruthy()
    expect(body!.inviteMessage, 'Response must include inviteMessage').toBeTruthy()

    agencyOrgId = body!.organizationId ?? null
    adminUserId = body!.adminUserId ?? null

    // Extract generated password from inviteMessage (format: "Password: <pwd>")
    const pwdMatch = body!.inviteMessage!.match(/Password:\s*(.+)/)
    expect(pwdMatch, 'inviteMessage must contain Password line').toBeTruthy()
    adminPassword = pwdMatch![1].trim()
  })

  // -------------------------------------------------------------------------
  // T2: New admin logs in and sees 4-item onboarding checklist
  // -------------------------------------------------------------------------
  test('T2: New admin sees 4-item onboarding checklist via API', async ({ request }) => {
    const adminToken = await getAuthToken(request, adminEmail, adminPassword)

    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', {
      token: adminToken,
    })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<{
      role: string
      items: Array<{ id: string; label: string; link: string }>
    }>(response)

    expect(body).not.toBeNull()
    expect(body!.role).toBe('agency_admin')
    expect(body!.items).toHaveLength(4)
    expect(body!.items.map((i) => i.id)).toEqual([
      'fill_profile', 'add_case_study', 'invite_bd', 'invite_contributor',
    ])
  })

  // -------------------------------------------------------------------------
  // T3: Admin creates BD user
  // -------------------------------------------------------------------------
  test('T3: Admin creates BD user who can log in', async ({ request }) => {
    const adminToken = await getAuthToken(request, adminEmail, adminPassword)

    const response = await apiRequest(request, 'POST', '/api/auth/users', {
      token: adminToken,
      data: {
        email: bdEmail,
        password: bdPassword,
        name: 'TC-036 BD User',
        organizationId: agencyOrgId,
        roles: ['agency_business_developer'],
      },
    })

    const body = await readJsonSafe<{ id?: string; error?: string }>(response)
    expect(
      [200, 201].includes(response.status()),
      `POST /api/auth/users (BD) failed: ${response.status()} — ${body?.error ?? 'no error details'}`,
    ).toBe(true)

    bdUserId = body?.id ?? null
    expect(bdUserId, 'BD user creation must return an id').toBeTruthy()

    // Verify BD can log in
    const bdToken = await getAuthToken(request, bdEmail, bdPassword)
    expect(bdToken, 'BD user must be able to authenticate').toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // T4: Admin creates Contributor user
  // -------------------------------------------------------------------------
  test('T4: Admin creates Contributor user who can log in', async ({ request }) => {
    const adminToken = await getAuthToken(request, adminEmail, adminPassword)

    const response = await apiRequest(request, 'POST', '/api/auth/users', {
      token: adminToken,
      data: {
        email: contributorEmail,
        password: contributorPassword,
        name: 'TC-036 Contributor',
        organizationId: agencyOrgId,
        roles: ['agency_developer'],
      },
    })

    const body = await readJsonSafe<{ id?: string; error?: string }>(response)
    expect(
      [200, 201].includes(response.status()),
      `POST /api/auth/users (Contributor) failed: ${response.status()} — ${body?.error ?? 'no error details'}`,
    ).toBe(true)

    contributorUserId = body?.id ?? null
    expect(contributorUserId, 'Contributor user creation must return an id').toBeTruthy()

    // Verify Contributor can log in
    const contribToken = await getAuthToken(request, contributorEmail, contributorPassword)
    expect(contribToken, 'Contributor must be able to authenticate').toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // T5: BD user sees 2-item onboarding checklist
  // -------------------------------------------------------------------------
  test('T5: BD user sees 2-item onboarding checklist', async ({ request }) => {
    const bdToken = await getAuthToken(request, bdEmail, bdPassword)

    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', {
      token: bdToken,
    })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<{
      role: string
      items: Array<{ id: string; label: string; link: string }>
    }>(response)

    expect(body).not.toBeNull()
    expect(body!.role).toBe('agency_business_developer')
    expect(body!.items).toHaveLength(2)
    expect(body!.items.map((i) => i.id)).toEqual(['add_prospect', 'create_deal'])
  })

  // -------------------------------------------------------------------------
  // T6: Contributor sees 1-item onboarding checklist
  // -------------------------------------------------------------------------
  test('T6: Contributor sees 1-item onboarding checklist', async ({ request }) => {
    const contribToken = await getAuthToken(request, contributorEmail, contributorPassword)

    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', {
      token: contribToken,
    })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<{
      role: string
      items: Array<{ id: string; label: string; link: string }>
    }>(response)

    expect(body).not.toBeNull()
    expect(body!.role).toBe('agency_developer')
    expect(body!.items).toHaveLength(1)
    expect(body!.items[0].id).toBe('set_gh_username')
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Agency onboarding E2E: PM creates agency, admin creates BD + contributor, all see correct checklists',
  dependsOnModules: ['partnerships', 'auth', 'directory'],
}
