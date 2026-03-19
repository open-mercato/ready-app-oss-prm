import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from './helpers/api'

test.describe('TC-PRM-006: Tier management via API', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test('seeded tiers are present (bronze, silver, gold)', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/tiers', { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const items = body.data?.items ?? body.items ?? body
    const labels = (Array.isArray(items) ? items : []).map((t: any) => t.label?.toLowerCase())
    expect(labels).toEqual(expect.arrayContaining(['bronze', 'silver', 'gold']))
  })

  test('tier has expected threshold fields', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/tiers', { token })
    const body = await res.json()
    const items = body.data?.items ?? body.items ?? body
    const bronze = items.find((t: any) => t.key === 'bronze')
    expect(bronze).toBeTruthy()
    expect(bronze.wicThreshold).toBeDefined()
    expect(bronze.wipThreshold).toBeDefined()
    expect(bronze.minThreshold).toBeDefined()
    expect(bronze.isActive).toBe(true)
  })
})
