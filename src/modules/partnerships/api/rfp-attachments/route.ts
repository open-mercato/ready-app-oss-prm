import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { PartnerRfpCampaign, PartnerRfpResponse } from '../../data/entities'

export const metadata = {
  path: '/partnerships/rfp-attachments',
  GET: { requireAuth: true, requireFeatures: ['partnerships.rfp.view'] },
}

const VALID_ENTITY_IDS = new Set(['partnerships:rfp_campaign', 'partnerships:rfp_response'])

/**
 * Cross-org attachment listing for RFP entities.
 *
 * The core /api/attachments GET filters by organizationId, which breaks
 * cross-org visibility (PM can't see agency uploads, agencies can't see PM's
 * campaign files). This route queries by tenantId only, after validating
 * that the caller has access to the parent campaign/response.
 */
export async function GET(req: Request) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId || !auth.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const entityId = url.searchParams.get('entityId') || ''
    const recordId = url.searchParams.get('recordId') || ''
    if (!entityId || !recordId) {
      return NextResponse.json({ error: 'entityId and recordId are required' }, { status: 400 })
    }
    if (!VALID_ENTITY_IDS.has(entityId)) {
      return NextResponse.json({ error: 'Invalid entityId for RFP attachments' }, { status: 400 })
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const rbac = container.resolve('rbacService') as RbacService

    // Validate access to the parent record
    const hasAccess = await validateRfpAccess(em, rbac, auth as { sub: string; tenantId: string; orgId?: string | null }, entityId, recordId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Query without organizationId filter — cross-org by design
    const items = await em.find(
      Attachment,
      { entityId, recordId, tenantId: auth.tenantId },
      { orderBy: { createdAt: 'desc' } as any },
    )

    return NextResponse.json({
      items: items.map((a: any) => ({
        id: a.id,
        url: a.url,
        fileName: a.fileName,
        fileSize: a.fileSize,
        createdAt: a.createdAt,
        mimeType: a.mimeType ?? null,
      })),
    })
  } catch (err) {
    console.error('[partnerships/rfp-attachments.GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function validateRfpAccess(
  em: EntityManager,
  rbac: RbacService,
  auth: { sub: string; tenantId: string; orgId?: string | null },
  entityId: string,
  recordId: string,
): Promise<boolean> {
  const isPm = await rbac.userHasAllFeatures(auth.sub, ['partnerships.rfp.manage'], {
    tenantId: auth.tenantId,
    organizationId: auth.orgId ?? null,
  })

  if (entityId === 'partnerships:rfp_campaign') {
    const campaign = await em.findOne(PartnerRfpCampaign, { id: recordId, tenantId: auth.tenantId })
    if (!campaign) return false
    if (isPm) return true
    // Agency: must see published campaign + be in audience
    if (campaign.status === 'draft') return false
    if (campaign.audience === 'selected') {
      return Array.isArray(campaign.selectedAgencyIds) && !!auth.orgId && campaign.selectedAgencyIds.includes(auth.orgId)
    }
    return true
  }

  if (entityId === 'partnerships:rfp_response') {
    const response = await em.findOne(PartnerRfpResponse, { id: recordId, tenantId: auth.tenantId })
    if (!response) return false
    if (isPm) return true
    // Agency: can only see own response
    return response.organizationId === auth.orgId
  }

  return false
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const attachmentItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  fileName: z.string(),
  fileSize: z.number().int(),
  createdAt: z.string(),
  mimeType: z.string().nullable(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'List attachments for an RFP campaign or response (cross-org)',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Attachment list', schema: z.object({ items: z.array(attachmentItemSchema) }) },
    { status: 403, description: 'Forbidden' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'RFP attachments (cross-org)',
  methods: { GET: getDoc },
}

export default GET
