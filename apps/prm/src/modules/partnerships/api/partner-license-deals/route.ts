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
  GET: { requireAuth: true, requireFeatures: ['partnerships.license-deals.manage'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.license-deals.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.license-deals.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['partnerships.license-deals.manage'] },
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
    buildFilters: async (query: z.infer<typeof listSchema>) => {
      const filters: Record<string, unknown> = {}
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
        // Compute year from closedAt if not provided (form doesn't send year)
        const closedAtDate = scoped.closedAt ? new Date(scoped.closedAt as string) : undefined
        const year = scoped.year ?? (closedAtDate ? closedAtDate.getUTCFullYear() : undefined)
        const parsed = partnerLicenseDealCreateSchema.parse({
          ...scoped,
          year,
          createdBy: ctx.auth?.userId ?? ctx.auth?.sub ?? scoped.createdBy,
        })

        // Cross-org company uniqueness guard: same company cannot be attributed to two agencies
        if (parsed.companyId && parsed.organizationId) {
          const em = ctx.container.resolve('em') as import('@mikro-orm/postgresql').EntityManager
          const existing = await em.findOne(PartnerLicenseDeal, {
            companyId: parsed.companyId,
            organizationId: { $ne: parsed.organizationId },
            tenantId: parsed.tenantId,
          })
          if (existing) {
            throw new CrudHttpError(422, {
              error: 'Company already attributed to another agency',
              companyId: parsed.companyId,
              existingOrganizationId: existing.organizationId,
            })
          }
        }

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

export async function GET(req: Request) {
  const { NextResponse } = await import('next/server')
  try {
    const { getAuthFromRequest } = await import('@open-mercato/shared/lib/auth/server')
    const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50))
    const search = url.searchParams.get('search') ?? undefined
    const orgFilter = url.searchParams.get('organizationId') ?? undefined
    const yearFilter = url.searchParams.get('year') ? parseInt(url.searchParams.get('year')!, 10) : undefined
    const statusFilter = url.searchParams.get('status') ?? undefined

    const { resolve } = await createRequestContainer()
    const em = resolve('em') as import('@mikro-orm/postgresql').EntityManager

    const where: Record<string, unknown> = { tenantId: auth.tenantId }
    if (orgFilter) where.organizationId = orgFilter
    if (yearFilter) where.year = yearFilter
    if (statusFilter) where.status = statusFilter
    if (search) where.licenseIdentifier = { $ilike: `%${escapeLikePattern(search)}%` }

    const [items, total] = await Promise.all([
      em.find(PartnerLicenseDeal, where, {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        orderBy: { createdAt: 'DESC' },
      }),
      em.count(PartnerLicenseDeal, where),
    ])

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (err: unknown) {
    console.error('[partnerships/partner-license-deals.GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
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
