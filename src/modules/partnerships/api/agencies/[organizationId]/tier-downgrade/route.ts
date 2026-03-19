import type { NextRequest } from 'next/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { runMutationGuards } from '@open-mercato/shared/lib/crud/mutation-guard-registry'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'
import { PartnerAgency } from '../../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['partnerships.tiers.manage'] },
}

export async function POST(req: NextRequest, ctx: any) {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.auth?.orgId
  if (!tenantId || !organizationId) {
    throw new CrudHttpError(403, { error: 'Missing context' })
  }

  const agencyOrgId = ctx.params?.organizationId
  if (!agencyOrgId) {
    throw new CrudHttpError(400, { error: 'Missing organizationId param' })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as any

  const agency = await findOneWithDecryption(em, PartnerAgency, {
    tenantId, organizationId, agencyOrganizationId: agencyOrgId, deletedAt: null,
  } as any, undefined, { tenantId, organizationId })
  if (!agency) {
    throw new CrudHttpError(404, { error: 'Partner agency not found' })
  }

  const body = await req.json()

  // Mutation guards
  const guards = (container as any).resolve?.('mutationGuards') ?? []
  if (guards.length > 0) {
    const guardResult = await runMutationGuards(guards, {
      tenantId, organizationId, userId: ctx.auth?.userId,
      resourceKind: 'partnerships:partner_tier_assignment',
      resourceId: agency.id,
      operation: 'update',
      requestMethod: 'POST',
      requestHeaders: req.headers,
      mutationPayload: body,
    }, { userFeatures: ctx.auth?.features ?? [] })
    if (!guardResult.ok) {
      return Response.json(guardResult.errorBody, { status: guardResult.errorStatus ?? 403 })
    }
  }

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
  const { result } = await commandBus.execute('partnerships.partner_tier.downgrade', {
    input: { ...body, partnerAgencyId: agency.id },
    ctx: runtimeCtx,
  })

  return Response.json({
    ok: true,
    data: {
      id: result.id,
      tierKey: result.tierKey,
      grantedAt: result.grantedAt.toISOString(),
      validUntil: result.validUntil?.toISOString() ?? null,
      reason: result.reason ?? null,
    },
  }, { status: 201 })
}

export const openApi: OpenApiRouteDoc = {
  summary: 'Downgrade an agency tier',
  methods: {
    POST: {
      summary: 'Downgrade an agency tier',
      tags: ['Partnerships'],
      responses: [{ status: 201, description: 'Tier downgraded' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
        { status: 404, description: 'Agency or tier not found' },
      ],
    },
  },
}
