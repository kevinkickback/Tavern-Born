import { expect, test } from '@playwright/test'
import type { GameData } from '@/types/5etools'
import { ensureStartupPromptResolved, MINIMAL_GAME_DATA } from './helpers/startup'

const SOURCE_GROUPS = ['core', 'supplement', 'setting', 'adventure', 'playtest', 'other']

const GAME_DATA_WITH_MANY_SOURCES: GameData = {
  ...MINIMAL_GAME_DATA,
  sources: Array.from({ length: 30 }, (_, index) => ({
    abbreviation: `TEST${index + 1}`,
    name: `Test Source ${index + 1}`,
    group: SOURCE_GROUPS[Math.floor(index / 5)],
    year: 2024,
  })),
}

test.use({ viewport: { width: 1280, height: 720 } })

test('Rules warnings remain visible while Allowed Sources scrolls', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-character-creation', GAME_DATA_WITH_MANY_SOURCES)

  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  await dialog.getByLabel('Character Name').fill('Warning Test')
  await dialog.getByRole('button', { name: 'Next' }).click()

  await dialog.getByRole('button', { name: /5\.5e Revised/ }).click()
  const sourceScroller = dialog.getByRole('region', { name: 'Allowed sources' })
  await expect(sourceScroller).toBeVisible()
  await expect
    .poll(() => sourceScroller.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true)

  await sourceScroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await dialog.getByRole('button', { name: /Test Source 30/ }).click()

  const sourceWarning = dialog.getByText(/Non-recommended sources often contain/)
  const rulesetWarning = dialog.getByText(
    /Some content exists in both Legacy|Older options are hidden when newer versions exist/,
  )
  await expect(sourceWarning).toBeInViewport()
  await expect(rulesetWarning).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Next' })).toBeInViewport()
  await expect
    .poll(() => sourceScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
})
