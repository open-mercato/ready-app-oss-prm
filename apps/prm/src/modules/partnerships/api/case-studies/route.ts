import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { SortDir } from '@open-mercato/shared/lib/query/types'
import type { QueryEngine } from '@open-mercato/shared/lib/query/types'
import { loadCustomFieldSnapshot } from '@open-mercato/shared/lib/commands/customFieldSnapshots'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import {
  getSelectedOrganizationFromRequest,
  resolveOrganizationScope,
} from '@open-mercato/core/modules/directory/utils/organizationScope'
import {
  caseStudyCreateSchema,
  caseStudyDeleteSchema,
  caseStudyUpdateSchema,
  caseStudyValuesSchema,
} from '../../data/validators'

const ENTITY_ID = 'partnerships:case_study'

export const metadata = {
  path: '/partnerships/case-studies',
  GET: { requireAuth: true, requireFeatures: ['customers.*'] },
  POST: { requireAuth: true, requireFeatures: ['customers.*'] },
  PUT: { requireAuth: true, requireFeatures: ['customers.*'] },
  DELETE: { requireAuth: true, requireFeatures: ['customers.*'] },
}

const caseStudyItemSchema = caseStudyValuesSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
})

const listResponseSchema = z.object({
  items: z.array(caseStudyItemSchema),
  total: z.number().int().nonnegative(),
})

type NormalizedCaseStudyRecord = z.infer<typeof caseStudyItemSchema>

function normalizeRow(row: Record<string, unknown>): NormalizedCaseStudyRecord {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const nextKey = key.startsWith('cf_') ? key.slice(3) : key
    normalized[nextKey] = value instanceof Date ? value.toISOString() : value
  }

  return caseStudyItemSchema.parse({
    id: normalized.id,
    title: normalized.title,
    industry: normalized.industry,
    technologies: normalized.technologies,
    budget_bucket: normalized.budget_bucket,
    duration_bucket: normalized.duration_bucket,
    client_name: normalized.client_name,
    description: normalized.description,
    challenges: normalized.challenges,
    solution: normalized.solution,
    results: normalized.results,
    is_public: normalized.is_public,
    created_at: normalized.created_at ?? null,
    updated_at: normalized.updated_at ?? null,
  })
}

async function resolveOrgContext(
  req: Request,
  em: EntityManager,
  rbac: RbacService,
  auth: NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>,
) {
  const tenantId = auth.tenantId
  if (!tenantId) {
    throw new Error('Tenant context is required')
  }

  const scope = await resolveOrganizationScope({
    em,
    rbac,
    auth,
    selectedId: getSelectedOrganizationFromRequest(req),
  })

  const organizationId = scope.selectedId ?? auth.orgId
  if (!organizationId) {
    throw new Error('Organization context is required')
  }

  return {
    organizationId,
    tenantId,
  }
}

async function loadRecordOrThrow(
  qe: QueryEngine,
  tenantId: string,
  organizationId: string,
  recordId: string,
): Promise<NormalizedCaseStudyRecord> {
  const result = await qe.query(ENTITY_ID as never, {
    tenantId,
    includeCustomFields: true,
    page: { page: 1, pageSize: 1 },
    sort: [{ field: 'created_at', dir: SortDir.Desc }],
    organizationIds: [organizationId],
    filters: {
      id: recordId,
      organization_id: organizationId,
    } as never,
  })

  const first = result.items?.[0]
  if (!first || typeof first !== 'object') {
    throw new Error('Not found')
  }

  return normalizeRow(first as Record<string, unknown>)
}

