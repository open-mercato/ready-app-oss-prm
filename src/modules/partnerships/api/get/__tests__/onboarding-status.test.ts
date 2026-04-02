import {
  detectRole,
  getItemsForRole,
  type RbacService,
} from '../onboarding-status'

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

const TENANT_ID = 'tenant-001'
const ORG_ID = 'org-001'
const USER_ID = 'user-001'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('onboarding-status', () => {
  describe('detectRole', () => {
    it('returns agency_admin when user has agency-profile manage feature', async () => {
      const rbac = createMockRbacService({
        'partnerships.agency-profile.manage': true,
        'partnerships.widgets.wip-count': true,
      })
      const role = await detectRole(rbac, USER_ID, TENANT_ID, ORG_ID)
      expect(role).toBe('agency_admin')
    })

    it('returns agency_business_developer when user has wip-count but not agency-profile manage', async () => {
      const rbac = createMockRbacService({
        'partnerships.agency-profile.manage': false,
        'partnerships.widgets.wip-count': true,
      })
      const role = await detectRole(rbac, USER_ID, TENANT_ID, ORG_ID)
      expect(role).toBe('agency_business_developer')
    })

    it('returns agency_developer when user has neither agency-profile manage nor wip-count', async () => {
      const rbac = createMockRbacService({
        'partnerships.agency-profile.manage': false,
        'partnerships.widgets.wip-count': false,
      })
      const role = await detectRole(rbac, USER_ID, TENANT_ID, ORG_ID)
      expect(role).toBe('agency_developer')
    })
  })

  describe('getItemsForRole', () => {
    it('returns 4 items for agency_admin', () => {
      const items = getItemsForRole('agency_admin')
      expect(items).toHaveLength(4)
      expect(items.map((i) => i.id)).toEqual([
        'fill_profile',
        'add_case_study',
        'invite_bd',
        'invite_contributor',
      ])
      expect(items[0].label).toBe('partnerships.widgets.onboardingChecklist.fillProfile')
      expect(items[1].label).toBe('partnerships.widgets.onboardingChecklist.addCaseStudy')
      expect(items[2].label).toBe('partnerships.widgets.onboardingChecklist.inviteBd')
      expect(items[3].label).toBe('partnerships.widgets.onboardingChecklist.inviteContributor')
      expect(items[0].link).toBe('/backend/partnerships/agency-profile')
      expect(items[1].link).toBe('/backend/partnerships/case-studies')
      expect(items[2].link).toBe('/backend/partnerships/users')
      expect(items[3].link).toBe('/backend/partnerships/users')
    })

    it('returns 2 items for agency_business_developer', () => {
      const items = getItemsForRole('agency_business_developer')
      expect(items).toHaveLength(2)
      expect(items.map((i) => i.id)).toEqual(['add_prospect', 'create_deal'])
      expect(items[0].label).toBe('partnerships.widgets.onboardingChecklist.addProspect')
      expect(items[1].label).toBe('partnerships.widgets.onboardingChecklist.createDeal')
      expect(items[0].link).toBe('/backend/customers/companies')
      expect(items[1].link).toBe('/backend/customers/deals')
    })

    it('returns 1 item for agency_developer', () => {
      const items = getItemsForRole('agency_developer')
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('set_gh_username')
      expect(items[0].label).toBe('partnerships.widgets.onboardingChecklist.setGhUsername')
      expect(items[0].link).toBe('/backend/auth/profile')
    })

    it('returns empty array for null role', () => {
      const items = getItemsForRole(null)
      expect(items).toHaveLength(0)
    })
  })
})
