import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { PartnerAgency } from '../../data/entities'
import { agencyListQuerySchema, onboardAgencySchema } from '../../data/validators'
import { E } from '@/.mercato/generated/entities.ids.generated'
import { createPartnershipsCrudOpenApi } from '../openapi'
import { createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'

const rawBodySchema = z.object({}).passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.agencies.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.agencies.onboard'] },
}
export const metadata = routeMetadata

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: PartnerAgency,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: E.partnerships.partner_agency },
  list: {
    schema: agencyListQuerySchema,
    entityId: E.partnerships.partner_agency,
    fields: ['id', 'agency_organization_id', 'name', 'status', 'onboarded_at', 'created_at'],
    buildFilters: async (query: any) => {
      const filters: Record<string, any> = {}
      if (query.status) {
        filters.status = { $eq: query.status }
      }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'partnerships.partner_agency.self_onboard',
      schema: rawBodySchema,
      mapInput: async ({ raw }) => {
        return onboardAgencySchema.parse(raw ?? {})
      },
      response: ({ result }) => ({ id: result?.id, status: result?.status }),
      status: 201,
    },
  },
})

export const { GET, POST } = crud

const agencyListItemSchema = z.object({
  id: z.string().uuid(),
  agency_organization_id: z.string().uuid().nullable().optional(),
  name: z.string().nullable().optional(),
  status: z.string(),
  onboarded_at: z.string().nullable().optional(),
  created_at: z.string(),
})

export const openApi = createPartnershipsCrudOpenApi({
  resourceName: 'Partner Agency',
  querySchema: agencyListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(agencyListItemSchema),
  create: {
    schema: onboardAgencySchema,
    description: 'Self-onboard as partner agency.',
    status: 201,
  },
})
