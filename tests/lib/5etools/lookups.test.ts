import { describe, expect, test } from 'vitest'
import {
  buildGameDataLookups,
  buildSpellLookup,
  getEntityLookupKey,
  getSubclassLookupKey,
} from '@/lib/5etools/lookups'
import { makeClassFixture, makeSpellFixture } from '../../fixtures/gameDataFixtures'

describe('5etools/lookups', () => {
  test('buildGameDataLookups creates composite-key lookups for classes, spells, features, optional features, and subclasses', () => {
    const subclass = {
      name: 'School of Evocation',
      shortName: 'Evocation',
      source: 'PHB',
      className: 'Wizard',
      classSource: 'PHB',
    }

    const lookups = buildGameDataLookups({
      races: [],
      classes: [makeClassFixture({ subclasses: [subclass] })],
      backgrounds: [],
      spells: [makeSpellFixture()],
      feats: [],
      items: [],
      itemsBase: [],
      classFeatures: [
        {
          name: 'Arcane Recovery',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
        },
      ],
      actions: [],
      conditions: [],
      deities: [],
      skills: [],
      senses: [],
      languages: [],
      magicvariants: [],
      optionalfeatures: [{ name: 'Cantrip Formulas', source: 'TCE' }],
      variantrules: [],
      trapHazards: [],
      rewards: [],
      cultsBoons: [],
      organizations: [],
      sources: [],
    })

    expect(lookups.classesByKey[getEntityLookupKey('Wizard', 'PHB')]).toBeTruthy()
    expect(lookups.classFeaturesByKey[getEntityLookupKey('Arcane Recovery', 'PHB')]).toBeTruthy()
    expect(lookups.spellsByKey[getEntityLookupKey('Magic Missile', 'PHB')]).toBeTruthy()
    expect(
      lookups.optionalFeaturesByKey[getEntityLookupKey('Cantrip Formulas', 'TCE')],
    ).toBeTruthy()
    expect(
      lookups.subclassesByKey[getSubclassLookupKey('Wizard', 'PHB', 'Evocation', 'PHB')],
    ).toMatchObject({ name: 'School of Evocation' })
    expect(lookups.itemLookup).toBeInstanceOf(Map)
  })
})

describe('buildSpellLookup', () => {
  test('indexes spells by name|source composite key', () => {
    const missile = makeSpellFixture({
      name: 'Magic Missile',
      source: 'PHB',
      level: 1,
    })
    const fireball = makeSpellFixture({
      name: 'Fireball',
      source: 'PHB',
      level: 3,
    })
    const lookup = buildSpellLookup([missile, fireball])

    expect(lookup[getEntityLookupKey('Magic Missile', 'PHB')]).toBe(missile)
    expect(lookup[getEntityLookupKey('Fireball', 'PHB')]).toBe(fireball)
  })

  test('cantrips (level 0) are correctly stored and distinguishable from non-cantrips', () => {
    const cantrip = makeSpellFixture({
      name: 'Fire Bolt',
      source: 'PHB',
      level: 0,
    })
    const spell = makeSpellFixture({
      name: 'Burning Hands',
      source: 'PHB',
      level: 1,
    })
    const lookup = buildSpellLookup([cantrip, spell])

    expect(lookup[getEntityLookupKey('Fire Bolt', 'PHB')]?.level).toBe(0)
    expect(lookup[getEntityLookupKey('Burning Hands', 'PHB')]?.level).toBe(1)

    // Simulate the cantrip/known-spell split used in BuildClassPage and SpellsPage.
    const names = ['Fire Bolt', 'Burning Hands']
    const spellByName = new Map(Object.values(lookup).map((s) => [s.name, s]))
    expect(names.filter((n) => spellByName.get(n)?.level === 0)).toEqual(['Fire Bolt'])
    expect(names.filter((n) => spellByName.get(n)?.level !== 0)).toEqual(['Burning Hands'])
  })

  test('first entry wins when duplicate name|source keys are present', () => {
    const first = makeSpellFixture({
      name: 'Magic Missile',
      source: 'PHB',
      level: 1,
    })
    const duplicate = makeSpellFixture({
      name: 'Magic Missile',
      source: 'PHB',
      level: 2,
    })
    const lookup = buildSpellLookup([first, duplicate])

    expect(lookup[getEntityLookupKey('Magic Missile', 'PHB')]).toBe(first)
  })

  test('returns empty object for empty input', () => {
    expect(buildSpellLookup([])).toEqual({})
  })

  test('returns undefined for a name not in the lookup (mirrors spellByName.get() undefined behavior)', () => {
    const lookup = buildSpellLookup([makeSpellFixture()])
    expect(lookup[getEntityLookupKey('Unknown Spell', 'PHB')]).toBeUndefined()
  })
})
