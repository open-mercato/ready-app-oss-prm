import {
  detectRole,
  buildAdminItems,
  buildBdItems,
  type RbacService,
  type CompletionContext,
} from './onboarding-status'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRbacService(featureMap: Record<string, boolean>): RbacService {
  return {
    async userHasAllFeatures(
      _userId: string,
      required: string[],
      _scope: { tenantId: string | null; organizationId: string | null },
    ): Promise<boolean> {
      return required.every((feature) => featureMap[feature] === true)
    },
  }
}

type CountCall = { entity: unknown; filter: Record<string, unknown> }
type FindOneCall = { entity: unknown; filter: Record<string, unknown> }

function createMockEm(options: {
  countResults?: Record<string, number>
  findOneResults?: Record<string, unknown>
} = {}) {
  const countCalls: CountCall[] = []
  const findOneCalls: FindOneCall[] = []
  const { countResults = {}, findOneResults = {} } = options

  return {
    countCalls,
    findOneCalls,
    em: {
      count(entity: unknown, filter: Record<string, unknown>) {
        countCalls.push({ entity, filter })
        // Match by entity class name or a key pattern
        const entityName = typeof entity === 'function' ? entity.name : String(entity)
        const result = countResults[entityName]
        return Promise.resolve(result ?? 0)
      },
      findOne(entity: unknown, filter: Record<string, unknown>) {
        findOneCalls.push({ entity, filter })
        const entityName = typeof entity === 'function' ? entity.name : String(entity)
        const result = findOneResults[entityName]
        return Promise.resolve(result ?? null)
      },
    } as unknown as CompletionContext['em'],
  }
}

