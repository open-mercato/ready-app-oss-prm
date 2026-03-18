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
    const items = body.items ?? body.data ?? body
    const keys = (Array.isArray(items) ? items : []).map((t: any) => t.key)
    expect(keys).toEqual(expect.arrayContaining(['bronze', 'silver', 'gold']))
  })

  test('demo agency is seeded', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const items = body.items ?? body.data ?? body
    expect(Array.isArray(items) ? items.length : 0).toBeGreaterThanOrEqual(1)
    const names = items.map((a: any) => a.name)
    expect(names).toContain('Demo Agency')
  })
})
