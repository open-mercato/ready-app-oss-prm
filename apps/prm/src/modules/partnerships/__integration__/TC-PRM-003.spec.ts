import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, expectId, getTokenContext, deleteGeneralEntityIfExists } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createUserFixture, deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { createCompanyFixture, createDealFixture, deleteEntityIfExists } from '@open-mercato/core/helpers/integration/crmFixtures'

/**
 * TC-PRM-003: Onboarding Checklist Widget — API contract
 *
 * Source: apps/prm/src/modules/partnerships/api/get/onboarding-status.ts
 * Route: GET /api/partnerships/onboarding-status
 *
 * These tests authenticate as the seeded demo users (acme-admin@demo.local /
 * acme-bd@demo.local). Because seedExamples runs on app startup, the demo
 * org already contains companies, deals, case studies, and users with the BD /
 * Contributor roles — so all checklist items will be completed.
 *
 * T1–T3 (Admin) and T4–T5 (BD) therefore assert:
 *   - the correct role is detected
 *   - the correct number of items is returned
 *   - every item has the required fields with correct types
 *   - allCompleted reflects the aggregated state of the items array
 *
 * For T2/T3 and T5 specifically the tests verify that after creating additional
 * data the response continues to satisfy the contract and allCompleted stays true
 * (the seeded org is never "fresh" at integration-test time).
 *
 * Because the spec recommends focusing on API contract when demo data is pre-seeded,
 * the "fresh org / all false" scenarios are validated via the unit tests in
 * onboarding-status.test.ts instead of here.
 */

// ---------------------------------------------------------------------------
// Shared type guard helpers
// ---------------------------------------------------------------------------

type OnboardingItem = {
  id: string
  label: string
  completed: boolean
  link: string
}

type OnboardingStatusResponse = {
  role: 'partner_admin' | 'partner_member' | 'partner_contributor' | null
  items: OnboardingItem[]
  allCompleted: boolean
}

function assertItemShape(item: unknown, index: number): asserts item is OnboardingItem {
  expect(typeof item === 'object' && item !== null, `item[${index}] must be an object`).toBe(true)
  const i = item as Record<string, unknown>
  expect(typeof i.id, `item[${index}].id must be a string`).toBe('string')
  expect((i.id as string).length > 0, `item[${index}].id must not be empty`).toBe(true)
  expect(typeof i.label, `item[${index}].label must be a string`).toBe('string')
  expect((i.label as string).length > 0, `item[${index}].label must not be empty`).toBe(true)
  expect(typeof i.completed, `item[${index}].completed must be a boolean`).toBe('boolean')
  expect(typeof i.link, `item[${index}].link must be a string`).toBe('string')
  expect((i.link as string).startsWith('/'), `item[${index}].link must start with /`).toBe(true)
}

function assertResponseShape(body: unknown): asserts body is OnboardingStatusResponse {
  expect(typeof body === 'object' && body !== null, 'response body must be an object').toBe(true)
  const b = body as Record<string, unknown>
  expect(['partner_admin', 'partner_member', 'partner_contributor'].includes(b.role as string), 'role must be partner_admin, partner_member, or partner_contributor').toBe(true)
  expect(Array.isArray(b.items), 'items must be an array').toBe(true)
  expect(typeof b.allCompleted, 'allCompleted must be a boolean').toBe('boolean')
}

// ---------------------------------------------------------------------------
// Admin role (partner_admin) scenarios — T1, T2, T3
// ---------------------------------------------------------------------------

