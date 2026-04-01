import type {
  InterceptorRequest,
  InterceptorResponse,
  InterceptorContext,
} from '@open-mercato/shared/lib/crud/api-interceptor'

// Mock MikroORM entity modules to avoid decorator initialization issues in test env
jest.mock('@open-mercato/core/modules/customers/data/entities', () => ({
  CustomerPipelineStage: class CustomerPipelineStage {},
}))

jest.mock('@open-mercato/core/modules/entities/data/entities', () => ({
  CustomFieldValue: class CustomFieldValue {},
}))

jest.mock('@open-mercato/core/modules/auth/data/entities', () => ({
  User: class User {},
  Role: class Role {},
  UserRole: class UserRole {},
}))

jest.mock('@open-mercato/core/modules/audit_logs/services/actionLogService', () => ({
  ActionLogService: class ActionLogService {},
}))

import { interceptors, isPartnerAdmin, getAgencyRoleIds, isLastPartnerAdmin } from '../interceptors'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENCY_ROLE_NAMES = ['partner_admin', 'partner_member', 'partner_contributor']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findInterceptor(id: string) {
  const found = interceptors.find((i) => i.id === id)
  if (!found) throw new Error(`Interceptor "${id}" not found`)
  return found
}

function makeRequest(overrides: Partial<InterceptorRequest> = {}): InterceptorRequest {
  return {
    method: 'GET',
    url: 'http://localhost/api/auth/users',
    body: {},
    headers: {},
    ...overrides,
  }
}

function makeResponse(overrides: Partial<InterceptorResponse> = {}): InterceptorResponse {
  return {
    statusCode: 200,
    body: { items: [], total: 0, totalPages: 1 },
    headers: {},
    ...overrides,
  }
}

/**
 * Build a mock RbacService. `features` is the list of features the user "has".
 */
function makeRbacService(features: string[]) {
  return {
    userHasAllFeatures: jest.fn((_userId: string, required: string[]) => {
      return Promise.resolve(required.every((f) => features.includes(f)))
    }),
  }
}

/**
 * Build a mock EntityManager that can be configured per-test via overrides.
 *
 * Override keys:
 *   findRoles   — result for em.find(Role, ...)
 *   findUserRoles — result for em.find(UserRole, ...)
 *   findOneUser — result for em.findOne(User, ...)
 *   findOneRole — result for em.findOne(Role, ...)
 */
function makeMockEm(
  overrides: {
    findRoles?: Array<{ id: string; name: string }>
    findUsers?: Array<{ id: string; organizationId?: string }>
    findUserRoles?: Array<{ user: string | { id: string }; role: string }>
    findOneUser?: Record<string, unknown> | null
    findOneRole?: Record<string, unknown> | null
  } = {},
) {
  const em = {
    find: jest.fn((entity: unknown, _filter: unknown) => {
      const entityName = typeof entity === 'function' ? entity.name : String(entity)
      if (entityName === 'Role') return Promise.resolve(overrides.findRoles ?? [])
      if (entityName === 'User') return Promise.resolve(overrides.findUsers ?? [])
      if (entityName === 'UserRole') return Promise.resolve(overrides.findUserRoles ?? [])
      return Promise.resolve([])
    }),
    findOne: jest.fn((entity: unknown, _filter: unknown) => {
      const entityName = typeof entity === 'function' ? entity.name : String(entity)
      if (entityName === 'User') return Promise.resolve(overrides.findOneUser ?? null)
      if (entityName === 'Role') return Promise.resolve(overrides.findOneRole ?? null)
      return Promise.resolve(null)
    }),
    count: jest.fn().mockResolvedValue(0),
    persist: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
    fork: jest.fn(),
  }
  em.fork.mockReturnValue(em)
  return em
}

function makeContext(
  em: ReturnType<typeof makeMockEm>,
  overrides: Partial<InterceptorContext> = {},
): InterceptorContext {
  return {
    userId: 'user-actor',
    organizationId: 'org-1',
    tenantId: 'tenant-1',
    em: em as unknown as InterceptorContext['em'],
    container: {
      resolve: () => undefined,
    } as unknown as InterceptorContext['container'],
    ...overrides,
  }
}

function makeContextWithRbac(
  em: ReturnType<typeof makeMockEm>,
  rbacService: ReturnType<typeof makeRbacService>,
  overrides: Partial<InterceptorContext> = {},
): InterceptorContext {
  return makeContext(em, {
    container: {
      resolve: (name: string) => {
        if (name === 'rbacService') return rbacService
        return undefined
      },
    } as unknown as InterceptorContext['container'],
    ...overrides,
  })
}

// ===========================================================================
// Tests
// ===========================================================================

