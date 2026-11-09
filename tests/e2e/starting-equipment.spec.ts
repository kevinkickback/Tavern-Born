import { existsSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeConfiguredStartingEquipmentScenario } from '../fixtures/configuredStartingEquipmentFixtures'
import { makeStartingEquipmentScenario } from '../fixtures/startingEquipmentFixtures'
import { readPersistedCharacters, seedAppState, selectCharacterFromHome } from './helpers/startup'

async function openClass(page: Page) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const accordion = page.getByRole('button', { name: /^Starting Equipment/ })
  if ((await accordion.getAttribute('data-state')) === 'closed') await accordion.click()
}
async function openPicker(page: Page, role: 'Class' | 'Background', block = 1) {
  await page
    .getByRole('button', { name: `${role} starting equipment choice ${block} specific items` })
    .click()
  return page.getByRole('dialog', { name: 'Starting items', exact: true })
}
async function pick(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name: 'Starting items', exact: true })
  await dialog.getByRole('textbox', { name: /Search/ }).fill(name)
  await dialog
    .locator('button[aria-pressed]')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click({ position: { x: 8, y: 8 } })
}

test('@focused starting packages support keyboard tabs, independent quantities, details and strict reopen', async ({
  page,
}, info) => {
  const { character, data } = makeStartingEquipmentScenario()
  await page.setViewportSize({ width: 1100, height: 760 })
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-starting-items',
    gameData: data,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await openClass(page)
  const firstTabs = page.getByRole('tablist', {
    name: 'Class starting equipment choice 1',
    exact: true,
  })
  const a = firstTabs.getByRole('tab', { name: 'Package A', exact: true })
  const b = firstTabs.getByRole('tab', { name: 'Package B', exact: true })
  await a.focus()
  await a.press('ArrowRight')
  await expect(b).toBeFocused()
  await expect(a).toHaveAttribute('aria-selected', 'true')
  await b.press('Enter')
  await expect(b).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('button', { name: 'Class starting equipment choice 1 specific items' }),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('tablist', { name: 'Class starting equipment choice 2', exact: true })
      .getByRole('tab', { name: 'Package A', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await a.click()
  let dialog = await openPicker(page, 'Class')
  await expect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
  await dialog.getByRole('textbox', { name: /Search/ }).fill('Enchanted')
  await expect(dialog.locator('button[aria-pressed]')).toHaveCount(0)
  await pick(page, 'Longsword')
  await expect(dialog.getByText('3 lb', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/Practice fixture rules\./)).toBeVisible()
  await expect(
    dialog.getByText(/The second paragraph remains readable directly in the item card\./),
  ).toBeVisible()
  await expect(dialog.locator('details')).toHaveCount(0)
  await expect(dialog.locator('p').filter({ hasText: 'Longsword (PHB)' })).toHaveCount(0)
  await dialog
    .getByRole('button', { name: 'Increase Longsword (PHB) quantity', exact: true })
    .click()
  await expect(
    dialog.getByRole('status', { name: 'Longsword (PHB) quantity', exact: true }),
  ).toHaveText('2')
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  dialog = await openPicker(page, 'Class')
  await expect(
    dialog.getByRole('status', { name: 'Longsword (PHB) quantity', exact: true }),
  ).toHaveText('2')
  await dialog
    .getByRole('button', { name: 'Decrease Longsword (PHB) quantity', exact: true })
    .click()
  await pick(page, 'Warhammer')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  dialog = await openPicker(page, 'Class')
  await expect(
    dialog.getByRole('status', { name: 'Longsword (PHB) quantity', exact: true }),
  ).toHaveText('2')
  await dialog
    .getByRole('button', { name: 'Decrease Longsword (PHB) quantity', exact: true })
    .click()
  await pick(page, 'Warhammer')
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('link', { name: 'Background', exact: true }).click()
  await page.getByRole('tab', { name: 'Background details', exact: true }).click()
  dialog = await openPicker(page, 'Background')
  await pick(page, 'Warhammer')
  await dialog
    .getByRole('button', { name: 'Increase Warhammer (PHB) quantity', exact: true })
    .click()
  await page.screenshot({ path: info.outputPath('starting-items-quantities.png') })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  const saved = async () =>
    characterPersistenceSchema.parse(
      (await readPersistedCharacters(page)).find(
        (row) => !!row && typeof row === 'object' && 'id' in row && row.id === character.id,
      ),
    )
  await expect
    .poll(async () =>
      (await saved()).startingEquipmentGrants?.background?.items
        .filter((lot) => lot.reference.name === 'Warhammer')
        .reduce((sum, lot) => sum + lot.remainingQuantity, 0),
    )
    .toBe(2)
  const before = await saved()
  expect(
    before.equipment
      .filter((item) => item.name === 'Dagger')
      .map((item) => item.quantity)
      .sort(),
  ).toEqual([1, 2])
  expect(before.currency?.gp).toBe(5)
  expect(
    before.startingEquipmentGrants?.class?.items
      .filter((lot) => ['Longsword', 'Warhammer'].includes(lot.reference.name))
      .map((lot) => lot.remainingQuantity),
  ).toEqual([1, 1])
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await openClass(page)
  dialog = await openPicker(page, 'Class')
  await expect(
    dialog.getByRole('status', { name: 'Longsword (PHB) quantity', exact: true }),
  ).toHaveText('1')
  await expect(
    dialog.getByRole('status', { name: 'Warhammer (PHB) quantity', exact: true }),
  ).toHaveText('1')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect((await saved()).startingEquipmentGrants).toEqual(before.startingEquipmentGrants)
})

for (const edition of ['2014', '2024'] as const) {
  test(`@focused configured ${edition} starting item declarations save exact repeated weapons or named group members`, async ({
    page,
  }, info) => {
    test.skip(
      ![
        'data/items.json',
        'data/items-base.json',
        'data/class/class-fighter.json',
        'data/class/class-cleric.json',
      ].every(existsSync),
      'Configured starting-equipment sources are unavailable',
    )
    const { character, data } = makeConfiguredStartingEquipmentScenario(edition)
    // Runtime lookup Maps are rebuilt by the app after the browser seed is restored.
    delete data.lookups
    await page.goto('/')
    await seedAppState(page, {
      sourcePath: `e2e-starting-${edition}`,
      gameData: data,
      characters: [character],
      activeCharacterId: character.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    await openClass(page)
    if (edition === '2014')
      await page
        .getByRole('tablist', { name: 'Class starting equipment choice 2', exact: true })
        .getByRole('tab', { name: 'Package B', exact: true })
        .click()
    const block = edition === '2014' ? 2 : 1
    const name = edition === '2014' ? 'Longsword' : 'Emblem'
    const source = edition === '2014' ? 'PHB' : 'XPHB'
    let dialog = await openPicker(page, 'Class', block)
    await pick(page, name)
    if (edition === '2024') {
      await expect(
        dialog.getByRole('region', { name: 'Selected item quantities', exact: true }),
      ).toHaveCount(0)
      await expect(dialog.locator('p').filter({ hasText: `${name} (${source})` })).toHaveCount(0)
      await expect(dialog.locator('details')).toHaveCount(0)
    }
    if (edition === '2014')
      await dialog
        .getByRole('button', { name: `Increase ${name} (${source}) quantity`, exact: true })
        .click()
    await page.screenshot({ path: info.outputPath(`configured-starting-${edition}.png`) })
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    const saved = async () =>
      characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find(
          (row) => !!row && typeof row === 'object' && 'id' in row && row.id === character.id,
        ),
      )
    await expect
      .poll(
        async () =>
          (await saved()).startingEquipmentGrants?.class?.items.find(
            (lot) => lot.reference.name === name,
          )?.remainingQuantity,
      )
      .toBe(edition === '2014' ? 2 : 1)
    const before = await saved()
    expect(before.equipment.find((item) => item.name === name)?.source).toBe(source)
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    await openClass(page)
    dialog = await openPicker(page, 'Class', block)
    if (edition === '2014')
      await expect(
        dialog.getByRole('status', { name: `${name} (${source}) quantity`, exact: true }),
      ).toHaveText('2')
    else
      await expect(
        dialog.locator('button[aria-pressed=true]').filter({ hasText: name }),
      ).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect((await saved()).startingEquipmentGrants).toEqual(before.startingEquipmentGrants)
  })
}

for (const change of ['catalog', 'tools'] as const) {
  test(`@focused an open starting picker rejects confirmation after ${change} changes`, async ({
    page,
  }) => {
    const { character, data } = makeStartingEquipmentScenario()
    await page.goto('/')
    await seedAppState(page, {
      sourcePath: `e2e-starting-stale-${change}`,
      gameData: data,
      characters: [character],
      activeCharacterId: character.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    await openClass(page)
    const dialog = await openPicker(page, 'Class')
    await pick(page, 'Longsword')
    await dialog
      .getByRole('button', { name: 'Increase Longsword (PHB) quantity', exact: true })
      .click()
    const before = await page.evaluate(async () => {
      const path = '/src/store/characterStore.ts'
      const { useCharacterStore } = await import(path)
      return structuredClone(useCharacterStore.getState().activeCharacter)
    })
    await page.evaluate(async (kind) => {
      if (kind === 'catalog') {
        const path = '/src/store/gameDataStore.ts'
        const { useGameDataStore } = await import(path)
        const gameData = useGameDataStore.getState().gameData
        useGameDataStore.setState({ gameData: { ...gameData } })
      } else {
        const path = '/src/store/characterStore.ts'
        const { useCharacterStore } = await import(path)
        const actor = useCharacterStore.getState().activeCharacter
        useCharacterStore.getState().updateActiveCharacter({
          proficiencies: { ...actor.proficiencies, tools: ['flute'] },
        })
      }
    }, change)
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(
      page.getByText('Starting equipment changed. Review the current choice before confirming.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(dialog).toBeVisible()
    const after = await page.evaluate(async () => {
      const path = '/src/store/characterStore.ts'
      const { useCharacterStore } = await import(path)
      return structuredClone(useCharacterStore.getState().activeCharacter)
    })
    expect(after.equipment).toEqual(before.equipment)
    expect(after.startingEquipmentGrants).toEqual(before.startingEquipmentGrants)
    expect(after.classEquipmentItemChoices).toEqual(before.classEquipmentItemChoices)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  })
}

test('@focused configured Sorcerer keeps each package, picker and result in its own choice group', async ({
  page,
}, info) => {
  test.skip(
    !['data/class/class-sorcerer.json', 'data/items.json', 'data/items-base.json'].every(
      existsSync,
    ),
    'Configured Sorcerer sources are unavailable',
  )
  const { character, data } = makeConfiguredStartingEquipmentScenario('2014', 'Sorcerer')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-starting-sorcerer-layout',
    gameData: data,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await openClass(page)
  const accordion = page.getByRole('button', { name: /^Starting Equipment/ })
  const card = accordion.locator('xpath=ancestor::*[@data-slot="accordion-item"][1]')
  await expect(accordion).toContainText('3 Choices')
  await expect(card.getByRole('group')).toHaveCount(3)
  const first = card.getByRole('group', {
    name: 'Class starting equipment choice 1 configuration',
    exact: true,
  })
  await first.getByRole('tab', { name: 'Package B', exact: true }).click()
  await expect(first.getByText('Simple weapons', { exact: true })).toBeVisible()
  await expect(first.getByText('0 / 1 selected', { exact: true })).toBeVisible()
  await expect(accordion).toContainText('1 pending choice')
  const dialog = await openPicker(page, 'Class')
  await pick(page, 'Club')
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(first.getByText('Club', { exact: true })).toBeVisible()
  await expect(first.getByText('1 / 1 selected', { exact: true })).toBeVisible()
  await expect(accordion).toContainText('All choices made')
  const second = card.getByRole('group', {
    name: 'Class starting equipment choice 2 configuration',
    exact: true,
  })
  const third = card.getByRole('group', {
    name: 'Class starting equipment choice 3 configuration',
    exact: true,
  })
  await expect(second.getByRole('tab', { name: 'Package A', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(second.getByText('Component Pouch', { exact: true })).toBeVisible()
  await expect(third.getByText("Dungeoneer's Pack", { exact: true })).toBeVisible()
  await expect(
    card
      .getByRole('region', { name: 'Class starting equipment included equipment', exact: true })
      .getByText('2× Dagger', { exact: true }),
  ).toBeVisible()
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await card.screenshot({ path: info.outputPath('sorcerer-starting-equipment.png') })
  const equipmentColors = () =>
    first.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        border: style.borderColor,
        background: style.backgroundColor,
        icon: getComputedStyle(element.querySelector('svg')!).color,
        tabs: Array.from(element.querySelectorAll('[role="tablist"], [role="tab"]')).map((tab) => {
          const tabStyle = getComputedStyle(tab)
          return {
            color: tabStyle.color,
            background: tabStyle.backgroundColor,
            border: tabStyle.borderColor,
          }
        }),
      }
    })
  const fixedColors = await equipmentColors()
  for (const accent of ['rose', 'green', 'violet'] as const) {
    await page.evaluate(async (value) => {
      const path = '/src/store/appPreferencesStore.ts'
      const { useAppPreferencesStore } = await import(path)
      useAppPreferencesStore.getState().setThemeAccent(value)
    }, accent)
    await expect(page.locator('#root')).toHaveAttribute('data-accent', accent)
    expect(await equipmentColors()).toEqual(fixedColors)
  }
  await page.evaluate(async () => {
    const path = '/src/store/appPreferencesStore.ts'
    const { useAppPreferencesStore } = await import(path)
    useAppPreferencesStore.getState().setThemeAccent('blue')
    useAppPreferencesStore.getState().setThemeAppearance('light')
  })
  await expect(page.locator('#root')).toHaveAttribute('data-appearance', 'light')
  await card.screenshot({
    path: info.outputPath('sorcerer-starting-equipment-light.png'),
    animations: 'disabled',
  })
  await page.screenshot({ path: info.outputPath('sorcerer-starting-equipment-light-page.png') })
  await info.attach('equipment-theme-colors', {
    body: JSON.stringify({ dark: fixedColors, light: await equipmentColors() }, null, 2),
    contentType: 'application/json',
  })
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const saved = characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find(
          (row) => !!row && typeof row === 'object' && 'id' in row && row.id === character.id,
        ),
      )
      return saved.classEquipmentItemChoices?.['Sorcerer|PHB']?.['0:b:0']
    })
    .toEqual([{ name: 'Club', source: 'PHB' }])
})

test('@focused narrow starting picker scrolls virtual rows and preserves exact selections through source loss', async ({
  page,
}, info) => {
  const { character, data } = makeStartingEquipmentScenario()
  const sourcePath = 'e2e-starting-narrow-recovery'
  await page.setViewportSize({ width: 900, height: 640 })
  await page.goto('/')
  await seedAppState(page, {
    sourcePath,
    gameData: data,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await openClass(page)
  let dialog = await openPicker(page, 'Class')
  const last = dialog.locator('button[aria-pressed]').filter({ hasText: 'Warhammer' })
  await expect(last).toHaveCount(0)
  const scroller = dialog.locator('[data-selection-scroll-container]')
  await scroller.hover()
  await page.mouse.wheel(0, 10000)
  await expect(last).toBeVisible()
  await last.click({ position: { x: 8, y: 8 } })
  await dialog
    .getByRole('button', { name: 'Increase Warhammer (PHB) quantity', exact: true })
    .click()
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(900)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('starting-narrow-virtual-row.png') })
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  const saved = async () =>
    characterPersistenceSchema.parse(
      (await readPersistedCharacters(page)).find(
        (row) => !!row && typeof row === 'object' && 'id' in row && row.id === character.id,
      ),
    )
  await expect
    .poll(
      async () =>
        (await saved()).startingEquipmentGrants?.class?.items.find(
          (lot) => lot.reference.name === 'Warhammer',
        )?.remainingQuantity,
    )
    .toBe(2)
  const before = await saved()
  for (const missing of [true, false]) {
    const current = {
      ...data,
      itemsBase: data.itemsBase.filter((item) => !missing || item.name !== 'Warhammer'),
    }
    await seedAppState(page, {
      sourcePath,
      gameData: current,
      characters: [before],
      activeCharacterId: before.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    await openClass(page)
    dialog = await openPicker(page, 'Class')
    if (missing) {
      await expect(
        dialog
          .getByRole('group', { name: 'Unavailable selected items', exact: true })
          .getByRole('button', { name: 'Remove Warhammer (PHB)', exact: true }),
      ).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
    } else {
      await expect(
        dialog.getByRole('status', { name: 'Warhammer (PHB) quantity', exact: true }),
      ).toHaveText('2')
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect((await saved()).startingEquipmentGrants).toEqual(before.startingEquipmentGrants)
  }
})