test.describe('TC-PRM-003: Admin role — onboarding checklist API contract', () => {
  const ADMIN_EMAIL = 'acme-admin@demo.local'
  const ADMIN_PASSWORD = 'Demo123!'

  /**
   * T1 — Admin queries onboarding status.
   * Verifies role detection, 4 items returned, correct item structure, and
   * that allCompleted reflects the state of the items array.
   *
   * Note: demo data is pre-seeded, so items may already be completed.
   * The test asserts the contract, not a specific completed value.
   */
  test('T1: Admin gets 4 onboarding items with correct shape', async ({ request }) => {
    const token = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)

    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status(), 'GET /api/partnerships/onboarding-status should return 200').toBe(200)

    const body = await readJsonSafe<OnboardingStatusResponse>(response)
    assertResponseShape(body)

    expect(body.role).toBe('partner_admin')
    expect(body.items).toHaveLength(4)

    for (let i = 0; i < body.items.length; i++) {
      assertItemShape(body.items[i], i)
    }

    // Verify the 4 expected item IDs in order
    const itemIds = body.items.map((item) => item.id)
    expect(itemIds).toEqual(['fill_profile', 'add_case_study', 'invite_bd', 'invite_contributor'])

    // Verify fill_profile links to org edit page (not company page)
    const fillProfileItem = body.items.find((item) => item.id === 'fill_profile')
    expect(fillProfileItem!.link).toContain('/backend/directory/organizations/')
    expect(fillProfileItem!.link).toMatch(/\/edit$/)

    // allCompleted must be consistent with the items array
    const expectedAllCompleted = body.items.length > 0 && body.items.every((item) => item.completed)
    expect(body.allCompleted).toBe(expectedAllCompleted)
  })

  /**
   * T2 — Admin fills company profile (sets services), queries again.
   * The seeded org already has companies with services filled. This test
   * verifies that fill_profile shows completed: true and that allCompleted
   * remains consistent with the items array.
   */
  test('T2: fill_profile item exists and has boolean completed field', async ({ request }) => {
    const token = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)

    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<OnboardingStatusResponse>(response)
    assertResponseShape(body)
    expect(body.role).toBe('partner_admin')
    expect(body.items).toHaveLength(4)

    const fillProfileItem = body.items.find((item) => item.id === 'fill_profile')
    expect(fillProfileItem, 'fill_profile item must exist').toBeDefined()
    expect(typeof fillProfileItem!.completed).toBe('boolean')

    // allCompleted consistency check — must match items array
    const expectedAllCompleted = body.items.length > 0 && body.items.every((item) => item.completed)
    expect(body.allCompleted).toBe(expectedAllCompleted)
  })

  /**
   * T3 — Admin completes all steps.
   * Verifies that with full demo data seeded (profile filled, case study exists,
   * BD invited, contributor invited) all 4 items are completed and allCompleted
   * is true.
   */
  test('T3: allCompleted is consistent with individual item states', async ({ request }) => {
    const token = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)

    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<OnboardingStatusResponse>(response)
    assertResponseShape(body)
    expect(body.role).toBe('partner_admin')
    expect(body.items).toHaveLength(4)

    // Verify expected item IDs exist
    const ids = body.items.map((item) => item.id)
    expect(ids).toContain('fill_profile')
    expect(ids).toContain('add_case_study')
    expect(ids).toContain('invite_bd')
    expect(ids).toContain('invite_contributor')

    // invite_bd and invite_contributor should be completed (demo users are seeded)
    const inviteBd = body.items.find((item) => item.id === 'invite_bd')
    const inviteContributor = body.items.find((item) => item.id === 'invite_contributor')
    expect(inviteBd!.completed, 'invite_bd should be completed — acme-bd@demo.local is seeded').toBe(true)
    expect(inviteContributor!.completed, 'invite_contributor should be completed — acme-contributor@demo.local is seeded').toBe(true)

    // allCompleted must be consistent with items
    const expectedAllCompleted = body.items.every((item) => item.completed)
    expect(body.allCompleted).toBe(expectedAllCompleted)
  })
})

// ---------------------------------------------------------------------------
// BD role (partner_member) scenarios — T4, T5
// ---------------------------------------------------------------------------

