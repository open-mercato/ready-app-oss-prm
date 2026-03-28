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

import { interceptors } from '../interceptors'

const DEAL_ENTITY_ID = 'customers:customer_deal'
const WIP_FIELD_KEY = 'wip_registered_at'

function findInterceptor(id: string) {
  const found = interceptors.find((i) => i.id === id)
  if (!found) throw new Error(`Interceptor "${id}" not found`)
  return found
}

function makeRequest(overrides: Partial<InterceptorRequest> = {}): InterceptorRequest {
  return {
    method: 'PATCH',
    url: '/api/customers/deals/some-deal-id',
    body: {},
    headers: {},
    ...overrides,
  }
}

function makeResponse(overrides: Partial<InterceptorResponse> = {}): InterceptorResponse {
  return {
    statusCode: 200,
    body: {
      id: 'deal-uuid-1',
      pipelineStageId: 'stage-uuid-sql',
    },
    headers: {},
    ...overrides,
  }
}

function makeMockEm(stageOrder: number, existingWipValue: string | null = null) {
  const findOneResult = (entity: unknown, filter: unknown) => {
    const entityName = typeof entity === 'function' ? entity.name : String(entity)

    if (entityName === 'CustomerPipelineStage') {
      return Promise.resolve(
        stageOrder >= 0 ? { id: 'stage-uuid-sql', order: stageOrder } : null,
      )
    }

    if (entityName === 'CustomFieldValue') {
      return Promise.resolve(
        existingWipValue !== null
          ? { id: 'cfv-1', valueText: existingWipValue, fieldKey: WIP_FIELD_KEY }
          : null,
      )
    }

    return Promise.resolve(null)
  }

  const em = {
    findOne: jest.fn(findOneResult),
    persist: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((entity: unknown, data: Record<string, unknown>) => ({ ...data })),
    fork: jest.fn(),
  }
  // fork() returns self (same mock instance) for simplicity
  em.fork.mockReturnValue(em)
  return em
}

function makeContext(
  em: ReturnType<typeof makeMockEm>,
  overrides: Partial<InterceptorContext> = {},
): InterceptorContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    tenantId: 'tenant-1',
    em: em as unknown as InterceptorContext['em'],
    container: {} as InterceptorContext['container'],
    ...overrides,
  }
}

describe('partnerships WIP interceptors', () => {
  describe('beforeDealPatch — wip-stamp-guard', () => {
    const interceptor = findInterceptor('partnerships.wip-stamp-guard')

    it('strips wip_registered_at from request body custom fields if present', async () => {
      const request = makeRequest({
        method: 'PATCH',
        body: {
          title: 'Updated deal',
          customFields: {
            wip_registered_at: '2026-01-15T10:00:00.000Z',
            other_field: 'keep me',
          },
        },
      })

      const em = makeMockEm(0)
      const context = makeContext(em)
      const result = await interceptor.before!(request, context)

      expect(result.ok).toBe(true)
      expect(result.body).toBeDefined()
      expect((result.body!.customFields as Record<string, unknown>).wip_registered_at).toBeUndefined()
      expect((result.body!.customFields as Record<string, unknown>).other_field).toBe('keep me')
    })

    it('returns ok without body modification when wip_registered_at is not present', async () => {
      const request = makeRequest({
        method: 'POST',
        body: {
          title: 'New deal',
          customFields: { other_field: 'value' },
        },
      })

      const em = makeMockEm(0)
      const context = makeContext(em)
      const result = await interceptor.before!(request, context)

      expect(result.ok).toBe(true)
      // No body rewrite needed
      expect(result.body).toBeUndefined()
    })
  })

  describe('afterDealPatch — wip-stamp-after', () => {
    const interceptor = findInterceptor('partnerships.wip-stamp-after')

    it('stamps wip_registered_at when deal transitions to SQL stage (order >= 3) and field is null', async () => {
      const request = makeRequest()
      const response = makeResponse({
        statusCode: 200,
        body: { id: 'deal-uuid-1', pipelineStageId: 'stage-uuid-sql' },
      })

      const em = makeMockEm(3, null) // order=3 (SQL), no existing value
      const context = makeContext(em)

      await interceptor.after!(request, response, context)

      // Should have persisted a new CustomFieldValue instance
      expect(em.persist).toHaveBeenCalled()
      expect(em.flush).toHaveBeenCalled()

      const persistedEntity = em.persist.mock.calls[0][0] as Record<string, unknown>
      expect(persistedEntity.fieldKey).toBe(WIP_FIELD_KEY)
      expect(persistedEntity.entityId).toBe(DEAL_ENTITY_ID)
      expect(persistedEntity.recordId).toBe('deal-uuid-1')
      expect(persistedEntity.organizationId).toBe('org-1')
      expect(persistedEntity.tenantId).toBe('tenant-1')
      expect(persistedEntity.valueText).toBeDefined()
      // Should be a valid ISO date string
      expect(new Date(persistedEntity.valueText as string).toISOString()).toBe(persistedEntity.valueText)
    })

    it('does NOT stamp when deal transitions to stage below SQL (order < 3)', async () => {
      const request = makeRequest()
      const response = makeResponse({
        statusCode: 200,
        body: { id: 'deal-uuid-1', pipelineStageId: 'stage-uuid-contacted' },
      })

      const em = makeMockEm(1, null) // order=1, below SQL
      const context = makeContext(em)

      await interceptor.after!(request, response, context)

      expect(em.persist).not.toHaveBeenCalled()
      expect(em.flush).not.toHaveBeenCalled()
    })

    it('does NOT overwrite when wip_registered_at is already set', async () => {
      const request = makeRequest()
      const response = makeResponse({
        statusCode: 200,
        body: { id: 'deal-uuid-1', pipelineStageId: 'stage-uuid-sql' },
      })

      const em = makeMockEm(3, '2026-01-10T08:00:00.000Z') // order=3, already has value
      const context = makeContext(em)

      await interceptor.after!(request, response, context)

      // Should NOT persist or flush — immutability enforced
      expect(em.persist).not.toHaveBeenCalled()
      expect(em.flush).not.toHaveBeenCalled()
    })

    it('does NOT stamp when pipelineStageId is not in response', async () => {
      const request = makeRequest()
      const response = makeResponse({
        statusCode: 200,
        body: { id: 'deal-uuid-1' }, // no pipelineStageId
      })

      const em = makeMockEm(3, null)
      const context = makeContext(em)

      await interceptor.after!(request, response, context)

      expect(em.persist).not.toHaveBeenCalled()
      expect(em.flush).not.toHaveBeenCalled()
    })

    it('does NOT stamp on non-200 responses', async () => {
      const request = makeRequest()
      const response = makeResponse({
        statusCode: 422,
        body: { id: 'deal-uuid-1', pipelineStageId: 'stage-uuid-sql' },
      })

      const em = makeMockEm(3, null)
      const context = makeContext(em)

      await interceptor.after!(request, response, context)

      expect(em.persist).not.toHaveBeenCalled()
      expect(em.flush).not.toHaveBeenCalled()
    })
  })
})
