import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/testing'

test.describe('TC-PRM-010: ACL feature gating', () => {
  let adminToken: string
  let employeeToken: string

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, 'admin')
    employeeToken = await getAuthToken(request, 'employee')
  })

  test('employee can view agencies', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/agencies', {
      token: employeeToken,
    })
    expect(res.status()).toBe(200)
  })

  test('employee cannot onboard agency', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
      token: employeeToken,
      data: { agencyOrganizationId: '00000000-0000-0000-0000-000000000001' },
    })
    expect(res.status()).toBe(403)
  })

  test('employee can view tiers', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/tiers', {
      token: employeeToken,
    })
    expect(res.status()).toBe(200)
  })

  test('employee cannot create tier', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/tiers', {
      token: employeeToken,
      data: {
        key: 'test',
        label: 'Test',
        rank: 99,
        thresholds: { wicMin: 0, wipMin: 0, minMin: 0 },
      },
    })
    expect(res.status()).toBe(403)
  })

  test('unauthenticated request returns 401', async ({ request }) => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
    const res = await request.get(`${baseUrl}/api/partnerships/agencies`)
    expect(res.status()).toBe(401)
  })
})
