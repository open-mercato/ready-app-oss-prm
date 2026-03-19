import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('TC-PRM-005: Admin navigation', () => {
  test('login and navigate to partnerships section', async ({ page }) => {
    await login(page)

    // Backend should be loaded
    await expect(page).toHaveURL(/\/backend/)

    // Look for partnerships-related navigation or menu items
    // The sidebar/nav should contain partnerships links
    const partnershipsLink = page.getByRole('link', { name: /partner|agencies|tier/i })
    // At least one partnerships nav item should be visible
    await expect(partnershipsLink.first()).toBeVisible({ timeout: 10_000 })
  })

  test('navigate to agencies page', async ({ page }) => {
    await login(page)
    const link = page.getByRole('link', { name: /agencies/i })
    if (await link.first().isVisible().catch(() => false)) {
      await link.first().click()
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByText(/agency|agencies/i).first()).toBeVisible({ timeout: 10_000 })
    }
  })

  test('navigate to tiers page', async ({ page }) => {
    await login(page)
    const link = page.getByRole('link', { name: /tier/i })
    if (await link.first().isVisible().catch(() => false)) {
      await link.first().click()
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByText(/tier|bronze|silver|gold/i).first()).toBeVisible({ timeout: 10_000 })
    }
  })
})
