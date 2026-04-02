import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-033: Cross-org company_id uniqueness guard on PartnerLicenseDeal
 *
 * Validates that the same CRM company cannot be attributed to two different
 * agencies via PartnerLicenseDeal. Prevents double-counting MIN KPI.
 *
 * T1 — Create deal for Company X → Agency A succeeds
 * T2 — Create deal for same Company X → Agency B returns 422
 * T3 — Create deal for same Company X → same Agency A succeeds (same org OK)
 *
 * Phase: 2, WF5 Tier Governance
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const DEMO_PASSWORD = 'Demo123!'

test.describe('TC-PRM-033: Cross-org company_id uniqueness guard', () => {
  let pmToken: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    const adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    acmeOrgId = getTokenContext(adminToken).organizationId
  })

  test('T1: First attribution succeeds, second to different org returns 422, same org OK', async ({ request }) => {
    // Find a company via cross-org search
    const searchRes = await apiRequest(request, 'GET', '/api/partnerships/company-search?q=Demo', {
      token: pmToken,
    })
    expect(searchRes.ok()).toBe(true)
    const searchData = await readJsonSafe<{ results: Array<{ companyId: string; organizationId: string }> }>(searchRes)
    expect(searchData?.results?.length).toBeGreaterThan(0)

    const company = searchData!.results[0]
    const companyId = company.companyId
    const firstOrgId = company.organizationId

    // Create first deal — should succeed
    const uniqueLicId = `LIC-GUARD-${Date.now()}`
    const res1 = await apiRequest(request, 'POST', '/api/partnerships/partner-license-deals', {
      token: pmToken,
      data: {
        organizationId: firstOrgId,
        companyId,
        licenseIdentifier: uniqueLicId,
        industryTag: 'FinTech',
        type: 'enterprise',
        status: 'won',
        isRenewal: false,
        startDate: '2026-01-01',
        endDate: '2026-03-01',
        year: 2026,
      },
    })
    expect(res1.status(), `First deal should succeed, got ${res1.status()}`).toBe(201)

    // Find a different org — test requires at least 2 agencies in seed data
    const otherOrg = searchData!.results.find((r) => r.organizationId !== firstOrgId)
    expect(otherOrg, 'Seed data must have companies in at least 2 different agencies for cross-org test').toBeDefined()

    const res2 = await apiRequest(request, 'POST', '/api/partnerships/partner-license-deals', {
      token: pmToken,
      data: {
        organizationId: otherOrg!.organizationId,
        companyId,
        licenseIdentifier: `LIC-GUARD2-${Date.now()}`,
        industryTag: 'FinTech',
        type: 'enterprise',
        status: 'won',
        isRenewal: false,
        startDate: '2026-01-01',
        endDate: '2026-03-15',
        year: 2026,
      },
    })
    expect(res2.status()).toBe(422)
    const body = await readJsonSafe<{ error: string }>(res2)
    expect(body?.error).toContain('already attributed')

    // Same org, different license — should succeed
    const res3 = await apiRequest(request, 'POST', '/api/partnerships/partner-license-deals', {
      token: pmToken,
      data: {
        organizationId: firstOrgId,
        companyId,
        licenseIdentifier: `LIC-GUARD3-${Date.now()}`,
        industryTag: 'HealthTech',
        type: 'enterprise',
        status: 'won',
        isRenewal: false,
        startDate: '2026-01-01',
        endDate: '2026-06-01',
        year: 2026,
      },
    })
    expect(res3.status(), `Same-org deal should succeed, got ${res3.status()}`).toBe(201)
  })
})

export const integrationMeta = {
  description: 'Cross-org company_id uniqueness guard — prevents same company attributed to two agencies',
  dependsOnModules: ['partnerships', 'customers', 'auth'],
}
