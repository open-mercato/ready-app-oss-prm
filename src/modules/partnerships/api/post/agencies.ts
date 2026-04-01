import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { User, Role, RoleAcl, UserRole, UserAcl } from '@open-mercato/core/modules/auth/data/entities'
import { hashForLookup } from '@open-mercato/shared/lib/encryption/aes'
import { hash } from 'bcryptjs'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { seedAgencyDemoData } from '../../lib/seed-agency-demo'
import { TierAssignment } from '../../data/entities'

export const metadata = {
  path: '/partnerships/agencies',
  POST: { requireAuth: true, requireFeatures: ['partnerships.agencies.manage'] },
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

import { TIER_THRESHOLDS } from '../../data/tier-thresholds'
const TIER_NAMES = TIER_THRESHOLDS.map((t) => t.tier) as [string, ...string[]]

const createAgencySchema = z.object({
  agencyName: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  seedDemoData: z.boolean().default(true),
  initialTier: z.enum(TIER_NAMES).default('OM Agency'),
})

// ---------------------------------------------------------------------------
// Password generation
// ---------------------------------------------------------------------------

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password + '!1'
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function POST(req: Request) {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = createAgencySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { agencyName, adminEmail, seedDemoData, initialTier } = parsed.data
  const tenantId = auth.tenantId
  const em = container.resolve('em') as EntityManager

  // Check email uniqueness
  const emailHash = hashForLookup(adminEmail)
  const existingUser = await em.findOne(User, { emailHash, deletedAt: null })
  if (existingUser) {
    return NextResponse.json(
      { error: 'A user with this email already exists' },
      { status: 409 }
    )
  }

  // Atomic creation: org + admin user + UserAcl
  const orgSlug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')
  const existingOrg = await em.findOne(Organization, { tenant: tenantId, slug: orgSlug })
  if (existingOrg) {
    return NextResponse.json(
      { error: 'An organization with this name already exists' },
      { status: 409 }
    )
  }

  const org = em.create(Organization, {
    tenant: tenantId,
    name: agencyName,
    slug: orgSlug,
    isActive: true,
    depth: 0,
    ancestorIds: [],
    childIds: [],
    descendantIds: [],
    parentId: null,
    rootId: null,
    treePath: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  em.persist(org)
  await em.flush()

  const password = generatePassword()
  const passwordHash = await hash(password, 10)

  const user = em.create(User, {
    email: adminEmail,
    emailHash,
    passwordHash,
    name: `${agencyName} Admin`,
    isConfirmed: true,
    organizationId: org.id,
    tenantId,
    createdAt: new Date(),
  })
  em.persist(user)

  const role = await em.findOne(Role, { name: 'partner_admin', tenantId, deletedAt: null })
  if (role) {
    em.persist(em.create(UserRole, { user, role, createdAt: new Date() }))

    const roleAcl = await em.findOne(RoleAcl, { role, tenantId })
    em.persist(em.create(UserAcl, {
      user,
      tenantId,
      organizationsJson: [org.id],
      featuresJson: roleAcl?.featuresJson ?? [],
      isSuperAdmin: false,
      createdAt: new Date(),
    }))
  }

  await em.flush()

  // Create initial tier assignment
  const tierAssignment = em.create(TierAssignment, {
    organizationId: org.id,
    tier: initialTier,
    effectiveDate: new Date(),
    approvedBy: auth.sub,
    reason: 'Initial onboarding',
    tenantId,
  })
  em.persist(tierAssignment)
  await em.flush()

  // Emit AgencyCreated event
  try {
    const eventBus = container.resolve('eventBus') as { emitEvent: (id: string, payload: Record<string, unknown>) => Promise<void> }
    await eventBus.emitEvent('partnerships.agency.created', {
      organizationId: org.id,
      adminUserId: user.id,
      createdBy: auth.sub,
      demoDataSeeded: seedDemoData,
      createdAt: new Date().toISOString(),
    })
  } catch {
    // Event emission is non-critical
  }

  if (seedDemoData) {
    try {
      await seedAgencyDemoData(em, { tenantId, organizationId: org.id })
    } catch (err) {
      console.warn(`[partnerships/agencies.POST] Demo data seeding failed for ${agencyName}`, err)
    }
  }

  const inviteMessage = [
    `Your agency account has been created on Open Mercato PRM.`,
    `Organization: ${agencyName}`,
    `Login: ${adminEmail}`,
    `Password: ${password}`,
    `URL: ${req.headers.get('origin') || ''}/login`,
    `Please change your password after first login.`,
  ].join('\n')

  return NextResponse.json({
    organizationId: org.id,
    adminUserId: user.id,
    agencyName,
    adminEmail,
    inviteMessage,
    demoDataSeeded: seedDemoData,
  }, { status: 201 })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const postDoc: OpenApiMethodDoc = {
  summary: 'Create a new partner agency (organization + admin user)',
  tags: ['Partnerships'],
  requestBody: {
    schema: createAgencySchema,
  },
  responses: [
    { status: 201, description: 'Agency created' },
    { status: 409, description: 'Email or org name already exists' },
    { status: 422, description: 'Validation error' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Partner agencies',
  methods: { POST: postDoc },
}

export default POST
