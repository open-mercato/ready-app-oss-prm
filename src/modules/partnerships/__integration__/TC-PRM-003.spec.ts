import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

/**
 * TC-PRM-003: Onboarding Checklist Widget — API contract (simplified)
 *
 * Source: src/modules/partnerships/api/get/onboarding-status.ts
 * Route: GET /api/partnerships/onboarding-status
 *
 * The API returns static checklist items per role (no completion state —
 * checked state is managed client-side via dashboard widget settings).
 *
 * T1 — Admin gets 4 static items
 * T2 — BD gets 2 static items
 * T3 — Contributor gets 1 static item
 * T4 — PM gets 403 (lacks onboarding-checklist feature)
 * T5 — Unauthenticated gets 401
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OnboardingItem = {
  id: string
  label: string
  link: string
}

type OnboardingStatusResponse = {
  role: 'agency_admin' | 'agency_business_developer' | 'agency_developer' | null
  items: OnboardingItem[]
}

function assertItemShape(item: unknown, index: number): asserts item is OnboardingItem {
  expect(typeof item === 'object' && item !== null, `item[${index}] must be an object`).toBe(true)
  const i = item as Record<string, unknown>
  expect(typeof i.id, `item[${index}].id must be a string`).toBe('string')
  expect((i.id as string).length > 0, `item[${index}].id must not be empty`).toBe(true)
  expect(typeof i.label, `item[${index}].label must be a string`).toBe('string')
  expect((i.label as string).length > 0, `item[${index}].label must not be empty`).toBe(true)
  expect(typeof i.link, `item[${index}].link must be a string`).toBe('string')
  expect((i.link as string).startsWith('/'), `item[${index}].link must start with /`).toBe(true)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'acme-admin@demo.local'
const BD_EMAIL = 'acme-bd@demo.local'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const PM_EMAIL = 'partnership-manager@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5001'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-003: Onboarding checklist API — static items per role', () => {
  test('T1: Admin gets 4 items with correct IDs and links', async ({ request }) => {
    const token = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<OnboardingStatusResponse>(response)
    expect(body).not.toBeNull()
    expect(body!.role).toBe('agency_admin')
    expect(body!.items).toHaveLength(4)

    for (let i = 0; i < body!.items.length; i++) {
      assertItemShape(body!.items[i], i)
    }

    expect(body!.items.map((i) => i.id)).toEqual([
      'fill_profile', 'add_case_study', 'invite_bd', 'invite_contributor',
    ])
    expect(body!.items[0].link).toBe('/backend/partnerships/agency-profile')
    expect(body!.items[1].link).toBe('/backend/partnerships/case-studies')
    expect(body!.items[2].link).toBe('/backend/partnerships/users')
    expect(body!.items[3].link).toBe('/backend/partnerships/users')
  })

  test('T2: BD gets 2 items with correct IDs and links', async ({ request }) => {
    const token = await getAuthToken(request, BD_EMAIL, DEMO_PASSWORD)
    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<OnboardingStatusResponse>(response)
    expect(body).not.toBeNull()
    expect(body!.role).toBe('agency_business_developer')
    expect(body!.items).toHaveLength(2)

    for (let i = 0; i < body!.items.length; i++) {
      assertItemShape(body!.items[i], i)
    }

    expect(body!.items.map((i) => i.id)).toEqual(['add_prospect', 'create_deal'])
    expect(body!.items[0].link).toBe('/backend/customers/companies')
    expect(body!.items[1].link).toBe('/backend/customers/deals')
  })

  test('T3: Contributor gets 1 item (set GH username)', async ({ request }) => {
    const token = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status()).toBe(200)

    const body = await readJsonSafe<OnboardingStatusResponse>(response)
    expect(body).not.toBeNull()
    expect(body!.role).toBe('agency_developer')
    expect(body!.items).toHaveLength(1)

    assertItemShape(body!.items[0], 0)
    expect(body!.items[0].id).toBe('set_gh_username')
    expect(body!.items[0].link).toBe('/backend/auth/profile')
  })

  test('T4: PM gets 403 (no onboarding checklist for PM)', async ({ request }) => {
    const token = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    const response = await apiRequest(request, 'GET', '/api/partnerships/onboarding-status', { token })
    expect(response.status()).toBe(403)
  })

  test('T5: Unauthenticated returns 401', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/partnerships/onboarding-status`)
    expect(response.status()).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Onboarding checklist API contract — static items per role (no completion state)',
  dependsOnModules: ['partnerships', 'auth'],
}