const TENANT_ID = 'tenant-001'
const ORG_ID = 'org-001'
const USER_ID = 'user-001'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('onboarding-status', () => {
  describe('detectRole', () => {
    it('returns partner_admin when user has partnerships.manage feature', async () => {
      const rbac = createMockRbacService({
        'partnerships.manage': true,
        'partnerships.widgets.wip-count': true,
      })
      const role = await detectRole(rbac, USER_ID, TENANT_ID, ORG_ID)
      expect(role).toBe('partner_admin')
    })

    it('returns partner_member when user has wip-count but not manage', async () => {
      const rbac = createMockRbacService({
        'partnerships.manage': false,
        'partnerships.widgets.wip-count': true,
      })
      const role = await detectRole(rbac, USER_ID, TENANT_ID, ORG_ID)
      expect(role).toBe('partner_member')
    })

    it('returns partner_contributor when user has neither manage nor wip-count', async () => {
      const rbac = createMockRbacService({
        'partnerships.manage': false,
        'partnerships.widgets.wip-count': false,
      })
      const role = await detectRole(rbac, USER_ID, TENANT_ID, ORG_ID)
      expect(role).toBe('partner_contributor')
    })
  })

  describe('buildAdminItems', () => {
    it('returns 4 items, all uncompleted in a fresh org', async () => {
      const { em } = createMockEm()
      // All counts return 0, all findOne return null (fresh org)
      const ctx: CompletionContext = { em, tenantId: TENANT_ID, organizationId: ORG_ID }

      const items = await buildAdminItems(ctx)

      expect(items).toHaveLength(4)
      expect(items.map((i) => i.id)).toEqual([
        'fill_profile',
        'add_case_study',
        'invite_bd',
        'invite_contributor',
      ])
      expect(items.every((i) => i.completed === false)).toBe(true)
      // Verify i18n keys
      expect(items[0].label).toBe('partnerships.widgets.onboardingChecklist.fillProfile')
      expect(items[1].label).toBe('partnerships.widgets.onboardingChecklist.addCaseStudy')
      expect(items[2].label).toBe('partnerships.widgets.onboardingChecklist.inviteBd')
      expect(items[3].label).toBe('partnerships.widgets.onboardingChecklist.inviteContributor')
      // Verify links
      expect(items[0].link).toBe('/backend/directory/organizations/org-001/edit')
      expect(items[1].link).toBe('/backend/partnerships')
      expect(items[2].link).toBe('/backend/auth/users')
      expect(items[3].link).toBe('/backend/auth/users')
    })

    it('marks fill_profile as completed when custom fields are populated', async () => {
      const { em } = createMockEm()

      // Override count to be context-aware (called in parallel for all 4 checks)
      let countCallIndex = 0
      const countResponses = [
        1, // checkProfileFilled: services/industries CustomFieldValue exists
        0, // checkCaseStudyExists: no CustomEntityStorage records
        0, // checkBdInvited: UserRole count
        0, // checkContributorInvited: UserRole count
      ]
      em.count = ((_entity: unknown, _filter: Record<string, unknown>) => {
        const result = countResponses[countCallIndex] ?? 0
        countCallIndex++
        return Promise.resolve(result)
      }) as typeof em.count

      em.findOne = ((_entity: unknown, _filter: Record<string, unknown>) => {
        return Promise.resolve(null) // No roles found
      }) as typeof em.findOne

      const ctx: CompletionContext = { em, tenantId: TENANT_ID, organizationId: ORG_ID }
      const items = await buildAdminItems(ctx)

      expect(items[0].id).toBe('fill_profile')
      expect(items[0].completed).toBe(true)
      expect(items[1].completed).toBe(false)
      expect(items[2].completed).toBe(false)
      expect(items[3].completed).toBe(false)
    })
  })

  describe('buildBdItems', () => {
    it('returns 2 items for partner_member role', async () => {
      const { em } = createMockEm({
        countResults: {
          CustomerEntity: 0,
          CustomerDeal: 0,
        },
      })
      const ctx: CompletionContext = { em, tenantId: TENANT_ID, organizationId: ORG_ID }

      const items = await buildBdItems(ctx)

      expect(items).toHaveLength(2)
      expect(items.map((i) => i.id)).toEqual(['add_prospect', 'create_deal'])
      expect(items.every((i) => i.completed === false)).toBe(true)
      expect(items[0].label).toBe('partnerships.widgets.onboardingChecklist.addProspect')
      expect(items[1].label).toBe('partnerships.widgets.onboardingChecklist.createDeal')
    })
  })

  describe('allCompleted logic', () => {
    it('returns allCompleted=true when all admin items pass their checks', async () => {
      const { em } = createMockEm()

      let countCallIndex = 0
      // For admin items, calls are:
      // 1. checkProfileFilled (CustomFieldValue count for services/industries)
      // 2. checkCaseStudyExists (CustomEntityStorage count for case_study)
      // 3. checkBdInvited (UserRole count after findOne Role)
      // 4. checkContributorInvited (UserRole count after findOne Role)
      const countResponses = [1, 1, 1, 1]
      em.count = ((_entity: unknown, _filter: Record<string, unknown>) => {
        const result = countResponses[countCallIndex] ?? 0
        countCallIndex++
        return Promise.resolve(result)
      }) as typeof em.count

      let findOneCallIndex = 0
      const findOneResponses = [
        { id: 'role-bd', name: 'partner_member' },
        { id: 'role-contrib', name: 'partner_contributor' },
      ]
      em.findOne = ((_entity: unknown, _filter: Record<string, unknown>) => {
        const result = findOneResponses[findOneCallIndex] ?? null
        findOneCallIndex++
        return Promise.resolve(result)
      }) as typeof em.findOne

      const ctx: CompletionContext = { em, tenantId: TENANT_ID, organizationId: ORG_ID }
      const items = await buildAdminItems(ctx)

      expect(items.every((i) => i.completed)).toBe(true)
      const allCompleted = items.length > 0 && items.every((i) => i.completed)
      expect(allCompleted).toBe(true)
    })
  })

  describe('partner_contributor (fallback)', () => {
    it('returns partner_contributor when user has neither manage nor wip-count', async () => {
      // Contributor has only onboarding-checklist feature (no manage, no wip-count).
      // detectRole falls through to partner_contributor as the default.
      const rbac = createMockRbacService({
        'partnerships.manage': false,
        'partnerships.widgets.wip-count': false,
      })
      const role = await detectRole(rbac, USER_ID, TENANT_ID, ORG_ID)
      expect(role).toBe('partner_contributor')
    })
  })
})
