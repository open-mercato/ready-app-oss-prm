import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-005: Org Isolation (US-6.1 through US-6.4)
 *
 * Verifies that agency users only see their own organization's data
 * and that the PM (partnership_manager) can see across all orgs.
 *
 * Demo users (seeded by seedExamples):
 *   - PM:           partnership-manager@demo.local / Demo123!  (sees all orgs)
 *   - Acme Admin:   acme-admin@demo.local / Demo123!           (Acme org only)
 *   - Acme BD:      acme-bd@demo.local / Demo123!              (Acme org only)
 *   - Nordic Admin: nordic-admin@demo.local / Demo123!          (Nordic org only)
 *
 * Source: apps/prm/src/modules/partnerships/setup.ts (seedExamples)
 * Phase: 1
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const ACME_ADMIN_EMAIL = 'acme-admin@demo.local'
const ACME_BD_EMAIL = 'acme-bd@demo.local'
const NORDIC_ADMIN_EMAIL = 'nordic-admin@demo.local'
const DEMO_PASSWORD = 'Demo123!'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>

type CompanyListResponse = {
  items?: JsonRecord[]
}

type DealListResponse = {
  items?: JsonRecord[]
}

type OrgSwitcherResponse = {
  organizations?: Array<{ id: string; name: string }>
  items?: Array<{ id: string; name: string }>
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-005: Org Isolation (US-6.1 through US-6.4)', () => {
  // -------------------------------------------------------------------------
  // T1: Admin sees only own org's companies
  // -------------------------------------------------------------------------
  test('T1: Admin sees only own org companies — Acme and Nordic see disjoint sets', async ({ request }) => {
    // Auth as Acme Admin
    const acmeToken = await getAuthToken(request, ACME_ADMIN_EMAIL, DEMO_PASSWORD)
    const acmeRes = await apiRequest(request, 'GET', '/api/customers/companies', { token: acmeToken })
    expect(acmeRes.ok(), `GET /api/customers/companies (Acme Admin) failed: ${acmeRes.status()}`).toBeTruthy()
    const acmeBody = await readJsonSafe<CompanyListResponse>(acmeRes)
    const acmeCompanies = acmeBody?.items ?? []

    // Acme Admin must see at least one company (demo data includes "Acme Digital (Demo)")
    expect(
      acmeCompanies.length,
      'Acme Admin should see at least 1 company from demo seed data',
    ).toBeGreaterThanOrEqual(1)

    // All companies visible to Acme Admin should belong to Acme org context
    // (the org scoping ensures only Acme org data is returned)
    const acmeCompanyNames = acmeCompanies.map((c) => c.displayName as string)

    // Auth as Nordic Admin
    const nordicToken = await getAuthToken(request, NORDIC_ADMIN_EMAIL, DEMO_PASSWORD)
    const nordicRes = await apiRequest(request, 'GET', '/api/customers/companies', { token: nordicToken })
    expect(nordicRes.ok(), `GET /api/customers/companies (Nordic Admin) failed: ${nordicRes.status()}`).toBeTruthy()
    const nordicBody = await readJsonSafe<CompanyListResponse>(nordicRes)
    const nordicCompanies = nordicBody?.items ?? []

    // Nordic Admin must see at least one company
    expect(
      nordicCompanies.length,
      'Nordic Admin should see at least 1 company from demo seed data',
    ).toBeGreaterThanOrEqual(1)

    const nordicCompanyNames = nordicCompanies.map((c) => c.displayName as string)

    // Verify no overlap: none of Acme's companies appear in Nordic's list and vice versa
    for (const acmeName of acmeCompanyNames) {
      expect(
        nordicCompanyNames,
        `Nordic should NOT see Acme company "${acmeName}"`,
      ).not.toContain(acmeName)
    }
    for (const nordicName of nordicCompanyNames) {
      expect(
        acmeCompanyNames,
        `Acme should NOT see Nordic company "${nordicName}"`,
      ).not.toContain(nordicName)
    }
  })

  // -------------------------------------------------------------------------
  // T2: BD sees only own org's deals
  // -------------------------------------------------------------------------
  test('T2: BD user sees only own org deals', async ({ request }) => {
    const bdToken = await getAuthToken(request, ACME_BD_EMAIL, DEMO_PASSWORD)
    const res = await apiRequest(request, 'GET', '/api/customers/deals', { token: bdToken })
    expect(res.ok(), `GET /api/customers/deals (Acme BD) failed: ${res.status()}`).toBeTruthy()
    const body = await readJsonSafe<DealListResponse>(res)
    const deals = body?.items ?? []

    // Acme BD must see at least one deal (demo data seeds 5 Acme deals)
    expect(
      deals.length,
      'Acme BD should see at least 1 deal from demo seed data',
    ).toBeGreaterThanOrEqual(1)

    // All deal titles from Acme should contain "Acme" prefix (per demo seed naming convention)
    // and none should contain "Nordic" or "CloudBridge" prefixes
    for (const deal of deals) {
      const title = deal.title as string
      expect(
        title,
        `Acme BD should not see non-Acme deal: "${title}"`,
      ).not.toMatch(/^Nordic:/i)
      expect(
        title,
        `Acme BD should not see non-Acme deal: "${title}"`,
      ).not.toMatch(/^CloudBridge:/i)
    }
  })

  // -------------------------------------------------------------------------
  // T3: PM can see multiple orgs via org switcher
  // -------------------------------------------------------------------------
  test('T3: PM sees multiple organizations via org switcher API', async ({ request }) => {
    const pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    const res = await apiRequest(request, 'GET', '/api/directory/organization-switcher', { token: pmToken })
    expect(res.ok(), `GET /api/directory/organization-switcher (PM) failed: ${res.status()}`).toBeTruthy()
    const body = await readJsonSafe<OrgSwitcherResponse>(res)

    // The response may contain organizations under "organizations" or "items" key
    const orgs = body?.organizations ?? body?.items ?? []

    // PM must see at least 2 organizations: their own (home org) + at least one agency org
    expect(
      Array.isArray(orgs),
      'Organization switcher response must contain an array of organizations',
    ).toBe(true)
    expect(
      orgs.length,
      `PM should see at least 2 organizations (own + agencies), got ${orgs.length}`,
    ).toBeGreaterThanOrEqual(2)
  })

  // -------------------------------------------------------------------------
  // T4: Admin cannot access another org's data
  // -------------------------------------------------------------------------
  test('T4: Acme Admin and Nordic Admin see strictly disjoint company data', async ({ request }) => {
    // Auth as Acme Admin
    const acmeToken = await getAuthToken(request, ACME_ADMIN_EMAIL, DEMO_PASSWORD)
    const acmeRes = await apiRequest(request, 'GET', '/api/customers/companies', { token: acmeToken })
    expect(acmeRes.ok(), `GET /api/customers/companies (Acme Admin) failed: ${acmeRes.status()}`).toBeTruthy()
    const acmeBody = await readJsonSafe<CompanyListResponse>(acmeRes)
    const acmeCompanies = acmeBody?.items ?? []

    // Auth as Nordic Admin
    const nordicToken = await getAuthToken(request, NORDIC_ADMIN_EMAIL, DEMO_PASSWORD)
    const nordicRes = await apiRequest(request, 'GET', '/api/customers/companies', { token: nordicToken })
    expect(nordicRes.ok(), `GET /api/customers/companies (Nordic Admin) failed: ${nordicRes.status()}`).toBeTruthy()
    const nordicBody = await readJsonSafe<CompanyListResponse>(nordicRes)
    const nordicCompanies = nordicBody?.items ?? []

    // Both must have data
    expect(acmeCompanies.length, 'Acme Admin should see at least 1 company').toBeGreaterThanOrEqual(1)
    expect(nordicCompanies.length, 'Nordic Admin should see at least 1 company').toBeGreaterThanOrEqual(1)

    // Extract IDs for strict comparison
    const acmeIds = new Set(acmeCompanies.map((c) => c.id as string))
    const nordicIds = new Set(nordicCompanies.map((c) => c.id as string))

    // No company ID should appear in both sets
    for (const id of acmeIds) {
      expect(
        nordicIds.has(id),
        `Company ID ${id} visible to Acme Admin should NOT be visible to Nordic Admin`,
      ).toBe(false)
    }
    for (const id of nordicIds) {
      expect(
        acmeIds.has(id),
        `Company ID ${id} visible to Nordic Admin should NOT be visible to Acme Admin`,
      ).toBe(false)
    }

    // Also verify deal isolation
    const acmeDealsRes = await apiRequest(request, 'GET', '/api/customers/deals', { token: acmeToken })
    expect(acmeDealsRes.ok()).toBeTruthy()
    const acmeDeals = (await readJsonSafe<DealListResponse>(acmeDealsRes))?.items ?? []

    const nordicDealsRes = await apiRequest(request, 'GET', '/api/customers/deals', { token: nordicToken })
    expect(nordicDealsRes.ok()).toBeTruthy()
    const nordicDeals = (await readJsonSafe<DealListResponse>(nordicDealsRes))?.items ?? []

    const acmeDealIds = new Set(acmeDeals.map((d) => d.id as string))
    const nordicDealIds = new Set(nordicDeals.map((d) => d.id as string))

    for (const id of acmeDealIds) {
      expect(
        nordicDealIds.has(id),
        `Deal ID ${id} visible to Acme should NOT be visible to Nordic`,
      ).toBe(false)
    }
    for (const id of nordicDealIds) {
      expect(
        acmeDealIds.has(id),
        `Deal ID ${id} visible to Nordic should NOT be visible to Acme`,
      ).toBe(false)
    }
  })
})
