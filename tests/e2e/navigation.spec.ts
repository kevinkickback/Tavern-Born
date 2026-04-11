import { expect, test } from '@playwright/test'

test('startup data source modal supports remote/local setup flow', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Welcome to Tavern Born' })).toBeVisible()

  await expect(page.getByRole('tab', { name: 'Remote URL' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Local Directory' })).toBeVisible()

  await page.getByRole('tab', { name: 'Local Directory' }).click()
  await expect(page.getByRole('button', { name: 'Select Folder' })).toBeVisible()

  await page.getByRole('tab', { name: 'Remote URL' }).click()
  await expect(page.getByLabel('Repository URL')).toBeVisible()
  await page
    .getByLabel('Repository URL')
    .fill('https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master')
  await expect(page.getByLabel('Repository URL')).toHaveValue(
    'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master',
  )
})
