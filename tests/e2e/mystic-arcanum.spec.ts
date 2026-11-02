import { expect, type Page, test } from '@playwright/test'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellBrowserFixtures } from '../fixtures/managedClassSpellBrowserFixtures'
import { readPersistedCharacters, seedAppState, selectCharacterFromHome } from './helpers/startup'

async function openSetup(page: Page) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const level = page.getByRole('button', { name: /^Level 13,/ })
  if ((await level.getAttribute('data-state')) === 'closed') await level.click()
  const section = page
    .getByText('Spell Selection', { exact: true })
    .locator('xpath=../..')
    .locator('..')
  await section.getByRole('button', { name: /^(Choose|Edit)$/ }).click()
  return page.getByRole('dialog', { name: 'Warlock spells at level 13', exact: true })
}

for (const source of ['PHB', 'XPHB'] as const) {
  test(`@focused ${source} Mystic Arcanum Class setup, source recovery, save/reopen and exact Clear`, async ({
    page,
  }) => {
    const fixture = makeManagedClassSpellBrowserFixtures()
    let character = makeCharacterFixture({
      name: `Arcanum ${source}`,
      originSystem: source === 'PHB' ? '2014' : '2024',
      allowedSources: [source],
      classProgression: [{ name: 'Warlock', source, levels: 13 }],
    })
    character.spells.spellProfiles = ensureSpellProfiles(character)
    const sourcePath = `e2e-arcanum-${source}`
    await page.goto('/')
    await seedAppState(page, {
      sourcePath,
      gameData: fixture.gameData,
      characters: [character],
      activeCharacterId: character.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    let draft = await openSetup(page)
    await draft
      .getByRole('group', { name: 'Mystic Arcanum 1', exact: true })
      .getByRole('button', { name: 'Choose', exact: true })
      .click()
    const picker = page.getByRole('dialog', { name: 'Choose spell 1', exact: true })
    await picker.getByRole('switch', { name: 'Ignore class restrictions', exact: true }).click()
    await picker.getByRole('textbox', { name: /Search/ }).fill('Circle of Death')
    await expect(picker.getByText('Circle of Death', { exact: true })).toHaveCount(0)
    await picker.getByRole('switch', { name: 'Ignore class restrictions', exact: true }).click()
    await picker.getByRole('textbox', { name: /Search/ }).fill('Finger of Death')
    await picker.getByText('Finger of Death', { exact: true }).click()
    await picker.getByRole('button', { name: 'Confirm', exact: true }).click()
    await draft.getByRole('button', { name: 'Finish', exact: true }).click()
    await expect(draft).toHaveCount(0)
    await page.getByRole('link', { name: 'Spells', exact: true }).click()
    await expect(
      page.getByText(/Mystic Arcanum — once per long rest, without expending a spell slot/),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    await expect
      .poll(async () => {
        const saved = characterPersistenceSchema.parse(
          (await readPersistedCharacters(page)).find(
            (row) => (row as Character).id === character.id,
          ),
        )
        return saved.managedClassSpellChoices
          ?.filter((row) => row.slot[1] === 'class-arcanum')
          .map((row) => row.target.name)
      })
      .toEqual(['Finger of Death'])
    character = characterPersistenceSchema.parse(
      (await readPersistedCharacters(page)).find((row) => (row as Character).id === character.id),
    )

    if (source === 'XPHB') {
      const missingIntro = {
        ...fixture.gameData,
        classFeatures: fixture.gameData.classFeatures.filter(
          (row) =>
            !(row.classSource === 'XPHB' && row.level === 11 && row.name === 'Mystic Arcanum'),
        ),
      }
      missingIntro.lookups = buildGameDataLookups(missingIntro)
      await seedAppState(page, {
        sourcePath,
        gameData: missingIntro,
        characters: [character],
        activeCharacterId: character.id,
      })
      await page.reload()
      await selectCharacterFromHome(page, character.name)
      draft = await openSetup(page)
      await expect(draft.getByText(/Restore the introductory casting feature/)).toBeVisible()
      await expect(draft.getByText(`Finger of Death (${source})`, { exact: true })).toBeVisible()
      await draft.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    await seedAppState(page, {
      sourcePath,
      gameData: fixture.gameData,
      characters: [character],
      activeCharacterId: character.id,
    })
    await page.reload()
    await selectCharacterFromHome(page, character.name)
    draft = await openSetup(page)
    await expect(draft.getByText(`Finger of Death (${source})`, { exact: true })).toBeVisible()
    await expect(draft.getByText(/Restore the introductory casting feature/)).toHaveCount(0)
    await draft
      .getByRole('group', { name: 'Mystic Arcanum 1', exact: true })
      .getByRole('button', { name: 'Clear', exact: true })
      .click()
    await draft.getByRole('button', { name: 'Cancel', exact: true }).click()
    draft = await openSetup(page)
    await expect(draft.getByText(`Finger of Death (${source})`, { exact: true })).toBeVisible()
    await draft
      .getByRole('group', { name: 'Mystic Arcanum 1', exact: true })
      .getByRole('button', { name: 'Clear', exact: true })
      .click()
    await draft.getByRole('button', { name: 'Finish', exact: true }).click()
    await page.getByRole('button', { name: 'Save character', exact: true }).click()
    await expect
      .poll(
        async () =>
          characterPersistenceSchema.parse(
            (await readPersistedCharacters(page)).find(
              (row) => (row as Character).id === character.id,
            ),
          ).managedClassSpellChoices,
      )
      .toEqual([])
  })
}
