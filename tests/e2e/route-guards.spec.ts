import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved, MINIMAL_GAME_DATA, seedAppState } from './helpers/startup'

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
  '/character-sheet/2014/official',
  '/character-sheet/2014/custom',
  '/character-sheet/2024',
  '/character-sheet/2024/official',
  '/character-sheet/2024/custom',
] as const

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-route-guard-seed')
})

test('Compendium source search stays above the app footer with a scrollable list', async ({
  page,
}) => {
  const sources = Array.from({ length: 60 }, (_, index) => ({
    abbreviation: `TEST${index}`,
    name: `Source ${index}`,
    group: 'supplement' as const,
  }))
  await seedAppState(page, {
    sourcePath: 'e2e-compendium-sources',
    gameData: {
      ...MINIMAL_GAME_DATA,
      sources,
      conditions: sources.map((source) => ({
        name: `Condition ${source.name}`,
        source: source.abbreviation,
      })),
    },
  })
  await page.reload()
  await page.goto('/#/compendium')
  const button = page.getByRole('button', { name: 'Sources' })
  const picker = page.getByRole('dialog', { name: 'Filter by source' })
  const search = picker.getByRole('textbox', { name: 'Search sources' })
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 900, height: 480 },
  ]) {
    await page.setViewportSize(viewport)
    await button.click()
    await expect(search).toBeFocused()
    await expect
      .poll(async () => {
        const [menu, main] = await Promise.all([
          picker.boundingBox(),
          page.locator('main').boundingBox(),
        ])
        return menu && main ? main.y + main.height - menu.y - menu.height : 0
      })
      .toBeGreaterThanOrEqual(11)
    await search.fill('test59')
    await expect(picker.getByRole('checkbox')).toHaveCount(1)
    await expect(picker.getByRole('checkbox', { name: /Source 59/ })).toBeVisible()
    await search.press('Escape')
    await expect(picker).toBeHidden()
  }
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

  await test.step('character-sheet attribution', async () => {
    await page.goto('/#/settings?section=about#character-sheet-pdf-2014-custom')
    await expect(page.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('link', { name: 'MorePurpleMoreBetter (Joost Wijnen)' }),
    ).toBeVisible()
  })
})
