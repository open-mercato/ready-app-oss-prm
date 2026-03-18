import { type APIRequestContext } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:3000'

export async function getAuthToken(
  request: APIRequestContext,
  email = 'admin@acme.com',
  password = 'secret',
): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { email, password },
  })
  if (!res.ok()) throw new Error(`Login failed: ${res.status()}`)
  const body = await res.json()
  return body.token ?? body.accessToken ?? body.data?.token
}

export async function apiRequest(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  options: { token: string; data?: unknown },
) {
  const url = `${BASE}${path}`
  const headers = { Authorization: `Bearer ${options.token}` }
  const res = await request[method.toLowerCase() as 'get'](url, {
    headers,
    ...(options.data ? { data: options.data } : {}),
  })
  return res
}
