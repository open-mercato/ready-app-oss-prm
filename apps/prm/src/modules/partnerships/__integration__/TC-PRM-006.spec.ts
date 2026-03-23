import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-006: Cross-org Agencies API (US-2.3 PM view)
 *
 * Tests GET /api/partnerships/agencies — the PM's cross-org view listing all
 * partner agencies with their WIP counts.
 *
 * API: GET /api/partnerships/agencies
 *   - Requires: partnerships.manage feature (PM only)
 *   - Returns: { agencies: [{ organizationId, name, adminEmail, wipCount, createdAt }] }
 *
 * Demo users:
 *   - PM: partnership-manager@demo.local / Demo123!  (has partnerships.manage)
 *   - BD: acme-bd@demo.local / Demo123!              (does NOT have partnerships.manage)
 *
 * Source: apps/prm/src/modules/partnerships/api/get/agencies.ts
 * Phase: 1
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const BD_EMAIL = 'acme-bd@demo.local'
const DEMO_PASSWORD = 'Demo123!'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgencyListItem = {
  organizationId: string
  name: string
  adminEmail: string | null
  wipCount: number
  createdAt: string
}

type AgenciesResponse = {
  agencies: AgencyListItem[]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-006: Cross-org Agencies API (US-2.3 PM view)', () => {
  // -------------------------------------------------------------------------
  // T1: PM gets list of agencies with WIP counts
  // -------------------------------------------------------------------------
  test('T1: PM gets list of agencies with required fields and WIP counts', async ({ request }) => {
    const pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token: pmToken })
    expect(res.ok(), `GET /api/partnerships/agencies (PM) failed: ${res.status()}`).toBeTruthy()

    const body = await readJsonSafe<AgenciesResponse>(res)
    expect(body, 'Response body must not be null').not.toBeNull()
    expect(Array.isArray(body!.agencies), 'agencies must be an array').toBe(true)

    // Demo data seeds at least 3 agencies (Acme Digital, Nordic AI Labs, CloudBridge Solutions)
    expect(
      body!.agencies.length,
      `Expected at least 1 agency, got ${body!.agencies.length}`,
    ).toBeGreaterThanOrEqual(1)

    // Verify each agency has the required fields with correct types
    for (const agency of body!.agencies) {
      expect(typeof agency.organizationId, `organizationId must be a string`).toBe('string')
      expect(agency.organizationId.length, 'organizationId must not be empty').toBeGreaterThan(0)

      expect(typeof agency.name, 'name must be a string').toBe('string')
      expect(agency.name.length, 'name must not be empty').toBeGreaterThan(0)

      // adminEmail can be null for orgs without a partner_admin user
      expect(
        agency.adminEmail === null || typeof agency.adminEmail === 'string',
        'adminEmail must be a string or null',
      ).toBe(true)

      expect(typeof agency.wipCount, 'wipCount must be a number').toBe('number')
      expect(agency.wipCount, 'wipCount must be non-negative').toBeGreaterThanOrEqual(0)

      expect(typeof agency.createdAt, 'createdAt must be a string').toBe('string')
      expect(agency.createdAt.length, 'createdAt must not be empty').toBeGreaterThan(0)
      // Verify createdAt is a valid ISO date
      const parsed = new Date(agency.createdAt)
      expect(
        Number.isNaN(parsed.getTime()),
        `createdAt "${agency.createdAt}" must be a valid date`,
      ).toBe(false)
    }

    // PM's own org should NOT be in the agencies list
    // The PM belongs to the default org (e.g., "Open Mercato Backoffice" or similar)
    // We verify this in T3 more specifically, but also check no duplicates here
    const orgIds = body!.agencies.map((a) => a.organizationId)
    const uniqueIds = new Set(orgIds)
    expect(orgIds.length, 'No duplicate organizationIds in agency list').toBe(uniqueIds.size)
  })

  // -------------------------------------------------------------------------
  // T2: Non-PM user gets 403
  // -------------------------------------------------------------------------
  test('T2: BD user without partnerships.manage gets 403', async ({ request }) => {
    const bdToken = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token: bdToken })

    expect(
      res.status(),
      `Expected 403 for BD user, got ${res.status()}`,
    ).toBe(403)
  })

  // -------------------------------------------------------------------------
  // T3: Agency list excludes PM's home org
  // -------------------------------------------------------------------------
  test('T3: Agency list excludes PM home org', async ({ request }) => {
    const pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token: pmToken })
    expect(res.ok(), `GET /api/partnerships/agencies (PM) failed: ${res.status()}`).toBeTruthy()

    const body = await readJsonSafe<AgenciesResponse>(res)
    expect(body, 'Response body must not be null').not.toBeNull()
    expect(body!.agencies.length, 'agencies must not be empty').toBeGreaterThanOrEqual(1)

    const agencyNames = body!.agencies.map((a) => a.name.toLowerCase())

    // PM belongs to the default OM org. Common names for the PM home org:
    // "Open Mercato", "Open Mercato Backoffice", or the tenant's default org.
    // None of these should appear in the agencies list.
    for (const name of agencyNames) {
      expect(
        name.includes('open mercato'),
        `PM home org should not appear in agencies list, but found "${name}"`,
      ).toBe(false)
    }

    // Additionally, verify that the returned agencies are actual partner agencies
    // (i.e. they have the expected demo agency names or at least are not the PM's org)
    // The demo seeds: "Acme Digital", "Nordic AI Labs", "CloudBridge Solutions"
    const knownAgencyFragments = ['acme', 'nordic', 'cloudbridge']
    const hasKnownAgency = agencyNames.some((name) =>
      knownAgencyFragments.some((fragment) => name.includes(fragment))
    )
    expect(
      hasKnownAgency,
      `Expected at least one known demo agency in the list, got: ${agencyNames.join(', ')}`,
    ).toBe(true)
  })
})
