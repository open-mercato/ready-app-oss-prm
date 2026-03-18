import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerTierDefinition } from '../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.tiers.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.tiers.manage'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) {
    throw new CrudHttpError(403, { error: 'Missing context' })
  }

  const em = ctx.container.resolve('em') as any
  const url = new URL(req.url)
  const includeInactive = url.searchParams.get('includeInactive') === 'true'

  const where: any = { tenantId, organizationId, deletedAt: null }
  if (!includeInactive) where.isActive = true

  const items = await em.find(PartnerTierDefinition, where, {
    orderBy: { wicThreshold: 'asc' },
  })

  return Response.json({
    ok: true,
    data: {
      items: items.map((t: PartnerTierDefinition) => ({
        id: t.id,
        key: t.key,
        label: t.label,
        wicThreshold: t.wicThreshold,
        wipThreshold: t.wipThreshold,
        minThreshold: t.minThreshold,
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
      })),
    },
  })
}

export async function POST(req: NextRequest, ctx: any) {
  const body = await req.json()
  const executeCommand = ctx.container.resolve('executeCommand') as any
  const result = await executeCommand('partnerships.partner_tier.define', body, ctx)
  return Response.json({ ok: true, data: { id: result.id, key: result.key } }, { status: 201 })
}

export const openApi = {
  '/api/partnerships/tiers': {
    get: {
      summary: 'List tier definitions',
      tags: ['Partnerships'],
      parameters: [
        { name: 'includeInactive', in: 'query', schema: { type: 'boolean', default: false } },
      ],
      responses: { 200: { description: 'Tier list' } },
    },
    post: {
      summary: 'Create a tier definition',
      tags: ['Partnerships'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                wicThreshold: { type: 'integer' },
                wipThreshold: { type: 'integer' },
                minThreshold: { type: 'integer' },
                isActive: { type: 'boolean' },
              },
              required: ['key', 'label'],
            },
          },
        },
      },
      responses: { 201: { description: 'Tier created' }, 409: { description: 'Tier key already exists' } },
    },
  },
}
