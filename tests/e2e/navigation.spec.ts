import { expect, test } from '@playwright/test'
import { seedAppState } from './helpers/startup'

test('startup data source modal supports remote/local setup flow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Choose Game Data' }).first()).toBeVisible()
  await seedAppState(page, {
    sourcePath: 'srd/core',
    dataSourceConfig: {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    },
  })
  await page.evaluate(() => localStorage.removeItem('tb:bundled-srd-intro:v1'))
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Welcome to Tavern Born' })).toBeVisible()
  await expect(page.getByText(/SRD content for both 2014 and 2024 characters/)).toBeVisible()

  await page.getByRole('button', { name: 'Add Additional Content' }).click()
  await expect(page.getByRole('heading', { name: 'Add Additional Content' })).toBeVisible()
  await expect(page.getByRole('link', { name: '5etools community wiki' })).toBeVisible()
  await expect(
    page.getByText(
      'Enter a web address or select a folder containing 5etools-compatible JSON files.',
    ),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Tavern Born' })).toBeVisible()
  await page.getByRole('button', { name: 'Add Additional Content' }).click()

  await expect(page.getByRole('tab', { name: 'Online' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'This Computer' })).toBeVisible()

  await page.getByRole('tab', { name: 'This Computer' }).click()
  await expect(page.getByRole('button', { name: 'Select Folder' })).toBeVisible()

  await page.getByRole('tab', { name: 'Online' }).click()
  await expect(page.getByLabel('Web Address')).toBeVisible()
  await page
    .getByLabel('Web Address')
    .fill('https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master')
  await expect(page.getByLabel('Web Address')).toHaveValue(
    'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master',
  )
})
