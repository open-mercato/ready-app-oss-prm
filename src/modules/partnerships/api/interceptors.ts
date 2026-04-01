import type { ApiInterceptor, InterceptorContext } from '@open-mercato/shared/lib/crud/api-interceptor'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomerPipelineStage } from '@open-mercato/core/modules/customers/data/entities'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import { User, Role, UserRole, UserAcl, RoleAcl } from '@open-mercato/core/modules/auth/data/entities'
import { ActionLogService } from '@open-mercato/core/modules/audit_logs/services/actionLogService'
import type { RbacService } from './get/onboarding-status'
import { PRM_SQL_STAGE_ORDER } from '../data/custom-fields'

const DEAL_ENTITY_ID = 'customers:customer_deal'
const WIP_FIELD_KEY = 'wip_registered_at'

const USER_ENTITY_ID = 'auth:user'
const GH_USERNAME_FIELD_KEY = 'github_username'
const CONTRIBUTION_UNIT_ENTITY_ID = 'partnerships:contribution_unit'
const CU_GH_USERNAME_FIELD_KEY = 'contributor_github_username'

export const interceptors: ApiInterceptor[] = [
  {
    id: 'partnerships.pm-crm-readonly',
    targetRoute: 'customers/*',
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    features: ['partnerships.widgets.cross-org-wip'], // Only fires for PM
    priority: 100,
    async before(_request, context) {
      const em = context.em.fork()
      const user = await em.findOne(User, { id: context.userId })
      if (!user) return { ok: true }

      if (context.organizationId === user.organizationId) {
        return { ok: true }
      }

      return {
        ok: false,
        statusCode: 403,
        body: { error: 'Agency CRM is read-only for Partnership Managers.' },
      }
    },
  },
  {
    id: 'partnerships.wip-stamp-guard',
    targetRoute: 'customers/deals',
    methods: ['PATCH', 'PUT', 'POST'],
    priority: 50,
    async before(request) {
      const customFields = (request.body?.customFields as Record<string, unknown> | undefined)
      if (!customFields || !(WIP_FIELD_KEY in customFields)) {
        return { ok: true }
      }

      const { [WIP_FIELD_KEY]: _stripped, ...rest } = customFields
      return {
        ok: true,
        body: {
          ...request.body,
          customFields: rest,
        },
      }
    },
  },
  {
    id: 'partnerships.wip-stamp-after',
    targetRoute: 'customers/deals',
    methods: ['PATCH', 'PUT'],
    priority: 50,
    async after(request, response, context) {
      if (response.statusCode !== 200) return {}

      // PUT returns { ok: true } without entity fields — read from request body
      const dealId = (response.body.id ?? request.body?.id) as string | undefined
      const pipelineStageId = (response.body.pipelineStageId ?? request.body?.pipelineStageId) as string | undefined

      if (!dealId || !pipelineStageId) return {}

      // Fork EM to avoid dirty state from the CRUD route's prior flush
      const em = context.em.fork()

      const stage = await em.findOne(CustomerPipelineStage, { id: pipelineStageId })
      if (!stage || stage.order < PRM_SQL_STAGE_ORDER) return {}

      const existingValue = await em.findOne(CustomFieldValue, {
        entityId: DEAL_ENTITY_ID,
        recordId: dealId,
        fieldKey: WIP_FIELD_KEY,
        deletedAt: null,
      })

      if (existingValue?.valueText) return {}

      em.persist(em.create(CustomFieldValue, {
        entityId: DEAL_ENTITY_ID,
        recordId: dealId,
        fieldKey: WIP_FIELD_KEY,
        valueText: new Date().toISOString(),
        organizationId: context.organizationId,
        tenantId: context.tenantId,
        createdAt: new Date(),
      }))
      await em.flush()

      return {}
    },
  },
  {
    id: 'partnerships.gh-username-immutability',
    targetRoute: 'entities/records',
    methods: ['PUT', 'PATCH'],
    priority: 50,
    async before(request, context) {
      // Only act on auth:user github_username updates
      const entityId = request.body?.entityId as string | undefined
      const customFields = request.body?.customFields as Record<string, unknown> | undefined
      if (entityId !== USER_ENTITY_ID || !customFields || !(GH_USERNAME_FIELD_KEY in customFields)) {
        return { ok: true }
      }

      const newUsername = customFields[GH_USERNAME_FIELD_KEY] as string | undefined
      const recordId = request.body?.recordId as string | undefined

      if (!newUsername || !recordId) {
        return { ok: true }
      }

      const em = context.em.fork()

      // --- Uniqueness check ---
      const existing = await em.findOne(CustomFieldValue, {
        entityId: USER_ENTITY_ID,
        fieldKey: GH_USERNAME_FIELD_KEY,
        valueText: newUsername,
        tenantId: context.tenantId,
        deletedAt: null,
      })
      if (existing && existing.recordId !== recordId) {
        return {
          ok: false,
          statusCode: 403,
          body: { error: 'GitHub username is already in use by another user' },
        }
      }

      // --- Immutability check: get current GH username for this user ---
      const currentCfv = await em.findOne(CustomFieldValue, {
        entityId: USER_ENTITY_ID,
        fieldKey: GH_USERNAME_FIELD_KEY,
        recordId,
        tenantId: context.tenantId,
        deletedAt: null,
      })
      const currentUsername = currentCfv?.valueText ?? null

      // Check ContributionUnits recorded against the current OR new username
      const usernamesToCheck = [...new Set([currentUsername, newUsername].filter(Boolean))] as string[]
      let hasCus = false
      if (usernamesToCheck.length > 0) {
        const cuCount = await em.count(CustomFieldValue, {
          entityId: CONTRIBUTION_UNIT_ENTITY_ID,
          fieldKey: CU_GH_USERNAME_FIELD_KEY,
          valueText: { $in: usernamesToCheck },
          tenantId: context.tenantId,
          deletedAt: null,
        })
        hasCus = cuCount > 0
      }

      if (!hasCus) {
        return { ok: true }
      }

      // CUs exist — only PM can override
      const rbacService = context.container.resolve('rbacService') as RbacService
      const isPm = await rbacService.userHasAllFeatures(
        context.userId,
        ['partnerships.wic.manage'],
        { tenantId: context.tenantId, organizationId: context.organizationId },
      )

      if (!isPm) {
        return {
          ok: false,
          statusCode: 403,
          body: { error: 'GitHub username cannot be changed once WIC is recorded. Contact your Partnership Manager.' },
        }
      }

      return { ok: true }
    },
    async after(request, response, context) {
      if (response.statusCode !== 200) return {}

      // Only act on auth:user github_username updates
      const entityId = request.body?.entityId as string | undefined
      const customFields = request.body?.customFields as Record<string, unknown> | undefined
      if (entityId !== USER_ENTITY_ID || !customFields || !(GH_USERNAME_FIELD_KEY in customFields)) {
        return {}
      }

      const newUsername = customFields[GH_USERNAME_FIELD_KEY] as string | undefined
      const recordId = request.body?.recordId as string | undefined
      if (!newUsername || !recordId) return {}

      // Write audit log for PM override
      const actionLogService = context.container.resolve('actionLogService') as ActionLogService
      await actionLogService.log({
        commandId: 'partnerships.gh_username.pm_override',
        actorUserId: context.userId,
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        resourceKind: USER_ENTITY_ID,
        resourceId: recordId,
        changes: { github_username: newUsername },
        context: { note: 'PM override of immutable GitHub username (WIC recorded)' },
      })

      return {}
    },
  },

  // ---------------------------------------------------------------------------
  // Auth route interceptors — restrict partner_admin to own-org agency users
  // ---------------------------------------------------------------------------

  // Note: auth users GET is a custom handler that bypasses makeCrudRoute,
  // so interceptor before/after hooks don't fire for GET requests.
  // Org isolation for GET is enforced at the UI level (PRM page always sends organizationId)
  // and by the auth route's own tenant scoping. Full raw-API GET protection requires
  // upstream work to wire the custom GET handler through the interceptor pipeline.

  {
    id: 'partnerships.auth-users-mutation-guard',
    targetRoute: 'auth/users',
    methods: ['POST', 'PUT'],
    priority: 200,
    async before(request, context) {
      if (!await isPartnerAdmin(context)) return { ok: true }

      const body = request.body ?? {}
      const em = context.em.fork()

      // Enforce organization scope — must be actor's org
      const bodyOrgId = body.organizationId as string | undefined
      if (bodyOrgId && bodyOrgId !== context.organizationId) {
        return {
          ok: false,
          statusCode: 403,
          body: { error: 'Agency admins can only manage users within their own organization.' },
        }
      }

      // Force organizationId to actor's org
      const patchedBody = { ...body, organizationId: context.organizationId }

      // Validate roles — only agency roles allowed
      const roles = body.roles as string[] | undefined
      if (Array.isArray(roles) && roles.length > 0) {
        const agencyRoleIds = await getAgencyRoleIds(em, context.tenantId)
        const agencyRoleIdSet = new Set(agencyRoleIds)

        // Roles can be IDs or names — check both
        const agencyRoleNameSet = new Set<string>(AGENCY_ROLE_NAMES)

        for (const role of roles) {
          if (!agencyRoleIdSet.has(role) && !agencyRoleNameSet.has(role)) {
            return {
              ok: false,
              statusCode: 403,
              body: { error: 'Agency admins can only assign agency roles (partner_admin, partner_member, partner_contributor).' },
            }
          }
        }
      }

      return { ok: true, body: patchedBody }
    },
    async after(request, response, context) {
      // After successful user creation by partner_admin, restrict the new user to actor's org
      if (request.method !== 'POST') return {}
      if (response.statusCode !== 201) return {}
      if (!await isPartnerAdmin(context)) return {}

      const newUserId = (response.body.id ?? response.body.userId) as string | undefined
      if (!newUserId) return {}

      const em = context.em.fork()

      // Load the role's features to copy into UserAcl
      const roles = request.body?.roles as string[] | undefined
      let features: string[] = []
      if (Array.isArray(roles) && roles.length > 0) {
        const roleAcl = await em.findOne(RoleAcl, {
          role: roles[0],
          tenantId: context.tenantId,
        } as Record<string, unknown>)
        if (roleAcl && Array.isArray(roleAcl.featuresJson)) {
          features = roleAcl.featuresJson as string[]
        }
      }

      // Create UserAcl restricting new user to actor's org
      const aclData = {
        user: newUserId,
        tenantId: context.tenantId,
        organizationsJson: [context.organizationId],
        featuresJson: features,
        isSuperAdmin: false,
        createdAt: new Date(),
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      em.persist(em.create(UserAcl, aclData as any))
      await em.flush()

      return {}
    },
  },

  {
    id: 'partnerships.auth-users-delete-guard',
    targetRoute: 'auth/users',
    methods: ['DELETE'],
    priority: 200,
    async before(request, context) {
      if (!await isPartnerAdmin(context)) return { ok: true }

      const em = context.em.fork()

      // Parse target user ID from query string
      const url = new URL(request.url)
      const targetUserId = url.searchParams.get('id') ?? (request.query?.id as string | undefined)

      if (!targetUserId) {
        return {
          ok: false,
          statusCode: 403,
          body: { error: 'Missing user ID.' },
        }
      }

      // Prevent self-delete
      if (targetUserId === context.userId) {
        return {
          ok: false,
          statusCode: 403,
          body: { error: 'You cannot delete your own account.' },
        }
      }

      // Target must be in actor's org
      const targetUser = await em.findOne(User, { id: targetUserId, deletedAt: null })
      if (!targetUser || targetUser.organizationId !== context.organizationId) {
        return {
          ok: false,
          statusCode: 403,
          body: { error: 'Agency admins can only delete users within their own organization.' },
        }
      }

      // Prevent deleting the last partner_admin in the org
      if (await isLastPartnerAdmin(em, context.organizationId, context.tenantId, targetUserId)) {
        return {
          ok: false,
          statusCode: 403,
          body: { error: 'Cannot delete the last agency admin in the organization.' },
        }
      }

      return { ok: true }
    },
  },
]

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENCY_ROLE_NAMES = ['partner_admin', 'partner_member', 'partner_contributor'] as const

// ---------------------------------------------------------------------------
// Exported helpers (testable)
// ---------------------------------------------------------------------------

/**
 * Returns true if the actor is a partner_admin (has agency-profile.manage but NOT wic.manage).
 * PM users always pass through (returns false). Non-agency-admin users also return false.
 */
export async function isPartnerAdmin(context: InterceptorContext): Promise<boolean> {
  const rbacService = context.container.resolve('rbacService') as RbacService
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }

  // PM passes through — not restricted
  const isPm = await rbacService.userHasAllFeatures(context.userId, ['partnerships.wic.manage'], scope)
  if (isPm) return false

  // Check if actor is agency admin
  const isAgencyAdmin = await rbacService.userHasAllFeatures(
    context.userId,
    ['partnerships.agency-profile.manage'],
    scope,
  )
  return isAgencyAdmin
}

