import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomerEntity, CustomerDeal } from '@open-mercato/core/modules/customers/data/entities'
import { CustomFieldValue, CustomEntityStorage } from '@open-mercato/core/modules/entities/data/entities'
import { Role, User, UserRole } from '@open-mercato/core/modules/auth/data/entities'
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
  completed: boolean
  link: string
}

export type OnboardingStatusResponse = {
  role: 'partner_admin' | 'partner_member' | 'partner_contributor'
  items: OnboardingChecklistItem[]
  allCompleted: boolean
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

export type DetectedRole = 'partner_admin' | 'partner_member' | 'partner_contributor' | null

export async function detectRole(
  rbacService: RbacService,
  userId: string,
  tenantId: string,
  organizationId: string | null,
): Promise<DetectedRole> {
  const scope = { tenantId, organizationId }

  const hasManage = await rbacService.userHasAllFeatures(userId, ['partnerships.manage'], scope)
  if (hasManage) {
    // partnership_manager also has partnerships.manage but does NOT have onboarding-checklist feature
    // The metadata guard already ensures the user has partnerships.widgets.onboarding-checklist,
    // so if they also have partnerships.manage, they are partner_admin (not partnership_manager).
    return 'partner_admin'
  }

  const hasWipCount = await rbacService.userHasAllFeatures(userId, ['partnerships.widgets.wip-count'], scope)
  if (hasWipCount) {
    return 'partner_member'
  }

  // Contributor has only partnerships.widgets.onboarding-checklist (no wip-count, no manage)
  return 'partner_contributor'
}

// ---------------------------------------------------------------------------
// Completion checks
// ---------------------------------------------------------------------------

export type CompletionContext = {
  em: EntityManager
  tenantId: string
  organizationId: string | null
}

export async function checkProfileFilled(ctx: CompletionContext): Promise<boolean> {
  const cfvCount = await ctx.em.count(CustomFieldValue, {
    entityId: 'directory:organization',
    tenantId: ctx.tenantId,
    ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    fieldKey: { $in: ['services', 'industries'] },
    valueText: { $nin: [null, ''] },
  })
  return cfvCount > 0
}

export async function checkCaseStudyExists(ctx: CompletionContext): Promise<boolean> {
  const count = await ctx.em.count(CustomEntityStorage, {
    entityType: 'partnerships:case_study',
    tenantId: ctx.tenantId,
    ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    deletedAt: null,
  })
  return count > 0
}

async function countUsersWithRoleInOrg(
  em: EntityManager,
  roleName: string,
  tenantId: string,
  organizationId: string | null,
): Promise<number> {
  const role = await em.findOne(Role, { name: roleName, tenantId, deletedAt: null })
  if (!role) return 0
  const filters: Record<string, unknown> = { role, deletedAt: null }
  if (organizationId) {
    filters.user = { organizationId, deletedAt: null }
  }
  return em.count(UserRole, filters)
}

export async function checkBdInvited(ctx: CompletionContext): Promise<boolean> {
  const count = await countUsersWithRoleInOrg(ctx.em, 'partner_member', ctx.tenantId, ctx.organizationId)
  return count > 0
}

export async function checkContributorInvited(ctx: CompletionContext): Promise<boolean> {
  const count = await countUsersWithRoleInOrg(ctx.em, 'partner_contributor', ctx.tenantId, ctx.organizationId)
  return count > 0
}

export async function checkGhUsernameFilled(ctx: CompletionContext, userId: string): Promise<boolean> {
  const cfvCount = await ctx.em.count(CustomFieldValue, {
    entityId: 'auth:user',
    tenantId: ctx.tenantId,
    fieldKey: 'github_username',
    recordId: userId,
    valueText: { $nin: [null, ''] },
  })
  return cfvCount > 0
}

export async function checkProspectAdded(ctx: CompletionContext): Promise<boolean> {
  const count = await ctx.em.count(CustomerEntity, {
    kind: 'company',
    tenantId: ctx.tenantId,
    ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    deletedAt: null,
  })
  return count > 0
}

export async function checkDealCreated(ctx: CompletionContext): Promise<boolean> {
  const count = await ctx.em.count(CustomerDeal, {
    tenantId: ctx.tenantId,
    ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    deletedAt: null,
  })
  return count > 0
}

// ---------------------------------------------------------------------------
// Item builders
// ---------------------------------------------------------------------------

export async function buildAdminItems(ctx: CompletionContext): Promise<OnboardingChecklistItem[]> {
  const [profileFilled, caseStudyExists, bdInvited, contributorInvited] = await Promise.all([
    checkProfileFilled(ctx),
    checkCaseStudyExists(ctx),
    checkBdInvited(ctx),
    checkContributorInvited(ctx),
  ])

  const profileLink = ctx.organizationId
    ? `/backend/directory/organizations/${ctx.organizationId}/edit`
    : '/backend/directory/organizations'

  return [
    {
      id: 'fill_profile',
      label: 'partnerships.widgets.onboardingChecklist.fillProfile',
      completed: profileFilled,
      link: profileLink,
    },
    {
      id: 'add_case_study',
      label: 'partnerships.widgets.onboardingChecklist.addCaseStudy',
      completed: caseStudyExists,
      link: '/backend/partnerships/case-studies',
    },
    {
      id: 'invite_bd',
      label: 'partnerships.widgets.onboardingChecklist.inviteBd',
      completed: bdInvited,
      link: '/backend/auth/users',
    },
    {
      id: 'invite_contributor',
      label: 'partnerships.widgets.onboardingChecklist.inviteContributor',
      completed: contributorInvited,
      link: '/backend/auth/users',
    },
  ]
}

export async function buildBdItems(ctx: CompletionContext): Promise<OnboardingChecklistItem[]> {
  const [prospectAdded, dealCreated] = await Promise.all([
    checkProspectAdded(ctx),
    checkDealCreated(ctx),
  ])

  return [
    {
      id: 'add_prospect',
      label: 'partnerships.widgets.onboardingChecklist.addProspect',
      completed: prospectAdded,
      link: '/backend/customers/companies',
    },
    {
      id: 'create_deal',
      label: 'partnerships.widgets.onboardingChecklist.createDeal',
      completed: dealCreated,
      link: '/backend/customers/deals',
    },
  ]
}

export async function buildContributorItems(ctx: CompletionContext, userId: string): Promise<OnboardingChecklistItem[]> {
  const ghFilled = await checkGhUsernameFilled(ctx, userId)

  return [
    {
      id: 'set_gh_username',
      label: 'partnerships.widgets.onboardingChecklist.setGhUsername',
      completed: ghFilled,
      link: '/backend/auth/users/profile',
    },
  ]
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

    const rbacService = container.resolve('rbacService') as RbacService
    const userId = auth.sub
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = await detectRole(rbacService, userId, tenantId, organizationId)
    if (!role) {
      return NextResponse.json({ role: null, items: [], allCompleted: false })
    }

    const em = container.resolve('em') as EntityManager
    const ctx: CompletionContext = { em, tenantId, organizationId }

    let items: OnboardingChecklistItem[]
    if (role === 'partner_admin') {
      items = await buildAdminItems(ctx)
    } else if (role === 'partner_member') {
      items = await buildBdItems(ctx)
    } else {
      items = await buildContributorItems(ctx, userId)
    }

    const allCompleted = items.length > 0 && items.every((item) => item.completed)

    const response: OnboardingStatusResponse = { role, items, allCompleted }
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
  completed: z.boolean(),
  link: z.string(),
})

const responseSchema = z.object({
  role: z.enum(['partner_admin', 'partner_member', 'partner_contributor']).nullable(),
  items: z.array(onboardingItemSchema),
  allCompleted: z.boolean(),
})

const getDoc: OpenApiMethodDoc = {
  summary: 'Get onboarding checklist status for current user',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Onboarding checklist status', schema: responseSchema },
    { status: 401, description: 'Unauthorized' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Onboarding checklist status',
  methods: {
    GET: getDoc,
  },
}

export default GET
