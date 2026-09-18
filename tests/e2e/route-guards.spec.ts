import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved } from './helpers/startup'

const CHARACTER_ROUTES = [
  '/build',
  '/build/race',
  '/build/class',
  '/build/background',
  '/build/proficiencies',
  '/build/ability-scores',
  '/build/adjustments',
  '/feats',
  '/spells',
  '/equipment',
  '/rules',
  '/details',
  '/details/portrait',
  '/details/characteristics',
  '/details/conditions',
  '/sources',
  '/character-sheet',
  '/character-sheet/2014',
  '/character-sheet/2024',
] as const

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-route-guard-seed')
})

test('every character-only route redirects to the empty library without an active character', async ({
  page,
}) => {
  for (const route of CHARACTER_ROUTES) {
    await test.step(route, async () => {
      await page.goto(`/#${route}`)
      await expect(page).toHaveURL(/\/#\/$/)
      await expect(page.getByRole('heading', { name: 'No Characters Yet' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'New Character' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Import' })).toBeVisible()
    })
  }
})

test('public settings and compendium routes remain available without a character', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await test.step('settings', async () => {
    await page.goto('/#/settings')
    await expect(page).toHaveURL(/\/#\/settings$/)
    await expect(page.getByRole('tablist', { name: 'Settings category' })).toBeVisible()

    await page.getByRole('tab', { name: 'Appearance' }).click()
    await expect(page).toHaveURL(/\/#\/settings\?section=appearance$/)
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeAttached()
    await expect(page.getByRole('radio', { name: 'Arcane' })).toBeAttached()

    await page.getByText('Light', { exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked()
    await page.getByText('Eldritch', { exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Eldritch' })).toBeChecked()
    expect(pageErrors).toEqual([])
  })

  await test.step('compendium', async () => {
    await page.goto('/#/compendium')
    await expect(page).toHaveURL(/\/#\/compendium$/)
    await expect(page.getByRole('searchbox', { name: 'Search compendium' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
  })
})
