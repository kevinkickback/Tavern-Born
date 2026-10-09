import { describe, expect, test } from 'vitest'
import { buildRacialSpellProfile, toRacialProfileId } from '@/lib/calculations/spellProfiles'

describe('toRacialProfileId', () => {
  test('creates id from name and source', () => {
    expect(toRacialProfileId('High Elf', 'PHB')).toBe('racial:High Elf|PHB')
  })

  test('handles missing source', () => {
    expect(toRacialProfileId('Tiefling')).toBe('racial:Tiefling|')
  })
})

describe('buildRacialSpellProfile', () => {
  test('newly supported direct choices cannot inherit a saved nested choice selection', () => {
    const existing = buildRacialSpellProfile({
      raceName: 'Test Race',
      additionalSpells: [{ known: { 2: { _: [{ choose: 'level=1|class=Wizard' }] } } }],
      totalLevel: 2,
    })
    const saved = {
      ...existing,
      choices: existing.choices?.map((choice) => ({ ...choice, selected: ['Find Familiar|PHB'] })),
      spellsKnown: ['Find Familiar|PHB'],
    }
    const updated = buildRacialSpellProfile({
      raceName: 'Test Race',
      additionalSpells: [
        {
          known: {
            1: [{ choose: 'level=0|class=Sorcerer' }],
            2: { _: [{ choose: 'level=1|class=Wizard' }] },
          },
        },
      ],
      totalLevel: 2,
      existingProfile: saved,
    })
    expect(
      updated.choices?.find((choice) => choice.filter?.classes.includes('Sorcerer'))?.selected,
    ).toEqual([])
    expect(
      updated.choices?.find((choice) => choice.filter?.classes.includes('Wizard')),
    ).toMatchObject({
      id: 'choose-0',
      selected: ['Find Familiar|PHB'],
    })
    expect(updated.cantrips).toEqual([])
    expect(updated.spellsKnown).toEqual(['Find Familiar|PHB'])
  })

  test('level-gates direct known choices while retaining ungated choices', () => {
    const additionalSpells = [
      {
        known: {
          _: [{ choose: 'level=0|class=Sorcerer' }],
          5: [{ choose: 'level=1|class=Wizard', count: 2 }],
        },
      },
    ]
    const level1 = buildRacialSpellProfile({
      raceName: 'Test Race',
      additionalSpells,
      totalLevel: 1,
    })
    expect(level1.choices).toEqual([
      {
        id: 'direct-_-choose-0',
        count: 1,
        isCantrip: true,
        selected: [],
        filter: { level: 0, classes: ['Sorcerer'] },
      },
    ])
    const level5 = buildRacialSpellProfile({
      raceName: 'Test Race',
      additionalSpells,
      totalLevel: 5,
    })
    expect(level5.choices).toEqual([
      {
        id: 'direct-5-choose-0',
        count: 2,
        isCantrip: false,
        selected: [],
        filter: { level: 1, classes: ['Wizard'] },
      },
      {
        id: 'direct-_-choose-0',
        count: 1,
        isCantrip: true,
        selected: [],
        filter: { level: 0, classes: ['Sorcerer'] },
      },
    ])
  })

  test('creates profile with fixed spells from single block', () => {
    const profile = buildRacialSpellProfile({
      raceName: 'Tiefling',
      raceSource: 'PHB',
      additionalSpells: [
        {
          known: { '1': ['thaumaturgy#c'] },
          innate: {
            '3': { daily: { '1': ['hellish rebuke'] } },
          },
          ability: 'cha',
        },
      ],
      totalLevel: 3,
    })

    expect(profile.id).toBe('racial:Tiefling|PHB')
    expect(profile.type).toBe('racial')
    expect(profile.label).toBe('Racial Spells')
    expect(profile.raceName).toBe('Tiefling')
    expect(profile.castingAbility).toBe('cha')
    expect(profile.cantrips).toContain('thaumaturgy|PHB')
    expect(profile.spellsKnown).toContain('hellish rebuke|PHB')
    expect(profile.fixedSpells).toEqual(
      expect.arrayContaining(['thaumaturgy|PHB', 'hellish rebuke|PHB']),
    )
  })

  test('respects totalLevel for level-gated spells', () => {
    const profile = buildRacialSpellProfile({
      raceName: 'Tiefling',
      raceSource: 'PHB',
      additionalSpells: [
        {
          known: { '1': ['thaumaturgy#c'] },
          innate: {
            '3': { daily: { '1': ['hellish rebuke'] } },
            '5': { daily: { '1': ['darkness'] } },
          },
          ability: 'cha',
        },
      ],
      totalLevel: 3,
    })

    expect(profile.cantrips).toContain('thaumaturgy|PHB')
    expect(profile.spellsKnown).toContain('hellish rebuke|PHB')
    expect(profile.spellsKnown).not.toContain('darkness|PHB')
  })

  test('creates profile with choose filter choices', () => {
    const profile = buildRacialSpellProfile({
      raceName: 'High Elf',
      raceSource: 'PHB',
      additionalSpells: [
        {
          known: {
            '1': {
              _: [{ choose: 'level=0|class=Wizard' }],
            },
          } as Record<string, string[] | { _: Array<string | { choose: string }> }>,
          ability: 'int',
        },
      ],
      totalLevel: 1,
    })

    expect(profile.choices).toHaveLength(1)
    expect(profile.choices?.[0].filter).toEqual({ level: 0, classes: ['Wizard'] })
    expect(profile.choices?.[0].isCantrip).toBe(true)
    expect(profile.choices?.[0].count).toBe(1)
    expect(profile.fixedSpells).toBeUndefined()
  })

  test('creates pool choice from mutually exclusive blocks', () => {
    const profile = buildRacialSpellProfile({
      raceName: 'Astral Elf',
      raceSource: 'AAG',
      additionalSpells: [
        { known: { '1': ['dancing lights#c'] }, ability: 'int' },
        { known: { '1': ['light#c'] }, ability: 'int' },
        { known: { '1': ['sacred flame#c'] }, ability: 'int' },
      ],
      totalLevel: 1,
    })

    expect(profile.choices).toHaveLength(1)
    expect(profile.choices?.[0].id).toBe('block-choice')
    expect(profile.choices?.[0].pool).toEqual(
      expect.arrayContaining(['dancing lights|PHB', 'light|PHB', 'sacred flame|PHB']),
    )
    expect(profile.choices?.[0].count).toBe(1)
    expect(profile.choices?.[0].isCantrip).toBe(true)
    expect(profile.fixedSpells).toBeUndefined()
  })

  test('preserves existing selections from previous profile', () => {
    const existing = buildRacialSpellProfile({
      raceName: 'Astral Elf',
      raceSource: 'AAG',
      additionalSpells: [
        { known: { '1': ['dancing lights#c'] }, ability: 'int' },
        { known: { '1': ['light#c'] }, ability: 'int' },
        { known: { '1': ['sacred flame#c'] }, ability: 'int' },
      ],
      totalLevel: 1,
    })

    // Simulate user having selected 'light'
    const withSelection = {
      ...existing,
      choices: existing.choices?.map((c) => ({ ...c, selected: ['light|PHB'] })),
      cantrips: ['light|PHB'],
    }

    const rebuilt = buildRacialSpellProfile({
      raceName: 'Astral Elf',
      raceSource: 'AAG',
      additionalSpells: [
        { known: { '1': ['dancing lights#c'] }, ability: 'int' },
        { known: { '1': ['light#c'] }, ability: 'int' },
        { known: { '1': ['sacred flame#c'] }, ability: 'int' },
      ],
      totalLevel: 1,
      existingProfile: withSelection,
    })

    expect(rebuilt.choices?.[0].selected).toEqual(['light|PHB'])
    expect(rebuilt.cantrips).toContain('light|PHB')
  })

  test('preserves qualified selections from native UIDs with default printing', () => {
    const rebuilt = buildRacialSpellProfile({
      raceName: 'Astral Elf',
      raceSource: 'AAG',
      additionalSpells: [
        { known: { '1': ['dancing lights#c'] }, ability: 'int' },
        { known: { '1': ['light#c'] }, ability: 'int' },
      ],
      totalLevel: 1,
      existingProfile: {
        id: toRacialProfileId('Astral Elf', 'AAG'),
        type: 'racial',
        label: 'Racial Spellcasting',
        raceName: 'Astral Elf',
        raceSource: 'AAG',
        cantrips: ['Light|PHB'],
        spellsKnown: [],
        preparedSpells: [],
        choices: [
          {
            id: 'block-choice',
            count: 1,
            isCantrip: true,
            pool: ['dancing lights|PHB', 'light|PHB'],
            selected: ['Light|PHB'],
          },
        ],
      },
    })

    expect(rebuilt.choices?.[0].selected).toEqual(['Light|PHB'])
    expect(rebuilt.cantrips).toContain('Light|PHB')
  })

  test('sets abilityOptions for choose ability blocks', () => {
    const profile = buildRacialSpellProfile({
      raceName: 'Test Race',
      additionalSpells: [
        {
          known: { '1': ['thaumaturgy#c'] },
          ability: { choose: ['int', 'wis', 'cha'] },
        },
      ],
      totalLevel: 1,
    })

    expect(profile.castingAbilityOptions).toEqual(['int', 'wis', 'cha'])
    expect(profile.castingAbility).toBeUndefined()
  })

  test('inherits casting ability from existing profile', () => {
    const existing = buildRacialSpellProfile({
      raceName: 'Test Race',
      additionalSpells: [
        {
          known: { '1': ['thaumaturgy#c'] },
          ability: { choose: ['int', 'wis', 'cha'] },
        },
      ],
      totalLevel: 1,
    })

    const withAbility = { ...existing, castingAbility: 'wis' }

    const rebuilt = buildRacialSpellProfile({
      raceName: 'Test Race',
      additionalSpells: [
        {
          known: { '1': ['thaumaturgy#c'] },
          ability: { choose: ['int', 'wis', 'cha'] },
        },
      ],
      totalLevel: 1,
      existingProfile: withAbility,
    })

    expect(rebuilt.castingAbility).toBe('wis')
  })
})
