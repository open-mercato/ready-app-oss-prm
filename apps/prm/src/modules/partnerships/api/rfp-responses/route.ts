import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { PartnerRfpCampaign, PartnerRfpResponse } from '../../data/entities'
import { rfpResponseCreateSchema, rfpResponseUpdateSchema } from '../../data/validators'

export const metadata = {
  path: '/partnerships/rfp-responses',
  GET: { requireAuth: true },
  POST: { requireAuth: true, requireFeatures: ['partnerships.rfp.respond'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.rfp.respond'] },
}

const ACTIVE_RESPONSE_CAMPAIGN_STATUSES = new Set(['open', 'published'])

// ---------------------------------------------------------------------------
// GET — list responses (PM sees all, filtered by campaignId)
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const campaignId = url.searchParams.get('campaignId')

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const rbac = container.resolve('rbacService') as RbacService

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const tenantId = scope?.tenantId ?? auth.tenantId
    const selectedOrgId = scope?.selectedId ?? null

    // PM (rfp.manage) sees responses scoped to org switcher; agency sees own org only
    const isPm = await rbac.userHasAllFeatures(auth.sub, ['partnerships.rfp.manage'], {
      tenantId,
      organizationId: selectedOrgId ?? auth.orgId ?? null,
    })

    const where: Record<string, unknown> = { tenantId }
    if (campaignId) where.campaignId = campaignId
    if (isPm) {
      // filterIds=null means "All Orgs" or no cookie set — show everything
      // filterIds=[...] means specific org selected — scope to those orgs
      if (scope?.filterIds) where.organizationId = { $in: scope.filterIds }
    } else {
      // Agency: locked to own org
      where.organizationId = auth.orgId
    }

    const rawItems = await em.find(PartnerRfpResponse, where, {
      orderBy: { createdAt: 'ASC' },
    })

    // Enrich with agency names
    const orgIds = [...new Set(rawItems.map((r) => r.organizationId))]
    const orgs = orgIds.length > 0 ? await em.find(Organization, { id: { $in: orgIds } }) : []
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]))

    const items = rawItems.map((r) => ({
      ...r,
      agencyName: orgMap.get(r.organizationId) ?? 'Agency',
    }))

    return NextResponse.json({ items, total: items.length })
  } catch (err) {
    console.error('[partnerships/rfp-responses.GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

async function validateCampaignForResponse(
  em: EntityManager,
  campaignId: string,
  tenantId: string,
  organizationId: string,
): Promise<{ campaign: PartnerRfpCampaign } | { error: string; status: number }> {
  const campaign = await em.findOne(PartnerRfpCampaign, { id: campaignId, tenantId })
  if (!campaign) return { error: 'Campaign not found', status: 404 }
  if (campaign.status === 'awarded' || campaign.status === 'closed') {
    return { error: 'Campaign is no longer accepting responses', status: 422 }
  }
  if (!ACTIVE_RESPONSE_CAMPAIGN_STATUSES.has(campaign.status)) {
    return { error: 'Campaign is not published yet', status: 422 }
  }
  if (
    campaign.audience === 'selected' &&
    (!Array.isArray(campaign.selectedAgencyIds) || !campaign.selectedAgencyIds.includes(organizationId))
  ) {
    return { error: 'Your agency is not invited to this campaign', status: 403 }
  }
  if (new Date(campaign.deadline) < new Date()) {
    return { error: 'Campaign deadline has passed', status: 422 }
  }
  return { campaign }
}

// ---------------------------------------------------------------------------
// POST — submit response (BD only)
// ---------------------------------------------------------------------------

async function POST(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.sub || !auth.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = rfpResponseCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      )
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    const validation = await validateCampaignForResponse(em, parsed.data.campaignId, auth.tenantId, auth.orgId)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    // Check for existing response from this org
    const existing = await em.findOne(PartnerRfpResponse, {
      campaignId: parsed.data.campaignId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Your agency has already submitted a response. Use PUT to update.' },
        { status: 422 },
      )
    }

    const response = em.create(PartnerRfpResponse, {
      campaignId: parsed.data.campaignId,
      organizationId: auth.orgId,
      responseText: parsed.data.responseText,
      submittedBy: auth.sub,
      tenantId: auth.tenantId,
    })
    em.persist(response)
    await em.flush()

    return NextResponse.json({ id: response.id, organizationId: response.organizationId, ok: true }, { status: 201 })
  } catch (err) {
    console.error('[partnerships/rfp-responses.POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT — update/upsert response (BD only)
// ---------------------------------------------------------------------------

async function PUT(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.sub || !auth.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = rfpResponseUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      )
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    const validation = await validateCampaignForResponse(em, parsed.data.campaignId, auth.tenantId, auth.orgId)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    // Find existing response or create new
    let response = await em.findOne(PartnerRfpResponse, {
      campaignId: parsed.data.campaignId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
    })

    if (response) {
      response.responseText = parsed.data.responseText
      response.submittedBy = auth.sub
    } else {
      response = em.create(PartnerRfpResponse, {
        campaignId: parsed.data.campaignId,
        organizationId: auth.orgId,
        responseText: parsed.data.responseText,
        submittedBy: auth.sub,
        tenantId: auth.tenantId,
      })
      em.persist(response)
    }

    await em.flush()

    return NextResponse.json({ id: response.id, ok: true })
  } catch (err) {
    console.error('[partnerships/rfp-responses.PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const responseItemSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  organizationId: z.string().uuid(),
  responseText: z.string(),
  submittedBy: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'List RFP responses (optionally filtered by campaignId)',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'RFP responses', schema: z.object({ items: z.array(responseItemSchema), total: z.number() }) },
  ],
}

const postDoc: OpenApiMethodDoc = {
  summary: 'Submit a response to an RFP campaign',
  tags: ['Partnerships'],
  requestBody: { schema: rfpResponseCreateSchema },
  responses: [
    { status: 201, description: 'Response submitted' },
    { status: 422, description: 'Validation error or deadline passed' },
    { status: 403, description: 'Forbidden' },
  ],
}

const putDoc: OpenApiMethodDoc = {
  summary: 'Update/upsert a response to an RFP campaign',
  tags: ['Partnerships'],
  requestBody: { schema: rfpResponseUpdateSchema },
  responses: [
    { status: 200, description: 'Response updated' },
    { status: 422, description: 'Validation error or deadline passed' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'RFP responses',
  methods: { GET: getDoc, POST: postDoc, PUT: putDoc },
}

export { GET, POST, PUT }
export default GET
