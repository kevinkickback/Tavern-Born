import { existsSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeLegacySubclassActor, makeLegacySubclassData } from '../fixtures/legacySubclassFixtures'
import { readPersistedCharacters, seedAppState, selectCharacterFromHome } from './helpers/startup'

async function open(page: Page, label: string) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const level = page.getByRole('button', { name: /^Level 3,/ })
  if ((await level.getAttribute('data-state')) === 'closed') await level.click()
  await page
    .getByRole('button', { name: new RegExp(`^(Choose|Edit) ${label}$`) })
    .or(
      page
        .getByRole('group', { name: label, exact: true })
        .getByRole('button', { name: 'Review saved choice', exact: true }),
    )
    .click()
  return page.getByRole('dialog')
}
async function choose(page: Page, label: string, name: string) {
  const dialog = await open(page, label)
  await dialog.getByRole('textbox', { name: /Search/ }).fill(name)
  await dialog
    .locator('button[aria-pressed]')
    .filter({ hasText: name })
    .click({ position: { x: 8, y: 8 } })
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}
for (const edition of ['2014', '2024'] as const)
  for (const family of ['Bard', 'Monk'] as const)
    test(`@focused configured ${edition} ${family} legacy setup saves, reopens, cancels and recovers exact dependencies`, async ({
      page,
    }, info) => {
      test.skip(
        ![
          'data/class/class-bard.json',
          'data/class/class-monk.json',
          'data/items-base.json',
          'data/optionalfeatures.json',
        ].every(existsSync),
        'Configured legacy subclass sources are unavailable',
      )
      const data = makeLegacySubclassData(),
        character = makeLegacySubclassActor(data, edition, family),
        sourcePath = `e2e-legacy-${edition}-${family}`
      // Runtime Maps do not cross Playwright's argument serialization; the app rebuilds them.
      delete data.lookups
      await page.goto('/')
      await seedAppState(page, {
        sourcePath,
        gameData: data,
        characters: [character],
        activeCharacterId: character.id,
      })
      await page.reload()
      await selectCharacterFromHome(page, character.name)
      const label = family === 'Bard' ? 'Fighting Style' : 'Kensei ranged weapon',
        name = family === 'Bard' ? 'Dueling' : 'Longbow'
      await choose(page, label, name)
      if (family === 'Monk') {
        await choose(page, 'Kensei melee weapon', 'Longsword')
        await choose(page, 'Way of the Brush', "Painter's Supplies")
      }
      await page.getByRole('button', { name: 'Save character', exact: true }).click()
      const saved = async () =>
        characterPersistenceSchema.parse(
          (await readPersistedCharacters(page)).find(
            (row) => !!row && typeof row === 'object' && 'id' in row && row.id === character.id,
          ),
        )
      await expect
        .poll(async () => (await saved()).classChoiceSelections?.length)
        .toBe(family === 'Bard' ? 1 : 3)
      const before = await saved()
      expect(before.equipment).toEqual(character.equipment)
      if (family === 'Monk') {
        expect(before.proficiencies.weapons).toEqual(
          expect.arrayContaining(['longbow', 'longsword']),
        )
        expect(before.proficiencies.tools).toContain("painter's supplies")
      }
      await page.reload()
      await selectCharacterFromHome(page, character.name)
      let dialog = await open(page, label)
      await dialog.getByRole('textbox', { name: /Search/ }).fill(name)
      await expect(
        dialog.locator('button[aria-pressed=true]').filter({ hasText: name }),
      ).toHaveCount(1)
      await page.screenshot({ path: info.outputPath('legacy-exact-picker.png') })
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      expect(await saved()).toEqual(before)
      const absent =
        family === 'Bard'
          ? {
              ...data,
              optionalfeatures: data.optionalfeatures.filter(
                (row) =>
                  !(
                    row &&
                    typeof row === 'object' &&
                    'name' in row &&
                    row.name === 'Dueling' &&
                    'source' in row &&
                    row.source === 'PHB'
                  ),
              ),
            }
          : {
              ...data,
              itemsBase: data.itemsBase.filter(
                (row) => !(row.name === 'Longbow' && row.source === 'PHB'),
              ),
            }
      delete absent.lookups
      await seedAppState(page, {
        sourcePath,
        gameData: absent,
        characters: [before],
        activeCharacterId: before.id,
      })
      await page.reload()
      await selectCharacterFromHome(page, character.name)
      dialog = await open(page, label)
      await expect(dialog.getByText(/Source rules are unavailable/).first()).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      expect(await saved()).toEqual(before)
      await seedAppState(page, {
        sourcePath,
        gameData: data,
        characters: [before],
        activeCharacterId: before.id,
      })
      await page.reload()
      await selectCharacterFromHome(page, character.name)
      dialog = await open(page, label)
      await dialog.getByRole('textbox', { name: /Search/ }).fill(name)
      await dialog
        .locator('button[aria-pressed=true]')
        .filter({ hasText: name })
        .click({ position: { x: 8, y: 8 } })
      await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
      await page.getByRole('button', { name: 'Save character', exact: true }).click()
      await expect
        .poll(async () => (await saved()).classChoiceSelections?.some((row) => row.label === label))
        .toBe(false)
      if (family === 'Monk') {
        expect((await saved()).proficiencies.weapons).not.toContain('longbow')
        expect((await saved()).proficiencies.weapons).toContain('longsword')
        expect((await saved()).proficiencies.tools).toContain("painter's supplies")
      }
    })
