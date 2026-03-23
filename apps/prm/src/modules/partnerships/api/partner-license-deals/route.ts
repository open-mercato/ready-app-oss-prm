/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerLicenseDeal } from '../../data/entities'
import { partnerLicenseDealCreateSchema, partnerLicenseDealUpdateSchema } from '../../data/validators'
import { withScopedPayload, resolveCrudRecordId } from '../utils'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import {
  createPartnershipsCrudOpenApi,
  createPagedListResponseSchema,
  defaultOkResponseSchema,
} from '../openapi'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'

const rawBodySchema = z.object({}).passthrough()

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(50),
    search: z.string().optional(),
    organizationId: z.string().uuid().optional(),
    year: z.coerce.number().optional(),
    status: z.string().optional(),
    industryTag: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.manage'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['partnerships.manage'] },
}

export const metadata = routeMetadata

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: PartnerLicenseDeal,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  list: {
    schema: listSchema,
    fields: [
      'id',
      'organization_id',
      'company_id',
      'license_identifier',
      'industry_tag',
      'type',
      'status',
      'is_renewal',
      'closed_at',
      'year',
      'created_by',
      'tenant_id',
      'created_at',
    ],
    sortFieldMap: {
      year: 'year',
      createdAt: 'created_at',
      licenseIdentifier: 'license_identifier',
      industryTag: 'industry_tag',
    },
    buildFilters: async (query: any) => {
      const filters: Record<string, any> = {}
      if (query.organizationId) {
        filters.organization_id = { $eq: query.organizationId }
      }
      if (query.year) {
        filters.year = { $eq: query.year }
      }
      if (query.status) {
        filters.status = { $eq: query.status }
      }
      if (query.industryTag) {
        filters.industry_tag = { $eq: query.industryTag }
      }
      if (query.search) {
        filters.license_identifier = { $ilike: `%${escapeLikePattern(query.search)}%` }
      }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'partnerships.license-deals.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)
        const parsed = partnerLicenseDealCreateSchema.parse({
          ...scoped,
          createdBy: ctx.auth?.userId ?? scoped.createdBy,
        })
        return parsed
      },
      response: ({ result }) => ({
        id: result?.id ?? null,
      }),
      status: 201,
    },
    update: {
      commandId: 'partnerships.license-deals.update',
      schema: rawBodySchema,
      mapInput: async ({ raw }) => {
        const parsed = partnerLicenseDealUpdateSchema.parse(raw ?? {})
        return parsed
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'partnerships.license-deals.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id = resolveCrudRecordId(parsed, ctx, translate)
        if (!id) throw new CrudHttpError(400, { error: 'Partner license deal id is required' })
        return { id }
      },
      response: () => ({ ok: true }),
    },
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE

const pldListItemSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  company_id: z.string().uuid(),
  license_identifier: z.string(),
  industry_tag: z.string(),
  type: z.string(),
  status: z.string(),
  is_renewal: z.boolean().optional(),
  closed_at: z.string().nullable().optional(),
  year: z.number(),
  created_by: z.string().uuid(),
  tenant_id: z.string().uuid(),
  created_at: z.string().nullable().optional(),
})

const pldCreateResponseSchema = z.object({
  id: z.string().uuid().nullable(),
})

export const openApi = createPartnershipsCrudOpenApi({
  resourceName: 'PartnerLicenseDeal',
  pluralName: 'PartnerLicenseDeals',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(pldListItemSchema),
  create: {
    schema: partnerLicenseDealCreateSchema,
    responseSchema: pldCreateResponseSchema,
    description: 'Creates a partner license deal record for manual attribution.',
  },
  update: {
    schema: partnerLicenseDealUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates a partner license deal by id.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Deletes a partner license deal by id.',
  },
})
