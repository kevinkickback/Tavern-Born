import { describe, expect, test } from 'vitest'
import {
  characterUsesContentOutsideCatalog,
  createGameDataAvailabilityIndex,
} from '@/lib/character/additionalContentAvailability'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeSpellFixture,
} from '../fixtures/gameDataFixtures'

function makeIncludedSrdData() {
  return makeGameDataFixture({
    races: [{ name: 'Human', source: 'PHB' }],
    classes: [makeClassFixture({ name: 'Fighter', source: 'PHB', classFeatures: [] })],
    backgrounds: [{ name: 'Soldier', source: 'PHB' }],
    feats: [{ name: 'Grappler', source: 'PHB' }],
    spells: [makeSpellFixture({ name: 'Magic Missile', source: 'PHB' })],
    items: [{ name: 'Longsword', source: 'PHB', type: 'M' }],
  })
}

describe('additional content availability', () => {
  test('accepts source-qualified choices that are present in the Included SRD catalog', () => {
    const character = makeCharacterFixture({
      feats: [{ id: 'grappler', name: 'Grappler', source: 'PHB', description: 'An SRD feat.' }],
      equipment: [
        {
          id: 'longsword',
          name: 'Longsword',
          source: 'PHB',
          type: 'M',
          quantity: 1,
          equipped: true,
        },
      ],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Fighter|PHB',
            type: 'class',
            label: 'Fighter',
            className: 'Fighter',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Magic Missile|PHB'],
            preparedSpells: [],
          },
        ],
      },
    })

    expect(
      characterUsesContentOutsideCatalog(
        character,
        createGameDataAvailabilityIndex(makeIncludedSrdData()),
      ),
    ).toBe(false)
  })

  test('detects non-SRD choices even when they share a PHB source abbreviation', () => {
    const character = makeCharacterFixture({
      feats: [
        {
          id: 'missing-feat',
          name: 'Non-SRD Player Option',
          source: 'PHB',
          description: 'Only available in a user-provided catalog.',
        },
      ],
    })

    expect(
      characterUsesContentOutsideCatalog(
        character,
        createGameDataAvailabilityIndex(makeIncludedSrdData()),
      ),
    ).toBe(true)
  })

  test('detects source-qualified external spells and equipment while ignoring custom unqualified values', () => {
    const base = makeCharacterFixture()
    const external = makeCharacterFixture({
      equipment: [
        {
          id: 'external-item',
          name: 'External Item',
          source: 'XGE',
          type: 'W',
          quantity: 1,
          equipped: false,
        },
      ],
      spells: {
        ...base.spells,
        spellProfiles: [
          {
            ...base.spells.spellProfiles[0],
            spellsKnown: ['External Spell|XGE'],
          },
        ],
      },
    })
    const custom = makeCharacterFixture({
      equipment: [
        {
          id: 'custom-item',
          name: 'Handwritten Keepsake',
          type: 'G',
          quantity: 1,
          equipped: false,
        },
      ],
    })
    const index = createGameDataAvailabilityIndex(makeIncludedSrdData())

    expect(characterUsesContentOutsideCatalog(external, index)).toBe(true)
    expect(characterUsesContentOutsideCatalog(custom, index)).toBe(false)
  })
})