describe('auth user guardrails — helper functions', () => {
  // -------------------------------------------------------------------------
  // isPartnerAdmin
  // -------------------------------------------------------------------------
  describe('isPartnerAdmin', () => {
    it('returns false when user has partnerships.wic.manage (PM)', async () => {
      const em = makeMockEm()
      const rbacService = makeRbacService(['partnerships.wic.manage', 'partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const result = await isPartnerAdmin(context)
      expect(result).toBe(false)
    })

    it('returns true when user has partnerships.agency-profile.manage but NOT partnerships.wic.manage', async () => {
      const em = makeMockEm()
      const rbacService = makeRbacService(['partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const result = await isPartnerAdmin(context)
      expect(result).toBe(true)
    })

    it('returns false when user has neither feature', async () => {
      const em = makeMockEm()
      const rbacService = makeRbacService([])
      const context = makeContextWithRbac(em, rbacService)

      const result = await isPartnerAdmin(context)
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // getAgencyRoleIds
  // -------------------------------------------------------------------------
  describe('getAgencyRoleIds', () => {
    it('returns IDs for the 3 agency roles found in DB', async () => {
      const em = makeMockEm({
        findRoles: [
          { id: 'role-pa', name: 'partner_admin' },
          { id: 'role-pm', name: 'partner_member' },
          { id: 'role-pc', name: 'partner_contributor' },
        ],
      })

      const ids = await getAgencyRoleIds(em as unknown as Parameters<typeof getAgencyRoleIds>[0], 'tenant-1')
      expect(ids).toEqual(['role-pa', 'role-pm', 'role-pc'])
      expect(em.find).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when no roles match', async () => {
      const em = makeMockEm({ findRoles: [] })

      const ids = await getAgencyRoleIds(em as unknown as Parameters<typeof getAgencyRoleIds>[0], 'tenant-1')
      expect(ids).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // isLastPartnerAdmin
  // -------------------------------------------------------------------------
  describe('isLastPartnerAdmin', () => {
    it('returns true when target user is the only partner_admin in org', async () => {
      const em = makeMockEm({
        findOneRole: { id: 'role-pa', name: 'partner_admin' },
        findUsers: [{ id: 'user-target', organizationId: 'org-1' }],
        findUserRoles: [{ user: 'user-target', role: 'role-pa' }],
      })

      const result = await isLastPartnerAdmin(
        em as unknown as Parameters<typeof isLastPartnerAdmin>[0],
        'org-1', 'tenant-1', 'user-target',
      )
      expect(result).toBe(true)
    })

    it('returns false when there are other partner_admins in org', async () => {
      const em = makeMockEm({
        findOneRole: { id: 'role-pa', name: 'partner_admin' },
        findUsers: [
          { id: 'user-target', organizationId: 'org-1' },
          { id: 'user-other', organizationId: 'org-1' },
        ],
        findUserRoles: [
          { user: 'user-target', role: 'role-pa' },
          { user: 'user-other', role: 'role-pa' },
        ],
      })

      const result = await isLastPartnerAdmin(
        em as unknown as Parameters<typeof isLastPartnerAdmin>[0],
        'org-1', 'tenant-1', 'user-target',
      )
      expect(result).toBe(false)
    })

    it('returns false when partner_admin role does not exist', async () => {
      const em = makeMockEm({ findOneRole: null })

      const result = await isLastPartnerAdmin(
        em as unknown as Parameters<typeof isLastPartnerAdmin>[0],
        'org-1', 'tenant-1', 'user-target',
      )
      expect(result).toBe(false)
    })
  })
})

describe('auth user guardrails — interceptors', () => {
  // -------------------------------------------------------------------------
  // partnerships.auth-users-list-guard
  // -------------------------------------------------------------------------
  // Note: auth-users-list-guard was removed — auth users GET is a custom handler
  // that bypasses makeCrudRoute, so interceptor hooks don't fire for it.
  // Org isolation for GET is enforced by the PRM page always sending organizationId.

  // -------------------------------------------------------------------------
  // partnerships.auth-users-mutation-guard
  // -------------------------------------------------------------------------
  describe('partnerships.auth-users-mutation-guard', () => {
    const interceptor = findInterceptor('partnerships.auth-users-mutation-guard')

    it('passes through when user is PM', async () => {
      const em = makeMockEm()
      const rbacService = makeRbacService(['partnerships.wic.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const request = makeRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/users',
        body: { email: 'new@example.com', organizationId: 'org-other', roles: ['superadmin'] },
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(true)
      // PM -> body not rewritten
      expect(result.body).toBeUndefined()
    })

    it('rejects foreign organizationId in body', async () => {
      const em = makeMockEm({
        findRoles: [
          { id: 'role-pa', name: 'partner_admin' },
          { id: 'role-pm', name: 'partner_member' },
          { id: 'role-pc', name: 'partner_contributor' },
        ],
      })
      const rbacService = makeRbacService(['partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const request = makeRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/users',
        body: { email: 'new@example.com', organizationId: 'org-foreign' },
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(false)
      expect(result.statusCode).toBe(403)
      expect((result.body as Record<string, unknown>)?.error).toMatch(/own organization/)
    })

    it('rejects forbidden role', async () => {
      const em = makeMockEm({
        findRoles: [
          { id: 'role-pa', name: 'partner_admin' },
          { id: 'role-pm', name: 'partner_member' },
          { id: 'role-pc', name: 'partner_contributor' },
        ],
      })
      const rbacService = makeRbacService(['partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const request = makeRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/users',
        body: { email: 'new@example.com', roles: ['superadmin'] },
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(false)
      expect(result.statusCode).toBe(403)
      expect((result.body as Record<string, unknown>)?.error).toMatch(/agency roles/)
    })

    it('forces organizationId to actor org and passes for valid roles', async () => {
      const em = makeMockEm({
        findRoles: [
          { id: 'role-pa', name: 'partner_admin' },
          { id: 'role-pm', name: 'partner_member' },
          { id: 'role-pc', name: 'partner_contributor' },
        ],
      })
      const rbacService = makeRbacService(['partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const request = makeRequest({
        method: 'POST',
        url: 'http://localhost/api/auth/users',
        body: { email: 'new@example.com', roles: ['role-pm', 'partner_contributor'] },
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(true)
      expect(result.body).toBeDefined()
      expect((result.body as Record<string, unknown>).organizationId).toBe('org-1')
    })
  })

  // -------------------------------------------------------------------------
  // partnerships.auth-users-delete-guard
  // -------------------------------------------------------------------------
  describe('partnerships.auth-users-delete-guard', () => {
    const interceptor = findInterceptor('partnerships.auth-users-delete-guard')

    it('passes through when user is PM', async () => {
      const em = makeMockEm()
      const rbacService = makeRbacService(['partnerships.wic.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const request = makeRequest({
        method: 'DELETE',
        url: 'http://localhost/api/auth/users?id=user-target',
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(true)
    })

    it('rejects self-delete', async () => {
      const em = makeMockEm()
      const rbacService = makeRbacService(['partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const request = makeRequest({
        method: 'DELETE',
        url: 'http://localhost/api/auth/users?id=user-actor',
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(false)
      expect(result.statusCode).toBe(403)
      expect((result.body as Record<string, unknown>)?.error).toMatch(/own account/)
    })

    it('rejects cross-org delete', async () => {
      const em = makeMockEm({
        findOneUser: { id: 'user-target', organizationId: 'org-other', deletedAt: null },
      })
      const rbacService = makeRbacService(['partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      const request = makeRequest({
        method: 'DELETE',
        url: 'http://localhost/api/auth/users?id=user-target',
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(false)
      expect(result.statusCode).toBe(403)
      expect((result.body as Record<string, unknown>)?.error).toMatch(/own organization/)
    })

    it('rejects deleting last partner_admin', async () => {
      const em = makeMockEm({
        findOneUser: { id: 'user-target', organizationId: 'org-1', deletedAt: null },
        findOneRole: { id: 'role-pa', name: 'partner_admin' },
        findUserRoles: [{ user: 'user-target', role: 'role-pa' }],
      })
      const rbacService = makeRbacService(['partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      // Override findOne to handle both User and Role lookups in sequence
      em.findOne.mockImplementation((entity: unknown, filter: unknown) => {
        const entityName = typeof entity === 'function' ? entity.name : String(entity)
        if (entityName === 'User') {
          const f = filter as Record<string, unknown>
          // Target user lookup
          if (f.id === 'user-target') {
            return Promise.resolve({ id: 'user-target', organizationId: 'org-1', deletedAt: null })
          }
          return Promise.resolve(null)
        }
        if (entityName === 'Role') {
          return Promise.resolve({ id: 'role-pa', name: 'partner_admin' })
        }
        return Promise.resolve(null)
      })

      const request = makeRequest({
        method: 'DELETE',
        url: 'http://localhost/api/auth/users?id=user-target',
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(false)
      expect(result.statusCode).toBe(403)
      expect((result.body as Record<string, unknown>)?.error).toMatch(/last agency admin/)
    })

    it('allows delete when another admin exists', async () => {
      const em = makeMockEm()
      const rbacService = makeRbacService(['partnerships.agency-profile.manage'])
      const context = makeContextWithRbac(em, rbacService)

      // Override findOne & find for the full flow
      em.findOne.mockImplementation((entity: unknown, filter: unknown) => {
        const entityName = typeof entity === 'function' ? entity.name : String(entity)
        if (entityName === 'User') {
          const f = filter as Record<string, unknown>
          if (f.id === 'user-target') {
            return Promise.resolve({ id: 'user-target', organizationId: 'org-1', deletedAt: null })
          }
          // user-other is in the same org — proves there's another admin
          if (f.id === 'user-other') {
            return Promise.resolve({ id: 'user-other', organizationId: 'org-1', deletedAt: null })
          }
          return Promise.resolve(null)
        }
        if (entityName === 'Role') {
          return Promise.resolve({ id: 'role-pa', name: 'partner_admin' })
        }
        return Promise.resolve(null)
      })

      em.find.mockImplementation((entity: unknown) => {
        const entityName = typeof entity === 'function' ? entity.name : String(entity)
        if (entityName === 'UserRole') {
          return Promise.resolve([
            { user: 'user-target', role: 'role-pa' },
            { user: 'user-other', role: 'role-pa' },
          ])
        }
        return Promise.resolve([])
      })

      const request = makeRequest({
        method: 'DELETE',
        url: 'http://localhost/api/auth/users?id=user-target',
      })

      const result = await interceptor.before!(request, context)
      expect(result.ok).toBe(true)
    })
  })
})
