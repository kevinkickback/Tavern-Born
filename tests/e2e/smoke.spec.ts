import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved } from './helpers/startup'

test('home page renders expected shell', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page)

  await expect(page.locator('body')).toContainText('Tavern Born')
  await expect(page.getByRole('button', { name: 'Characters' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
})