/**
 * Looks up the Role IDs for the 3 agency roles within a tenant.
 */
export async function getAgencyRoleIds(em: EntityManager, tenantId: string): Promise<string[]> {
  const roles = await em.find(Role, {
    name: { $in: [...AGENCY_ROLE_NAMES] },
    $or: [{ tenantId }, { tenantId: null }],
    deletedAt: null,
  })
  return roles.map((r) => r.id)
}

/**
 * Returns true if deleting targetUserId would leave zero partner_admins in the org.
 */
export async function isLastPartnerAdmin(
  em: EntityManager,
  organizationId: string,
  tenantId: string,
  targetUserId: string,
): Promise<boolean> {
  // Find the partner_admin role
  const partnerAdminRole = await em.findOne(Role, {
    name: 'partner_admin',
    $or: [{ tenantId }, { tenantId: null }],
    deletedAt: null,
  })
  if (!partnerAdminRole) return false

  // Find all users in this org with partner_admin role
  const orgAdmins = await em.find(User, {
    organizationId,
    deletedAt: null,
  })
  const orgAdminIds = new Set(orgAdmins.map((u) => u.id))

  // Find which of those users have the partner_admin role
  const adminLinks = await em.find(UserRole, {
    role: partnerAdminRole.id,
    user: { $in: [...orgAdminIds] },
    deletedAt: null,
  } as Record<string, unknown>)

  // Count admins in this org excluding the target user
  let otherAdminCount = 0
  for (const link of adminLinks) {
    const userId = String((link as unknown as Record<string, unknown>).user ?? '')
    if (userId && userId !== targetUserId) otherAdminCount++
  }

  return otherAdminCount === 0
}
