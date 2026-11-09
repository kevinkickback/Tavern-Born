import { expect, test } from '@playwright/test'
import type { GameData } from '@/types/5etools'
import {
  ensureStartupPromptResolved,
  MINIMAL_GAME_DATA,
  readPersistedCharacters,
  seedAppState,
  selectCharacterFromHome,
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
  const progress = dialog.getByRole('navigation', { name: 'Character creation progress' })
  await expect(progress.locator('[aria-current=step]')).toHaveText('Rules')
  const bounds = await progress.locator('[data-slot=wizard-step-chip]').evaluateAll((chips) =>
    chips.map((chip) => {
      const { left, right } = chip.getBoundingClientRect()
      return { left, right }
    }),
  )
  expect(bounds).toHaveLength(8)
  const gaps = bounds.slice(1).map((chip, index) => chip.left - bounds[index].right)
  expect(Math.min(...gaps)).toBeGreaterThan(0)
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1)
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await expect(progress.getByRole('button', { name: 'Basics, completed' })).toBeVisible()
  await expect(progress.getByRole('button', { name: 'Sourcebooks' })).toHaveCount(0)

  const dialogBounds = await dialog.boundingBox()
  if (!dialogBounds || dialogBounds.x <= 1) throw new Error('Expected space outside the wizard')
  await page.mouse.click(dialogBounds.x / 2, 10)

  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Step 2 of 8').first()).toBeVisible()
  await progress.getByRole('button', { name: 'Basics, completed' }).click()
  await expect(progress.locator('[aria-current=step]')).toHaveText('Basics')
  await expect(dialog.getByLabel('Character Name')).toHaveValue('Retained Wizard Hero')
  await expect(dialog.getByRole('combobox', { name: 'Gender' })).toHaveText('Non-binary')

  await dialog.getByRole('button', { name: 'Close' }).click()
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

  const close = wizard.getByRole('button', { name: 'Close', exact: true })
  await close.click()
  await page.mouse.click(5, 5)
  await expect(confirmation).toBeVisible()
  await keepEditing.click()
  await expect(close).toBeFocused()
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
  await wizard.getByRole('button', { name: 'Close' }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Discard character creation?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Keep editing' }).click()
  await expect(wizard.getByLabel('Character Name')).toHaveValue('Temporary name')
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
  await wizard.getByRole('button', { name: 'Close' }).click()
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
  await wizard.getByRole('button', { name: 'Close' }).click()
  await confirmation.getByRole('button', { name: 'Discard changes' }).click()
  await newCharacter.click()
  await wizard.getByLabel('Character Name').fill('New wizard lifetime')
  await wizard.getByRole('button', { name: 'Next' }).click()
  await wizard.getByRole('button', { name: /5e Legacy/ }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()
  await expect(wizard.locator('[data-allowed-sources-count]')).toHaveText('1')
})