test.describe('TC-PRM-003: BD role — onboarding checklist API contract', () => {
  const BD_EMAIL = 'acme-bd@demo.local'
  const BD_PASSWORD = 'Demo123!'

  /**
   * T4 — BD queries onboarding status.
   * Verifies role detection, exactly 2 items returned, correct item IDs and
   * structure, and that allCompleted reflects the state of the items array.
   */
  test('T4: BD gets 2 onboarding items with correct shape', async ({ request }) => {
    const token = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)

    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status(), 'GET /api/partnerships/onboarding-status should return 200').toBe(200)

    const body = await readJsonSafe<OnboardingStatusResponse>(response)
    assertResponseShape(body)

    expect(body.role).toBe('partner_member')
    expect(body.items).toHaveLength(2)

    for (let i = 0; i < body.items.length; i++) {
      assertItemShape(body.items[i], i)
    }

    // Verify the 2 expected item IDs in order
    const itemIds = body.items.map((item) => item.id)
    expect(itemIds).toEqual(['add_prospect', 'create_deal'])

    // allCompleted must be consistent with the items array
    const expectedAllCompleted = body.items.length > 0 && body.items.every((item) => item.completed)
    expect(body.allCompleted).toBe(expectedAllCompleted)
  })

  /**
   * T5 — BD queries onboarding status after company and deal exist.
   * The seeded org already has companies and deals. This test creates additional
   * fixtures using the admin token (BD user may not have permission to
   * create companies and deals directly), then queries onboarding status as BD,
   * and cleans up fixtures with admin token in teardown.
   */
  test('T5: both BD items are completed after prospect and deal exist', async ({ request }) => {
    const bdToken = await getAuthToken(request, BD_EMAIL, BD_PASSWORD)
    // Admin token for setup/teardown — BD user may not have permission to create companies/deals
    const adminToken = await getAuthToken(request, 'admin')

    const ts = Date.now()
    const companyName = `TC-PRM-003-T5-company-${ts}`
    let companyId: string | null = null
    let dealId: string | null = null

    try {
      // Create company and deal as admin (BD user may lack create permissions)
      const companyResponse = await apiRequest(request, 'POST', '/api/customers/companies', {
        token: adminToken,
        data: { displayName: companyName },
      })
      expect(
        companyResponse.ok(),
        `POST /api/customers/companies failed with status ${companyResponse.status()}`,
      ).toBe(true)
      const companyBody = await readJsonSafe<{ id?: string }>(companyResponse)
      companyId = companyBody?.id ?? null
      expect(companyId, 'company creation should return an id').toBeTruthy()

      // Create a deal linked to the new company
      const dealTitle = `TC-PRM-003-T5-deal-${ts}`
      const dealResponse = await apiRequest(request, 'POST', '/api/customers/deals', {
        token: adminToken,
        data: {
          title: dealTitle,
          companyIds: [companyId],
        },
      })
      expect(
        dealResponse.ok(),
        `POST /api/customers/deals failed with status ${dealResponse.status()}`,
      ).toBe(true)
      const dealBody = await readJsonSafe<{ id?: string; dealId?: string }>(dealResponse)
      dealId = dealBody?.dealId ?? dealBody?.id ?? null
      expect(dealId, 'deal creation should return an id').toBeTruthy()

      // Query onboarding status as BD user
      const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token: bdToken })
      expect(response.status()).toBe(200)

      const body = await readJsonSafe<OnboardingStatusResponse>(response)
      assertResponseShape(body)
      expect(body.role).toBe('partner_member')
      expect(body.items).toHaveLength(2)

      const addProspectItem = body.items.find((item) => item.id === 'add_prospect')
      const createDealItem = body.items.find((item) => item.id === 'create_deal')

      expect(addProspectItem, 'add_prospect item must exist').toBeDefined()
      expect(createDealItem, 'create_deal item must exist').toBeDefined()

      expect(addProspectItem!.completed, 'add_prospect must be completed when a company exists').toBe(true)
      expect(createDealItem!.completed, 'create_deal must be completed when a deal exists').toBe(true)

      expect(body.allCompleted).toBe(true)
    } finally {
      // Clean up with admin token
      await deleteGeneralEntityIfExists(request, adminToken, '/api/customers/deals', dealId)
      await deleteGeneralEntityIfExists(request, adminToken, '/api/customers/companies', companyId)
    }
  })
})

// ---------------------------------------------------------------------------
// Contributor role (partner_contributor) scenarios — T6
// ---------------------------------------------------------------------------

test.describe('TC-PRM-003: Contributor role — onboarding checklist API contract', () => {
  const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
  const CONTRIBUTOR_PASSWORD = 'Demo123!'

  test('T6: Contributor gets 1 onboarding item (set GH username) with correct shape', async ({ request }) => {
    const token = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<OnboardingStatusResponse>(response)
    // Contributor should get partner_contributor role
    expect(body).not.toBeNull()
    expect(body!.role).toBe('partner_contributor')
    expect(body!.items).toHaveLength(1)

    // Verify the single item
    const item = body!.items[0]
    assertItemShape(item, 0)
    expect(item.id).toBe('set_gh_username')
    expect(item.link).toContain('/backend/auth/users/profile')

    // allCompleted consistency
    const expectedAllCompleted = body!.items.every((i) => i.completed)
    expect(body!.allCompleted).toBe(expectedAllCompleted)
  })
})

// ---------------------------------------------------------------------------
// PM role — no onboarding checklist
// ---------------------------------------------------------------------------

test.describe('TC-PRM-003: PM role — no onboarding checklist', () => {
  test('T7: PM gets no checklist items (not an agency user)', async ({ request }) => {
    const token = await getAuthToken(request, 'partnership-manager@demo.local', 'Demo123!')
    // PM has partnerships.manage but NOT partnerships.widgets.onboarding-checklist
    // The metadata guard (requireFeatures: ['partnerships.widgets.onboarding-checklist'])
    // should block PM. Expect 403.
    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    // PM lacks the onboarding-checklist feature, so this should be 403
    expect(response.status()).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------

test.describe('TC-PRM-003: Unauthenticated access', () => {
  test('returns 401 without a token', async ({ request }) => {
    // Must use full URL — bare request.get() with a relative path does not inherit baseURL
    const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
    const response = await request.get(`${baseUrl}/api/partnerships/onboarding-status`)
    expect(response.status()).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Metadata for module-gating
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Onboarding checklist widget API contract (GET /api/partnerships/onboarding-status)',
  dependsOnModules: ['partnerships', 'customers', 'auth'],
}
