import type { ApiInterceptor } from '@open-mercato/shared/lib/crud/api-interceptor'
import { CustomerPipelineStage } from '@open-mercato/core/modules/customers/data/entities'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import { PRM_SQL_STAGE_ORDER } from '../data/custom-fields'

const DEAL_ENTITY_ID = 'customers:customer_deal'
const WIP_FIELD_KEY = 'wip_registered_at'

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
]
