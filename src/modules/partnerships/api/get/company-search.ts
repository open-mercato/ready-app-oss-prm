import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomerEntity, CustomerDealCompanyLink } from '@open-mercato/core/modules/customers/data/entities'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'

export const metadata = {
  path: '/partnerships/company-search',
  GET: { requireAuth: true, requireFeatures: ['partnerships.agencies.manage'] },
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const querySchema = z.object({
  q: z.string().min(2, 'Search term must be at least 2 characters'),
})

export type CompanySearchQuery = z.infer<typeof querySchema>

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

export type CompanySearchItem = {
  companyId: string
  companyName: string
  organizationId: string
  agencyName: string
  createdAt: string
  dealCount: number
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export async function searchCompanies(
  em: EntityManager,
  tenantId: string,
  q: string,
): Promise<CompanySearchItem[]> {
  const likePattern = `%${escapeLikePattern(q)}%`

  // Cross-org query: no organizationId filter — PM has Program Scope
  const companies = await em.find(
    CustomerEntity,
    {
      tenantId,
      kind: 'company',
      displayName: { $ilike: likePattern },
      deletedAt: null,
    },
    { orderBy: { displayName: 'asc' }, limit: 50 },
  )

  if (companies.length === 0) {
    return []
  }

  // Collect unique org IDs and count deals per company in parallel
  const orgIds = [...new Set(companies.map((c) => c.organizationId))]

  const [orgs, dealLinks] = await Promise.all([
    em.find(Organization, { id: { $in: orgIds } }),
    em.find(
      CustomerDealCompanyLink,
      { company: { $in: companies.map((c) => c.id) } },
      { populate: ['company'] },
    ),
  ])

  const orgMap = new Map(orgs.map((o) => [o.id, o.name]))

  // Count deals per company id
  const dealCountMap = new Map<string, number>()
  for (const link of dealLinks) {
    const companyId: string = link.company.id
    dealCountMap.set(companyId, (dealCountMap.get(companyId) ?? 0) + 1)
  }

  return companies.map((c) => ({
    companyId: c.id,
    companyName: c.displayName,
    organizationId: c.organizationId,
    agencyName: orgMap.get(c.organizationId) ?? c.organizationId,
    createdAt: c.createdAt.toISOString(),
    dealCount: dealCountMap.get(c.id) ?? 0,
  }))
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const rawQ = url.searchParams.get('q') ?? ''

    const parseResult = querySchema.safeParse({ q: rawQ })
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message ?? 'Invalid search term' },
        { status: 400 },
      )
    }

    const auth = await getAuthFromRequest(req)
    if (!auth?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager

    const results = await searchCompanies(em, auth.tenantId, parseResult.data.q)

    return NextResponse.json({ results })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/company-search.GET] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const companySearchItemSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  organizationId: z.string().uuid(),
  agencyName: z.string(),
  createdAt: z.string(),
  dealCount: z.number().int().nonnegative(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'Cross-org company search for license deal attribution',
  tags: ['Partnerships'],
  responses: [
    {
      status: 200,
      description: 'Matching companies (filtered by selected organization on the client)',
      schema: z.object({ results: z.array(companySearchItemSchema) }),
    },
    { status: 400, description: 'Search term too short (min 2 chars)' },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Cross-org company search',
  methods: {
    GET: getDoc,
  },
}

export default GET
