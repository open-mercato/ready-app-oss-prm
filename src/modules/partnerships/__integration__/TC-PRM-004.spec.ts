import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, expectId, deleteGeneralEntityIfExists } from '@open-mercato/core/helpers/integration/generalFixtures'
import { deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'

/**
 * TC-PRM-004: Add Agency API (US-1.1)
 *
 * Route: POST /api/partnerships/agencies
 * Auth:  requireAuth + requireFeatures: ['partnerships.agencies.manage'] (PM only)
 * Body:  { agencyName: string, adminEmail: string, seedDemoData: boolean }
 *
 * Creates: Organization + User (partner_admin) + UserAcl (restricted to org) + optional demo data
 * Returns: { organizationId, adminUserId, agencyName, adminEmail, inviteMessage, demoDataSeeded }
 *
 * T1 — PM creates agency successfully (seedDemoData=false)
 * T2 — Duplicate email returns 409
 * T3 — Validation error on missing fields returns 422
 * T4 — Non-PM (BD) user gets 403
 * T5 — Demo data seeding creates pipeline + deals (seedDemoData=true)
 *
 * Source: apps/prm/src/modules/partnerships/api/post/agencies.ts
 * Phase: 1
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const BD_EMAIL = 'acme-bd@demo.local'
const BD_PASSWORD = 'Demo123!'

type JsonRecord = Record<string, unknown>

type AgencyResponse = {
  organizationId: string
  adminUserId: string
  agencyName: string
  adminEmail: string
  inviteMessage: string
  demoDataSeeded: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the plain-text password from the inviteMessage returned by the API. */
function extractPasswordFromInvite(inviteMessage: string): string | null {
  const match = inviteMessage.match(/Password:\s*(.+)/)
  return match ? match[1].trim() : null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-004: Add Agency API (US-1.1)', () => {
  // -------------------------------------------------------------------------
  // T1: PM creates agency successfully
  // -------------------------------------------------------------------------
  test('T1: PM creates agency successfully (seedDemoData=false)', async ({ request }) => {
    const pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    const ts = Date.now()
    const agencyName = `QA Agency T1 ${ts}`
    const adminEmail = `qa-t1-${ts}@test.local`

    let createdUserId: string | null = null
    let createdOrgId: string | null = null

    try {
      const res = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
        token: pmToken,
        data: { agencyName, adminEmail, seedDemoData: false },
      })

      expect(res.status(), 'POST /api/partnerships/agencies should return 201').toBe(201)

      const body = await readJsonSafe<AgencyResponse>(res)
      expect(body, 'response body must not be null').not.toBeNull()

      // Capture IDs for cleanup
      createdOrgId = body!.organizationId ?? null
      createdUserId = body!.adminUserId ?? null

      // Assert all expected fields
      expectId(body!.organizationId, 'organizationId must be a non-empty string')
      expectId(body!.adminUserId, 'adminUserId must be a non-empty string')
      expect(body!.agencyName).toBe(agencyName)
      expect(body!.adminEmail).toBe(adminEmail)
      expect(typeof body!.inviteMessage).toBe('string')
      expect(body!.inviteMessage.length).toBeGreaterThan(0)
      expect(body!.demoDataSeeded).toBe(false)

      // Assert inviteMessage contains expected details
      expect(body!.inviteMessage).toContain(agencyName)
      expect(body!.inviteMessage).toContain(adminEmail)

      // Assert inviteMessage contains a password line
      const password = extractPasswordFromInvite(body!.inviteMessage)
      expect(password, 'inviteMessage must contain a Password line').not.toBeNull()
      expect(password!.length).toBeGreaterThanOrEqual(8)
    } finally {
      await deleteUserIfExists(request, pmToken, createdUserId)
      await deleteGeneralEntityIfExists(request, pmToken, '/api/directory/organizations', createdOrgId)
    }
  })

  // -------------------------------------------------------------------------
  // T2: Duplicate email returns 409
  // -------------------------------------------------------------------------
  test('T2: Duplicate email returns 409', async ({ request }) => {
    const pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    const ts = Date.now()
    const agencyName1 = `QA Agency T2a ${ts}`
    const agencyName2 = `QA Agency T2b ${ts}`
    const sharedEmail = `qa-t2-${ts}@test.local`

    let firstUserId: string | null = null
    let firstOrgId: string | null = null
    let secondUserId: string | null = null
    let secondOrgId: string | null = null

    try {
      // Create first agency
      const res1 = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
        token: pmToken,
        data: { agencyName: agencyName1, adminEmail: sharedEmail, seedDemoData: false },
      })
      expect(res1.status(), 'First agency creation should return 201').toBe(201)

      const body1 = await readJsonSafe<AgencyResponse>(res1)
      firstUserId = body1?.adminUserId ?? null
      firstOrgId = body1?.organizationId ?? null

      // Try creating second agency with same email — should get 409
      const res2 = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
        token: pmToken,
        data: { agencyName: agencyName2, adminEmail: sharedEmail, seedDemoData: false },
      })
      expect(res2.status(), 'Duplicate email should return 409').toBe(409)

      const body2 = await readJsonSafe<JsonRecord>(res2)
      expect(body2?.error, 'Response should contain an error message').toBeTruthy()

      // Capture second IDs in case a second agency was accidentally created
      secondUserId = (body2 as AgencyResponse | null)?.adminUserId ?? null
      secondOrgId = (body2 as AgencyResponse | null)?.organizationId ?? null
    } finally {
      await deleteUserIfExists(request, pmToken, secondUserId)
      await deleteGeneralEntityIfExists(request, pmToken, '/api/directory/organizations', secondOrgId)
      await deleteUserIfExists(request, pmToken, firstUserId)
      await deleteGeneralEntityIfExists(request, pmToken, '/api/directory/organizations', firstOrgId)
    }
  })

  // -------------------------------------------------------------------------
  // T3: Validation error on missing fields returns 422
  // -------------------------------------------------------------------------
  test('T3: Validation error on missing fields returns 422', async ({ request }) => {
    const pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)

    const res = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
      token: pmToken,
      data: {},
    })

    expect(res.status(), 'Empty body should return 422').toBe(422)

    const body = await readJsonSafe<JsonRecord>(res)
    expect(body?.error, 'Response should contain an error field').toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // T4: Non-PM user (BD) gets 403
  // -------------------------------------------------------------------------
  test('T4: Non-PM user (BD) gets 403 — lacks partnerships.agencies.manage', async ({ request }) => {
    const bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    const ts = Date.now()

    const res = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
      token: bdToken,
      data: {
        agencyName: `QA Agency T4 ${ts}`,
        adminEmail: `qa-t4-${ts}@test.local`,
        seedDemoData: false,
      },
    })

    expect(res.status(), 'BD user should be rejected with 403').toBe(403)
  })

  // -------------------------------------------------------------------------
  // T5: Demo data seeding creates pipeline + deals
  // -------------------------------------------------------------------------
  test('T5: seedDemoData=true creates pipeline + deals accessible by new admin', async ({ request }) => {
    const pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    const ts = Date.now()
    const agencyName = `QA Agency T5 ${ts}`
    const adminEmail = `qa-t5-${ts}@test.local`

    let createdUserId: string | null = null
    let createdOrgId: string | null = null

    try {
      // Create agency with demo data seeding
      const res = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
        token: pmToken,
        data: { agencyName, adminEmail, seedDemoData: true },
      })

      expect(res.status(), 'POST /api/partnerships/agencies should return 201').toBe(201)

      const body = await readJsonSafe<AgencyResponse>(res)
      expect(body, 'response body must not be null').not.toBeNull()
      expect(body!.demoDataSeeded, 'demoDataSeeded should be true').toBe(true)

      createdUserId = body!.adminUserId ?? null
      createdOrgId = body!.organizationId ?? null

      // Extract the generated password from the invite message
      const password = extractPasswordFromInvite(body!.inviteMessage)
      expect(password, 'inviteMessage must contain a Password line for new admin login').not.toBeNull()

      // Authenticate as the newly created admin
      const newAdminToken = await getAuthToken(request, adminEmail, password!)

      // Fetch deals as the new admin — demo data should include deals
      const dealsRes = await apiRequest(request, 'GET', '/api/customers/deals', {
        token: newAdminToken,
      })
      expect(dealsRes.ok(), `GET /api/customers/deals should succeed: ${dealsRes.status()}`).toBeTruthy()

      const dealsBody = await readJsonSafe<{ items: JsonRecord[] }>(dealsRes)
      const items = dealsBody?.items ?? []
      expect(items.length, 'Demo data should seed at least 1 deal in the new org').toBeGreaterThanOrEqual(1)

      // Verify deals look like demo data (have titles)
      for (const deal of items) {
        expect(typeof deal.title, 'Each deal should have a string title').toBe('string')
      }
    } finally {
      await deleteUserIfExists(request, pmToken, createdUserId)
      await deleteGeneralEntityIfExists(request, pmToken, '/api/directory/organizations', createdOrgId)
    }
  })
})

// ---------------------------------------------------------------------------
// Metadata for module-gating
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Add Agency API (POST /api/partnerships/agencies) — US-1.1',
  dependsOnModules: ['partnerships', 'auth', 'directory', 'customers'],
}
