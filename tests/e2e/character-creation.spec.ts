import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { parseBackgrounds, parseFeats } from '@/lib/5etools/parsers/basic'
import { parseRaces } from '@/lib/5etools/parsers/races'
import type { GameData, Race5e } from '@/types/5etools'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
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
  backgrounds: parseBackgrounds([
    {
      name: 'Acolyte',
      source: 'PHB',
      entries: ['You spent your life in service to a temple.'],
      languageProficiencies: [{ anyStandard: 2 }],
    },
  ]) as GameData['backgrounds'],
  languages: [{ name: 'Elvish', source: 'PHB', type: 'standard' }],
  sources: [{ abbreviation: 'PHB', name: "Player's Handbook", group: 'core', year: 2014 }],
}

test.use({ viewport: { width: 1280, height: 720 } })

test('centers the Included SRD message in the Sourcebooks body', async ({ page }) => {
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'srd/core',
    gameData: CHARACTER_CREATION_GAME_DATA,
    dataSourceConfig: {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    },
  })
  await page.evaluate(() => localStorage.setItem('tb:bundled-srd-intro:v1', '1'))
  await page.reload()
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const wizard = page.getByRole('dialog', { name: 'Create New Character' })
  await wizard.getByLabel('Character Name').fill('SRD Explorer')
  await wizard.getByRole('button', { name: 'Next' }).click()
  await wizard.getByRole('button', { name: /5e Legacy/ }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()

  const message = wizard.getByText('Using the included SRD', { exact: true })
  await expect(message).toBeVisible()
  for (const height of [720, 440]) {
    await page.setViewportSize({ width: 1280, height })
    const { top, bottom } = await wizard.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return { top: bounds.top, bottom: bounds.bottom }
    })
    expect(top).toBeGreaterThanOrEqual(40)
    expect(bottom).toBeLessThanOrEqual(height - 16)
    const { offset, space } = await message.evaluate((element) => {
      const content = element.parentElement!.getBoundingClientRect()
      const body = element.parentElement!.parentElement!.getBoundingClientRect()
      return {
        offset: Math.abs(content.top + content.height / 2 - body.top - body.height / 2),
        space: body.height - content.height,
      }
    })
    expect(space).toBeGreaterThan(20)
    expect(offset).toBeLessThan(2)
    await expect(wizard.getByRole('button', { name: 'Next' })).toBeInViewport()
  }
})

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
  const preview = dialog.getByRole('region', { name: 'Portrait card preview' })
  await expect(preview).toContainText('Level 1')
  await expect(preview.getByText('5e (2014)', { exact: true })).toHaveCSS('opacity', '1')
  await expect(preview.getByText('Last modified: Unsaved')).toBeVisible()
  const previewActions = preview.locator('[data-slot="character-card-actions"]')
  await expect(previewActions).toHaveCSS('opacity', '1')
  await expect(previewActions.locator('button')).toHaveCount(3)
  await expect(preview.getByRole('button')).toHaveCount(0)
  const libraryHeader = dialog.getByRole('heading', { name: 'Portrait Library' }).locator('..')
  const libraryRule = await libraryHeader.evaluate((header) => {
    const line = getComputedStyle(header, '::after')
    return {
      width: Number.parseFloat(line.width),
      ruleColor: line.backgroundColor,
      paneColor: getComputedStyle(header.parentElement!).backgroundColor,
    }
  })
  expect(libraryRule.width).toBeGreaterThan(16)
  expect(libraryRule.ruleColor).not.toBe(libraryRule.paneColor)
  expect(libraryRule.paneColor).not.toBe('rgba(0, 0, 0, 0)')
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
  const sourceWarning = dialog.getByText(/Books outside the presets can include/)
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

