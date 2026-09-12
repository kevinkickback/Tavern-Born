import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved } from './helpers/startup'

const CHARACTER_ROUTES = [
  '/build',
  '/build/race',
  '/build/class',
  '/build/background',
  '/build/proficiencies',
  '/build/ability-scores',
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
  await test.step('settings', async () => {
    await page.goto('/#/settings')
    await expect(page).toHaveURL(/\/#\/settings$/)
    await expect(page.getByRole('tablist', { name: 'Settings category' })).toBeVisible()
  })

  await test.step('compendium', async () => {
    await page.goto('/#/compendium')
    await expect(page).toHaveURL(/\/#\/compendium$/)
    await expect(page.getByRole('searchbox', { name: 'Search compendium' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
  })
})
