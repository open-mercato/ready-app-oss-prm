import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { Role, UserRole } from '@open-mercato/core/modules/auth/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  path: '/partnerships/onboarding-status',
  GET: { requireAuth: true, requireFeatures: ['partnerships.widgets.onboarding-checklist'] },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnboardingChecklistItem = {
  id: string
  label: string
  link: string
}

export type OnboardingStatusResponse = {
  role: 'agency_admin' | 'agency_business_developer' | 'agency_developer'
  items: OnboardingChecklistItem[]
}

// ---------------------------------------------------------------------------
// Role detection
// ---------------------------------------------------------------------------

export type RbacService = {
  userHasAllFeatures(
    userId: string,
    required: string[],
    scope: { tenantId: string | null; organizationId: string | null },
  ): Promise<boolean>
}

export type DetectedRole = 'agency_admin' | 'agency_business_developer' | 'agency_developer' | null

export async function detectRole(
  rbacService: RbacService,
  userId: string,
  tenantId: string,
  organizationId: string | null,
): Promise<DetectedRole> {
  const scope = { tenantId, organizationId }

  const canManageAgencyProfile = await rbacService.userHasAllFeatures(userId, ['partnerships.agency-profile.manage'], scope)
  if (canManageAgencyProfile) {
    return 'agency_admin'
  }

  const hasWipCount = await rbacService.userHasAllFeatures(userId, ['partnerships.widgets.wip-count'], scope)
  if (hasWipCount) {
    return 'agency_business_developer'
  }

  return 'agency_developer'
}

async function detectRoleByAssignment(
  em: EntityManager,
  userId: string,
  tenantId: string,
  organizationId: string | null,
): Promise<DetectedRole> {
  const userFilter = organizationId
    ? { id: userId, organizationId, deletedAt: null }
    : { id: userId, deletedAt: null }

  const hasAdminRole = await em.findOne(UserRole, {
    user: userFilter,
    role: { name: 'agency_admin', tenantId, deletedAt: null },
    deletedAt: null,
  })
  if (hasAdminRole) return 'agency_admin'

  const hasMemberRole = await em.findOne(UserRole, {
    user: userFilter,
    role: { name: 'agency_business_developer', tenantId, deletedAt: null },
    deletedAt: null,
  })
  if (hasMemberRole) return 'agency_business_developer'

  const hasContributorRole = await em.findOne(UserRole, {
    user: userFilter,
    role: { name: 'agency_developer', tenantId, deletedAt: null },
    deletedAt: null,
  })
  if (hasContributorRole) return 'agency_developer'

  return null
}

// ---------------------------------------------------------------------------
// Static item definitions per role
// ---------------------------------------------------------------------------

const ADMIN_ITEMS: OnboardingChecklistItem[] = [
  {
    id: 'fill_profile',
    label: 'partnerships.widgets.onboardingChecklist.fillProfile',
    link: '/backend/partnerships/agency-profile',
  },
  {
    id: 'add_case_study',
    label: 'partnerships.widgets.onboardingChecklist.addCaseStudy',
    link: '/backend/partnerships/case-studies',
  },
  {
    id: 'invite_bd',
    label: 'partnerships.widgets.onboardingChecklist.inviteBd',
    link: '/backend/partnerships/users',
  },
  {
    id: 'invite_contributor',
    label: 'partnerships.widgets.onboardingChecklist.inviteContributor',
    link: '/backend/partnerships/users',
  },
]

const BD_ITEMS: OnboardingChecklistItem[] = [
  {
    id: 'add_prospect',
    label: 'partnerships.widgets.onboardingChecklist.addProspect',
    link: '/backend/customers/companies',
  },
  {
    id: 'create_deal',
    label: 'partnerships.widgets.onboardingChecklist.createDeal',
    link: '/backend/customers/deals',
  },
]

const CONTRIBUTOR_ITEMS: OnboardingChecklistItem[] = [
  {
    id: 'set_gh_username',
    label: 'partnerships.widgets.onboardingChecklist.setGhUsername',
    link: '/backend/auth/profile',
  },
]

export function getItemsForRole(role: DetectedRole): OnboardingChecklistItem[] {
  switch (role) {
    case 'agency_admin': return ADMIN_ITEMS
    case 'agency_business_developer': return BD_ITEMS
    case 'agency_developer': return CONTRIBUTOR_ITEMS
    default: return []
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function GET(req: Request) {
  try {
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)
    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const tenantId: string = scope?.tenantId ?? auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId ?? null

    const userId = auth.sub
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const em = container.resolve('em') as EntityManager
    const rbacService = container.resolve('rbacService') as RbacService

    const role =
      await detectRoleByAssignment(em, userId, tenantId, organizationId)
      ?? await detectRole(rbacService, userId, tenantId, organizationId)
    if (!role) {
      return NextResponse.json({ role: null, items: [] })
    }

    const items = getItemsForRole(role)
    const response: OnboardingStatusResponse = { role, items }
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[partnerships/onboarding-status.GET] Unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const onboardingItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  link: z.string(),
})

const responseSchema = z.object({
  role: z.enum(['agency_admin', 'agency_business_developer', 'agency_developer']).nullable(),
  items: z.array(onboardingItemSchema),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'Get onboarding checklist items for current user',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Onboarding checklist items', schema: responseSchema },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Onboarding checklist items',
  methods: {
    GET: getDoc,
  },
}

export default GET
