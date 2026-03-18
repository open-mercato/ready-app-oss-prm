import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerAgency } from '../../../../data/entities'
import { getCurrentTierAssignment } from '../../../../lib/tier-lifecycle'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.tiers.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.tiers.manage'] },
}

export async function GET(_req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) {
    throw new CrudHttpError(403, { error: 'Missing context' })
  }

  const agencyOrgId = ctx.params?.organizationId
  if (!agencyOrgId) {
    throw new CrudHttpError(400, { error: 'Missing organizationId param' })
  }

  const em = ctx.container.resolve('em') as any

  const agency = await em.findOne(PartnerAgency, {
    tenantId, organizationId, agencyOrganizationId: agencyOrgId, deletedAt: null,
  })
  if (!agency) {
    throw new CrudHttpError(404, { error: 'Partner agency not found' })
  }

  const scope = { tenantId, organizationId }
  const current = await getCurrentTierAssignment(em, scope, agency.id)

  return Response.json({
    ok: true,
    data: current
      ? {
          id: current.id,
          tierKey: current.tierKey,
          grantedAt: current.grantedAt.toISOString(),
          validUntil: current.validUntil?.toISOString() ?? null,
          reason: current.reason ?? null,
          assignedByUserId: current.assignedByUserId ?? null,
        }
      : null,
  })
}

export async function POST(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) {
    throw new CrudHttpError(403, { error: 'Missing context' })
  }

  const agencyOrgId = ctx.params?.organizationId
  if (!agencyOrgId) {
    throw new CrudHttpError(400, { error: 'Missing organizationId param' })
  }

  const em = ctx.container.resolve('em') as any

  const agency = await em.findOne(PartnerAgency, {
    tenantId, organizationId, agencyOrganizationId: agencyOrgId, deletedAt: null,
  })
  if (!agency) {
    throw new CrudHttpError(404, { error: 'Partner agency not found' })
  }

  const body = await req.json()
  const executeCommand = ctx.container.resolve('executeCommand') as any
  const result = await executeCommand('partnerships.partner_tier.assign', {
    ...body,
    partnerAgencyId: agency.id,
  }, ctx)

  return Response.json({
    ok: true,
    data: {
      id: result.id,
      tierKey: result.tierKey,
      grantedAt: result.grantedAt.toISOString(),
      validUntil: result.validUntil?.toISOString() ?? null,
    },
  }, { status: 201 })
}

export const openApi = {
  '/api/partnerships/agencies/{organizationId}/tier-assignments': {
    get: {
      summary: 'Get current tier assignment for an agency',
      tags: ['Partnerships'],
      parameters: [
        { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { 200: { description: 'Current assignment or null' }, 404: { description: 'Agency not found' } },
    },
    post: {
      summary: 'Assign a tier to an agency',
      tags: ['Partnerships'],
      parameters: [
        { name: 'organizationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                tierKey: { type: 'string' },
                validUntil: { type: 'string', format: 'date-time' },
                reason: { type: 'string' },
              },
              required: ['tierKey'],
            },
          },
        },
      },
      responses: { 201: { description: 'Tier assigned' }, 404: { description: 'Agency or tier not found' } },
    },
  },
}
