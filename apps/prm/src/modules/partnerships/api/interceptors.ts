import type { ApiInterceptor } from '@open-mercato/shared/lib/crud/api-interceptor'
import { CustomerPipelineStage } from '@open-mercato/core/modules/customers/data/entities'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
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
        ['partnerships.manage'],
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
]
