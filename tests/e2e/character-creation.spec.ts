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

test('outside clicks retain wizard input and portalled choices remain usable', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-wizard-dismissal', CHARACTER_CREATION_GAME_DATA)
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  await dialog.getByLabel('Character Name').fill('Retained Wizard Hero')

  await dialog.getByRole('combobox', { name: 'Gender' }).click()
  await page.getByRole('option', { name: 'Non-binary', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: 'Gender' })).toHaveText('Non-binary')
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByText('Step 2 of 8').first()).toBeVisible()

  const dialogBounds = await dialog.boundingBox()
  if (!dialogBounds || dialogBounds.x <= 1) throw new Error('Expected space outside the wizard')
  await page.mouse.click(dialogBounds.x / 2, 10)

  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Step 2 of 8').first()).toBeVisible()
  await dialog.getByRole('button', { name: 'Back' }).click()
  await expect(dialog.getByLabel('Character Name')).toHaveValue('Retained Wizard Hero')
  await expect(dialog.getByRole('combobox', { name: 'Gender' })).toHaveText('Non-binary')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page
    .getByRole('alertdialog', { name: 'Discard character creation?' })
    .getByRole('button', { name: 'Discard changes' })
    .click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'New Character' }).first().click()
  await expect(dialog.getByLabel('Character Name')).toHaveValue('')
  await expect(dialog.getByText('Step 1 of 8').first()).toBeVisible()
})

test('wizard exit confirmation keeps focus and input until discard is confirmed', async ({
  page,
}) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-wizard-discard', CHARACTER_CREATION_GAME_DATA)
  const newCharacter = page.getByRole('button', { name: 'New Character' }).first()
  await newCharacter.click()
  const wizard = page.getByRole('dialog', { name: 'Create New Character' })
  await wizard.getByLabel('Character Name').fill('Temporary name')
  await wizard.getByLabel('Character Name').fill('')
  await wizard.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(wizard).toBeHidden()
  await newCharacter.click()

  const gender = wizard.getByRole('combobox', { name: 'Gender' })
  await gender.click()
  await page.getByRole('option', { name: 'Non-binary', exact: true }).click()
  await gender.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(gender).toBeFocused()
  await page.keyboard.press('Escape')

  const confirmation = page.getByRole('alertdialog', { name: 'Discard character creation?' })
  const keepEditing = confirmation.getByRole('button', { name: 'Keep editing' })
  const discard = confirmation.getByRole('button', { name: 'Discard changes' })
  await expect(keepEditing).toBeFocused()
  await expect(wizard).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(discard).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(keepEditing).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeHidden()
  await expect(gender).toBeFocused()
  await expect(gender).toHaveText('Non-binary')
  await expect(wizard.getByLabel('Character Name')).toHaveValue('')

  const cancel = wizard.getByRole('button', { name: 'Cancel' })
  await cancel.click()
  await page.mouse.click(5, 5)
  await expect(confirmation).toBeVisible()
  await keepEditing.click()
  await expect(cancel).toBeFocused()
  await wizard.getByRole('button', { name: 'Close', exact: true }).click()
  await discard.click()
  await expect(wizard).toBeHidden()
  await newCharacter.click()
  await expect(gender).toHaveText('Female')
  await expect(wizard.getByLabel('Character Name')).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(wizard).toBeHidden()
  await expect(confirmation).toHaveCount(0)
})

