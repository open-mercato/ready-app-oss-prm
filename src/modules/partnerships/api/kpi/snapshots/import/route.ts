import type { NextRequest } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { runMutationGuards } from '@open-mercato/shared/lib/crud/mutation-guard-registry'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi/types'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['partnerships.kpi.manage'] },
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
  // Mutation guards
  const guards = (container as any).resolve?.('mutationGuards') ?? []
  if (guards.length > 0) {
    const guardResult = await runMutationGuards(guards, {
      tenantId: ctx.auth?.tenantId, organizationId: effectiveOrgId, userId: ctx.auth?.userId,
      resourceKind: 'partnerships:partner_metric_snapshot',
      resourceId: 'new',
      operation: 'create',
      requestMethod: 'POST',
      requestHeaders: req.headers,
      mutationPayload: body,
    }, { userFeatures: ctx.auth?.features ?? [] })
    if (!guardResult.ok) {
      return Response.json(guardResult.errorBody, { status: guardResult.errorStatus ?? 403 })
    }
  }

  // Support batch { snapshots: [...] } or single snapshot
  const snapshots = Array.isArray(body.snapshots) ? body.snapshots : [body]
  const results = []
  for (const snapshot of snapshots) {
    const { result } = await commandBus.execute('partnerships.partner_metric.ingest', { input: snapshot, ctx: runtimeCtx })
    results.push({ id: (result as any).id, metricKey: (result as any).metricKey })
  }
  return Response.json({ ok: true, data: { imported: results.length, items: results } }, { status: 201 })
}

export const openApi: OpenApiRouteDoc = {
  summary: 'Import KPI snapshots',
  methods: {
    POST: {
      summary: 'Import KPI snapshot (interactive)',
      tags: ['Partnerships'],
      responses: [{ status: 201, description: 'Snapshots imported' }],
      errors: [
        { status: 401, description: 'Not authenticated' },
        { status: 403, description: 'Blocked by mutation guard' },
      ],
    },
  },
}
