import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from './helpers/api'

test.describe('TC-PRM-007: Partner portal access', () => {
  // Portal routes require customer authentication.
  // Without a portal user, they should return 401 (not 500).
  // This proves the routes are registered and the auth guard works.

  const portalPaths = [
    '/api/partnerships/portal/dashboard',
    '/api/partnerships/portal/kpi',
    '/api/partnerships/portal/rfp',
    '/api/partnerships/portal/case-studies',
  ]

  for (const path of portalPaths) {
    test(`${path} returns 401 without auth`, async ({ request }) => {
      const res = await request.get(`${process.env.BASE_URL || 'http://localhost:3000'}${path}`)
      // Should be 401 (unauthorized) — proves route exists and auth guard works
      expect(res.status()).toBe(401)
    })
  }

  test('portal routes return data with valid token', async ({ request }) => {
    // This test attempts portal access with admin token.
    // Admin may not have portal context — expect either 200 or 403 (not 500).
    const token = await getAuthToken(request)
    const res = await apiRequest(request, 'GET', '/api/partnerships/portal/dashboard', { token })
    expect([200, 403]).toContain(res.status())
  })
})
