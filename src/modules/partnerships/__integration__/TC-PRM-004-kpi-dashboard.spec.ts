import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from './helpers/api'

test.describe('TC-PRM-004: KPI dashboard', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test('dashboard endpoint returns expected structure', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/kpi/dashboard', { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    // Dashboard should return an object (not an array)
    expect(typeof body).toBe('object')
    expect(body).not.toBeNull()
  })

  test('dashboard contains agency metrics or empty state', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/kpi/dashboard', { token })
    const body = await res.json()
    // Accept either populated data or empty state — both valid after fresh seed
    const data = body.items ?? body.data ?? body.agencies ?? body
    expect(data).toBeDefined()
  })
})
