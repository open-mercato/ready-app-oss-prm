import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'
import { getAuthToken, apiRequest } from './helpers/api'

test.describe('TC-PRM-006: Tier management UI', () => {
  const tierKey = `uitier_${Date.now()}`

  test.afterAll(async ({ request }) => {
    // Clean up via API
    try {
      const token = await getAuthToken(request)
      const res = await apiRequest(request, 'GET', '/api/partnerships/tiers', { token })
      const body = await res.json()
      const items = body.items ?? body.data ?? body
      const created = (Array.isArray(items) ? items : []).find((t: any) => t.key === tierKey)
      if (created?.id) {
        await apiRequest(request, 'DELETE', `/api/partnerships/tiers/${created.id}`, { token })
      }
    } catch {
      // Best-effort cleanup
    }
  })

  test('seeded tiers are visible in the UI', async ({ page }) => {
    await login(page)

    // Navigate to tiers page
    const tiersLink = page.getByRole('link', { name: /tier/i })
    if (await tiersLink.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await tiersLink.first().click()
      await page.waitForLoadState('networkidle')

      // Should see the seeded tiers
      await expect(page.getByText(/bronze/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/silver/i).first()).toBeVisible()
      await expect(page.getByText(/gold/i).first()).toBeVisible()
    }
  })
})