test('Source guidance stays visible while the full-width book list scrolls', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-character-creation', {
    ...GAME_DATA_WITH_MANY_SOURCES,
    optionalfeatures: [
      { name: 'Optional Rule: Test Feature', source: 'TEST30', isClassFeatureVariant: true },
    ],
  })

  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  await dialog.getByLabel('Character Name').fill('Warning Test')
  const modalHeight = () => dialog.evaluate((element) => element.clientHeight)
  const originalHeight = await modalHeight()
  expect(originalHeight).toBeGreaterThan(850)
  const library = dialog.getByRole('button', { name: 'Upload' }).locator('..')
  expect(
    await library.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
    ),
  ).toBe(4)
  await expect(library.getByRole('button', { name: 'Upload' })).toBeInViewport()
  const tallLibrary = await library.evaluate((element) => element.clientHeight)
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect
    .poll(async () => tallLibrary - (await library.evaluate((element) => element.clientHeight)))
    .toBeGreaterThan(150)
  await page.setViewportSize({ width: 1280, height: 1000 })
  await expect(dialog.getByRole('button', { name: 'Clear Portrait' })).toBeInViewport()
  await expect(dialog.getByText('Adjust portrait', { exact: true })).toBeVisible()
  await expect(dialog.locator('[data-slot=portrait-card-preview]')).toContainText('Level 1')
  await expect(dialog.getByText('Level 1 · Draft', { exact: true })).toHaveCount(0)
  const zoom = dialog.getByRole('slider', { name: 'Zoom' })
  await expect(zoom).toBeInViewport()
  const tones = await dialog.evaluate((modal) => {
    const background = (selector: string) => {
      const element = modal.querySelector(selector)
      if (!element) throw new Error(`Missing wizard surface: ${selector}`)
      return getComputedStyle(element).backgroundColor
    }
    return [
      getComputedStyle(modal).backgroundColor,
      background('header'),
      background('footer'),
      background('aside'),
    ]
  })
  expect(tones[0]).not.toBe(tones[1])
  expect(new Set(tones.slice(1)).size).toBe(1)
  await zoom.press('ArrowRight')
  await expect(zoom).toHaveAttribute('aria-valuenow', '155')
  await dialog.getByRole('button', { name: 'Reset View' }).click()
  await expect(zoom).toHaveAttribute('aria-valuenow', '150')
  await dialog.screenshot({ animations: 'disabled', path: info.outputPath('basics.png') })
  await dialog.getByRole('button', { name: 'Next' }).click()

  await dialog.getByRole('button', { name: /5\.5e Revised/ }).click()
  const optionalFeatures = dialog.getByRole('switch', { name: 'Allow Optional Class Features' })
  await expect(optionalFeatures).toBeDisabled()
  await expect(dialog.getByText('Unavailable with selected content')).toHaveCount(0)
  const unavailable = dialog.getByRole('group', { name: 'Allow Optional Class Features' })
  await unavailable.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Unavailable with selected content')
  await expect(dialog.getByRole('switch', { name: 'Any-Race Subclasses' })).toBeVisible()
  await expect(dialog.getByRole('switch', { name: 'Prefer Newer Printings' })).toBeDisabled()
  const averageHitPoints = dialog.getByRole('switch', { name: 'Average Hit Points' })
  await averageHitPoints.click()
  await expect(dialog.getByText('Ability Score Generation')).toHaveCount(0)
  expect(await modalHeight()).toBe(originalHeight)
  await dialog.screenshot({ animations: 'disabled', path: info.outputPath('rules.png') })
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByRole('switch')).toHaveCount(0)
  expect(await modalHeight()).toBe(originalHeight)
  const sourceScroller = dialog.getByRole('region', { name: 'Additional Content' })
  await expect(sourceScroller).toBeVisible()
  await expect
    .poll(() => sourceScroller.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true)

  await sourceScroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const listBeforeWarning = await sourceScroller.boundingBox()
  const sourceWarning = dialog.getByText(/Non-recommended sources often contain/)
  await expect(sourceWarning.locator('..')).toHaveCSS('opacity', '0')
  await dialog.getByRole('button', { name: /Test Source 30/ }).click()
  await expect(sourceWarning.locator('..')).toHaveCSS('opacity', '1')
  expect(await sourceScroller.boundingBox()).toEqual(listBeforeWarning)

  const rulesetWarning = dialog.getByText(
    /Revised replacements are always used.*Compatible older options remain available/,
  )
  await expect(sourceWarning).toBeInViewport()
  await dialog.screenshot({ animations: 'disabled', path: info.outputPath('content-warnings.png') })
  await expect(rulesetWarning).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Next' })).toBeInViewport()
  await expect
    .poll(() => sourceScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
  await dialog.getByRole('button', { name: 'Back' }).click()
  await expect(averageHitPoints).toHaveAttribute('aria-checked', 'false')
  await expect(optionalFeatures).toBeEnabled()
  await optionalFeatures.click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: 'None', exact: true }).click()
  await dialog.getByRole('button', { name: 'Back' }).click()
  await expect(optionalFeatures).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByText('Currently inactive')).toBeVisible()
  await optionalFeatures.click()
  await expect(optionalFeatures).toBeDisabled()
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
    await expect(wizard.getByRole('button', { name: 'Clear Portrait' })).toBeInViewport()
    const portraitTiles = await wizard
      .getByRole('button', { name: /Placeholder [1-4]$/ })
      .evaluateAll((tiles) =>
        tiles.map((tile) => {
          const { x, y, width, height } = tile.getBoundingClientRect()
          return { x, y, width, height }
        }),
      )
    expect(portraitTiles).toHaveLength(4)
    expect(portraitTiles[3].y).toBeGreaterThan(portraitTiles[0].y + portraitTiles[0].height)
    for (const tile of portraitTiles) {
      expect(Math.abs(tile.width / tile.height - 7 / 6)).toBeLessThan(0.025)
    }
    await wizard.screenshot({ animations: 'disabled', path: info.outputPath('basics.png') })
    if (viewport.width === 900) {
      const originalScale = await page.evaluate(() => {
        const root = document.documentElement
        const previous = root.style.fontSize
        root.style.fontSize = '120%'
        return previous
      })
      const previewControls = wizard.locator('[data-slot="portrait-image-controls"]')
      const clearPortrait = previewControls.getByRole('button', { name: 'Clear Portrait' })
      await clearPortrait.evaluate((button) => button.scrollIntoView({ block: 'center' }))
      await expect(clearPortrait).toBeInViewport({ ratio: 1 })
      await expect(previewControls.getByRole('button', { name: 'Reset View' })).toBeInViewport({
        ratio: 1,
      })
      await wizard.screenshot({
        animations: 'disabled',
        path: info.outputPath('basics-large-text.png'),
      })
      await page.evaluate((scale) => {
        document.documentElement.style.fontSize = scale
      }, originalScale)
    }
    await wizard.getByRole('button', { name: 'Next' }).click()
    await expect(wizard.getByRole('textbox', { name: 'Search sources' })).toHaveCount(0)
    const revisedSummary = wizard.getByText('Species have revised traits.', { exact: true })
    const summaryBounds = (await revisedSummary.boundingBox())!
    // Click the summary area, outside the visible bounds of the edition button.
    await page.mouse.click(
      summaryBounds.x + summaryBounds.width / 2,
      summaryBounds.y + summaryBounds.height / 2,
    )
    await expect(wizard.getByRole('button', { name: /5\.5e Revised/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await wizard.getByRole('button', { name: /5e Legacy/ }).click()
    await wizard.screenshot({ animations: 'disabled', path: info.outputPath('rules.png') })
    await wizard.getByRole('button', { name: 'Next' }).click()
    const presets = wizard.getByRole('group', { name: 'Sourcebook presets' })
    await expect(presets.getByRole('button', { name: 'None', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
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
    const selectionFilter = wizard.getByRole('combobox', { name: 'Sourcebook selection filter' })
    const title = wizard.getByRole('heading', { name: 'Choose sourcebooks', exact: true })
    await expect(title.locator('..').getByText('1 selected')).toBeVisible()
    await selectionFilter.selectOption('selected')
    await search.fill('')
    await expect(region.getByRole('button')).toHaveCount(1)
    const category = wizard.getByRole('combobox', { name: 'Sourcebook category' })
    await category.selectOption('supplement')
    await expect(wizard.getByText('No books match these filters.')).toBeVisible()
    await category.selectOption('other')
    await expect(source).toHaveAttribute('aria-pressed', 'true')
    await category.selectOption('all')
    await selectionFilter.selectOption('all')
    await search.fill('missing source')
    await expect(wizard.getByRole('status')).toHaveText('No sources match your search.')
    await expect(wizard.locator('[data-allowed-sources-count]')).toHaveText('1')
    await wizard.getByRole('button', { name: 'Back' }).click()
    await wizard.getByRole('button', { name: 'Next' }).click()
    await search.fill('source 30')
    await expect(source).toHaveAttribute('aria-pressed', 'true')
    await wizard.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(region.getByRole('button')).toHaveCount(32)
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
    gameData: {
      ...CHARACTER_CREATION_GAME_DATA,
      sources: [
        ...CHARACTER_CREATION_GAME_DATA.sources,
        {
          abbreviation: 'XGE',
          name: 'Provenance-only preset source',
          group: 'supplement',
          hasCharacterOptions: false,
        },
        {
          abbreviation: 'TCE',
          name: 'Revised-only preset source',
          group: 'supplement',
          minimumRuleset: '2024',
        },
      ],
    },
    characters: [],
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-character-create-seed')

  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  const physicalTraits = [
    { label: 'Height', placeholder: `5'10"`, value: '1.8 m' },
    { label: 'Weight', placeholder: '180 lbs', value: '73 kg' },
    { label: 'Eyes', placeholder: 'Blue', value: 'Amber' },
    { label: 'Hair', placeholder: 'Black', value: 'Silver' },
  ]

  await test.step('complete required wizard selections', async () => {
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.getByLabel('Character Name')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText('Character name is required', { exact: true })).toBeVisible()
    await dialog.getByLabel('Character Name').fill('E2E Created Hero')
    await expect(dialog.getByLabel('Age')).toHaveAttribute('placeholder', '25')
    await expect(dialog.getByLabel('Player Name')).toHaveCount(0)
    for (const { label, placeholder, value } of physicalTraits) {
      const field = dialog.getByLabel(label, { exact: true })
      await expect(field).toHaveAttribute('placeholder', placeholder)
      await expect(field).toHaveValue('')
      await field.fill(value)
    }
    await dialog.getByRole('button', { name: 'Next' }).click()

    await expect(dialog.getByRole('button', { name: /5e Legacy/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await dialog.getByRole('button', { name: 'Next' }).click()

    await expect(dialog.getByRole('heading', { name: 'Choose sourcebooks' })).toBeVisible()
    await page.evaluate(async () => {
      const modulePath = '/src/store/gameDataStore.ts'
      const { useGameDataStore } = await import(modulePath)
      const gameData = useGameDataStore.getState().gameData
      useGameDataStore.setState({
        gameData: {
          ...gameData,
          sources: [
            ...gameData.sources,
            { abbreviation: 'LATE', name: 'Late catalog addition', group: 'other' },
          ],
        },
      })
    })
    await expect(dialog.getByRole('button', { name: /Late catalog addition/ })).toBeVisible()
    await expect(dialog.locator('[data-allowed-sources-count]')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Next' }).click()
    await dialog.getByRole('button', { name: /Human\s+PHB/ }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()

    await dialog.getByRole('button', { name: /Fighter\s+PHB/ }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()

    await dialog.getByRole('button', { name: /Acolyte\s+PHB/ }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()

    await expect(dialog.getByRole('tab', { name: 'Point Buy' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Reset base scores' })).toHaveCount(0)
    await expect(dialog.getByText('27 of 27 points remaining')).toBeVisible()
    await dialog.getByRole('button', { name: 'Increase strength' }).click()
    await expect(dialog.getByText('26 of 27 points remaining')).toBeVisible()
    await dialog.getByRole('button', { name: 'Next' }).click()
  })

  await test.step('review and create', async () => {
    await expect(dialog.getByText('E2E Created Hero')).toBeVisible()
    await expect(dialog.getByText('Acolyte', { exact: true })).toBeVisible()
    await expect(dialog.getByText('5e Legacy (2014)', { exact: true })).toBeVisible()
    await expect(
      dialog.getByText(
        'No additional sourcebooks selected. Core rules for this edition are included.',
      ),
    ).toBeVisible()
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

  await selectCharacterFromHome(page, 'E2E Created Hero')
  await page.goto('/#/details/characteristics')
  for (const { label, value } of physicalTraits) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value)
  }
  await expect(page.getByPlaceholder('Player name', { exact: true })).toHaveValue('')

  await page.goto('/#/build/ability-scores')
  await expect(page.getByRole('tab', { name: 'Point Buy' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByText('26 of 27 points remaining')).toBeVisible()
  await page.getByRole('button', { name: 'Increase strength' }).click()
  await expect(page.getByText('25 of 27 points remaining')).toBeVisible()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const characters = (await readPersistedCharacters(page)) as Array<{
        name?: string
        abilityScores?: { strength?: number }
      }>
      return characters.find((character) => character.name === 'E2E Created Hero')?.abilityScores
        ?.strength
    })
    .toBe(10)
})

test('revised background bonuses update review, starting HP, and the saved character', async ({
  page,
}, info) => {
  const gameData: GameData = {
    ...CHARACTER_CREATION_GAME_DATA,
    races: [
      ...CHARACTER_CREATION_GAME_DATA.races.map((race) => ({
        ...race,
        source: 'XPHB',
        edition: 'one',
      })),
      { name: 'Aasimar', source: 'XPHB', edition: 'one', size: ['M'], speed: 30 },
    ],
    classes: [
      ...CHARACTER_CREATION_GAME_DATA.classes.map((cls) => ({
        ...cls,
        source: 'XPHB',
        edition: 'one',
      })),
      { name: 'Barbarian', source: 'XPHB', edition: 'one', hd: { faces: 12, number: 1 } },
    ],
    backgrounds: CHARACTER_CREATION_GAME_DATA.backgrounds.map((background) => ({
      ...background,
      source: 'XPHB',
      edition: 'one',
      ability: [
        { choose: { weighted: { from: ['con', 'int', 'wis'], weights: [2, 1] } } },
        { choose: { weighted: { from: ['con', 'int', 'wis'], weights: [1, 1, 1] } } },
      ],
      feats: [{ 'Magic Initiate; Cleric|XPHB': true }],
    })),
    sources: CHARACTER_CREATION_GAME_DATA.sources.map((source) => ({
      ...source,
      abbreviation: 'XPHB',
      year: 2024,
    })),
  }
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-character-desk-background', gameData)
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  const next = dialog.getByRole('button', { name: 'Next' })
  await dialog.getByLabel('Character Name').fill('Character Desk Hero')
  await next.click()
  await dialog.getByRole('button', { name: /5.5e Revised/ }).click()
  for (const title of [
    'Choose sourcebooks',
    'Choose a race',
    'Choose a class',
    'Choose a background',
  ]) {
    await next.click()
    await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible()
    if (title === 'Choose a race') {
      await expect(dialog.getByRole('button', { name: /^Aasimar\s+XPHB/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(dialog.getByText('Ability Scores', { exact: true })).toHaveCount(1)
      await dialog.getByRole('button', { name: /^Human\s+XPHB/ }).click()
    }
    if (title === 'Choose a class') {
      await expect(dialog.getByRole('button', { name: /^Barbarian\s+XPHB/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await dialog.getByRole('button', { name: /^Fighter\s+XPHB/ }).click()
    }
  }
  await expect(dialog.getByText('Magic Initiate (Cleric)', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('background.png') })
  await next.click()
  await dialog.getByRole('tab', { name: 'Standard Array' }).click()
  await dialog.getByRole('combobox', { name: 'constitution base score' }).click()
  await page.getByRole('option', { name: '13', exact: true }).click()
  await dialog.getByRole('button', { name: '+1 / +1 / +1', exact: true }).click()
  const fixedBonusSlots = dialog.getByRole('combobox', {
    name: /Background ability bonus \+1, choice/,
  })
  await expect(fixedBonusSlots).toHaveCount(3)
  await expect(fixedBonusSlots.first()).toBeDisabled()
  await expect(fixedBonusSlots.first()).toHaveText('CON')
  await next.click()
  await expect(dialog.getByText('13+1', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Back', exact: true }).click()
  await dialog.getByRole('button', { name: '+2 / +1', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Background ability bonus +2' }).click()
  await page.getByRole('option', { name: 'INT', exact: true }).click()
  await next.click()
  await expect(
    dialog.getByText('Finish choosing background bonuses or clear them to assign them later.'),
  ).toBeVisible()
  await dialog.getByRole('combobox', { name: 'Background ability bonus +1' }).click()
  await expect(page.getByRole('option', { name: 'INT', exact: true })).toHaveAttribute(
    'data-disabled',
    '',
  )
  await page.getByRole('option', { name: 'CON', exact: true }).click()
  await dialog.screenshot({ path: info.outputPath('ability-scores.png') })
  await dialog.getByRole('tab', { name: 'Custom' }).click()
  await dialog.getByRole('spinbutton', { name: 'constitution base score' }).fill('30')
  await expect(
    dialog.getByRole('heading', { name: 'constitution', exact: true }).locator('..'),
  ).toContainText('Total 30')
  await next.click()
  await expect(dialog.getByText('30+1 (capped)', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('review.png') })
  await expect(dialog.getByRole('button', { name: /^Edit\b/ })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Set ability scores' })).toBeVisible()
  await expect(dialog.getByRole('spinbutton', { name: 'constitution base score' })).toHaveValue(
    '30',
  )
  await dialog.getByRole('tab', { name: 'Standard Array' }).click()
  await dialog.getByRole('combobox', { name: 'constitution base score' }).click()
  await page.getByRole('option', { name: '13', exact: true }).click()
  await next.click()
  await expect(dialog.getByText('13+1', { exact: true })).toBeVisible()
  const reviewPortrait = dialog.locator('[data-slot=portrait-card-preview]')
  await expect(
    reviewPortrait.getByRole('img', { name: 'Character portrait card preview' }),
  ).toBeVisible()
  await expect(reviewPortrait.getByRole('button', { includeHidden: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => {
      const characters = (await readPersistedCharacters(page)) as Array<{ name?: string }>
      return characters.find((character) => character.name === 'Character Desk Hero')
    })
    .toMatchObject({
      backgroundAsiChoices: ['intelligence', 'constitution'],
      abilityScores: { constitution: 13 },
      hitPoints: { current: 12 },
      provenance: {
        abilityBonuses: expect.arrayContaining([
          expect.objectContaining({
            ability: 'constitution',
            value: 1,
            sourceTag: expect.objectContaining({ sourceName: 'Acolyte', sourceRef: 'XPHB' }),
          }),
        ]),
      },
    })
})
