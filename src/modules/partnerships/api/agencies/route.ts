import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerAgency } from '../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['partnerships.agencies.view'] },
  POST: { requireAuth: true, requireFeatures: ['partnerships.agencies.onboard'] },
}

export async function GET(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (!tenantId || !organizationId) {
    throw new CrudHttpError(403, { error: 'Missing context' })
  }

  const em = ctx.container.resolve('em') as any
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50', 10), 100)
  const status = url.searchParams.get('status')

  const where: any = { tenantId, organizationId, deletedAt: null }
  if (status) where.status = status

  const [items, total] = await em.findAndCount(PartnerAgency, where, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    orderBy: { createdAt: 'desc' },
  })

  return Response.json({
    ok: true,
    data: {
      items: items.map((a: PartnerAgency) => ({
        id: a.id,
        agencyOrganizationId: a.agencyOrganizationId,
        status: a.status,
        onboardedAt: a.onboardedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}

export async function POST(req: NextRequest, ctx: any) {
  const body = await req.json()
  const executeCommand = ctx.container.resolve('executeCommand') as any
  const result = await executeCommand('partnerships.partner_agency.self_onboard', body, ctx)
  return Response.json({ ok: true, data: { id: result.id, status: result.status } }, { status: 201 })
}

export const openApi = {
  '/api/partnerships/agencies': {
    get: {
      summary: 'List partner agencies',
      tags: ['Partnerships'],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
      ],
      responses: { 200: { description: 'Agency list' } },
    },
    post: {
      summary: 'Self-onboard as partner agency',
      tags: ['Partnerships'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { agencyOrganizationId: { type: 'string', format: 'uuid' } },
              required: ['agencyOrganizationId'],
            },
          },
        },
      },
      responses: { 201: { description: 'Agency created' }, 409: { description: 'Already onboarded' } },
    },
  },
}
