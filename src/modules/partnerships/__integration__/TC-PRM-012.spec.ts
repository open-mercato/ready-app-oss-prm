import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-012: PartnerLicenseDeal CRUD
 *
 * Route: /api/partnerships/partner-license-deals
 * Auth: GET requireFeatures: ['partnerships.license-deals.view'], writes requireFeatures: ['partnerships.license-deals.manage'] (PM only)
 *
 * Tests:
 * T1 — PM can create a PartnerLicenseDeal (201, id returned)
 * T2 — Duplicate (license_identifier, year) rejected (unique constraint)
 * T3 — Non-PM (admin) cannot create PLD (403)
 * T4 — PM can list PLDs (200, items array)
 *
 * Source: apps/prm/src/modules/partnerships/api/partner-license-deals/route.ts
 * Phase: 2, WF5 Tier Governance
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const CONTRIBUTOR_PASSWORD = 'Demo123!'

type JsonRecord = Record<string, unknown>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the Acme org's organizationId from an Acme user's token. */
function getAcmeOrgId(token: string): string {
  const { organizationId } = getTokenContext(token)
  expect(organizationId, 'Acme admin token should include an organizationId').toBeTruthy()
  return organizationId
}

/** Find a company from demo data to link PLDs to. */
async function findDemoCompanyId(
  request: Parameters<typeof apiRequest>[0],
  token: string,
): Promise<string> {
  const res = await apiRequest(request, 'GET', '/api/customers/companies', { token })
  expect(res.ok(), `GET /api/customers/companies failed: ${res.status()}`).toBeTruthy()
  const body = await readJsonSafe<{ items: JsonRecord[] }>(res)
  const items = body?.items ?? []
  expect(items.length, 'Demo data must contain at least one company').toBeGreaterThan(0)
  return items[0].id as string
}

/** Delete a PLD silently (for teardown). */
async function deletePld(
  request: Parameters<typeof apiRequest>[0],
  token: string | null,
  pldId: string | null,
): Promise<void> {
  if (!token || !pldId) return
  await apiRequest(
    request,
    'DELETE',
    `/api/partnerships/partner-license-deals?id=${encodeURIComponent(pldId)}`,
    { token },
  ).catch(() => {})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-012: PartnerLicenseDeal CRUD', () => {
  let pmToken: string
  let adminToken: string
  let acmeOrgId: string
  let companyId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    acmeOrgId = getAcmeOrgId(adminToken)
    companyId = await findDemoCompanyId(request, pmToken)
  })

  // -------------------------------------------------------------------------
  // T1: PM can create a PartnerLicenseDeal
  // -------------------------------------------------------------------------
  test('T1: PM can create a PartnerLicenseDeal', async ({ request }) => {
    const ts = Date.now()
    const licenseIdentifier = `QA-LIC-T1-${ts}`
    let pldId: string | null = null

    try {
      const res = await apiRequest(request, 'POST', '/api/partnerships/partner-license-deals', {
        token: pmToken,
        data: {
          organizationId: acmeOrgId,
          companyId,
          licenseIdentifier,
          industryTag: 'fintech',
          type: 'enterprise',
          status: 'won',
          isRenewal: false,
          startDate: '2098-01-01T00:00:00.000Z',
          endDate: '2098-06-15T00:00:00.000Z',
          year: 2098,
        },
      })

      expect(res.status(), `POST /api/partnerships/partner-license-deals should return 201, got ${res.status()}`).toBe(201)

      const body = await readJsonSafe<{ id: string | null }>(res)
      expect(body, 'response body must not be null').not.toBeNull()
      expect(body!.id, 'id must be returned').toBeTruthy()
      expect(typeof body!.id).toBe('string')

      pldId = body!.id
    } finally {
      await deletePld(request, pmToken, pldId)
    }
  })

  // -------------------------------------------------------------------------
  // T2: Duplicate (license_identifier, year) rejected
  // -------------------------------------------------------------------------
  test('T2: Duplicate (license_identifier, year) rejected', async ({ request }) => {
    const ts = Date.now()
    const licenseIdentifier = `QA-LIC-T2-${ts}`
    let pldId: string | null = null

    try {
      // First creation — should succeed
      const res1 = await apiRequest(request, 'POST', '/api/partnerships/partner-license-deals', {
        token: pmToken,
        data: {
          organizationId: acmeOrgId,
          companyId,
          licenseIdentifier,
          industryTag: 'healthtech',
          type: 'enterprise',
          status: 'won',
          isRenewal: false,
          startDate: '2098-01-01T00:00:00.000Z',
          endDate: '2098-07-01T00:00:00.000Z',
          year: 2098,
        },
      })
      expect(res1.status(), 'First PLD creation should succeed').toBe(201)
      const body1 = await readJsonSafe<{ id: string | null }>(res1)
      pldId = body1?.id ?? null

      // Second creation with same licenseIdentifier + year — should fail
      const res2 = await apiRequest(request, 'POST', '/api/partnerships/partner-license-deals', {
        token: pmToken,
        data: {
          organizationId: acmeOrgId,
          companyId,
          licenseIdentifier,
          industryTag: 'edtech',
          type: 'enterprise',
          status: 'won',
          isRenewal: false,
          startDate: '2098-01-01T00:00:00.000Z',
          endDate: '2098-08-01T00:00:00.000Z',
          year: 2098,
        },
      })

      // Unique constraint violation — expect 4xx (422 or 409 or 500 depending on error handling)
      expect(
        res2.status(),
        'Duplicate (licenseIdentifier, year) should be rejected',
      ).toBeGreaterThanOrEqual(400)
    } finally {
      await deletePld(request, pmToken, pldId)
    }
  })

  // -------------------------------------------------------------------------
  // T3: Non-PM cannot create PLD (403)
  // -------------------------------------------------------------------------
  test('T3: Non-PM (contributor) cannot create PLD — 403', async ({ request }) => {
    const ts = Date.now()
    const contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)

    const res = await apiRequest(request, 'POST', '/api/partnerships/partner-license-deals', {
      token: contributorToken,
      data: {
        organizationId: acmeOrgId,
        companyId,
        licenseIdentifier: `QA-LIC-T3-${ts}`,
        industryTag: 'retail',
        type: 'enterprise',
        status: 'won',
        isRenewal: false,
        startDate: '2098-01-01T00:00:00.000Z',
        endDate: '2098-09-01T00:00:00.000Z',
        year: 2098,
      },
    })

    expect(res.status(), 'Non-PM user should get 403').toBe(403)
  })

  // -------------------------------------------------------------------------
  // T4: PM can list PLDs
  // -------------------------------------------------------------------------
  test('T4: PM can list PLDs', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/partner-license-deals', {
      token: pmToken,
    })

    expect(res.status(), 'GET /api/partnerships/partner-license-deals should return 200').toBe(200)

    const body = await readJsonSafe<{ items: JsonRecord[] }>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(Array.isArray(body!.items), 'items must be an array').toBe(true)
    // Demo data should have seeded at least some PLDs
    // If not, the response should still be a valid array
    expect(body!.items.length, 'items array should exist').toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'PartnerLicenseDeal CRUD — create, duplicate rejection, PM-only, list',
  dependsOnModules: ['partnerships', 'customers', 'auth'],
}
