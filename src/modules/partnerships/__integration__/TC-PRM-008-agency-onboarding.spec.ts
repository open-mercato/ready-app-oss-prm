import { test, expect } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/testing'

test.describe('TC-PRM-008: Agency self-onboarding', () => {
  let token: string
  let createdAgencyId: string | undefined
  const agencyOrganizationId = crypto.randomUUID()

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test.afterAll(async ({ request }) => {
    if (createdAgencyId) {
      await apiRequest(request, 'DELETE', `/api/partnerships/agencies/${createdAgencyId}`, { token }).catch(() => {})
    }
  })

  test('self-onboard a new agency', async ({ request }) => {
    const res = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
      token,
      data: { agencyOrganizationId },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    const agency = body.data
    expect(agency.id).toBeTruthy()
    expect(agency.status).toBe('active')
    createdAgencyId = agency.id
  })

  test('duplicate onboard returns 409', async ({ request }) => {
    test.skip(!createdAgencyId, 'No agency created')
    const res = await apiRequest(request, 'POST', '/api/partnerships/agencies', {
      token,
      data: { agencyOrganizationId },
    })
    expect(res.status()).toBe(409)
  })

  test('onboard without auth returns 401', async ({ request }) => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
    const res = await request.post(`${baseUrl}/api/partnerships/agencies`, {
      data: { agencyOrganizationId: crypto.randomUUID() },
    })
    expect(res.status()).toBe(401)
  })
})
