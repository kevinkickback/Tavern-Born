import { describe, expect, test } from 'vitest'
import { parseRaceSpells } from '@/lib/5etools/raceSpells'

describe('parseRaceSpells', () => {
  test('parses tiefling-style known and innate spell grants', () => {
    const grants = parseRaceSpells([
      {
        known: {
          '1': ['thaumaturgy#c'],
        },
        innate: {
          '3': {
            daily: {
              '1': ['hellish rebuke'],
            },
          },
          '5': {
            daily: {
              '1': ['darkness'],
            },
          },
        },
        ability: 'cha',
      },
    ])

    expect(grants).toEqual(
      expect.arrayContaining([
        {
          spellName: 'thaumaturgy',
          level: 1,
          isCantrip: true,
          castingAbility: 'cha',
          source: 'known',
        },
        {
          spellName: 'hellish rebuke',
          level: 3,
          isCantrip: false,
          castingAbility: 'cha',
          dailyUses: 1,
          source: 'innate',
        },
        {
          spellName: 'darkness',
          level: 5,
          isCantrip: false,
          castingAbility: 'cha',
          dailyUses: 1,
          source: 'innate',
        },
      ]),
    )
  })
})
