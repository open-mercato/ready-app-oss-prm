import type { NextRequest } from 'next/server'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { runMutationGuards } from '@open-mercato/shared/lib/crud/mutation-guard-registry'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'
import { resolvePartnerAgency } from '../../../../../lib/resolvePartnerAgency'
import { z } from 'zod'

const rfpResponseSchema = z.object({
  content: z.string().min(1).max(10000),
})

export const metadata = {
  POST: { requireCustomerAuth: true, requireCustomerFeatures: ['portal.partner.rfp.respond'] },
}

export async function POST(req: NextRequest, ctx: any) {
  const auth = await getCustomerAuthFromRequest(req)
  if (!auth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as any

  const agencyCtx = await resolvePartnerAgency(em, auth.customerEntityId, auth.tenantId, auth.orgId)
  if (!agencyCtx) {
    return Response.json({ error: 'No partner agency linked to your account' }, { status: 403 })
  }

  const campaignId = ctx.params?.id
  if (!campaignId) return Response.json({ error: 'Missing campaign ID' }, { status: 400 })

  const body = await req.json()
  const parsed = rfpResponseSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  // Mutation guards
  const guards = (container as any).resolve?.('mutationGuards') ?? []
  if (guards.length > 0) {
    const guardResult = await runMutationGuards(guards, {
      tenantId: auth.tenantId ?? '', organizationId: auth.orgId ?? '', userId: auth.customerEntityId ?? '',
      resourceKind: 'partnerships:partner_rfp_response',
      resourceId: campaignId,
      operation: 'create',
      requestMethod: 'POST',
      requestHeaders: req.headers,
      mutationPayload: parsed.data,
    }, { userFeatures: [] })
    if (!guardResult.ok) {
      return Response.json(guardResult.errorBody, { status: guardResult.errorStatus ?? 403 })
    }
  }

  const commandBus = container.resolve('commandBus') as CommandBus
  const runtimeCtx = {
    container,
    auth: { tenantId: auth.tenantId, orgId: auth.orgId, userId: auth.customerEntityId },
    selectedOrganizationId: auth.orgId ?? null,
    organizationScope: { selectedId: auth.orgId ?? null, filterIds: auth.orgId ? [auth.orgId] : null },
    organizationIds: auth.orgId ? [auth.orgId] : null,
    request: req,
  } as unknown as CommandRuntimeContext

  const { result } = await commandBus.execute('partnerships.partner_rfp.respond', {
    input: {
      rfpCampaignId: campaignId,
      partnerAgencyId: agencyCtx.agency.id,
      content: parsed.data.content,
    },
    ctx: runtimeCtx,
  })

  const response = result as any
  return Response.json({
    ok: true,
    data: {
      id: response.id,
      status: response.status,
      content: response.content,
      submittedAt: response.submittedAt?.toISOString(),
    },
  })
}

export const openApi: OpenApiRouteDoc = {
  summary: 'Submit RFP response',
  methods: {
    POST: {
      summary: 'Submit or update an RFP response for a campaign',
      tags: ['Partner Portal'],
      responses: [{ status: 200, description: 'Response submitted' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
        { status: 403, description: 'No partner agency linked or blocked by mutation guard' },
        { status: 404, description: 'Campaign not found or not published' },
      ],
    },
  },
}
