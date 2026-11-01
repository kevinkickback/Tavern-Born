import { expect, type Page, test } from '@playwright/test'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellBrowserFixtures } from '../fixtures/managedClassSpellBrowserFixtures'
import { authorManagedClassSpellFixture } from '../fixtures/managedClassSpellFixtures'
import {
  ensureStartupPromptResolved,
  readPersistedCharacters,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

const fixture = makeManagedClassSpellBrowserFixtures()
const initial = makeCharacterFixture({
  id: 'sorcerer-spell-replacement-e2e',
  name: 'Sorcerer Spell Choices',
  classProgression: [{ name: 'Sorcerer', source: 'PHB', levels: 9 }],
})
const character = authorManagedClassSpellFixture(initial, fixture, [
  {
    owner: initial.classProgression[0],
    domain: 'class-known',
    gain: 2,
    targets: [{ name: 'Chromatic Orb', source: 'PHB' }],
  },
])
async function saveAndRead(page: Page, expectedTargets: string[]) {
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () =>
      (
        (await readPersistedCharacters(page)).find(
          (row) => (row as Character).id === character.id,
        ) as Character
      )?.managedClassSpellChoices?.map((row) => row.target.name),
    )
    .toEqual(expectedTargets)
  return characterPersistenceSchema.parse(
    (await readPersistedCharacters(page)).find((row) => (row as Character).id === character.id),
  )
}
async function openGain(page: Page, level: number) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  await page.getByRole('button', { name: new RegExp('^Level ' + level + ',') }).click()
  const spellSection = page
    .getByText('Spell Selection', { exact: true })
    .locator('xpath=../..')
    .locator('..')
  await spellSection.getByRole('button', { name: /^(Edit|Choose)$/ }).click()
  return page.getByRole('dialog', { name: 'Sorcerer spells at level ' + level })
}
async function pick(page: Page, name: string, previous?: string) {
  const picker = page.getByRole('dialog', { name: 'Choose spell 1', exact: true })
  if (previous) {
    await picker.getByRole('textbox', { name: /Search/ }).fill(previous)
    await picker.getByRole('button').filter({ hasText: previous }).click()
  }
  await picker.getByRole('textbox', { name: /Search/ }).fill(name)
  await picker.getByText(name, { exact: true }).click()
  await picker.getByRole('button', { name: 'Confirm', exact: true }).click()
}

test('@focused Sorcerer edits retain acquisition limits and a later gain learns a higher-level spell', async ({
  page,
}) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-sorcerer-choices', fixture.gameData)
  await seedAppState(page, {
    sourcePath: 'e2e-sorcerer-choices',
    gameData: fixture.gameData,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)

  let draft = await openGain(page, 2)
  await draft
    .getByRole('group', { name: 'Spell 1', exact: true })
    .getByRole('button', { name: 'Change', exact: true })
    .click()
  const picker = page.getByRole('dialog', { name: 'Choose spell 1', exact: true })
  await picker.getByRole('textbox', { name: /Search/ }).fill('Hold Monster')
  await expect(picker.getByText('No results match your filters.')).toBeVisible()
  await picker.getByRole('switch', { name: 'Ignore class restrictions', exact: true }).click()
  await expect(picker.getByText('No results match your filters.')).toBeVisible()
  await expect(picker.getByText('Hold Monster', { exact: true })).toHaveCount(0)
  await pick(page, 'Magic Missile', 'Chromatic Orb')
  await draft.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  const sorcererSpells = page.getByRole('region', { name: /Sorcerer/ })
  await expect(sorcererSpells.getByText('Chromatic Orb', { exact: true })).toBeVisible()
  await expect(sorcererSpells.getByText('Magic Missile', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save character', exact: true })).toBeDisabled()
  const cancelled = characterPersistenceSchema.parse(
    (await readPersistedCharacters(page)).find((row) => (row as Character).id === character.id),
  )
  expect(cancelled.managedClassSpellChoices).toEqual(character.managedClassSpellChoices)
  expect(cancelled.managedClassSpellRevision).toBe(character.managedClassSpellRevision)

  draft = await openGain(page, 2)
  await draft
    .getByRole('group', { name: 'Spell 1', exact: true })
    .getByRole('button', { name: 'Change', exact: true })
    .click()
  await pick(page, 'Magic Missile', 'Chromatic Orb')
  await draft.getByRole('button', { name: 'Finish', exact: true }).click()
  const replaced = await saveAndRead(page, ['Magic Missile'])
  expect(replaced.managedClassSpellChoices?.[0]?.slot).toEqual(
    character.managedClassSpellChoices?.[0]?.slot,
  )
  expect(replaced.managedClassSpellChoices?.[0]?.revision).toBeGreaterThan(
    character.managedClassSpellChoices![0].revision,
  )
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(sorcererSpells.getByText('Magic Missile', { exact: true })).toBeVisible()
  await expect(sorcererSpells.getByText('Chromatic Orb', { exact: true })).toHaveCount(0)

  draft = await openGain(page, 9)
  await draft
    .getByRole('group', { name: 'Spell 1', exact: true })
    .getByRole('button', { name: 'Choose', exact: true })
    .click()
  await pick(page, 'Hold Monster')
  await draft.getByRole('button', { name: 'Finish', exact: true }).click()
  const saved = await saveAndRead(page, ['Magic Missile', 'Hold Monster'])
  expect(saved.managedClassSpellChoices).toContainEqual(replaced.managedClassSpellChoices![0])
  expect(saved.managedClassSpellChoices?.find((row) => row.slot[3] === 9)?.target).toEqual({
    name: 'Hold Monster',
    source: 'PHB',
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(sorcererSpells.getByText('Hold Monster', { exact: true })).toBeVisible()
  await expect(sorcererSpells.getByText('Magic Missile', { exact: true })).toBeVisible()
})