test('creates a complete character and persists it across a full reload', async ({
  page,
}, info) => {
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-character-create-seed',
    gameData: {
      ...CHARACTER_CREATION_GAME_DATA,
      classes: CHARACTER_CREATION_GAME_DATA.classes.map((cls) => ({
        ...cls,
        startingProficiencies: {
          ...cls.startingProficiencies,
          skills: [{ choose: { from: ['history', 'perception'], count: 1 } }],
        },
      })),
      languages: [
        ...CHARACTER_CREATION_GAME_DATA.languages,
        { name: 'Halfling', source: 'PHB', type: 'standard' },
      ],
      backgrounds: CHARACTER_CREATION_GAME_DATA.backgrounds.map((background) => ({
        ...background,
        skillProficiencies: [{ history: true }],
        startingEquipment: [{ a: [{ value: 500 }], b: [{ value: 1000 }] }],
      })),
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
    await expect(dialog.getByRole('tablist', { name: 'Race details' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Next' }).click()

    await dialog.getByRole('button', { name: /Fighter\s+PHB/ }).click()
    const next = dialog.getByRole('button', { name: 'Next' })
    const classTab = dialog
      .getByRole('tablist', { name: 'Class details' })
      .getByRole('tab', { name: 'Choices' })
    await expect(next).toBeDisabled()
    await next.press('Enter')
    await expect(classTab).toBeFocused()
    await expect(classTab).toHaveAccessibleDescription(/Complete the class choices/)
    await classTab.press('Enter')
    await page.screenshot({ path: info.outputPath('creator-class-choices.png') })
    const classSkill = dialog.getByRole('combobox', { name: /^Skills · Fighter/ })
    await next.press('Enter')
    await expect(classSkill).toBeFocused()
    await classSkill.click()
    await page.getByRole('option', { name: 'History', exact: true }).click()
    await expect(dialog.getByText('Complete', { exact: true })).toBeVisible()
    await expect(classTab).toHaveAccessibleDescription('Class choices are ready.')
    await expect(next).toBeEnabled()
    await next.click()

    await dialog.getByRole('button', { name: /Acolyte\s+PHB/ }).click()
    const backgroundTab = dialog
      .getByRole('tablist', { name: 'Background details' })
      .getByRole('tab', { name: 'Choices' })
    await expect(next).toBeDisabled()
    await next.press('Enter')
    await expect(backgroundTab).toBeFocused()
    await backgroundTab.press('Enter')
    const languages = dialog.getByRole('combobox', { name: /^Languages · Acolyte/ })
    await next.press('Enter')
    await expect(languages).toBeFocused()
    await languages.click()
    await page.getByRole('option', { name: 'Elvish', exact: true }).click()
    await expect(next).toBeDisabled()
    await languages.click()
    await page.getByRole('option', { name: 'Halfling', exact: true }).click()
    const packageGroup = dialog.getByRole('group', {
      name: 'Background starting equipment choice 1 configuration',
    })
    await expect(packageGroup.getByRole('tab', { name: 'Package A' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(packageGroup.getByText('5 gp', { exact: true })).toBeVisible()
    await expect(packageGroup.getByRole('button', { name: /^Use package/ })).toHaveCount(0)
    await expect(packageGroup.getByText('Complete', { exact: true })).toBeVisible()
    await expect(next).toBeEnabled()
    const packageTabs = packageGroup.getByRole('tablist')
    await page.setViewportSize({ width: 900, height: 640 })
    await packageGroup.scrollIntoViewIfNeeded()
    const [groupBounds, tabBounds] = await Promise.all([
      packageGroup.boundingBox(),
      packageTabs.boundingBox(),
    ])
    expect(
      groupBounds && tabBounds
        ? groupBounds.x + groupBounds.width - tabBounds.x - tabBounds.width
        : Infinity,
    ).toBeLessThan(20)
    await page.screenshot({ path: info.outputPath('creator-background-choices.png') })
    await page.setViewportSize({ width: 1280, height: 720 })
    await packageGroup.getByRole('tab', { name: 'Package A' }).press('ArrowRight')
    await expect(packageGroup.getByRole('tab', { name: 'Package A' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await packageGroup.getByRole('tab', { name: 'Package B' }).press('Enter')
    await expect(packageGroup.getByText('10 gp', { exact: true })).toBeVisible()
    await expect(packageGroup.getByText('Complete', { exact: true })).toBeVisible()
    await expect(next).toBeEnabled()
    expect(await readPersistedCharacters(page)).toHaveLength(0)
    await next.click()
    await expect(dialog.getByRole('heading', { name: 'Choose a class' })).toBeVisible()
    const revisitedClassTab = dialog.getByRole('tab', { name: 'Choices', exact: true })
    await expect(next).toBeDisabled()
    await revisitedClassTab.click()
    await next.press('Enter')
    const overlappingSkill = dialog.getByRole('button', { name: /^Remove History/ })
    await expect(overlappingSkill).toBeFocused()
    await overlappingSkill.click()
    await dialog.getByRole('combobox', { name: /^Skills · Fighter/ }).click()
    await page.getByRole('option', { name: 'Perception', exact: true }).click()
    await next.click()
    await next.click()

    await expect(dialog.getByRole('tab', { name: 'Point Buy' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Reset base scores' })).toHaveCount(0)
    await expect(dialog.getByText('27 of 27 points remaining')).toBeVisible()
    await dialog.getByRole('button', { name: 'Increase strength' }).click()
    await expect(dialog.getByText('26 of 27 points remaining')).toBeVisible()
    await dialog.getByRole('button', { name: 'Next' }).click()
  })

  await test.step('review and create', async () => {
    await expect(dialog.getByRole('heading', { name: 'Review your character' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Choices,/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Background, completed' }).click()
    await dialog.getByRole('tab', { name: 'Choices', exact: true }).click()
    await expect(
      dialog.getByRole('button', { name: /^Remove Elvish from Languages · Acolyte/ }),
    ).toBeVisible()
    await expect(dialog.getByRole('tab', { name: 'Package B', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await dialog.getByRole('button', { name: 'Next' }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()
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
      const characters = (await readPersistedCharacters(page)) as Array<{
        name?: string
        proficiencies?: { languages: string[]; skills: string[] }
        backgroundEquipmentChoices?: string[]
        currency?: { gp: number }
      }>
      const created = characters.find((character) => character.name === 'E2E Created Hero')
      return {
        languages: created?.proficiencies?.languages.map((language) => language.toLowerCase()),
        skills: created?.proficiencies?.skills,
        backgroundEquipmentChoices: created?.backgroundEquipmentChoices,
        gold: created?.currency?.gp,
      }
    })
    .toMatchObject({
      languages: expect.arrayContaining(['elvish', 'halfling']),
      skills: expect.arrayContaining(['history', 'perception']),
      backgroundEquipmentChoices: ['b'],
      gold: 10,
    })

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

test('edits race options in the responsive Race step and saves the latest draft', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/')
  const trailborn = {
    name: 'Trailborn',
    source: 'PHB',
    size: ['S', 'M'],
    speed: 30,
    ability: [{ con: 1, choose: { from: ['str', 'dex'], amount: 1, count: 1 } }],
    languageProficiencies: [
      { common: true },
      { choose: { from: ['dwarvish', 'elvish'], count: 1 } },
    ],
    skillProficiencies: [{ perception: true }],
    additionalSpells: [
      {
        known: { 1: { _: [{ choose: 'level=0|class=Wizard' }] } },
        ability: { choose: ['int', 'cha'] },
      },
    ],
    resist: ['cold'],
    entries: ['Trailborn travel the foothills.'],
  }
  await seedAppState(page, {
    sourcePath: 'e2e-creator-race-choices',
    gameData: {
      ...CHARACTER_CREATION_GAME_DATA,
      races: parseRaces({ race: [trailborn, { ...trailborn, name: 'Woodborn' }] }) as Race5e[],
      spells: [
        makeSpellFixture({
          name: 'Light',
          source: 'PHB',
          level: 0,
          classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
        }),
      ],
      languages: [
        ...CHARACTER_CREATION_GAME_DATA.languages,
        { name: 'Gnomish', source: 'PHB', type: 'standard' },
        { name: 'Halfling', source: 'PHB', type: 'standard' },
      ],
    },
    characters: [],
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-creator-race-choices')
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  const next = dialog.getByRole('button', { name: 'Next', exact: true })
  const choose = async (label: string | RegExp, option: string) => {
    await dialog.getByRole('combobox', { name: label }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  await dialog.getByLabel('Character Name').fill('Trailborn Hero')
  for (const title of ['Choose rules', 'Choose sourcebooks', 'Choose a race']) {
    await next.click()
    if (title !== 'Choose rules')
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible()
  }
  const descriptionTab = dialog.getByRole('tab', { name: 'Description', exact: true })
  const choicesTab = dialog.getByRole('tab', { name: 'Choices', exact: true })
  const description = dialog.getByRole('tabpanel', { name: 'Description' })
  const choices = dialog.getByRole('region', { name: 'Race choices' })
  await expect(next).toBeDisabled()
  await next.press('Enter')
  await expect(choicesTab).toBeFocused()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(choicesTab).toHaveAttribute('aria-selected', 'false')
  await expect(dialog.getByRole('heading', { name: 'Choose a race' })).toBeVisible()
  await choicesTab.press('Enter')
  await expect(choicesTab).toBeFocused()
  await expect(next).toBeDisabled()
  await dialog.getByRole('button', { name: /Woodborn\s+PHB/ }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const flashFrames = await next.evaluate((button) => {
    ;(button as HTMLButtonElement).click()
    const cue = button.ownerDocument.activeElement
      ?.getAnimations()
      .find((animation) => animation.id === 'race-choice-flash')
    return (cue?.effect as KeyframeEffect | null)?.getKeyframes() ?? []
  })
  expect(flashFrames).not.toHaveLength(0)
  expect(flashFrames.every((frame) => !frame.transform)).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(choicesTab).toBeFocused()
  await dialog.getByRole('button', { name: /Trailborn\s+PHB/ }).click()
  await expect(descriptionTab).toHaveAttribute('aria-selected', 'true')
  await expect(description.getByText(/^CON \+1 · Choose 1 ability/)).toBeVisible()
  await expect(description.getByText(/^Common,/)).toBeVisible()
  await expect(description.getByText('Perception', { exact: true })).toBeVisible()
  await expect(description.getByText('Cold', { exact: true })).toBeVisible()
  await expect(description.getByText('Size', { exact: true })).toBeVisible()
  await expect(description.getByRole('combobox')).toHaveCount(0)
  await expect(choices).toHaveCount(0)
  const raceCard = description.locator('xpath=../..')
  await expect(raceCard.locator('footer')).toContainText('PHB')
  await expect(raceCard.getByRole('tablist', { name: 'Race details' })).toBeVisible()
  const descriptionHeight = (await description.boundingBox())!.height
  await descriptionTab.press('ArrowRight')
  await expect(choicesTab).toBeFocused()
  await choicesTab.press('Enter')
  await expect(choicesTab).toHaveAttribute('aria-selected', 'true')
  await expect(description).toHaveCount(0)
  const choicesHeight = (await dialog.getByRole('tabpanel', { name: 'Choices' }).boundingBox())!
    .height
  expect(choicesHeight).toBeCloseTo(descriptionHeight, 0)
  await choose('Racial size', 'Medium')
  await next.press('Enter')
  await expect(dialog.getByRole('combobox', { name: /^Racial ability bonus/ })).toBeFocused()
  await expect(next).toBeDisabled()
  await expect(choicesTab).toHaveAccessibleDescription(/Complete the race choices/)
  await choose(/^Racial ability bonus/, 'DEX')
  await expect(next).toBeDisabled()
  await choose(/^Languages · Trailborn/, 'Elvish')
  await expect(next).toBeDisabled()
  const castingAbility = choices.getByRole('combobox', { name: /Trailborn casting ability/ })
  await next.press('Enter')
  await expect(castingAbility).toBeFocused()
  await choose(/Trailborn casting ability/, 'Intelligence')
  const abilityPill = choices.getByRole('button', {
    name: /^Remove Intelligence as Trailborn casting ability/,
  })
  await expect(abilityPill).toBeVisible()
  await expect(castingAbility).toHaveCount(0)
  await expect(next).toBeDisabled()
  const spellButton = choices.getByRole('button', { name: /(?:Choose|Edit) .*spell choice 1/ })
  const picker = page.getByRole('dialog', { name: 'Choose racial cantrips' })
  const chooseLight = async () => {
    await spellButton.click()
    await picker
      .getByRole('button')
      .filter({ has: page.getByText('Light', { exact: true }) })
      .click()
    await picker.getByRole('button', { name: 'Confirm', exact: true }).click()
  }
  await chooseLight()
  const spellPill = choices.getByRole('button', { name: 'Remove Light from Trailborn cantrips' })
  await expect(spellPill).toBeVisible()
  await expect(spellButton).toHaveCount(0)
  await expect(spellPill).toHaveAccessibleDescription('Source PHB')
  await expect(
    spellPill.locator('xpath=ancestor::section[1]').getByText('Complete', { exact: true }),
  ).toBeVisible()
  await spellPill.click()
  await expect(spellPill).toHaveCount(0)
  await expect(abilityPill).toBeVisible()
  await expect(next).toBeDisabled()
  await chooseLight()
  await abilityPill.click()
  await expect(castingAbility).toBeVisible()
  await expect(spellPill).toBeVisible()
  await expect(next).toBeDisabled()
  await choose(/Trailborn casting ability/, 'Intelligence')
  await expect(next).toBeEnabled()
  await expect(choicesTab).toHaveAccessibleDescription('Race choices are ready.')
  await page.screenshot({ path: info.outputPath('race-choices-tall.png') })

  await page.setViewportSize({ width: 900, height: 640 })
  await descriptionTab.click()
  await expect(description).toBeVisible()
  await choicesTab.click()
  await expect(choices.getByRole('button', { name: /^Remove Elvish/ })).toBeVisible()
  await expect(choices.getByRole('button', { name: 'Remove Medium as racial size' })).toBeVisible()
  await choices.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('race-choices-compact.png') })
  await next.click()
  await expect(dialog.getByRole('heading', { name: 'Choose a class' })).toBeVisible()
  await next.click()
  await dialog.getByRole('tab', { name: 'Choices', exact: true }).click()
  await expect(dialog.getByText('Languages · Trailborn (PHB)', { exact: true })).toHaveCount(0)
  await choose(/^Languages · Acolyte/, 'Halfling')
  await choose(/^Languages · Acolyte/, 'Gnomish')
  await next.click()
  await next.click()
  await expect(dialog.getByText('Medium', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Race, completed' }).click()
  await choicesTab.click()
  await choices.getByRole('button', { name: /^Remove Elvish/ }).click()
  await expect(next).toBeDisabled()
  await dialog.getByRole('combobox', { name: /^Languages · Trailborn/ }).click()
  await expect(page.getByRole('option', { name: 'Elvish', exact: true })).toBeVisible()
  await page.getByRole('option', { name: 'Dwarvish', exact: true }).click()
  expect(await readPersistedCharacters(page)).toHaveLength(0)
  await next.click()
  await next.click()
  await dialog.getByRole('tab', { name: 'Choices', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: /^Remove Halfling from Languages · Acolyte/ }),
  ).toBeVisible()
  await next.click()
  await next.click()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => {
      const [saved] = (await readPersistedCharacters(page)) as Array<{
        raceSize: string
        raceAsiChoices: string[][]
        proficiencies: { languages: string[]; skills: string[] }
        spells: {
          spellProfiles: Array<{ type: string; cantrips: string[]; castingAbility?: string }>
        }
      }>
      return (
        saved && {
          size: saved.raceSize,
          bonuses: saved.raceAsiChoices,
          languages: saved.proficiencies.languages.map((name) => name.toLowerCase()).sort(),
          skills: saved.proficiencies.skills,
          racialSpells: saved.spells.spellProfiles
            .filter(({ type }) => type === 'racial')
            .map(({ cantrips, castingAbility }) => ({ cantrips, castingAbility })),
        }
      )
    })
    .toEqual({
      size: 'M',
      bonuses: [['dexterity']],
      languages: ['common', 'dwarvish', 'gnomish', 'halfling'],
      skills: ['perception'],
      racialSpells: [{ cantrips: ['Light|PHB'], castingAbility: 'int' }],
    })
})

test('Creator can replace one spell granted by a background feat without clearing its other pick', async ({
  page,
}) => {
  const feature = 'Temple Magic'
  const spellNames = ['Light', 'Guidance', 'Sacred Flame']
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-creator-feat-spell-removal',
    gameData: {
      ...CHARACTER_CREATION_GAME_DATA,
      races: [{ name: 'Dwarf', source: 'XPHB', edition: 'one', size: ['M'], speed: 30 }],
      classes: CHARACTER_CREATION_GAME_DATA.classes.map((cls) => ({
        ...cls,
        source: 'XPHB',
        edition: 'one',
      })),
      backgrounds: parseBackgrounds([
        {
          name: 'Temple Keeper',
          source: 'XPHB',
          edition: 'one',
          feats: [{ 'Temple Magic|XPHB': true }],
        },
      ]) as GameData['backgrounds'],
      feats: parseFeats({
        feat: [
          {
            name: feature,
            source: 'XPHB',
            category: 'O',
            additionalSpells: [{ ability: 'wis', known: { _: [{ choose: 'level=0', count: 2 }] } }],
          },
        ],
      }) as GameData['feats'],
      spells: spellNames.map((name) => makeSpellFixture({ name, source: 'XPHB', level: 0 })),
      sources: CHARACTER_CREATION_GAME_DATA.sources.map((source) => ({
        ...source,
        abbreviation: 'XPHB',
        year: 2024,
      })),
    },
  })
  await page.reload()
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const creator = page.getByRole('dialog', { name: 'Create New Character' })
  const next = creator.getByRole('button', { name: 'Next', exact: true })
  await creator.getByLabel('Character Name').fill('Temple Keeper')
  await next.click()
  await creator.getByRole('button', { name: /5\.5e Revised/ }).click()
  for (let step = 0; step < 4; step++) await next.click()
  await creator.getByRole('tab', { name: 'Choices', exact: true }).click()
  const row = creator
    .getByRole('heading', { name: feature, exact: true })
    .locator('xpath=ancestor::section[1]')
  const picker = page.getByRole('dialog', { name: `Configure: ${feature}` })
  await row.getByRole('button', { name: 'Configure feat' }).click()
  await picker.getByText('Light', { exact: true }).click()
  await picker.getByText('Guidance', { exact: true }).click()
  await picker.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(row.getByText('Complete', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Remove Light', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Remove Light', exact: true })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Remove Guidance', exact: true })).toBeVisible()
  await expect(row.getByText('Complete', { exact: true })).toHaveCount(0)
  await row.getByRole('button', { name: 'Edit feat options' }).click()
  await picker.getByText('Sacred Flame', { exact: true }).click()
  await picker.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Remove Sacred Flame', exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Remove Guidance', exact: true })).toBeVisible()
  await expect(row.getByText('Complete', { exact: true })).toBeVisible()
})

test('revised background bonuses update review, starting HP, and the saved character', async ({
  page,
}, info) => {
  const extraBooks = Array.from({ length: 8 }, (_, index) => ({
    abbreviation: `TBEX${index}`,
    name: `Supplemental rules and character options volume ${index + 1}`,
    group: 'supplement' as const,
    year: 2025,
    hasCharacterOptions: true,
  }))
  const gameData: GameData = {
    ...CHARACTER_CREATION_GAME_DATA,
    feats: (
      parseFeats(
        JSON.parse(readFileSync('resources/srd/data/feats.json', 'utf8')),
      ) as GameData['feats']
    ).filter(({ name, source }) => name === 'Magic Initiate' && source === 'XPHB'),
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
    backgrounds: parseBackgrounds(
      CHARACTER_CREATION_GAME_DATA.backgrounds.map((background) => ({
        ...background,
        source: 'XPHB',
        edition: 'one',
        ability: [
          { choose: { weighted: { from: ['con', 'int', 'wis'], weights: [2, 1] } } },
          { choose: { weighted: { from: ['con', 'int', 'wis'], weights: [1, 1, 1] } } },
        ],
        feats: [{ 'Magic Initiate; Cleric|XPHB': true }],
      })),
    ) as GameData['backgrounds'],
    sources: [
      ...CHARACTER_CREATION_GAME_DATA.sources.map((source) => ({
        ...source,
        abbreviation: 'XPHB',
        year: 2024,
      })),
      ...extraBooks,
    ],
  }
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-character-desk-background', gameData)
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Create New Character' })
  const next = dialog.getByRole('button', { name: 'Next' })
  await dialog.getByLabel('Character Name').fill('Character Desk Hero')
  await next.click()
  await dialog.getByRole('button', { name: /5.5e Revised/ }).click()
  await expect(
    dialog.getByRole('switch', { name: 'Allow Ability Scores Above 20' }),
  ).not.toBeChecked()
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
  const backgroundTab = dialog.getByRole('tab', { name: 'Choices', exact: true })
  await expect(next).toBeDisabled()
  await next.press('Enter')
  await expect(backgroundTab).toBeFocused()
  await backgroundTab.press('Enter')
  await dialog.getByRole('button', { name: '+1 / +1 / +1', exact: true }).click()
  const fixedBonusSlots = dialog.getByRole('combobox', {
    name: /Background ability bonus \+1, choice/,
  })
  await expect(fixedBonusSlots).toHaveCount(3)
  await expect(fixedBonusSlots.first()).toBeDisabled()
  await expect(fixedBonusSlots.first()).toHaveText('CON')
  await dialog.getByRole('button', { name: 'Configure feat', exact: true }).click()
  const originFeat = page.getByRole('dialog', { name: 'Configure: Magic Initiate', exact: true })
  await expect(originFeat).toBeVisible()
  await originFeat.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(originFeat).toBeHidden()
  await dialog.getByRole('button', { name: '+2 / +1', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Background ability bonus +2' }).click()
  await page.getByRole('option', { name: 'INT', exact: true }).click()
  await next.press('Enter')
  await expect(dialog.getByRole('combobox', { name: 'Background ability bonus +1' })).toBeFocused()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('combobox', { name: 'Background ability bonus +1' }).click()
  await expect(page.getByRole('option', { name: 'INT', exact: true })).toHaveAttribute(
    'data-disabled',
    '',
  )
  await page.getByRole('option', { name: 'CON', exact: true }).click()
  await next.click()
  await dialog.getByRole('tab', { name: 'Standard Array' }).click()
  await dialog.getByRole('combobox', { name: 'constitution base score' }).click()
  await page.getByRole('option', { name: '13', exact: true }).click()
  await dialog.screenshot({ path: info.outputPath('ability-scores.png') })
  await dialog.getByRole('tab', { name: 'Custom' }).click()
  await dialog.getByRole('spinbutton', { name: 'constitution base score' }).fill('30')
  await expect(
    dialog.getByRole('heading', { name: 'constitution', exact: true }).locator('..'),
  ).toContainText('Total 20')
  await next.click()
  await expect(dialog.getByText('20+1 (capped)', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('review.png') })
  await expect(dialog.getByRole('button', { name: /^Edit\b/ })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Set ability scores' })).toBeVisible()
  await expect(dialog.getByRole('spinbutton', { name: 'constitution base score' })).toHaveValue(
    '20',
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
  await expect(reviewPortrait.getByText('5.5e (2024)', { exact: true })).toHaveCSS('opacity', '1')
  await expect(reviewPortrait.getByText('Last modified: Unsaved')).toBeVisible()
  const reviewActions = reviewPortrait.locator('[data-slot="character-card-actions"]')
  await expect(reviewActions).toHaveCSS('opacity', '1')
  await expect(reviewActions.locator('button')).toHaveCount(3)
  await expect(reviewPortrait.getByRole('button')).toHaveCount(0)
  const snapshot = dialog.getByText('Character Snapshot', { exact: true }).locator('..')
  const variant = dialog.getByRole('heading', { name: 'Variant Rules' }).locator('../..')
  const scores = dialog.getByRole('heading', { name: 'Ability Scores' }).locator('../../..')
  const content = dialog.getByRole('heading', { name: 'Additional Content' }).locator('../..')
  const footer = dialog.locator('footer')
  const [portraitBounds, snapshotBounds, variantBounds, scoresBounds, contentBounds, footerBounds] =
    await Promise.all(
      [reviewPortrait, snapshot, variant, scores, content, footer].map((part) =>
        part.boundingBox(),
      ),
    )
  expect(portraitBounds!.y).toBeCloseTo(snapshotBounds!.y)
  expect(snapshotBounds!.y).toBeCloseTo(variantBounds!.y)
  expect(portraitBounds!.height).toBeCloseTo(snapshotBounds!.height, 1)
  expect(snapshotBounds!.height).toBeCloseTo(variantBounds!.height, 1)
  const portraitGap = snapshotBounds!.x - (portraitBounds!.x + portraitBounds!.width)
  const rulesGap = variantBounds!.x - (snapshotBounds!.x + snapshotBounds!.width)
  expect(portraitGap).toBeGreaterThan(0)
  expect(portraitGap).toBeCloseTo(rulesGap, 0)
  expect(scoresBounds!.y).toBeCloseTo(contentBounds!.y)
  expect(scoresBounds!.height).toBeCloseTo(contentBounds!.height)
  expect(scoresBounds!.y).toBeGreaterThan(portraitBounds!.y)
  expect(scoresBounds!.y + scoresBounds!.height).toBeLessThan(footerBounds!.y)
  expect(contentBounds!.y + contentBounds!.height).toBeLessThan(footerBounds!.y)
  await page.setViewportSize({ width: 720, height: 720 })
  await expect
    .poll(async () => (await variant.boundingBox())!.y - (await snapshot.boundingBox())!.y)
    .toBeGreaterThan(0)
  await content.scrollIntoViewIfNeeded()
  await expect(content.getByRole('heading', { name: 'Additional Content' })).toBeInViewport()
  await page.setViewportSize({ width: 1280, height: 720 })
  await dialog.getByRole('button', { name: 'Sourcebooks, completed', exact: true }).click()
  for (const book of extraBooks) {
    await dialog.getByRole('button', { name: new RegExp(book.name) }).click()
  }
  await next.click()
  await next.click()
  await page
    .getByRole('alertdialog', { name: 'Reset remaining character choices?' })
    .getByRole('button', { name: 'Reset and continue' })
    .click()
  for (let step = 0; step < 3; step++) await next.click()
  await expect(
    content.getByText(extraBooks[extraBooks.length - 1].name, { exact: true }),
  ).toBeVisible()

  const measurePairedRow = async () => {
    const [abilities, books] = await Promise.all([scores.boundingBox(), content.boundingBox()])
    return { y: abilities!.y - books!.y, height: abilities!.height - books!.height }
  }
  await expect.poll(measurePairedRow).toEqual({ y: 0, height: 0 })
  expect((await content.boundingBox())!.height).toBeGreaterThan(contentBounds!.height)
  await page.setViewportSize({ width: 900, height: 720 })
  await expect.poll(measurePairedRow).toEqual({ y: 0, height: 0 })
  await expect
    .poll(async () => (await variant.boundingBox())!.y - (await snapshot.boundingBox())!.y)
    .toBeGreaterThan(0)
  await expect
    .poll(
      async () =>
        (await reviewPortrait.boundingBox())!.height - (await snapshot.boundingBox())!.height,
    )
    .toBeCloseTo(0, 1)
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
