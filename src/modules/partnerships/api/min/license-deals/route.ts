import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { PartnerLicenseDeal } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.kpi.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.kpi.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['partnerships.kpi.manage'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.auth?.orgId
  if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

  const container = await createRequestContainer()
  const em = container.resolve('em') as any
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50', 10), 100)

  const [items, total] = await em.findAndCount(PartnerLicenseDeal, {
    tenantId, organizationId, deletedAt: null,
  }, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    orderBy: { createdAt: 'desc' },
  })

  return Response.json({
    ok: true,
    data: {
      items: items.map((d: PartnerLicenseDeal) => ({
        id: d.id, customerId: d.customerId, dealType: d.dealType,
        status: d.status, isRenewal: d.isRenewal,
        partnerAgencyId: d.partnerAgencyId,
        attributedAt: d.attributedAt?.toISOString() ?? null,
        attributedByUserId: d.attributedByUserId,
        createdAt: d.createdAt.toISOString(),
      })),
      total, page, pageSize, totalPages: Math.ceil(total / pageSize),
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
  const { result } = await commandBus.execute('partnerships.partner_license_deal.create', { input: body, ctx: runtimeCtx })
  return Response.json({ ok: true, data: { id: result.id } }, { status: 201 })
}

export async function PUT(req: NextRequest, ctx: any) {
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

  // If partnerAgencyId is present, use the attribute command
  if (body.partnerAgencyId && body.id) {
    const { result } = await commandBus.execute('partnerships.partner_license_deal.attribute', { input: body, ctx: runtimeCtx })
    return Response.json({ ok: true, data: { id: result.id } })
  }

  const { result } = await commandBus.execute('partnerships.partner_license_deal.update', { input: body, ctx: runtimeCtx })
  return Response.json({ ok: true, data: { id: result.id } })
}

export const openApi = {
  '/api/partnerships/min/license-deals': {
    get: { summary: 'List license deals for MIN attribution', tags: ['Partnerships'] },
    post: { summary: 'Create license deal', tags: ['Partnerships'] },
    put: { summary: 'Update or attribute license deal', tags: ['Partnerships'] },
  },
}
