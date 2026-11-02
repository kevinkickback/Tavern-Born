import { expect, type Page, test } from '@playwright/test'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeWarriorSpellFixtures } from '../fixtures/warriorSpellFixtures'
import {
  ensureStartupPromptResolved,
  readPersistedCharacters,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

async function openSetup(page: Page, name: string) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const level = page.getByRole('button', { name: /^Level 2,/ })
  if ((await level.getAttribute('data-state')) === 'closed') await level.click()
  const section = page
    .getByText('Spell Selection', { exact: true })
    .locator('xpath=../..')
    .locator('..')
  await section.getByRole('button', { name: /^(Choose|Edit)$/ }).click()
  return page.getByRole('dialog', { name: `${name} spells at level 2`, exact: true })
}

for (const [name, source] of [
  ['Ranger', 'PHB'],
  ['Paladin', 'XPHB'],
] as const) {
  test(`@focused ${name} ${source} Warrior cantrips use shared Class setup and survive save/reopen`, async ({
    page,
  }) => {
    const fixture = makeWarriorSpellFixtures()
    const character = makeCharacterFixture({
      name: `Warrior ${name} ${source}`,
      originSystem: source === 'PHB' ? '2014' : '2024',
      classProgression: [{ name, source, levels: 2 }],
      variantRules: { optionalClassFeatures: true },
      allowedSources: source === 'PHB' ? ['PHB', 'TCE'] : ['XPHB'],
    })
    character.spells.spellProfiles = ensureSpellProfiles(character)
    const sourcePath = `e2e-warrior-${source}`
    await page.goto('/')
    await ensureStartupPromptResolved(page, sourcePath, fixture.data)
    await seedAppState(page, {
      sourcePath,
      gameData: fixture.data,
      characters: [character],
      activeCharacterId: character.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    await page.getByRole('link', { name: 'Class', exact: true }).click()
    const level = page.getByRole('button', { name: /^Level 2,/ })
    if ((await level.getAttribute('data-state')) === 'closed') await level.click()
    if (source === 'PHB')
      await page.getByRole('checkbox', { name: /Fighting Style Options/ }).check()
    await page
      .getByRole('group', { name: 'Fighting Style', exact: true })
      .getByRole('button', { name: 'Choose', exact: true })
      .click()
    const stylePicker = page.getByRole('dialog', { name: 'Choose Fighting Style', exact: true })
    await stylePicker
      .getByRole('textbox', { name: /Search/ })
      .fill(name === 'Ranger' ? 'Druidic Warrior' : 'Blessed Warrior')
    await stylePicker
      .getByText(name === 'Ranger' ? 'Druidic Warrior' : 'Blessed Warrior', { exact: true })
      .click()
    await stylePicker.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(stylePicker).toHaveCount(0)
    let draft = await openSetup(page, name)
    for (const [index, target] of ['Guidance', 'Resistance'].entries()) {
      await draft
        .getByRole('group', { name: `Cantrip ${index + 1}`, exact: true })
        .getByRole('button', { name: 'Choose', exact: true })
        .click()
      const picker = page.getByRole('dialog', { name: `Choose cantrip ${index + 1}`, exact: true })
      await expect(
        picker.getByRole('switch', { name: 'Ignore class restrictions', exact: true }),
      ).toHaveCount(0)
      await picker.getByRole('textbox', { name: /Search/ }).fill(target)
      await picker.getByText(target, { exact: true }).click()
      await picker.getByRole('button', { name: 'Confirm', exact: true }).click()
    }
    await draft.getByRole('button', { name: 'Finish', exact: true }).click()
    await expect(draft).toHaveCount(0)
    await page.getByRole('link', { name: 'Spells', exact: true }).click()
    const profile = page.getByRole('region', { name: new RegExp(name) })
    await expect(profile.getByRole('button', { name: 'Guidance', exact: true })).toBeVisible()
    await expect(profile.getByRole('button', { name: 'Resistance', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    await expect
      .poll(async () => {
        const saved = characterPersistenceSchema.parse(
          (await readPersistedCharacters(page)).find(
            (row) => (row as Character).id === character.id,
          ),
        )
        return saved.managedClassSpellChoices
          ?.filter((choice) => choice.slot[1] === 'feature-cantrip')
          .map((choice) => `${choice.target.name}|${choice.target.source}`)
      })
      .toEqual([`Guidance|${source}`, `Resistance|${source}`])
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    draft = await openSetup(page, name)
    await expect(draft.getByText(`Guidance (${source})`, { exact: true })).toBeVisible()
    await draft
      .getByRole('group', { name: 'Cantrip 1', exact: true })
      .getByRole('button', { name: 'Clear', exact: true })
      .click()
    await draft.getByRole('button', { name: 'Cancel', exact: true }).click()
    draft = await openSetup(page, name)
    await expect(draft.getByText(`Guidance (${source})`, { exact: true })).toBeVisible()
    await draft.getByRole('button', { name: 'Cancel', exact: true }).click()
  })
}
