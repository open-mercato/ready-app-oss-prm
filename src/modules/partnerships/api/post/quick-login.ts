import { NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { AuthService } from '@open-mercato/core/modules/auth/services/authService'
import { signJwt } from '@open-mercato/shared/lib/auth/jwt'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  path: '/partnerships/quick-login',
}

export async function POST(req: Request) {
  const form = await req.formData()
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')

  if (!email || !password) {
    return NextResponse.redirect(new URL('/login', req.url), 303)
  }

  const container = await createRequestContainer()
  const auth = container.resolve('authService') as AuthService

  const users = await auth.findUsersByEmail(email)
  const user = users[0] ?? null
  if (!user || !user.passwordHash) {
    return NextResponse.redirect(new URL('/login', req.url), 303)
  }

  const ok = await auth.verifyPassword(user, password)
  if (!ok) {
    return NextResponse.redirect(new URL('/login', req.url), 303)
  }

  await auth.updateLastLoginAt(user)
  const tenantId = user.tenantId ? String(user.tenantId) : null
  const userRoleNames = await auth.getUserRoles(user, tenantId)

  const token = signJwt({
    sub: String(user.id),
    tenantId,
    orgId: user.organizationId ? String(user.organizationId) : null,
    email: user.email,
    roles: userRoleNames,
  })

  const res = NextResponse.redirect(new URL('/backend', req.url), 303)
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
  })
  return res
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Quick login with redirect (demo start page)',
  methods: {},
}

export default POST
