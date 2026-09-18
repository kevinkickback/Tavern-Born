import { expect, test } from '@playwright/test'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import type { GameData } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  ensureStartupPromptResolved,
  MINIMAL_GAME_DATA,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

const sorcerer = {
  name: 'Sorcerer',
  source: 'PHB',
  hd: { faces: 6, number: 1 },
  proficiency: ['con', 'cha'],
  startingProficiencies: { armor: [], weapons: ['daggers'], skills: [] },
  classFeatures: [],
  classFeatureRefs: [],
  casterProgression: 'full',
  spellcastingAbility: 'charisma',
  cantripProgression: [4, 4, 4, 5, 5, 5, 5, 5, 5],
  spellsKnownProgression: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  spellSlotProgression: [
    [2],
    [3],
    [4, 2],
    [4, 3],
    [4, 3, 2],
    [4, 3, 3],
    [4, 3, 3, 1],
    [4, 3, 3, 2],
    [4, 3, 3, 3, 1],
  ],
}

const gameDataBase: GameData = {
  ...MINIMAL_GAME_DATA,
  classes: [sorcerer],
  spells: [
    {
      name: 'Chromatic Orb',
      source: 'PHB',
      level: 1,
      school: 'V',
      time: [{ number: 1, unit: 'action' }],
      range: { type: 'point', distance: { type: 'feet', amount: 90 } },
      components: { v: true, s: true, m: 'a diamond' },
      duration: [{ type: 'instant' }],
      classes: { fromClassList: [{ name: 'Sorcerer', source: 'PHB' }] },
      entries: ['You hurl an orb of elemental energy.'],
    },
    {
      name: 'Hold Monster',
      source: 'PHB',
      level: 5,
      school: 'E',
      time: [{ number: 1, unit: 'action' }],
      range: { type: 'point', distance: { type: 'feet', amount: 90 } },
      components: { v: true, s: true, m: 'a small piece of iron' },
      duration: [{ type: 'timed', duration: { type: 'minute', amount: 1 } }],
      classes: { fromClassList: [{ name: 'Sorcerer', source: 'PHB' }] },
      entries: ['Choose a creature that you can see within range.'],
    },
  ],
}

const gameData: GameData = {
  ...gameDataBase,
  lookups: buildGameDataLookups(gameDataBase),
}

const character = characterPersistenceSchema.parse(
  makeCharacterFixture({
    id: 'sorcerer-spell-replacement-e2e',
    name: 'Sorcerer Spell Replacement',
    classProgression: [{ name: 'Sorcerer', source: 'PHB', levels: 9 }],
    spells: {
      ...makeCharacterFixture().spells,
      spellProfiles: [
        {
          id: 'class:Sorcerer|PHB',
          type: 'class',
          label: 'Sorcerer (Lv 9)',
          className: 'Sorcerer',
          classSource: 'PHB',
          cantrips: [],
          spellsKnown: ['Chromatic Orb|PHB'],
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
    },
    provenance: {
      ...makeCharacterFixture().provenance,
      spells: {
        'chromatic orb': [
          {
            sourceType: 'class',
            sourceName: 'Sorcerer',
            sourceRef: 'PHB',
            grantType: 'choice',
            label: 'Sorcerer',
            spellGrantedAtLevel: 2,
          },
        ],
      },
    },
  }),
)

test('@focused Sorcerer can replace an earlier spell with any currently castable class spell', async ({
  page,
}) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-sorcerer-replacement', gameData)
  await seedAppState(page, {
    sourcePath: 'e2e-sorcerer-replacement',
    gameData,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Class', exact: true }).click()

  await page.getByRole('button', { name: /Level 2 Features/ }).click()
  await page.getByRole('button', { name: 'Replace a spell for level 2' }).click()

  const replacementDialog = page.getByRole('dialog', { name: 'Replace a Spell' })
  await expect(replacementDialog.getByText('Chromatic Orb', { exact: true })).toBeVisible()
  await replacementDialog.getByText('Chromatic Orb', { exact: true }).click()
  const candidateDialog = page.getByRole('dialog', { name: 'Replace: Chromatic Orb' })
  await expect(candidateDialog.getByText(/replacement \(up to 5th-level\)/)).toBeVisible()
  await expect(candidateDialog.getByText('Hold Monster', { exact: true })).toBeVisible()
  await candidateDialog.getByText('Hold Monster', { exact: true }).click()
  await candidateDialog.getByRole('button', { name: 'Confirm' }).click()

  await page.getByRole('link', { name: 'Spells', exact: true }).click()
  const sorcererSpells = page.getByRole('region', { name: /Sorcerer/ })
  await expect(sorcererSpells.getByText('Hold Monster', { exact: true })).toBeVisible()
  await expect(sorcererSpells.getByText('Chromatic Orb', { exact: true })).toHaveCount(0)
})
