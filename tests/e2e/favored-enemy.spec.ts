import { existsSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeFavoredEnemyFixture } from '../fixtures/favoredEnemyFixtures'
import { readPersistedCharacters, seedAppState, selectCharacterFromHome } from './helpers/startup'

async function open(page: Page) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const level = page.getByRole('button', { name: /^Level 1,/ })
  if ((await level.getAttribute('data-state')) === 'closed') await level.click()
  await page
    .getByRole('group', { name: 'Favored Enemy', exact: true })
    .getByRole('button', { name: /^(Choose|Edit)$/ })
    .click()
  return page.getByRole('dialog')
}
async function select(page: Page, label: string, value: string) {
  await page.getByRole('dialog').getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: value, exact: true }).click()
}
for (const [label, file] of [
  ['bundled', 'resources/srd/core/data/class/class-ranger.json'],
  ['configured', 'data/class/class-ranger.json'],
] as const) {
  test(`@focused ${label} Ranger Favored Enemy campaign confirmation saves, reopens, cancels and clears exactly`, async ({
    page,
  }) => {
    test.skip(!existsSync(file), 'Configured external Ranger catalog is unavailable')
    const f = makeFavoredEnemyFixture(1, undefined, file),
      character = { ...f.character, name: `Favored Enemy ${label}` }
    f.data.creatures = [{ name: 'Hill Giant', source: 'MM', type: 'giant', languages: ['Giant'] }]
    f.data.races = [
      { name: 'Elf', source: 'PHB', languageProficiencies: [{ common: true, elvish: true }] },
    ]
    await page.goto('/')
    await seedAppState(page, {
      sourcePath: `e2e-favored-enemy-${label}`,
      gameData: f.data,
      characters: [character],
      activeCharacterId: character.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    let draft = await open(page)
    await draft.getByRole('combobox', { name: 'Creature type' }).fill('Gia')
    await expect(draft.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
    await draft.getByRole('combobox', { name: 'Creature type' }).fill('Giant')
    await expect(draft.getByRole('combobox', { name: 'Associated language' })).toContainText(
      'Giant',
    )
    await draft.getByRole('combobox', { name: 'Associated language' }).click()
    await expect(page.getByRole('option', { name: 'Common', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: 'Giant', exact: true }).click()
    await draft.getByRole('button', { name: 'Show all languages', exact: true }).click()
    await select(page, 'Associated language', 'Elvish')
    await draft.getByRole('button', { name: 'Cancel', exact: true }).click()
    draft = await open(page)
    await expect(draft.getByRole('combobox', { name: 'Creature type' })).toHaveValue('')
    await draft.getByRole('tab', { name: 'One creature type' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(draft.getByRole('tab', { name: 'Two humanoid races' })).toBeFocused()
    await draft.getByRole('tab', { name: 'Two humanoid races' }).press('Enter')
    await expect(draft.getByRole('tab', { name: 'Two humanoid races' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await draft.getByRole('tab', { name: 'Two humanoid races' }).click()
    await expect(draft.locator('datalist option[value="Elf"]').first()).toHaveCount(1)
    await draft.getByLabel('Humanoid race 1').fill('Gnoll')
    await draft.getByLabel('Humanoid race 2').fill('Orc')
    await select(page, 'Associated language', 'Common')
    await expect(draft.getByRole('checkbox')).toHaveCount(0)
    await draft.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(draft).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Favored Enemy', exact: true })).toContainText(
      '1 / 1 chosen',
    )
    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    const saved = async () =>
      characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find((c) => (c as Character).id === character.id),
      )
    await expect
      .poll(
        async () =>
          (await saved()).classChoiceSelections?.find((s) => s.label === 'Favored Enemy')
            ?.favoredEnemy,
      )
      .toEqual({
        mode: 'humanoid-races',
        humanoidsConfirmed: true,
        language: { kind: 'spoken', name: 'common' },
      })
    const before = await saved()
    expect(before.proficiencies.languages).toContain('common')
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    draft = await open(page)
    await expect(draft.getByLabel('Humanoid race 2')).toHaveValue('Orc')
    await draft.getByLabel('Humanoid race 2').fill('Hobgoblin')
    await expect(draft.getByRole('combobox', { name: 'Associated language' })).toContainText(
      'Decide later',
    )
    await draft.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(await saved()).toEqual(before)
    draft = await open(page)
    await draft.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(draft).toHaveCount(0)
    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    await expect
      .poll(async () =>
        (await saved()).classChoiceSelections?.filter((s) => s.label === 'Favored Enemy'),
      )
      .toEqual([])
    expect((await saved()).proficiencies.languages).not.toContain('common')
  })
}
