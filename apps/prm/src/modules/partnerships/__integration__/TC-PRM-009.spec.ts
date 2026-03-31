import { test, expect, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenContext } from '@open-mercato/core/helpers/integration/generalFixtures'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * TC-PRM-009: WIC Import Page UI
 *
 * Page: /backend/partnerships/my-wic/import
 * Auth: requireFeatures: ['partnerships.wic.import'] (PM only)
 *
 * Tests:
 * T1 — PM sees import form with agency select, month picker, file upload
 * T2 — PM can upload valid JSON file and sees success message
 * T3 — PM uploads file with unmatched GH username and sees error
 * T4 — Non-PM user (contributor) cannot access WIC import page
 *
 * Source: apps/prm/src/modules/partnerships/backend/partnerships/my-wic/import/page.tsx
 * Phase: 2, WF3 WIC
 */

const PM_EMAIL = 'partnership-manager@demo.local'
const ADMIN_EMAIL = 'acme-admin@demo.local'
const CONTRIBUTOR_EMAIL = 'acme-contributor@demo.local'
const DEMO_PASSWORD = 'Demo123!'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
const GH_USERNAME = 'carol-acme'

async function loginInBrowser(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'auth_token', value: token, url: BASE }])
}

/** Write JSON to a temp file and return its path. Caller should clean up. */
function writeTempJson(data: unknown): string {
  const filePath = path.join(os.tmpdir(), `wic-import-test-${Date.now()}.json`)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  return filePath
}

test.describe('TC-PRM-009: WIC Import Page UI', () => {
  let pmToken: string
  let adminToken: string
  let contributorToken: string
  let acmeOrgId: string

  test.beforeAll(async ({ request }) => {
    pmToken = await getAuthToken(request, PM_EMAIL, DEMO_PASSWORD)
    adminToken = await getAuthToken(request, ADMIN_EMAIL, DEMO_PASSWORD)
    contributorToken = await getAuthToken(request, CONTRIBUTOR_EMAIL, DEMO_PASSWORD)
    acmeOrgId = getTokenContext(adminToken).organizationId
  })

  test('T1: PM sees import form with agency select, month picker, file upload', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic/import`)

    // Agency select
    await expect(page.locator('#wic-org')).toBeVisible({ timeout: 15_000 })
    const options = await page.locator('#wic-org option').count()
    expect(options, 'Agency select should have at least 1 option').toBeGreaterThanOrEqual(1)

    // Month picker
    await expect(page.locator('#wic-month')).toBeVisible()

    // File upload area (drop zone)
    await expect(page.locator('#wic-json-file')).toBeAttached()

    // Import button
    await expect(page.locator('button:has-text("Import")')).toBeVisible()
  })

  test('T2: PM uploads valid JSON file and sees success message', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic/import`)
    await expect(page.locator('#wic-org')).toBeVisible({ timeout: 15_000 })

    // Select Acme Digital — carol-acme belongs to this org
    await page.locator('#wic-org').selectOption({ label: 'Acme Digital' })

    const month = '2098-01'
    await page.locator('#wic-month').fill(month)

    const filePath = writeTempJson([{
      contributorGithubUsername: GH_USERNAME,
      month,
      wicScore: 1.0,
      level: 'L2',
      impactBonus: 0.25,
      bountyBonus: 0.0,
      whyBonus: '',
      included: 'TC-PRM-009 test import',
      excluded: 'None',
      scriptVersion: '1.0-agent',
    }])

    try {
      await page.locator('#wic-json-file').setInputFiles(filePath)
      await page.locator('button:has-text("Import")').click()

      // Success message should appear
      await expect(page.locator('text=/Imported \\d+ record/i')).toBeVisible({ timeout: 10_000 })
    } finally {
      fs.unlinkSync(filePath)
    }
  })

  test('T3: PM uploads file with unmatched GH username and sees error', async ({ page }) => {
    await loginInBrowser(page, pmToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic/import`)
    await expect(page.locator('#wic-org')).toBeVisible({ timeout: 15_000 })

    const month = '2098-02'
    await page.locator('#wic-month').fill(month)

    const filePath = writeTempJson([{
      contributorGithubUsername: `nonexistent-user-${Date.now()}`,
      month,
      wicScore: 0.5,
      level: 'L1',
      impactBonus: 0.0,
      bountyBonus: 0.0,
      whyBonus: '',
      included: 'Test',
      excluded: 'None',
      scriptVersion: '1.0-agent',
    }])

    try {
      await page.locator('#wic-json-file').setInputFiles(filePath)
      await page.locator('button:has-text("Import")').click()

      // Error about unmatched username
      await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 10_000 })
    } finally {
      fs.unlinkSync(filePath)
    }
  })

  test('T4: Contributor cannot access WIC import page', async ({ page }) => {
    // Contributor lacks partnerships.wic.manage — page redirects or hides form
    await loginInBrowser(page, contributorToken)
    await page.goto(`${BASE}/backend/partnerships/my-wic/import`)
    await page.waitForTimeout(3_000)

    const formCount = await page.locator('#wic-json-file').count().catch(() => 0)
    expect(formCount > 0, 'Contributor should not see WIC import form').toBe(false)
  })
})

export const integrationMeta = {
  description: 'WIC Import page UI — form elements, valid file upload, unmatched username error, RBAC block',
  dependsOnModules: ['partnerships', 'entities', 'auth'],
}
