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
    const items = body.items ?? body.data ?? body
    expect(Array.isArray(items)).toBe(true)
  })

  test('demo agency is present in listing', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', { token })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const items = body.items ?? body.data ?? body
    const demo = items.find((a: any) => a.name === 'Demo Agency')
    expect(demo).toBeTruthy()
    expect(demo.status).toBe('active')
  })
})
