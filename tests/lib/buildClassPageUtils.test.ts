import { describe, expect, test } from 'vitest'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import {
  buildFeatModalFeats,
  buildLevelsToShow,
  countTotalAsiAcrossClasses,
  countTotalFeatSlots,
  filterClassSpells,
} from '@/pages/build/class/model/pageUtils'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

function makeLookup(classes: Class5e[]): {
  byKey: Record<string, Class5e | undefined>
} {
  const byKey: Record<string, Class5e | undefined> = {}
  for (const cls of classes) {
    byKey[`${cls.name}|${cls.source ?? ''}`] = cls
  }
  return { byKey }
}

describe('buildClassPageUtils', () => {
  test('getCharacterClassEntries uses classProgression when present', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Fighter', source: 'PHB', levels: 3 },
        { name: 'Wizard', source: 'PHB', levels: 2 },
      ],
    })

    expect(getCharacterClassEntries(character)).toEqual(character.classProgression)
  })

  test('countTotalAsiAcrossClasses sums ASI levels across multiclass progression', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Fighter', source: 'PHB', levels: 6 },
        { name: 'Wizard', source: 'PHB', levels: 4 },
      ],
    })

    const fighter = makeClassFixture({
      name: 'Fighter',
      source: 'PHB',
      classFeatureRefs: [
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 4,
        },
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 6,
        },
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 8,
        },
      ],
    })
    const wizard = makeClassFixture({
      name: 'Wizard',
      source: 'PHB',
      classFeatureRefs: [
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Wizard',
          level: 4,
        },
      ],
    })

    const { byKey } = makeLookup([fighter, wizard])

    expect(
      countTotalAsiAcrossClasses({
        classProgression: getCharacterClassEntries(character),
        character,
        classLookup: byKey,
      }),
    ).toBe(3)
  })

  test('countTotalFeatSlots subtracts ASI choices from earned ASI slots', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 8 }],
      asiChoices: [
        {
          id: 'asi-fighter-4',
          className: 'Fighter',
          classSource: 'PHB',
          level: 4,
          abilityChanges: { strength: 2 },
        },
      ],
    }) as Character

    const fighter = makeClassFixture({
      name: 'Fighter',
      source: 'PHB',
      classFeatureRefs: [
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 4,
        },
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 6,
        },
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 8,
        },
      ],
    })
    const { byKey } = makeLookup([fighter])

    expect(
      countTotalFeatSlots({
        classProgression: getCharacterClassEntries(character),
        character,
        classLookup: byKey,
      }),
    ).toBe(2)
  })

  test('buildLevelsToShow merges feature, asi, subclass, spell, and progression trigger levels', () => {
    const levels = buildLevelsToShow({
      allClassFeatures: [{ level: 1 }, { level: 3 }, { level: 9 }],
      asiLevels: [4, 8, 12],
      subclassLevel: 3,
      viewingClassLevel: 8,
      spellChoicesByLevel: new Map([
        [1, { cantrips: 2 }],
        [5, { spells: 2 }],
      ]),
      classChoiceLevels: [2, 8, 10],
    })

    expect(levels).toEqual([1, 2, 3, 4, 5, 8])
  })

  test('buildFeatModalFeats keeps available feats and appends selected missing feats', () => {
    const merged = buildFeatModalFeats({
      availableFeats: [
        { name: 'Alert', source: 'PHB', entries: [] },
        { name: 'Lucky', source: 'PHB', entries: [] },
      ],
      selectedFeats: [
        { name: 'Alert', source: 'PHB' },
        { name: 'Custom Feat', source: 'HOMEBREW' },
      ],
      createFallback: (selected) => ({
        name: selected.name,
        source: selected.source,
        entries: [],
      }),
    })

    expect(merged.map((feat) => `${feat.name}|${feat.source}`)).toEqual([
      'Alert|PHB',
      'Lucky|PHB',
      'Custom Feat|HOMEBREW',
    ])
  })

  test('filterClassSpells keeps only matching class spells', () => {
    const spells = [
      {
        name: 'Magic Missile',
        classes: { fromClassList: [{ name: 'Wizard' }] },
      },
      {
        name: 'Cure Wounds',
        classes: { fromClassList: [{ name: 'Cleric' }] },
      },
      {
        name: 'Universal Spell',
        classes: { fromClassList: [] },
      },
    ]

    expect(filterClassSpells(spells, 'Wizard').map((spell) => spell.name)).toEqual([
      'Magic Missile',
    ])
  })
})
