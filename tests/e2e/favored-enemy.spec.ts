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

test('@focused autocomplete stays within a small viewport and scrolls every race without closing setup', async ({
  page,
}, testInfo) => {
  const f = makeFavoredEnemyFixture(1)
  f.character.proficiencies.languages = ['Common']
  f.data.races = Array.from({ length: 100 }, (_, i) => ({
    name: `Race ${String(i).padStart(3, '0')}`,
    source: 'PHB',
  }))
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-scrollable-autocomplete',
    gameData: f.data,
    characters: [f.character],
    activeCharacterId: f.character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, f.character.name)
  const draft = await open(page)
  await page.setViewportSize({ width: 420, height: 560 })
  await draft.getByRole('tab', { name: 'Two humanoid races' }).click()
  const input = draft.getByLabel('Humanoid race 1', { exact: true })
  await draft.getByRole('button', { name: 'Show humanoid race 1 suggestions' }).click()
  const list = page.getByRole('listbox', { name: 'Humanoid race 1 suggestions' })
  await expect(list.getByRole('option')).toHaveCount(100)
  await expect
    .poll(async () => {
      const box = await list.boundingBox()
      return (
        !!box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 420 &&
        box.y + box.height <= 560 &&
        box.height <= 240
      )
    })
    .toBe(true)
  expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true)
  await input.press('ArrowDown')
  await input.press('ArrowUp')
  const last = list.getByRole('option', { name: 'Race 099 (PHB)' })
  await expect(last).toBeInViewport()
  await expect.poll(() => list.evaluate((e) => e.scrollTop)).toBeGreaterThan(0)
  await page.screenshot({ path: testInfo.outputPath('scrollable-races.png') })
  await last.click()
  await expect(input).toHaveValue('Race 099')
  await expect(draft).toBeVisible()
  const second = draft.getByLabel('Humanoid race 2', { exact: true })
  await second.fill('Race 04')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(10)
  await second.press('ArrowDown')
  await second.press('Enter')
  await expect(second).toHaveValue('Race 040')
  await second.fill('Campaign people')
  await second.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(draft).toBeVisible()
  await expect(second).toHaveValue('Campaign people')
  await draft.getByRole('combobox', { name: 'Associated language' }).click()
  await expect(page.getByRole('option', { name: 'Common', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: 'Elvish', exact: true }).click()
  await draft.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(draft).toHaveCount(0)
})
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
    await draft.getByRole('button', { name: 'Show humanoid race 1 suggestions' }).click()
    await expect(
      page
        .getByRole('listbox', { name: 'Humanoid race 1 suggestions' })
        .getByRole('option', { name: 'Elf (PHB)' }),
    ).toBeVisible()
    await draft.getByLabel('Humanoid race 1', { exact: true }).fill('Gnoll')
    await draft.getByLabel('Humanoid race 2', { exact: true }).fill('Orc')
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
    await expect(draft.getByLabel('Humanoid race 2', { exact: true })).toHaveValue('Orc')
    await draft.getByLabel('Humanoid race 2', { exact: true }).fill('Hobgoblin')
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
