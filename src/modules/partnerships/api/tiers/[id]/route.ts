import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { PartnerTierDefinition } from '../../../data/entities'
import { updateTierDefinitionSchema } from '../../../data/validators'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { createPartnershipsCrudOpenApi } from '../../openapi'
import { defaultOkResponseSchema } from '@open-mercato/shared/lib/openapi/crud'

const rawBodySchema = z.object({}).passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.tiers.view'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.tiers.manage'] },
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
  actions: {
    update: {
      commandId: 'partnerships.partner_tier.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const url = new URL(ctx.request!.url)
        const segments = url.pathname.split('/')
        const id = segments[segments.length - 1]
        return updateTierDefinitionSchema.parse({ ...(raw ?? {}), id })
      },
      response: ({ result }) => ({
        id: result?.id,
        key: result?.key,
        label: result?.label,
        isActive: result?.isActive,
      }),
    },
  },
})

export const GET = crud.GET
export const PATCH = crud.PUT

const tierDetailSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  isActive: z.boolean(),
})

export const openApi = createPartnershipsCrudOpenApi({
  resourceName: 'Tier Definition Detail',
  listResponseSchema: z.object({ items: z.array(tierDetailSchema) }),
  update: {
    schema: updateTierDefinitionSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Update a tier definition.',
  },
})