async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const qe = container.resolve('queryEngine') as QueryEngine
    const rbac = container.resolve('rbacService') as RbacService
    const { organizationId, tenantId } = await resolveOrgContext(req, em, rbac, auth)

    const result = await qe.query(ENTITY_ID as never, {
      tenantId,
      includeCustomFields: true,
      page: { page: 1, pageSize: 100 },
      sort: [{ field: 'created_at', dir: SortDir.Desc }],
      organizationIds: [organizationId],
      filters: {
        organization_id: organizationId,
      } as never,
    })

    return NextResponse.json({
      items: (result.items ?? []).map((item) => normalizeRow(item as Record<string, unknown>)),
      total: typeof result.total === 'number' ? result.total : (result.items ?? []).length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Organization context is required' ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const parseResult = caseStudyCreateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 422 },
      )
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const rbac = container.resolve('rbacService') as RbacService
    const de = container.resolve('dataEngine') as DataEngine
    const { organizationId, tenantId } = await resolveOrgContext(req, em, rbac, auth)

    const { id } = await de.createCustomEntityRecord({
      entityId: ENTITY_ID,
      organizationId,
      tenantId,
      values: parseResult.data.values,
    })

    const qe = container.resolve('queryEngine') as QueryEngine
    const item = await loadRecordOrThrow(qe, tenantId, organizationId, id)
    return NextResponse.json({ ok: true, item })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Organization context is required' ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function PUT(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const parseResult = caseStudyUpdateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 422 },
      )
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const rbac = container.resolve('rbacService') as RbacService
    const de = container.resolve('dataEngine') as DataEngine
    const qe = container.resolve('queryEngine') as QueryEngine
    const { organizationId, tenantId } = await resolveOrgContext(req, em, rbac, auth)

    await loadRecordOrThrow(qe, tenantId, organizationId, parseResult.data.recordId)
    const currentSnapshot = await loadCustomFieldSnapshot(em, {
      entityId: ENTITY_ID,
      recordId: parseResult.data.recordId,
      tenantId,
      organizationId,
    })

    await de.updateCustomEntityRecord({
      entityId: ENTITY_ID,
      recordId: parseResult.data.recordId,
      organizationId,
      tenantId,
      values: {
        ...currentSnapshot,
        ...parseResult.data.values,
      },
    })

    const item = await loadRecordOrThrow(qe, tenantId, organizationId, parseResult.data.recordId)
    return NextResponse.json({ ok: true, item })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Organization context is required'
      ? 400
      : message === 'Not found'
        ? 404
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function DELETE(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const recordId = url.searchParams.get('recordId')
    const payload = recordId ? { recordId } : await req.json()
    const parseResult = caseStudyDeleteSchema.safeParse(payload)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 422 },
      )
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const rbac = container.resolve('rbacService') as RbacService
    const de = container.resolve('dataEngine') as DataEngine
    const qe = container.resolve('queryEngine') as QueryEngine
    const { organizationId, tenantId } = await resolveOrgContext(req, em, rbac, auth)

    await loadRecordOrThrow(qe, tenantId, organizationId, parseResult.data.recordId)
    await de.deleteCustomEntityRecord({
      entityId: ENTITY_ID,
      recordId: parseResult.data.recordId,
      organizationId,
      tenantId,
      soft: true,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Organization context is required'
      ? 400
      : message === 'Not found'
        ? 404
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}

const mutationItemSchema = z.object({
  ok: z.literal(true),
  item: caseStudyItemSchema,
})

const okResponseSchema = z.object({
  ok: z.literal(true),
})

const errorResponseSchema = z.object({
  error: z.string(),
}).passthrough()

const getDoc: OpenApiMethodDoc = {
  summary: 'List case studies for the currently scoped organization',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Case studies', schema: listResponseSchema },
    { status: 401, description: 'Unauthorized', schema: errorResponseSchema },
  ],
}

const postDoc: OpenApiMethodDoc = {
  summary: 'Create a case study',
  tags: ['Partnerships'],
  requestBody: { schema: caseStudyCreateSchema },
  responses: [
    { status: 200, description: 'Created case study', schema: mutationItemSchema },
    { status: 401, description: 'Unauthorized', schema: errorResponseSchema },
    { status: 422, description: 'Validation failed', schema: errorResponseSchema },
  ],
}

const putDoc: OpenApiMethodDoc = {
  summary: 'Update a case study',
  tags: ['Partnerships'],
  requestBody: { schema: caseStudyUpdateSchema },
  responses: [
    { status: 200, description: 'Updated case study', schema: mutationItemSchema },
    { status: 401, description: 'Unauthorized', schema: errorResponseSchema },
    { status: 404, description: 'Case study not found', schema: errorResponseSchema },
    { status: 422, description: 'Validation failed', schema: errorResponseSchema },
  ],
}

const deleteDoc: OpenApiMethodDoc = {
  summary: 'Delete a case study',
  tags: ['Partnerships'],
  requestBody: { schema: caseStudyDeleteSchema },
  responses: [
    { status: 200, description: 'Deleted case study', schema: okResponseSchema },
    { status: 401, description: 'Unauthorized', schema: errorResponseSchema },
    { status: 404, description: 'Case study not found', schema: errorResponseSchema },
    { status: 422, description: 'Validation failed', schema: errorResponseSchema },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Case studies',
  methods: {
    GET: getDoc,
    POST: postDoc,
    PUT: putDoc,
    DELETE: deleteDoc,
  },
}

export { GET, POST, PUT, DELETE }
