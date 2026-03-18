import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { PartnerTierDefinition } from '../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.tiers.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.tiers.manage'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.auth?.orgId
  if (!tenantId || !organizationId) {
    throw new CrudHttpError(403, { error: 'Missing context' })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as any
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
  const container = await createRequestContainer()
  const commandBus = container.resolve('commandBus') as CommandBus
  const scope = await resolveOrganizationScopeForRequest({ container, auth: ctx.auth, request: req })
  const effectiveOrgId = scope.selectedId ?? ctx.auth?.orgId ?? null
  const runtimeCtx: CommandRuntimeContext = {
    container,
    auth: ctx.auth,
    organizationScope: scope,
    selectedOrganizationId: effectiveOrgId,
    organizationIds: scope.filterIds ?? (effectiveOrgId ? [effectiveOrgId] : null),
    request: req,
  }
  const { result } = await commandBus.execute('partnerships.partner_tier.define', { input: body, ctx: runtimeCtx })
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
