import type { NextRequest } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'

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
  // Support batch { snapshots: [...] } or single snapshot
  const snapshots = Array.isArray(body.snapshots) ? body.snapshots : [body]
  const results = []
  for (const snapshot of snapshots) {
    const { result } = await commandBus.execute('partnerships.partner_metric.ingest', { input: snapshot, ctx: runtimeCtx })
    results.push({ id: (result as any).id, metricKey: (result as any).metricKey })
  }
  return Response.json({ ok: true, data: { imported: results.length, items: results } }, { status: 201 })
}

export const openApi = {
  '/api/partnerships/kpi/snapshots/import': {
    post: { summary: 'Import KPI snapshot (interactive)', tags: ['Partnerships'] },
  },
}
