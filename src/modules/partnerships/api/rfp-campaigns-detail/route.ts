import { NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { PartnerRfpCampaign } from '../../data/entities'

export const metadata = {
  path: '/partnerships/rfp-campaigns/[id]',
  GET: { requireAuth: true, requireFeatures: ['partnerships.rfp.view'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['partnerships.rfp.manage'] },
}

function isCampaignVisibleToOrganization(
  campaign: Pick<PartnerRfpCampaign, 'audience' | 'selectedAgencyIds' | 'status'>,
  organizationId: string | null | undefined,
): boolean {
  if (campaign.status === 'draft') return false
  if (campaign.audience !== 'selected') return true
  if (!organizationId) return false
  return Array.isArray(campaign.selectedAgencyIds) && campaign.selectedAgencyIds.includes(organizationId)
}

function extractId(req: Request): string | null {
  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean)
  // /api/partnerships/rfp-campaigns/{id} — last segment before any action
  // But if URL is /api/partnerships/rfp-campaigns/{id}/publish or /award, we don't want that
  // For this route, the [id] IS the last segment
  const last = segments.at(-1)
  if (last && /^[0-9a-f-]{36}$/i.test(last)) return last
  return null
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = extractId(req)
    if (!id) return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 })

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const rbac = container.resolve('rbacService') as RbacService

    const campaign = await em.findOne(PartnerRfpCampaign, { id, tenantId: auth.tenantId })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const isPm = await rbac.userHasAllFeatures(auth.sub, ['partnerships.rfp.manage'], {
      tenantId: auth.tenantId,
      organizationId: auth.orgId ?? null,
    })
    if (!isPm && !isCampaignVisibleToOrganization(campaign, auth.orgId)) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    return NextResponse.json(campaign)
  } catch (err) {
    console.error('[partnerships/rfp-campaigns-detail.GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = extractId(req)
    if (!id) return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 })

    const body = await req.json()

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    const campaign = await em.findOne(PartnerRfpCampaign, { id, tenantId: auth.tenantId })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    if (campaign.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be edited' }, { status: 422 })
    }

    if (body.title) campaign.title = body.title
    if (body.description) campaign.description = body.description
    if (body.deadline) campaign.deadline = new Date(body.deadline)
    if (body.audience) campaign.audience = body.audience
    if (body.selectedAgencyIds) campaign.selectedAgencyIds = body.selectedAgencyIds

    await em.flush()

    return NextResponse.json({ ok: true, campaign: { id: campaign.id } })
  } catch (err) {
    console.error('[partnerships/rfp-campaigns-detail.PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = extractId(req)
    if (!id) return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 })

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    const campaign = await em.findOne(PartnerRfpCampaign, { id, tenantId: auth.tenantId })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    if (campaign.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be deleted' }, { status: 422 })
    }

    await em.removeAndFlush(campaign)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[partnerships/rfp-campaigns-detail.DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const getDoc: OpenApiMethodDoc = {
  summary: 'Get a single RFP campaign by ID',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Campaign details' },
    { status: 404, description: 'Not found' },
  ],
}

const putDoc: OpenApiMethodDoc = {
  summary: 'Update a draft RFP campaign',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Updated' },
    { status: 422, description: 'Only draft campaigns can be edited' },
  ],
}

const deleteDoc: OpenApiMethodDoc = {
  summary: 'Delete a draft RFP campaign',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Deleted' },
    { status: 422, description: 'Only draft campaigns can be deleted' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'RFP campaign by ID',
  methods: { GET: getDoc, PUT: putDoc, DELETE: deleteDoc },
}
