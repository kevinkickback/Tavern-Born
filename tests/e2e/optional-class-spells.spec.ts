import { expect, test } from '@playwright/test'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalClassSpellFixtures } from '../fixtures/optionalClassSpellFixtures'
import { makePrimalAwarenessSpellFixtures } from '../fixtures/primalAwarenessSpellFixtures'
import {
  ensureStartupPromptResolved,
  readPersistedCharacters,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

test('@focused Class spell-list adoption uses the existing Spells preparation and recovery controls', async ({
  page,
}) => {
  const fixture = makeOptionalClassSpellFixtures()
  const character = makeCharacterFixture({
    name: 'Optional Spell Lists',
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Cleric', source: 'PHB', levels: 5 }],
    variantRules: { optionalClassFeatures: true },
  })
  character.spells.spellProfiles = ensureSpellProfiles(character)
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-optional-spell-lists', fixture.gameData)
  await seedAppState(page, {
    sourcePath: 'e2e-optional-spell-lists',
    gameData: fixture.gameData,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  const adoption = async () => {
    await page.getByRole('link', { name: 'Class', exact: true }).click()
    const level = page.getByRole('button', { name: /^Level 1,/ })
    if ((await level.getAttribute('data-state')) === 'closed') await level.click()
    return page.getByRole('checkbox', { name: /Additional Cleric Spells/ })
  }
  const choice = await adoption()
  await expect(choice).not.toBeChecked()
  await choice.check()
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  const row = page
    .getByRole('region', { name: /Cleric/ })
    .getByRole('button', { name: 'Aura of Vitality', exact: true })
    .locator('xpath=../..')
  await row.getByTitle('Not prepared — click to prepare').click()
  await expect(row.getByTitle('Prepared — click to unprepare')).toBeVisible()
  // Check the excluded editor/reservation UI after Spells has rendered, not on its loading fallback.
  await expect(page.getByRole('button', { name: /Edit Cleric preparation/ })).toHaveCount(0)
  await expect(page.getByText(/saved reservations/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const saved = characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find(
          (item) => (item as Character).id === character.id,
        ),
      )
      return saved.spells.spellProfiles.find((profile) => profile.className === 'Cleric')
        ?.preparedSpells
    })
    .toContain('Aura of Vitality|PHB')
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  const reopened = await adoption()
  await expect(reopened).toBeChecked()
  await reopened.uncheck()
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(page.getByText('Aura of Vitality|PHB — saved preparation unavailable')).toBeVisible()
  await page.getByRole('button', { name: 'Unprepare saved choice', exact: true }).click()
  await expect(page.getByText('Aura of Vitality|PHB — saved preparation unavailable')).toHaveCount(
    0,
  )
  await (await adoption()).check()
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(row.getByTitle('Not prepared — click to prepare')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('@focused Primal Awareness grants survive save/reopen and disappear with the exact adoption', async ({
  page,
}) => {
  const fixture = makePrimalAwarenessSpellFixtures()
  const character = makeCharacterFixture({
    name: 'Primal Awareness Ranger',
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: 5 }],
    variantRules: { optionalClassFeatures: true },
  })
  character.spells.spellProfiles = ensureSpellProfiles(character)
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-primal-awareness', fixture.gameData)
  await seedAppState(page, {
    sourcePath: 'e2e-primal-awareness',
    gameData: fixture.gameData,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  const openClass = async () => {
    await page.getByRole('link', { name: 'Class', exact: true }).click()
    const level = page.getByRole('button', { name: /^Level 3,/ })
    if ((await level.getAttribute('data-state')) === 'closed') await level.click()
    return page.getByRole('tablist', { name: 'Primeval Awareness replacement' })
  }
  const choices = await openClass()
  await choices.getByRole('tab', { name: 'Primal Awareness', exact: true }).click()
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  const ranger = page.getByRole('region', { name: /Ranger/ })
  await expect(
    ranger.getByRole('button', { name: 'Speak with Animals', exact: true }),
  ).toBeVisible()
  await expect(ranger.getByRole('button', { name: 'Beast Sense', exact: true })).toBeVisible()
  await ranger.getByRole('button', { name: 'Speak with Animals', exact: true }).hover()
  await expect(
    page.getByText('Source: Class: Ranger — Primal Awareness', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const saved = characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find(
          (item) => (item as Character).id === character.id,
        ),
      )
      return saved.optionalClassFeatureAdoptions?.map((row) => row.target)
    })
    .toContain('class-feature|primal awareness|ranger|phb|3|tce')
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  const reopened = await openClass()
  await expect(
    reopened.getByRole('tab', { name: 'Primal Awareness', exact: true }),
  ).toHaveAttribute('data-state', 'active')
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(ranger.getByRole('button', { name: 'Beast Sense', exact: true })).toBeVisible()
  await (await openClass()).getByRole('tab', { name: 'Primeval Awareness', exact: true }).click()
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(ranger.getByRole('button', { name: 'Speak with Animals', exact: true })).toHaveCount(
    0,
  )
  await expect(ranger.getByRole('button', { name: 'Beast Sense', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const saved = characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find(
          (item) => (item as Character).id === character.id,
        ),
      )
      return saved.optionalClassFeatureAdoptions?.map((row) => row.target) ?? []
    })
    .not.toContain('class-feature|primal awareness|ranger|phb|3|tce')
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  await expect(ranger.getByRole('button', { name: 'Speak with Animals', exact: true })).toHaveCount(
    0,
  )
})
