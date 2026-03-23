import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { User, UserRole, Role } from '@open-mercato/core/modules/auth/data/entities'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'
import { CustomerDeal } from '@open-mercato/core/modules/customers/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { WIP_REGISTERED_AT_FIELD } from '../../data/custom-fields'

export const metadata = {
  path: '/partnerships/agencies',
  GET: { requireAuth: true, requireFeatures: ['partnerships.manage'] },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgencyListItem = {
  organizationId: string
  name: string
  adminEmail: string | null
  wipCount: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const em = container.resolve('em') as EntityManager
  const tenantId = auth.tenantId

  // Get the PM's own org (to exclude from agency list)
  const pmOrgId = auth.orgId

  // Find all organizations in tenant (excluding PM's own org)
  const allOrgs = await em.find(Organization, {
    tenant: tenantId,
    isActive: true,
    deletedAt: null,
  })

  const agencyOrgs = allOrgs.filter((o) => o.id !== pmOrgId)

  // Get current month for WIP count
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)).toISOString()

  const partnerAdminRole = await em.findOne(Role, { name: 'partner_admin', tenantId, deletedAt: null })
  const agencies: AgencyListItem[] = []

  for (const org of agencyOrgs) {
    // Find admin user for this specific org
    let adminEmail: string | null = null
    if (partnerAdminRole) {
      const orgUsers = await em.find(User, {
        organizationId: org.id,
        tenantId,
        deletedAt: null,
      })
      for (const user of orgUsers) {
        const hasAdminRole = await em.findOne(UserRole, {
          user: user.id as any,
          role: partnerAdminRole.id as any,
          deletedAt: null,
        })
        if (hasAdminRole) {
          adminEmail = user.email
          break
        }
      }
    }

    // Count WIP deals for this org in current month
    const wipValues = await em.find(CustomFieldValue, {
      entityId: 'customers:customer_deal',
      fieldKey: WIP_REGISTERED_AT_FIELD.key,
      organizationId: org.id,
      tenantId,
      valueText: { $gte: monthStart, $lte: monthEnd },
    })

    agencies.push({
      organizationId: org.id,
      name: org.name,
      adminEmail,
      wipCount: wipValues.length,
      createdAt: org.createdAt.toISOString(),
    })
  }

  return NextResponse.json({ agencies })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const agencySchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  adminEmail: z.string().nullable(),
  wipCount: z.number(),
  createdAt: z.string(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'List all partner agencies with WIP counts',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Agency list', schema: z.object({ agencies: z.array(agencySchema) }) },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Partner agencies',
  methods: { GET: getDoc },
}

export default GET
