import { existsSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  buildClassChoiceFeatureCatalogs,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makePsionicFixture } from '../fixtures/psionicFixtures'
import { readPersistedCharacters, seedAppState, selectCharacterFromHome } from './helpers/startup'

async function open(page: Page, label: string) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const level = page.getByRole('button', { name: /^Level 1,/ })
  if ((await level.getAttribute('data-state')) === 'closed') await level.click()
  await page
    .getByRole('group', { name: label, exact: true })
    .getByRole('button', { name: /^(Choose|Edit|Review saved choice)$/ })
    .click()
  return page.getByRole('dialog')
}

test('Mystic replaces a bonus discipline in Level Up and restores it on level removal', async ({
  page,
}) => {
  test.skip(
    !existsSync('data/class/class-mystic.json') || !existsSync('data/psionics.json'),
    'Configured Mystic catalog is unavailable',
  )
  const { data, character } = makePsionicFixture()
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const cls = data.classes.find((row) => row.name === 'Mystic')!
  const order = cls.subclasses?.find((row) => row.name === 'Order of the Avatar')
  const choice = getCharacterClassChoices(
    cls,
    order,
    createOptionalClassFeatureActivity(character, catalogs),
    catalogs,
  ).find((row) => row.label === 'Bonus Disciplines')!
  const psionics = data.psionics ?? []
  const initial = psionics.filter((row) => row.type === 'D' && row.order === 'Avatar').slice(0, 2)
  const incoming = psionics.find((row) => row.type === 'D' && row.order === 'Nomad')!
  const prepared = applyCharacterCommandResult(
    character,
    applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      choice,
      initial.map(({ name, source }) => ({ entityType: 'psionic', name, source })),
      { classes: data.classes, catalogs },
    ),
  )
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-mystic-replacement',
    gameData: data,
    characters: [prepared],
    activeCharacterId: prepared.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, prepared.name)
  await page.getByRole('banner').getByRole('button', { name: 'Level Up' }).click()
  const levelDialog = page.getByRole('dialog', { name: 'Level Up Character' })
  await levelDialog.getByRole('button', { name: 'Level Up', exact: true }).first().click()
  const confirm = page.getByRole('dialog', { name: 'Confirm Level Up' })
  await confirm.getByRole('combobox', { name: 'Discipline to replace' }).click()
  await page.getByRole('option', { name: new RegExp(initial[0].name) }).click()
  await confirm.getByRole('combobox', { name: 'New discipline' }).click()
  await page.getByRole('option', { name: new RegExp(incoming.name) }).click()
  await confirm.getByRole('button', { name: 'Confirm Level Up' }).click()
  await levelDialog.getByRole('button', { name: 'Close', exact: true }).last().click()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  const saved = async () =>
    characterPersistenceSchema.parse(
      (await readPersistedCharacters(page)).find(
        (row) => !!row && typeof row === 'object' && 'id' in row && row.id === prepared.id,
      ),
    )
  await expect
    .poll(async () => (await saved()).mysticDisciplineReplacements?.[0]?.to.name)
    .toBe(incoming.name)
  expect((await saved()).features.map((row) => row.name)).toContain(incoming.name)
  expect((await saved()).features.map((row) => row.name)).not.toContain(initial[0].name)
  await page.reload()
  await selectCharacterFromHome(page, prepared.name)
  await page.getByRole('banner').getByRole('button', { name: 'Level Up' }).click()
  await levelDialog.getByRole('button', { name: /^Remove last level/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await levelDialog.getByRole('button', { name: 'Close', exact: true }).last().click()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect.poll(async () => (await saved()).classProgression[0].levels).toBe(1)
  expect((await saved()).mysticDisciplineReplacements).toBeUndefined()
  expect((await saved()).features.map((row) => row.name)).toContain(initial[0].name)
})
for (const edition of ['2014', '2024'] as const)
  test(`@focused configured Mystic ${edition} setup chooses, strictly reopens, cancels, recovers sources and clears owned choices`, async ({
    page,
  }, testInfo) => {
    test.skip(
      !existsSync('data/class/class-mystic.json') || !existsSync('data/psionics.json'),
      'Configured Mystic catalog is unavailable',
    )
    const fixture = makePsionicFixture(edition),
      sourcePath = `e2e-mystic-psionics-${edition}`
    await page.goto('/')
    await seedAppState(page, {
      sourcePath,
      gameData: fixture.data,
      characters: [fixture.character],
      activeCharacterId: fixture.character.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, fixture.character.name)
    let dialog = await open(page, 'Psionic Talents')
    await dialog.getByRole('textbox', { name: /Search/ }).fill('Beacon')
    await dialog
      .locator('button[aria-pressed]')
      .filter({ hasText: 'Beacon' })
      .click({ position: { x: 8, y: 8 } })
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    dialog = await open(page, 'Psionic Disciplines')
    if (edition === '2024') {
      await page.setViewportSize({ width: 420, height: 700 })
      await dialog.getByRole('button', { name: 'Hide filters', exact: true }).click()
      const bounds = await dialog.boundingBox()
      expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 420).toBe(true)
    }
    await dialog.getByRole('textbox', { name: /Search/ }).fill('Adaptive Body')
    await dialog.getByText('Adaptive Body', { exact: true }).hover()
    await expect(page.getByText(/Psychic Focus/).first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('psionic-picker.png') })
    await page.mouse.move(0, 0)
    await dialog
      .locator('button[aria-pressed]')
      .filter({ hasText: 'Adaptive Body' })
      .click({ position: { x: 8, y: 8 } })
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    if (edition === '2024') await page.setViewportSize({ width: 1280, height: 720 })
    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    const saved = async () =>
      characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find((row: any) => row.id === fixture.character.id),
      )
    await expect
      .poll(async () =>
        (await saved()).classChoiceSelections?.map((row) => row.selected[0].name).sort(),
      )
      .toEqual(['Adaptive Body', 'Beacon'])
    const before = await saved()
    expect(before.features.every((row) => row.description === '')).toBe(true)
    await page.reload()
    await selectCharacterFromHome(page, fixture.character.name)
    dialog = await open(page, 'Psionic Talents')
    await dialog.getByRole('textbox', { name: /Search/ }).fill('Beacon')
    await dialog
      .locator('button[aria-pressed]')
      .filter({ hasText: 'Beacon' })
      .click({ position: { x: 8, y: 8 } })
    await dialog.getByRole('textbox', { name: /Search/ }).fill('Mind Thrust')
    await dialog
      .locator('button[aria-pressed]')
      .filter({ hasText: 'Mind Thrust' })
      .click({ position: { x: 8, y: 8 } })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(await saved()).toEqual(before)
    const absent = { ...fixture.data, psionics: [] }
    absent.lookups = buildGameDataLookups(absent)
    await seedAppState(page, {
      sourcePath,
      gameData: absent,
      characters: [before],
      activeCharacterId: before.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, fixture.character.name)
    dialog = await open(page, 'Psionic Talents')
    await expect(dialog.getByText(/Source rules are unavailable/).first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(await saved()).toEqual(before)
    await seedAppState(page, {
      sourcePath,
      gameData: fixture.data,
      characters: [before],
      activeCharacterId: before.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, fixture.character.name)
    dialog = await open(page, 'Psionic Talents')
    await dialog.getByRole('textbox', { name: /Search/ }).fill('Beacon')
    await dialog
      .locator('button[aria-pressed]')
      .filter({ hasText: 'Beacon' })
      .click({ position: { x: 8, y: 8 } })
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    await expect
      .poll(async () => (await saved()).classChoiceSelections?.map((row) => row.label))
      .toEqual(['Psionic Disciplines'])
    expect((await saved()).features.map((row) => row.name)).toEqual(['Adaptive Body'])
  })

test('@focused configured Mystic bonus disciplines remain distinct and can be cleared without their source', async ({
  page,
}) => {
  test.skip(
    !existsSync('data/class/class-mystic.json') || !existsSync('data/psionics.json'),
    'Configured Mystic catalog is unavailable',
  )
  const fixture = makePsionicFixture(),
    sourcePath = 'e2e-mystic-bonus'
  fixture.character.features = [
    {
      id: 'manual-independent',
      name: 'Independent feature',
      source: 'CUSTOM',
      description: 'Independent manual feature.',
    },
  ]
  const names = fixture.data
    .psionics!.filter((row) => row.order === 'Avatar')
    .slice(0, 2)
    .map((row) => row.name)
  await page.goto('/')
  await seedAppState(page, {
    sourcePath,
    gameData: fixture.data,
    characters: [fixture.character],
    activeCharacterId: fixture.character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, fixture.character.name)
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const level = page.getByRole('button', { name: /^Level 1,/ })
  if ((await level.getAttribute('data-state')) === 'closed') await level.click()
  const inline = page.getByRole('button', { name: 'Choose Bonus Disciplines', exact: true })
  if (await inline.count()) await inline.click()
  else
    await page
      .getByRole('group', { name: 'Bonus Disciplines', exact: true })
      .getByRole('button', { name: 'Choose', exact: true })
      .click()
  let dialog = page.getByRole('dialog', { name: 'Choose Bonus Disciplines', exact: true })
  for (const name of names) {
    await dialog.getByRole('textbox', { name: /Search/ }).fill(name)
    await dialog
      .locator('button[aria-pressed]')
      .filter({ hasText: name })
      .click({ position: { x: 8, y: 8 } })
  }
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  dialog = await open(page, 'Psionic Disciplines')
  await dialog.getByRole('textbox', { name: /Search/ }).fill(names[0])
  await expect(dialog.locator('button[aria-pressed]').filter({ hasText: names[0] })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  const saved = async () =>
    characterPersistenceSchema.parse(
      (await readPersistedCharacters(page)).find((row: any) => row.id === fixture.character.id),
    )
  await expect.poll(async () => (await saved()).classChoiceSelections?.[0].selected.length).toBe(2)
  const before = await saved(),
    absent = { ...fixture.data, psionics: [] }
  absent.lookups = buildGameDataLookups(absent)
  await seedAppState(page, {
    sourcePath,
    gameData: absent,
    characters: [before],
    activeCharacterId: before.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, fixture.character.name)
  dialog = await open(page, 'Bonus Disciplines')
  for (const name of names)
    await dialog
      .locator('button[aria-pressed]')
      .filter({ hasText: name })
      .click({ position: { x: 8, y: 8 } })
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect.poll(async () => (await saved()).classChoiceSelections).toEqual([])
  expect((await saved()).features.map((row) => row.id)).toEqual(['manual-independent'])
})
