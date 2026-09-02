import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/electron-smoke',
  testMatch: '**/*.ts',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
})
