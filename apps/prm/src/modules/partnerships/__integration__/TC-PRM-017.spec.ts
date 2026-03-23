import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'

/**
 * TC-PRM-017: Dashboard Widget Visibility per Role
 *
 * Verifies that the dashboard layout API returns the correct allowed widgets
 * for each persona. Uses the /api/dashboards/layout endpoint which resolves
 * DashboardRoleWidgets + feature-based filtering.
 *
 * PM dashboard: only "partnerships.dashboard.cross-org-wip"
 * Agency Admin dashboard: all 4 PRM agency widgets, no PM widget
 * Contributor dashboard: onboarding-checklist, wic-summary, tier-status
 *
 * Source: apps/prm/src/modules/partnerships/widgets/ + setup.ts
 * Phase: 2
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_EMAIL = 'partnership-manager@demo.local'
const PM_PASSWORD = 'Demo123!'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const ADMIN_PASSWORD = 'Demo123!'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const CONTRIBUTOR_PASSWORD = 'Demo123!'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LayoutResponse = {
  layout: { items: Array<{ widgetId: string }> }
  allowedWidgetIds: string[]
  widgets: Array<{ id: string; title: string }>
}

async function getDashboardLayout(
  request: Parameters<typeof getAuthToken>[0],
  token: string,
): Promise<LayoutResponse> {
  const res = await request.get('/api/dashboards/layout', {
    headers: { Authorization: `Bearer ${token}`, Cookie: `auth_token=${token}` },
  })
  expect(res.ok(), `Dashboard layout request failed: ${res.status()}`).toBeTruthy()
  return res.json()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-017: Dashboard Widget Visibility per Role', () => {
  let pmToken: string
  let adminToken: string
  let contributorToken: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, PM_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, CONTRIBUTOR_PASSWORD)
  })

  test('T1: PM sees only cross-org WIP widget', async ({ request }) => {
    const layout = await getDashboardLayout(request, pmToken)
    const allowed = layout.allowedWidgetIds

    expect(allowed).toContain('partnerships.dashboard.cross-org-wip')
    expect(allowed).not.toContain('partnerships.dashboard.onboarding-checklist')
    expect(allowed).not.toContain('partnerships.dashboard.wip-count')
    expect(allowed).not.toContain('partnerships.dashboard.wic-summary')
    expect(allowed).not.toContain('partnerships.dashboard.tier-status')
  })

  test('T2: Agency Admin sees all 4 PRM agency widgets', async ({ request }) => {
    const layout = await getDashboardLayout(request, adminToken)
    const allowed = layout.allowedWidgetIds

    expect(allowed).toContain('partnerships.dashboard.onboarding-checklist')
    expect(allowed).toContain('partnerships.dashboard.wip-count')
    expect(allowed).toContain('partnerships.dashboard.wic-summary')
    expect(allowed).toContain('partnerships.dashboard.tier-status')
    expect(allowed).not.toContain('partnerships.dashboard.cross-org-wip')
  })

  test('T3: Contributor sees onboarding, WIC, and tier widgets', async ({ request }) => {
    const layout = await getDashboardLayout(request, contributorToken)
    const allowed = layout.allowedWidgetIds

    expect(allowed).toContain('partnerships.dashboard.onboarding-checklist')
    expect(allowed).toContain('partnerships.dashboard.wic-summary')
    expect(allowed).toContain('partnerships.dashboard.tier-status')
    // Contributor does NOT have customers.* so should not see WIP
    // (wip-count widget requires partnerships.widgets.wip-count feature —
    //  contributor does not have it unless explicitly granted)
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const integrationMeta = {
  description: 'Dashboard widget visibility — PM sees cross-org only, agency roles see PRM widgets',
  dependsOnModules: ['partnerships', 'dashboards', 'auth'],
}
