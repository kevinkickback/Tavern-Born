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
    expect(profile.cantrips).toContain('thaumaturgy')
    expect(profile.spellsKnown).toContain('hellish rebuke')
    expect(profile.fixedSpells).toEqual(expect.arrayContaining(['thaumaturgy', 'hellish rebuke']))
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

    expect(profile.cantrips).toContain('thaumaturgy')
    expect(profile.spellsKnown).toContain('hellish rebuke')
    expect(profile.spellsKnown).not.toContain('darkness')
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
      expect.arrayContaining(['dancing lights', 'light', 'sacred flame']),
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
      choices: existing.choices?.map((c) => ({ ...c, selected: ['light'] })),
      cantrips: ['light'],
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

    expect(rebuilt.choices?.[0].selected).toEqual(['light'])
    expect(rebuilt.cantrips).toContain('light')
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
