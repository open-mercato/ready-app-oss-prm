import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerTierDefinition } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.tiers.view'] },
  PATCH: { requireAuth: true, requireFeatures: ['partnerships.tiers.manage'] },
}

export async function GET(_req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) {
    throw new CrudHttpError(403, { error: 'Missing context' })
  }

  const em = ctx.container.resolve('em') as any
  const id = ctx.params?.id
  if (!id) {
    throw new CrudHttpError(400, { error: 'Missing tier id' })
  }

  const tier = await em.findOne(PartnerTierDefinition, {
    id, tenantId, organizationId, deletedAt: null,
  })
  if (!tier) {
    throw new CrudHttpError(404, { error: 'Tier definition not found' })
  }

  return Response.json({
    ok: true,
    data: {
      id: tier.id,
      key: tier.key,
      label: tier.label,
      wicThreshold: tier.wicThreshold,
      wipThreshold: tier.wipThreshold,
      minThreshold: tier.minThreshold,
      isActive: tier.isActive,
      createdAt: tier.createdAt.toISOString(),
      updatedAt: tier.updatedAt.toISOString(),
    },
  })
}

export async function PATCH(req: NextRequest, ctx: any) {
  const body = await req.json()
  const id = ctx.params?.id
  if (!id) {
    throw new CrudHttpError(400, { error: 'Missing tier id' })
  }

  const executeCommand = ctx.container.resolve('executeCommand') as any
  const result = await executeCommand('partnerships.partner_tier.update', { ...body, id }, ctx)
  return Response.json({
    ok: true,
    data: {
      id: result.id,
      key: result.key,
      label: result.label,
      isActive: result.isActive,
    },
  })
}

export const openApi = {
  '/api/partnerships/tiers/{id}': {
    get: {
      summary: 'Get tier definition by ID',
      tags: ['Partnerships'],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { 200: { description: 'Tier detail' }, 404: { description: 'Not found' } },
    },
    patch: {
      summary: 'Update a tier definition',
      tags: ['Partnerships'],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                wicThreshold: { type: 'integer' },
                wipThreshold: { type: 'integer' },
                minThreshold: { type: 'integer' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Tier updated' }, 404: { description: 'Not found' } },
    },
  },
}
