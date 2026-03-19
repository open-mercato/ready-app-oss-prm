import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from './helpers/api'

test.describe('TC-PRM-001: Seed validation', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test('default tiers are seeded (bronze, silver, gold)', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/tiers', { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const items = body.data?.items ?? body.items ?? body
    const keys = (Array.isArray(items) ? items : []).map((t: any) => t.key)
    expect(keys).toEqual(expect.arrayContaining(['bronze', 'silver', 'gold']))
  })

  test('demo agency is seeded', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const items = body.data?.items ?? body.items ?? body
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThanOrEqual(1)
    // Agency has active status and a valid agencyOrganizationId
    const first = items[0]
    expect(first.status).toBe('active')
    expect(first.agencyOrganizationId).toBeTruthy()
  })
})
