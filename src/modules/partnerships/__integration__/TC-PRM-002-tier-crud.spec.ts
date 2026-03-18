import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from './helpers/api'

test.describe('TC-PRM-002: Tier CRUD', () => {
  let token: string
  let createdTierId: string | undefined

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test.afterAll(async ({ request }) => {
    if (createdTierId) {
      await apiRequest(request, 'DELETE', `/api/partnerships/tiers/${createdTierId}`, { token })
    }
  })

  test('create a new tier', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/tiers', {
      token,
      data: {
        key: `test_tier_${Date.now()}`,
        label: 'Test Tier',
        rank: 99,
        thresholds: { wicMin: 0, wipMin: 0, minMin: 0 },
      },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    createdTierId = body.id ?? body.data?.id
    expect(createdTierId).toBeTruthy()
  })

  test('read the created tier', async ({ request }) => {
    test.skip(!createdTierId, 'No tier created')
    const res = await apiRequest(request, 'GET', `/api/partnerships/tiers/${createdTierId}`, { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const tier = body.data ?? body
    expect(tier.label).toBe('Test Tier')
  })

  test('update the tier', async ({ request }) => {
    test.skip(!createdTierId, 'No tier created')
    const res = await apiRequest(request, 'PATCH', `/api/partnerships/tiers/${createdTierId}`, {
      token,
      data: { label: 'Updated Tier' },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const tier = body.data ?? body
    expect(tier.label).toBe('Updated Tier')
  })
})
