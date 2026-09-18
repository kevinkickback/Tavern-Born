import { expect, test } from '@playwright/test'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  ensureStartupPromptResolved,
  MINIMAL_GAME_DATA,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

const character = characterPersistenceSchema.parse(
  makeCharacterFixture({
    id: 'warlock-known-spells-e2e',
    name: 'Warlock Known Spells',
    classProgression: [{ name: 'Warlock', source: 'PHB', levels: 2 }],
    spells: {
      ...makeCharacterFixture().spells,
      spellProfiles: [
        {
          id: 'class:Warlock|PHB',
          type: 'class',
          label: 'Warlock (Lv 2)',
          className: 'Warlock',
          classSource: 'PHB',
          cantrips: [],
          spellsKnown: ['Hex|PHB'],
          preparedSpells: [],
          alwaysPrepared: false,
        },
        {
          id: 'special:unrestricted',
          type: 'special',
          label: 'Special (Unrestricted)',
          cantrips: [],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: true,
        },
      ],
      pactSpellSlots: {
        1: { max: 2, used: 0 },
        2: { max: 0, used: 0 },
        3: { max: 0, used: 0 },
        4: { max: 0, used: 0 },
        5: { max: 0, used: 0 },
        6: { max: 0, used: 0 },
        7: { max: 0, used: 0 },
        8: { max: 0, used: 0 },
        9: { max: 0, used: 0 },
      },
    },
  }),
)

const gameData = {
  ...MINIMAL_GAME_DATA,
  classes: [
    {
      name: 'Warlock',
      source: 'PHB',
      hd: { faces: 8, number: 1 },
      casterProgression: 'pact',
      spellcastingAbility: 'charisma',
      spellsKnownProgression: [2, 3],
      cantripProgression: [2, 2],
      spellSlotProgression: [[1], [2]],
      classFeatures: [],
      classFeatureRefs: [],
    },
  ],
  spells: [
    {
      name: 'Hex',
      source: 'PHB',
      level: 1,
      school: 'E',
      time: [{ number: 1, unit: 'bonus' }],
      range: { type: 'point', distance: { type: 'feet', amount: 90 } },
      components: { v: true, s: true, m: 'the petrified eye of a newt' },
      duration: [{ type: 'timed', duration: { type: 'hour', amount: 1 }, concentration: true }],
      classes: { fromClassList: [{ name: 'Warlock', source: 'PHB' }] },
      entries: ['You place a curse on a creature that you can see within range.'],
    },
  ],
}

test('@focused 2014 Warlock known spells stay active without preparation', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-warlock-known-spells', gameData)
  await seedAppState(page, {
    sourcePath: 'e2e-warlock-known-spells',
    gameData,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-warlock-known-spells', gameData)
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
