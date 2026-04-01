/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerRfpCampaign } from '../../data/entities'
import { rfpCampaignCreateSchema, rfpCampaignUpdateSchema } from '../../data/validators'
import { withScopedPayload, resolveCrudRecordId } from '../utils'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import {
  createPartnershipsCrudOpenApi,
  createPagedListResponseSchema,
  defaultOkResponseSchema,
} from '../openapi'

const rawBodySchema = z.object({}).passthrough()

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(50),
    search: z.string().optional(),
    status: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.rfp.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
}

export const metadata = routeMetadata

function isCampaignVisibleToOrganization(
  campaign: Pick<PartnerRfpCampaign, 'audience' | 'selectedAgencyIds' | 'status'>,
  organizationId: string | null | undefined,
): boolean {
  if (campaign.status === 'draft') return false
  if (campaign.audience !== 'selected') return true
  if (!organizationId) return false
  return Array.isArray(campaign.selectedAgencyIds) && campaign.selectedAgencyIds.includes(organizationId)
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: PartnerRfpCampaign,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  list: {
    schema: listSchema,
    fields: [
      'id',
      'title',
      'description',
      'deadline',
      'audience',
      'selected_agency_ids',
      'status',
      'winner_organization_id',
      'organization_id',
      'tenant_id',
      'created_by',
      'created_at',
    ],
    sortFieldMap: {
      createdAt: 'created_at',
      deadline: 'deadline',
      title: 'title',
    },
    buildFilters: async (query: any) => {
      const filters: Record<string, any> = {}
      if (query.status) {
        filters.status = { $eq: query.status }
      }
      if (query.search) {
        filters.title = { $ilike: `%${escapeLikePattern(query.search)}%` }
      }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'partnerships.rfp-campaigns.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)
        const parsed = rfpCampaignCreateSchema.parse(scoped)
        return {
          ...parsed,
          status: 'draft',
          organizationId: ctx.auth?.orgId ?? scoped.organizationId,
          tenantId: ctx.auth?.tenantId ?? scoped.tenantId,
          createdBy: ctx.auth?.userId ?? ctx.auth?.sub ?? scoped.createdBy,
        }
      },
      response: ({ result }) => ({
        id: result?.id ?? null,
      }),
      status: 201,
    },
    update: {
      commandId: 'partnerships.rfp-campaigns.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const parsed = rfpCampaignUpdateSchema.parse(raw ?? {})
        // Only allow updating draft campaigns
        const { createRequestContainer: crc } = await import('@open-mercato/shared/lib/di/container')
        const container = await crc()
        const em = container.resolve('em') as import('@mikro-orm/postgresql').EntityManager
        const existing = await em.findOne(PartnerRfpCampaign, {
          id: parsed.id,
          tenantId: ctx.auth?.tenantId,
        })
        if (!existing) throw new CrudHttpError(404, { error: 'Campaign not found' })
        if (existing.status !== 'draft') {
          throw new CrudHttpError(422, { error: 'Only draft campaigns can be updated' })
        }
        return parsed
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'partnerships.rfp-campaigns.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id = resolveCrudRecordId(parsed, ctx, translate)
        if (!id) throw new CrudHttpError(400, { error: 'Campaign id is required' })
        // Only allow deleting draft campaigns
        const { createRequestContainer: crc } = await import('@open-mercato/shared/lib/di/container')
        const container = await crc()
        const em = container.resolve('em') as import('@mikro-orm/postgresql').EntityManager
        const existing = await em.findOne(PartnerRfpCampaign, {
          id,
          tenantId: ctx.auth?.tenantId,
        })
        if (!existing) throw new CrudHttpError(404, { error: 'Campaign not found' })
        if (existing.status !== 'draft') {
          throw new CrudHttpError(422, { error: 'Only draft campaigns can be deleted' })
        }
        return { id }
      },
      response: () => ({ ok: true }),
    },
  },
})

export async function GET(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50))
    const search = url.searchParams.get('search') ?? undefined
    const statusFilter = url.searchParams.get('status') ?? undefined

    const { resolve } = await createRequestContainer()
    const em = resolve('em') as import('@mikro-orm/postgresql').EntityManager
    const rbac = resolve('rbacService') as RbacService
    const isPm = await rbac.userHasAllFeatures(auth.sub, ['partnerships.rfp.manage'], {
      tenantId: auth.tenantId,
      organizationId: auth.orgId ?? null,
    })

    // Single campaign by ID
    const idFilter = url.searchParams.get('id')
    if (idFilter && /^[0-9a-f-]{36}$/i.test(idFilter)) {
      const campaign = await em.findOne(PartnerRfpCampaign, { id: idFilter, tenantId: auth.tenantId })
      if (!campaign || (!isPm && !isCampaignVisibleToOrganization(campaign, auth.orgId))) {
        return NextResponse.json({ items: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
      }
      return NextResponse.json({ items: [campaign], total: 1, page: 1, pageSize: 1, totalPages: 1 })
    }

    const where: any = { tenantId: auth.tenantId }
    if (statusFilter) where.status = statusFilter
    if (search) where.title = { $ilike: `%${escapeLikePattern(search)}%` }

    const allItems = await em.find(PartnerRfpCampaign, where, {
      orderBy: { createdAt: 'DESC' },
    })
    const visibleItems = isPm ? allItems : allItems.filter((campaign) => isCampaignVisibleToOrganization(campaign, auth.orgId))
    const total = visibleItems.length
    const items = visibleItems.slice((page - 1) * pageSize, page * pageSize)

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (err: any) {
    console.error('[partnerships/rfp-campaigns.GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = rfpCampaignCreateSchema.parse(body)

    // Reject past deadlines
    if (parsed.deadline && new Date(parsed.deadline) < new Date()) {
      return NextResponse.json({ error: 'Deadline must be in the future' }, { status: 422 })
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as import('@mikro-orm/postgresql').EntityManager

    const campaign = em.create(PartnerRfpCampaign, {
      ...parsed,
      status: 'draft',
      organizationId: auth.orgId ?? auth.tenantId,
      tenantId: auth.tenantId,
      createdBy: auth.sub,
    })
    em.persist(campaign)
    await em.flush()

    return NextResponse.json({ id: campaign.id }, { status: 201 })
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: err.flatten?.()?.fieldErrors }, { status: 422 })
    }
    console.error('[partnerships/rfp-campaigns.POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const PUT = crud.PUT
export const DELETE = crud.DELETE

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const rfpCampaignListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  deadline: z.string(),
  audience: z.string(),
  selected_agency_ids: z.array(z.string()).nullable().optional(),
  status: z.string(),
  winner_organization_id: z.string().uuid().nullable().optional(),
  organization_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.string().nullable().optional(),
})

const rfpCampaignCreateResponseSchema = z.object({
  id: z.string().uuid().nullable(),
})

export const openApi = createPartnershipsCrudOpenApi({
  resourceName: 'PartnerRfpCampaign',
  pluralName: 'PartnerRfpCampaigns',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(rfpCampaignListItemSchema),
  create: {
    schema: rfpCampaignCreateSchema,
    responseSchema: rfpCampaignCreateResponseSchema,
    description: 'Creates a new RFP campaign in draft status.',
  },
  update: {
    schema: rfpCampaignUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates a draft RFP campaign by id.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Deletes a draft RFP campaign by id.',
  },
})
