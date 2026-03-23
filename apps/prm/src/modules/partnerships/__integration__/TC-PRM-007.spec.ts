import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, expectId, getTokenContext, deleteGeneralEntityIfExists } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createUserFixture, deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { createCompanyFixture, createDealFixture, deleteEntityIfExists } from '@open-mercato/core/helpers/integration/crmFixtures'

/**
 * TC-PRM-007: Admin Creates Users (US-1.4 + US-1.5)
 *
 * Verifies that Agency Admin can create BD and Contributor accounts within
 * their own org, and that non-admin users (BD) are denied.
 *
 * Demo users:
 *   - Acme Admin: acme-admin@demo.local / Demo123! (has auth.users.* feature)
 *   - Acme BD:    acme-bd@demo.local / Demo123!    (no auth.users.* feature)
 *
 * T1 — Admin can create a BD user via POST /api/auth/users (201)
 * T2 — Admin can create a Contributor user via POST /api/auth/users (201)
 * T3 — BD user cannot create users (403)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-007: Admin Creates Users (US-1.4 + US-1.5)', () => {
  // -------------------------------------------------------------------------
  // T1: Admin can create a BD user
  // -------------------------------------------------------------------------
  test('T1: Admin can create a BD user via POST /api/auth/users', async ({ request }) => {
    const adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const { organizationId } = getTokenContext(adminToken)
    const stamp = Date.now()
    const testEmail = `test-bd-${stamp}@test.local`
    let createdUserId: string | null = null

    try {
      const res = await apiRequest(request, 'POST', '/api/auth/users', {
        token: adminToken,
        data: {
          email: testEmail,
          password: 'Test123!',
          name: 'Test BD',
          organizationId,
          roles: ['partner_member'],
        },
      })

      expect(
        [200, 201].includes(res.status()),
        `POST /api/auth/users should return 200 or 201, got ${res.status()}`,
      ).toBe(true)

      const body = await readJsonSafe<{ id?: string }>(res)
      createdUserId = (body?.id as string) ?? null
      expect(createdUserId, 'User creation response should include an id').toBeTruthy()
    } finally {
      await deleteUserIfExists(request, adminToken, createdUserId)
    }
  })

  // -------------------------------------------------------------------------
  // T2: Admin can create a Contributor user
  // -------------------------------------------------------------------------
  test('T2: Admin can create a Contributor user via POST /api/auth/users', async ({ request }) => {
    const adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const { organizationId } = getTokenContext(adminToken)
    const stamp = Date.now()
    const testEmail = `test-contrib-${stamp}@test.local`
    let createdUserId: string | null = null

    try {
      const res = await apiRequest(request, 'POST', '/api/auth/users', {
        token: adminToken,
        data: {
          email: testEmail,
          password: 'Test123!',
          name: 'Test Contributor',
          organizationId,
          roles: ['partner_contributor'],
        },
      })

      expect(
        [200, 201].includes(res.status()),
        `POST /api/auth/users should return 200 or 201, got ${res.status()}`,
      ).toBe(true)

      const body = await readJsonSafe<{ id?: string }>(res)
      createdUserId = (body?.id as string) ?? null
      expect(createdUserId, 'User creation response should include an id').toBeTruthy()
    } finally {
      await deleteUserIfExists(request, adminToken, createdUserId)
    }
  })

  // -------------------------------------------------------------------------
  // T3: BD user cannot create users (no auth.users.* feature)
  // -------------------------------------------------------------------------
  test('T3: BD user cannot create users — returns 403', async ({ request }) => {
    const bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    const { organizationId } = getTokenContext(bdToken)
    const stamp = Date.now()
    const testEmail = `test-denied-${stamp}@test.local`

    const res = await apiRequest(request, 'POST', '/api/auth/users', {
      token: bdToken,
      data: {
        email: testEmail,
        password: 'Test123!',
        name: 'Should Not Be Created',
        organizationId,
        roles: ['partner_member'],
      },
    })

    expect(
      res.status(),
      `BD user should be denied user creation — expected 403, got ${res.status()}`,
    ).toBe(403)
  })
})
