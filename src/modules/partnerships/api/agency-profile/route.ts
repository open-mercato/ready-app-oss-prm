import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { loadCustomFieldSnapshot } from '@open-mercato/shared/lib/commands/customFieldSnapshots'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { E } from '@/.mercato/generated/entities.ids.generated'
import {
  agencyProfileUpdateSchema,
  agencyProfileValuesSchema,
} from '../../data/validators'

export const metadata = {
  path: '/partnerships/agency-profile',
  GET: { requireAuth: true, requireFeatures: ['partnerships.agency-profile.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.agency-profile.manage'] },
}

type AgencyProfileResponse = {
  organizationId: string
  organizationName: string | null
  values: z.infer<typeof agencyProfileValuesSchema>
}

async function loadAgencyProfile(
  em: EntityManager,
  tenantId: string,
  organizationId: string,
): Promise<AgencyProfileResponse> {
  const organization = await em.findOne(Organization, {
    id: organizationId,
    tenant: tenantId,
    deletedAt: null,
  })
  if (!organization) {
    throw new CrudHttpError(404, { error: 'Organization not found' })
  }

  const snapshot = await loadCustomFieldSnapshot(em, {
    entityId: E.directory.organization,
    recordId: organizationId,
    tenantId,
    organizationId,
  })

  return {
    organizationId,
    organizationName: organization.name ?? null,
    values: agencyProfileValuesSchema.parse(snapshot ?? {}),
  }
}

async function GET(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const em = (container.resolve('em') as EntityManager).fork()
    const response = await loadAgencyProfile(em, auth.tenantId, auth.orgId)
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/agency-profile.GET] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function PUT(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parseResult = agencyProfileUpdateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 422 },
      )
    }

    const container = await createRequestContainer()
    const em = (container.resolve('em') as EntityManager).fork()
    const organization = await em.findOne(Organization, {
      id: auth.orgId,
      tenant: auth.tenantId,
      deletedAt: null,
    })
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const dataEngine = container.resolve('dataEngine') as DataEngine
    const currentSnapshot = await loadCustomFieldSnapshot(em, {
      entityId: E.directory.organization,
      recordId: auth.orgId,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
    })
    const nextValues = {
      ...agencyProfileValuesSchema.parse(currentSnapshot ?? {}),
      ...parseResult.data.values,
    }

    await dataEngine.setCustomFields({
      entityId: E.directory.organization,
      recordId: auth.orgId,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      values: nextValues as Record<string, string | number | boolean | null | string[]>,
    })

    const response = await loadAgencyProfile(em, auth.tenantId, auth.orgId)
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/agency-profile.PUT] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const responseSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string().nullable(),
  values: agencyProfileValuesSchema,
})

const getDoc: OpenApiMethodDoc = {
  summary: 'Get the current agency profile for the authenticated organization',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Agency profile', schema: responseSchema },
    { status: 401, description: 'Unauthorized' },
    { status: 404, description: 'Organization not found' },
  ],
}

const putDoc: OpenApiMethodDoc = {
  summary: 'Update the current agency profile for the authenticated organization',
  tags: ['Partnerships'],
  requestBody: { schema: agencyProfileUpdateSchema },
  responses: [
    { status: 200, description: 'Updated agency profile', schema: responseSchema },
    { status: 401, description: 'Unauthorized' },
    { status: 404, description: 'Organization not found' },
    { status: 422, description: 'Validation failed' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Agency profile',
  methods: {
    GET: getDoc,
    PUT: putDoc,
  },
}

export { GET, PUT }