test('reverted source choices adopt late recommended defaults without losing draft input', async ({
  page,
}) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-wizard-late-sources', {
    ...CHARACTER_CREATION_GAME_DATA,
    sources: [
      ...CHARACTER_CREATION_GAME_DATA.sources,
      { abbreviation: 'HB', name: 'Test additional content', group: 'other' },
    ],
  })
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const wizard = page.getByRole('dialog', { name: 'Create New Character' })
  await wizard.getByLabel('Character Name').fill('Temporary name')
  await wizard.getByRole('button', { name: 'Next' }).click()
  await wizard.getByRole('button', { name: /5e Legacy/ }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()
  const additionalSource = wizard.getByRole('button', { name: /Test additional content/ })
  await additionalSource.click()
  await additionalSource.click()
  await wizard.getByRole('button', { name: 'Back' }).click()
  await wizard.getByRole('button', { name: 'Back' }).click()
  await wizard.getByLabel('Character Name').fill('')
  await page.evaluate(async () => {
    const modulePath = '/src/store/gameDataStore.ts'
    const { useGameDataStore } = await import(modulePath)
    const gameData = useGameDataStore.getState().gameData
    useGameDataStore.setState({
      gameData: {
        ...gameData,
        sources: [
          ...gameData.sources,
          { abbreviation: 'XGE', name: 'Late recommended source', group: 'supplement' },
        ],
      },
    })
  })
  await wizard.getByRole('button', { name: 'Cancel' }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Discard character creation?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Keep editing' }).click()
  await wizard.getByLabel('Character Name').fill('Restored late defaults')
  await wizard.getByRole('button', { name: 'Next' }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()
  await expect(wizard.locator('[data-allowed-sources-count]')).toHaveText('1')
  await expect(wizard.getByRole('button', { name: /Late recommended source/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('empty source selection survives refresh under discard confirmation', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-wizard-empty-sources', {
    ...CHARACTER_CREATION_GAME_DATA,
    sources: [
      ...CHARACTER_CREATION_GAME_DATA.sources,
      { abbreviation: 'XGE', name: 'Recommended source', group: 'supplement' },
    ],
  })
  const newCharacter = page.getByRole('button', { name: 'New Character' }).first()
  await newCharacter.click()
  const wizard = page.getByRole('dialog', { name: 'Create New Character' })
  await wizard.getByLabel('Character Name').fill('Preserved empty sources')
  await wizard.getByRole('button', { name: 'Next' }).click()
  await wizard.getByRole('button', { name: /5e Legacy/ }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()
  await expect(wizard.locator('[data-allowed-sources-count]')).toHaveText('1')
  await wizard.getByRole('button', { name: 'None', exact: true }).click()
  await expect(wizard.locator('[data-allowed-sources-count]')).toHaveCount(0)
  await wizard.getByRole('button', { name: 'Cancel' }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Discard character creation?' })
  await expect(confirmation).toBeVisible()
  await page.evaluate(async () => {
    const modulePath = '/src/store/gameDataStore.ts'
    const { useGameDataStore } = await import(modulePath)
    const gameData = useGameDataStore.getState().gameData
    useGameDataStore.setState({
      gameData: {
        ...gameData,
        sources: [
          ...gameData.sources,
          { abbreviation: 'HB', name: 'Refresh additional content', group: 'other' },
        ],
      },
    })
  })
  await confirmation.getByRole('button', { name: 'Keep editing' }).click()
  await expect(wizard.getByRole('button', { name: /Refresh additional content/ })).toBeVisible()
  await expect(wizard.locator('[data-allowed-sources-count]')).toHaveCount(0)
  await wizard.getByRole('button', { name: 'Cancel' }).click()
  await confirmation.getByRole('button', { name: 'Discard changes' }).click()
  await newCharacter.click()
  await wizard.getByLabel('Character Name').fill('New wizard lifetime')
  await wizard.getByRole('button', { name: 'Next' }).click()
  await wizard.getByRole('button', { name: /5e Legacy/ }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()
  await expect(wizard.locator('[data-allowed-sources-count]')).toHaveText('1')
})

test('Rules warnings remain visible while Additional Content scrolls', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-character-creation', GAME_DATA_WITH_MANY_SOURCES)

  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  await dialog.getByLabel('Character Name').fill('Warning Test')
  await dialog.getByRole('button', { name: 'Next' }).click()

  await dialog.getByRole('button', { name: /5\.5e Revised/ }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  const sourceScroller = dialog.getByRole('region', { name: 'Additional Content' })
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
    /Revised replacements are always used.*Compatible older options remain available/,
  )
  await expect(sourceWarning).toBeInViewport()
  await expect(rulesetWarning).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Next' })).toBeInViewport()
  await expect
    .poll(() => sourceScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
})

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 900, height: 640 },
]) {
  test(`Content search and native scrolling retain source choices at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await ensureStartupPromptResolved(page, 'e2e-content-search', {
      ...CHARACTER_CREATION_GAME_DATA,
      sources: [...CHARACTER_CREATION_GAME_DATA.sources, ...GAME_DATA_WITH_MANY_SOURCES.sources],
    })
    await page.getByRole('button', { name: 'New Character' }).first().click()
    const wizard = page.getByRole('dialog', { name: 'Create New Character' })
    await wizard.getByLabel('Character Name').fill('Content choices')
    await wizard.getByRole('button', { name: 'Next' }).click()
    await expect(wizard.getByRole('textbox', { name: 'Search sources' })).toHaveCount(0)
    await wizard.getByRole('button', { name: /5e Legacy/ }).click()
    await wizard.getByRole('button', { name: 'Next' }).click()
    const search = wizard.getByRole('textbox', { name: 'Search sources' })
    const region = wizard.getByRole('region', { name: 'Additional Content' })
    expect(await region.evaluate((node) => node.clientHeight)).toBeGreaterThan(200)
    await region.hover()
    await page.mouse.wheel(0, 320)
    await expect.poll(() => region.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
    await region.focus()
    await region.press('Home')
    await expect.poll(() => region.evaluate((node) => node.scrollTop)).toBe(0)
    await region.press('End')
    await expect.poll(() => region.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
    await search.fill('  tEsT30 ')
    const source = region.getByRole('button', { name: /Test Source 30/ })
    await expect(region.getByRole('button')).toHaveCount(1)
    await source.click()
    await expect(source).toHaveAttribute('aria-pressed', 'true')
    await search.fill('missing source')
    await expect(wizard.getByRole('status')).toHaveText('No sources match your search.')
    await expect(wizard.locator('[data-allowed-sources-count]')).toHaveText('1')
    await wizard.getByRole('button', { name: 'Back' }).click()
    await wizard.getByRole('button', { name: 'Next' }).click()
    await search.fill('source 30')
    await expect(source).toHaveAttribute('aria-pressed', 'true')
    await wizard.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(region.getByRole('button')).toHaveCount(30)
    await expect(wizard.getByRole('button', { name: 'Next' })).toBeInViewport()
    await page.screenshot({ path: info.outputPath('content-step.png') })
    await wizard.getByRole('button', { name: 'Next' }).click()
    await expect(wizard.getByPlaceholder('Search races...')).toBeVisible()
    await wizard.getByRole('button', { name: 'Next' }).click()
    const armor = wizard.getByText('Armor Proficiencies', { exact: true }).first()
    await expect(armor).toBeVisible()
    expect(await armor.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('class-details.png') })
  })
}

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

    await expect(dialog.getByRole('heading', { name: 'Additional Content' })).toBeVisible()
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
    await expect(page).toHaveURL(/\/$/)
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
