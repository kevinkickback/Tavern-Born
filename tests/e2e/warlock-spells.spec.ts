import { expect, test } from '@playwright/test'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellBrowserFixtures } from '../fixtures/managedClassSpellBrowserFixtures'
import { authorManagedClassSpellFixture } from '../fixtures/managedClassSpellFixtures'
import {
  ensureStartupPromptResolved,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

const fixture = makeManagedClassSpellBrowserFixtures()
const initial = makeCharacterFixture({
  id: 'warlock-known-spells-e2e',
  name: 'Warlock Known Spells',
  classProgression: [{ name: 'Warlock', source: 'PHB', levels: 2 }],
})
const character = authorManagedClassSpellFixture(initial, fixture, [
  {
    owner: initial.classProgression[0],
    domain: 'class-known',
    gain: 1,
    targets: [{ name: 'Hex', source: 'PHB' }],
  },
])

test('@focused 2014 Warlock known spells stay active without preparation', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-warlock-known-spells', fixture.gameData)
  await seedAppState(page, {
    sourcePath: 'e2e-warlock-known-spells',
    gameData: fixture.gameData,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-warlock-known-spells', fixture.gameData)
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Spells' }).click()
  const warlockSpells = page.getByRole('region', { name: /Warlock/ })
  await expect(warlockSpells.getByText('Hex', { exact: true })).toBeVisible()
  await expect(warlockSpells.getByText('Inactive', { exact: true })).toHaveCount(0)
  await expect(warlockSpells.getByText('Not prepared', { exact: true })).toHaveCount(0)
  await expect(warlockSpells.getByTitle(/click to prepare/i)).toHaveCount(0)
  await expect(page.getByText('Pact Magic')).toBeVisible()
  await expect(page.getByText('Level 1 slots')).toBeVisible()
})
