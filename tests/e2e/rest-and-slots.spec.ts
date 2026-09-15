import { expect, test } from '@playwright/test'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  ensureStartupPromptResolved,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

const SOURCE_PATH = 'e2e-rest-slot-seed'

const gameData = {
  races: [],
  classes: [
    {
      name: 'Test Caster',
      source: 'TST',
      classFeatures: [],
      classFeatureRefs: [],
      casterProgression: 'full',
      spellcastingAbility: 'intelligence',
      spellSlotProgression: [[2], [3]],
      hd: { number: 1, faces: 8 },
    },
  ],
  backgrounds: [],
  spells: [],
  feats: [],
  items: [],
  itemsBase: [],
  itemProperties: [],
  itemTypes: [],
  classFeatures: [],
  actions: [],
  conditions: [],
  deities: [],
  skills: [],
  senses: [],
  languages: [],
  magicvariants: [],
  optionalfeatures: [],
  variantrules: [],
  trapHazards: [],
  rewards: [],
  cultsBoons: [],
  organizations: [],
  sources: [],
}

const emptyCharacter = makeCharacterFixture()
const character = characterPersistenceSchema.parse(
  makeCharacterFixture({
    id: 'rest-slot-e2e-1',
    version: '10.0.0',
    name: 'Rest Slot E2E',
    class: 'Test Caster',
    classSource: 'TST',
    level: 2,
    classProgression: [{ name: 'Test Caster', source: 'TST', levels: 2 }],
    hitPointsInitialized: true,
    hitPointGains: [],
    hitPointAdjustments: [],
    armorClassAdjustments: [],
    movement: {
      speeds: { walk: 30 },
      source: { kind: 'manual', name: 'Test movement' },
    },
    movementAdjustments: [],
    movementOverrides: {},
    portraitTransform: { zoom: 1, panX: 0, panY: 0, rotation: 0 },
    classChoiceSelections: [],
    manualEffects: [],
    suppressedEffectIds: [],
    effectFlags: {},
    manualActions: [],
    spells: {
      ...emptyCharacter.spells,
      spellProfiles: [
        {
          id: 'class:Test Caster|TST',
          type: 'class',
          label: 'Test Caster (Lv 2)',
          className: 'Test Caster',
          classSource: 'TST',
          cantrips: [],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: false,
        },
        ...(emptyCharacter.spells.spellProfiles ?? []).filter(
          (profile) => profile.id === 'special:unrestricted',
        ),
      ],
    },
  }),
)

async function openCharacterSpells(page: import('@playwright/test').Page) {
  await ensureStartupPromptResolved(page, SOURCE_PATH, gameData)
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Spells' }).click()
  await expect(page).toHaveURL(/\/spells$/)
}

test('spell-slot capacity is display-only in the Builder', async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, SOURCE_PATH, gameData)
  await seedAppState(page, {
    sourcePath: SOURCE_PATH,
    gameData,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await openCharacterSpells(page)

  await expect(page.getByText('Spell Slots')).toBeVisible()
  await expect(page.getByText('Level 1 slots')).toBeVisible()
  await expect(page.getByRole('button', { name: /spend one .* spell slot/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /restore one .* spell slot/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preview a rest' })).toHaveCount(0)
})
