import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'src/modules/partnerships/__integration__',
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  timeout: 20_000,
  expect: {
    timeout: 20_000,
  },
  retries: 1,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    headless: !process.env.HEADED,
    trace: 'on-first-retry',
  },
  reporter: [['list'], ['html', { outputFolder: 'test-results' }]],
})
