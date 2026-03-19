import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/testing'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

test.describe('TC-PRM-009: RFP campaign portal route guards', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test('portal rfp list returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/partnerships/portal/rfp`)
    expect(res.status()).toBe(401)
  })

  test('portal rfp list rejects admin token', async ({ request }) => {
    const res = await apiRequest(request, 'GET', '/api/partnerships/portal/rfp', { token })
    expect([401, 403]).toContain(res.status())
  })

  test('portal rfp respond returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/partnerships/portal/rfp/fake-uuid/respond`, {
      data: { content: 'test' },
    })
    expect(res.status()).toBe(401)
  })

  test('portal rfp respond rejects admin token', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/portal/rfp/fake-uuid/respond', {
      token,
      data: { content: 'test' },
    })
    expect([401, 403]).toContain(res.status())
  })

  test('portal rfp detail returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/partnerships/portal/rfp/fake-uuid`)
    expect(res.status()).toBe(401)
  })
})
