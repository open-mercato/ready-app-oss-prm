import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { User, Role, UserRole } from '@open-mercato/core/modules/auth/data/entities'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { findAndCountWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { RbacService } from './onboarding-status'

export const metadata = {
  path: '/partnerships/agency-users',
  GET: { requireAuth: true, requireFeatures: ['partnerships.agency-profile.manage'] },
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENCY_ROLE_NAMES = ['partner_admin', 'partner_member', 'partner_contributor'] as const

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  organizationId: z.string().uuid().optional(),
})

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    organizationId: url.searchParams.get('organizationId') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid query parameters' },
      { status: 400 },
    )
  }

  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const em = container.resolve('em') as EntityManager
  const rbacService = container.resolve('rbacService') as RbacService
  const tenantId = auth.tenantId
  const userId = auth.sub

  // -----------------------------------------------------------------------
  // Determine actor type: PM or partner_admin
  // -----------------------------------------------------------------------

  const isPm = await rbacService.userHasAllFeatures(
    userId,
    ['partnerships.wic.manage'],
    { tenantId, organizationId: auth.orgId ?? null },
  )

  // -----------------------------------------------------------------------
  // Determine target organization
  // -----------------------------------------------------------------------

  let targetOrgId: string | null = null

  if (isPm) {
    // PM must supply an explicit organizationId
    if (!parsed.data.organizationId) {
      return NextResponse.json(
        { error: 'organizationId query parameter is required for PM users' },
        { status: 400 },
      )
    }
    // Verify the org exists and belongs to this tenant
    const org = await em.findOne(Organization, {
      id: parsed.data.organizationId,
      tenant: tenantId,
      isActive: true,
      deletedAt: null,
    })
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }
    targetOrgId = org.id
  } else {
    // partner_admin — always scoped to own org
    targetOrgId = auth.orgId ?? null
    if (!targetOrgId) {
      return NextResponse.json({ error: 'No organization associated with user' }, { status: 403 })
    }
  }

  // -----------------------------------------------------------------------
  // Find agency role IDs
  // -----------------------------------------------------------------------

  const agencyRoles = await em.find(Role, {
    name: { $in: [...AGENCY_ROLE_NAMES] },
    $or: [{ tenantId }, { tenantId: null }],
    deletedAt: null,
  })
  const roleIds = agencyRoles.map(r => r.id)

  if (roleIds.length === 0) {
    return NextResponse.json({ items: [], total: 0, totalPages: 0 })
  }

  // -----------------------------------------------------------------------
  // Find user-role links for agency roles
  // -----------------------------------------------------------------------

  const links = await em.find(UserRole, {
    role: { $in: roleIds },
    deletedAt: null,
  } as Record<string, unknown>)

  const userIds = links
    .map(l => String((l as any).user?.id ?? (l as any).user ?? ''))
    .filter(Boolean)

  if (userIds.length === 0) {
    return NextResponse.json({ items: [], total: 0, totalPages: 0 })
  }

  // -----------------------------------------------------------------------
  // Query users in the target org (with decryption for encrypted emails)
  // -----------------------------------------------------------------------

  const page = parsed.data.page
  const pageSize = parsed.data.pageSize

  const where = {
    id: { $in: userIds },
    organizationId: targetOrgId,
    deletedAt: null,
  }

  const [users, count] = await findAndCountWithDecryption(
    em,
    User,
    where as any,
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    },
    { tenantId },
  )

  // -----------------------------------------------------------------------
  // Build role map for returned users
  // -----------------------------------------------------------------------

  const roleNameById = new Map(agencyRoles.map(r => [String(r.id), r.name]))

  const userRoleMap = new Map<string, { roles: string[]; roleIds: string[] }>()
  for (const link of links) {
    const uid = String((link as any).user?.id ?? (link as any).user ?? '')
    const rid = String((link as any).role?.id ?? (link as any).role ?? '')
    if (!uid || !rid) continue

    if (!userRoleMap.has(uid)) {
      userRoleMap.set(uid, { roles: [], roleIds: [] })
    }
    const entry = userRoleMap.get(uid)!
    const roleName = roleNameById.get(rid)
    if (roleName && !entry.roles.includes(roleName)) {
      entry.roles.push(roleName)
      entry.roleIds.push(rid)
    }
  }

  // -----------------------------------------------------------------------
  // Build response
  // -----------------------------------------------------------------------

  const items = users.map(user => {
    const roleInfo = userRoleMap.get(String(user.id)) ?? { roles: [], roleIds: [] }
    return {
      id: user.id,
      email: user.email,
      organizationId: (user as any).organizationId ?? targetOrgId,
      roles: roleInfo.roles,
      roleIds: roleInfo.roleIds,
    }
  })

  const totalPages = Math.ceil(count / pageSize)

  return NextResponse.json({ items, total: count, totalPages })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const agencyUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  organizationId: z.string().nullable(),
  roles: z.array(z.string()).describe('Agency role names assigned to this user'),
  roleIds: z.array(z.string()).describe('Agency role IDs assigned to this user'),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'List agency users scoped to the actor\'s org (partner_admin) or a specified org (PM)',
  tags: ['Partnerships'],
  query: querySchema,
  responses: [
    {
      status: 200,
      description: 'Paginated list of agency users',
      schema: z.object({
        items: z.array(agencyUserSchema),
        total: z.number(),
        totalPages: z.number(),
      }),
    },
    { status: 400, description: 'Invalid query parameters' },
    { status: 401, description: 'Unauthorized' },
    { status: 403, description: 'No organization associated with user' },
    { status: 404, description: 'Organization not found' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Agency users',
  methods: { GET: getDoc },
}

export default GET
