import { expect, test } from '@playwright/test'
import type { GameData } from '@/types/5etools'
import {
  ensureStartupPromptResolved,
  MINIMAL_GAME_DATA,
  readPersistedCharacters,
  seedAppState,
} from './helpers/startup'

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

const CHARACTER_CREATION_GAME_DATA: GameData = {
  ...MINIMAL_GAME_DATA,
  races: [
    {
      name: 'Human',
      source: 'PHB',
      size: ['M'],
      speed: 30,
      ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }],
      entries: ['Humans are adaptable and ambitious.'],
    },
  ],
  classes: [
    {
      name: 'Fighter',
      source: 'PHB',
      hd: { faces: 10, number: 1 },
      proficiency: ['str', 'con'],
      startingProficiencies: {
        armor: ['light armor', 'medium armor', 'heavy armor', 'shields'],
        weapons: ['simple weapons', 'martial weapons'],
        skills: [],
      },
      classFeatures: [],
      classFeatureRefs: [],
    },
  ],
  backgrounds: [
    {
      name: 'Acolyte',
      source: 'PHB',
      entries: ['You spent your life in service to a temple.'],
    },
  ],
  sources: [{ abbreviation: 'PHB', name: "Player's Handbook", group: 'core', year: 2014 }],
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

test('creates a complete character and persists it across a full reload', async ({ page }) => {
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-character-create-seed',
    gameData: CHARACTER_CREATION_GAME_DATA,
    characters: [],
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-character-create-seed')

  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })

  await test.step('complete required wizard selections', async () => {
    await dialog.getByLabel('Character Name').fill('E2E Created Hero')
    await dialog.getByRole('button', { name: 'Next' }).click()

    await dialog.getByRole('button', { name: /5e Legacy/ }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()

    await dialog.getByRole('button', { name: /Human\s+PHB/ }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()

    await dialog.getByRole('button', { name: /Fighter\s+PHB/ }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()

    await dialog.getByRole('button', { name: /Acolyte\s+PHB/ }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()

    await expect(dialog.getByText('0 / 27')).toBeVisible()
    await dialog.getByRole('button', { name: 'Next' }).click()
  })

  await test.step('review and create', async () => {
    await expect(dialog.getByText('E2E Created Hero')).toBeVisible()
    await expect(dialog.getByText('Acolyte', { exact: true })).toBeVisible()
    await expect(dialog.getByText('5e Legacy (2014)', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog).toBeHidden()
  })

  await expect(page.getByText('E2E Created Hero').first()).toBeVisible()
  await expect
    .poll(async () => {
      const characters = (await readPersistedCharacters(page)) as Array<{ name?: string }>
      return characters.some((character) => character.name === 'E2E Created Hero')
    })
    .toBe(true)

  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-character-create-seed')
  await expect(page.getByText('E2E Created Hero').first()).toBeVisible()
})
