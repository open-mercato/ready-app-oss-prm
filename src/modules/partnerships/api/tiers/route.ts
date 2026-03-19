import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { PartnerTierDefinition } from '../../data/entities'
import { tierListQuerySchema, createTierDefinitionSchema } from '../../data/validators'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { createPartnershipsCrudOpenApi } from '../openapi'
import { createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'

const rawBodySchema = z.object({}).passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.tiers.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.tiers.manage'] },
}
export const metadata = routeMetadata

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: PartnerTierDefinition,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: E.partnerships.partner_tier_definition },
  list: {
    schema: tierListQuerySchema,
    entityId: E.partnerships.partner_tier_definition,
    fields: ['id', 'key', 'label', 'wic_threshold', 'wip_threshold', 'min_threshold', 'is_active', 'created_at'],
    buildFilters: async (query: any) => {
      const filters: Record<string, any> = {}
      if (!query.includeInactive) {
        filters.is_active = { $eq: true }
      }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'partnerships.partner_tier.define',
      schema: rawBodySchema,
      mapInput: async ({ raw }) => {
        return createTierDefinitionSchema.parse(raw ?? {})
      },
      response: ({ result }) => ({ id: result?.id, key: result?.key }),
      status: 201,
    },
  },
})

export const { GET, POST } = crud

const tierListItemSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  wic_threshold: z.number().nullable().optional(),
  wip_threshold: z.number().nullable().optional(),
  min_threshold: z.number().nullable().optional(),
  is_active: z.boolean(),
  created_at: z.string(),
})

export const openApi = createPartnershipsCrudOpenApi({
  resourceName: 'Tier Definition',
  querySchema: tierListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(tierListItemSchema),
  create: {
    schema: createTierDefinitionSchema,
    description: 'Create a tier definition.',
    status: 201,
  },
})
