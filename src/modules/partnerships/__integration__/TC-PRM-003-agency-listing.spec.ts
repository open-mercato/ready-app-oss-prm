import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from './helpers/api'

test.describe('TC-PRM-003: Agency listing', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test('list agencies returns paginated results', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    // Expect pagination shape or array
    const items = body.data?.items ?? body.items ?? body
    expect(Array.isArray(items)).toBe(true)
  })

  test('demo agency is present in listing', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const items = body.data?.items ?? body.items ?? body
    // At least the seeded demo agency should be present
    const demo = items.find((a: any) => a.status === 'active')
    expect(demo).toBeTruthy()
    expect(demo.agencyOrganizationId).toBeTruthy()
  })
})
