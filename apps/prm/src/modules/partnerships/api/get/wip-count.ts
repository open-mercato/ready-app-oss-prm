import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  path: '/partnerships/wip-count',
  GET: { requireAuth: true, requireFeatures: ['partnerships.widgets.wip-count'] },
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEAL_ENTITY_ID = 'customers:customer_deal'
const WIP_FIELD_KEY = 'wip_registered_at'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export const querySchema = z.object({
  month: z
    .string()
    .regex(MONTH_REGEX, 'month must be in YYYY-MM format')
    .optional(),
})

export type WipCountQuery = z.infer<typeof querySchema>

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Parse a YYYY-MM string and return UTC boundaries for that month:
 * { start: first instant of the month, end: first instant of the next month }
 */
export function parseMonthBoundaries(month: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthStr, 10) - 1 // 0-based

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0))

  return { start, end }
}

/**
 * Format a Date to YYYY-MM (UTC).
 */
export function formatMonthUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export type WipCountContext = {
  em: EntityManager
  tenantId: string
  organizationId: string | null
}

export async function countWipDeals(
  ctx: WipCountContext,
  start: Date,
  end: Date,
): Promise<number> {
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  return ctx.em.count(CustomFieldValue, {
    entityId: DEAL_ENTITY_ID,
    fieldKey: WIP_FIELD_KEY,
    tenantId: ctx.tenantId,
    ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    deletedAt: null,
    valueText: { $gte: startIso, $lt: endIso },
  })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const rawMonth = url.searchParams.get('month') ?? undefined

    // Validate month param if provided
    const parseResult = querySchema.safeParse({ month: rawMonth })
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message ?? 'Invalid month format' },
        { status: 400 },
      )
    }

    const auth = await getAuthFromRequest(req)
    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const tenantId: string = scope?.tenantId ?? auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId ?? null

    // Resolve the month: use provided value or default to current UTC month
    const month = parseResult.data.month ?? formatMonthUtc(new Date())
    const { start, end } = parseMonthBoundaries(month)

    const em = container.resolve('em') as EntityManager
    const ctx: WipCountContext = { em, tenantId, organizationId }

    const count = await countWipDeals(ctx, start, end)

    return NextResponse.json({ count, month })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/wip-count.GET] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  count: z.number().int().nonnegative(),
  month: z.string().describe('The queried month in YYYY-MM format'),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'Get count of WIP deals for a given month',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'WIP deal count for the requested month', schema: responseSchema },
    { status: 400, description: 'Invalid month format' },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'WIP deal count',
  methods: {
    GET: getDoc,
  },
}

export default GET
