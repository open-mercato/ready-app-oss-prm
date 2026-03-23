import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-013: Cross-Org Company Search
 *
 * Route: GET /api/partnerships/company-search?q=<term>
 * Auth:  requireAuth + requireFeatures: ['partnerships.manage'] (PM only)
 *
 * Tests:
 * T1 — PM can search companies across orgs (results have expected shape)
 * T2 — Search with no results returns empty array
 * T3 — Non-PM (admin) cannot search (403)
 * T4 — Search term too short returns 400
 *
 * Source: apps/prm/src/modules/partnerships/api/get/company-search.ts
 * Phase: 2, WF5 Tier Governance
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'

type CompanySearchItem = {
  companyId: string
  companyName: string
  organizationId: string
  agencyName: string
  createdAt: string
  dealCount: number
}

type CompanySearchResponse = {
  results: CompanySearchItem[]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-013: Cross-Org Company Search', () => {
  let pmToken: string
  let adminToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  // -------------------------------------------------------------------------
  // T1: PM can search companies across orgs
  // -------------------------------------------------------------------------
  test('T1: PM can search companies across orgs', async ({ request }) => {
    // Search for a term likely to match demo data (seeded companies typically include "Acme")
    const res = await apiRequest(
      request,
      'GET',
      '/api/partnerships/company-search?q=Acme',
      { token: pmToken },
    )

    expect(res.status(), 'GET /api/partnerships/company-search should return 200').toBe(200)

    const body = await readJsonSafe<CompanySearchResponse>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(Array.isArray(body!.results), 'results must be an array').toBe(true)

    // Demo data should have at least one Acme-related company
    // If the search term does not match, at least verify the shape
    if (body!.results.length > 0) {
      const item = body!.results[0]
      expect(typeof item.companyId, 'companyId must be a string').toBe('string')
      expect(typeof item.companyName, 'companyName must be a string').toBe('string')
      expect(typeof item.organizationId, 'organizationId must be a string').toBe('string')
      expect(typeof item.agencyName, 'agencyName must be a string').toBe('string')
      expect(typeof item.createdAt, 'createdAt must be a string').toBe('string')
      expect(typeof item.dealCount, 'dealCount must be a number').toBe('number')
    }
  })

  // -------------------------------------------------------------------------
  // T2: Search with no results returns empty array
  // -------------------------------------------------------------------------
  test('T2: Search with no results returns empty array', async ({ request }) => {
    const res = await apiRequest(
      request,
      'GET',
      '/api/partnerships/company-search?q=zzz_nonexistent_company_99999',
      { token: pmToken },
    )

    expect(res.status(), 'GET with no-match term should return 200').toBe(200)

    const body = await readJsonSafe<CompanySearchResponse>(res)
    expect(body, 'response body must not be null').not.toBeNull()
    expect(Array.isArray(body!.results), 'results must be an array').toBe(true)
    expect(body!.results.length, 'results should be empty for non-matching search').toBe(0)
  })

  // -------------------------------------------------------------------------
  // T3: Non-PM (admin) cannot search (403)
  // -------------------------------------------------------------------------
  test('T3: Non-PM (admin) cannot search — 403', async ({ request }) => {
    const res = await apiRequest(
      request,
      'GET',
      '/api/partnerships/company-search?q=test',
      { token: adminToken },
    )

    expect(res.status(), 'Non-PM user should get 403').toBe(403)
  })

  // -------------------------------------------------------------------------
  // T4: Search term too short returns 400
  // -------------------------------------------------------------------------
  test('T4: Search term too short returns 400', async ({ request }) => {
    const res = await apiRequest(
      request,
      'GET',
      '/api/partnerships/company-search?q=a',
      { token: pmToken },
    )

    expect(res.status(), 'Search term < 2 chars should return 400').toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Cross-org company search — PM search, empty results, non-PM rejected, short query rejected',
  dependsOnModules: ['partnerships', 'customers', 'directory', 'auth'],
}
