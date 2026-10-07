import { describe, expect, test } from 'vitest'
import { parseChooseFilter, parseRaceSpellBlocks, parseRaceSpells } from '@/lib/5etools/raceSpells'

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

describe('parseChooseFilter', () => {
  test('parses level and class', () => {
    expect(parseChooseFilter('level=0|class=Wizard')).toEqual({
      level: 0,
      classes: ['Wizard'],
    })
  })

  test('parses multiple classes with semicolons', () => {
    expect(parseChooseFilter('level=0|class=Cleric;Druid;Wizard')).toEqual({
      level: 0,
      classes: ['Cleric', 'Druid', 'Wizard'],
    })
  })

  test('defaults level to 0 when missing', () => {
    expect(parseChooseFilter('class=Bard')).toEqual({
      level: 0,
      classes: ['Bard'],
    })
  })
})

describe('parseRaceSpellBlocks', () => {
  test('parses ungated direct known arrays with fixed spells and the supplied choice count', () => {
    const [block] = parseRaceSpellBlocks([
      { known: { _: ['light#c', { choose: 'level=0|class=Sorcerer', count: 2 }] } },
    ])
    expect(block.grants).toEqual([
      expect.objectContaining({ spellName: 'light', level: 0, isCantrip: true, source: 'known' }),
    ])
    expect(block.choices).toEqual([
      {
        id: 'direct-_-choose-0',
        level: 0,
        count: 2,
        isCantrip: true,
        filter: { level: 0, classes: ['Sorcerer'] },
      },
    ])
  })

  test('parses innate direct arrays at ungated and later levels without inventing daily limits', () => {
    const grants = parseRaceSpells([
      { innate: { _: ['light#c'], 3: ['misty step'] }, ability: 'cha' },
    ])
    expect(grants).toEqual([
      {
        spellName: 'misty step',
        level: 3,
        isCantrip: false,
        castingAbility: 'cha',
        source: 'innate',
      },
      { spellName: 'light', level: 0, isCantrip: true, castingAbility: 'cha', source: 'innate' },
    ])
  })

  test.each([0, -1, 1.5])('does not grant a filtered choice with invalid count %s', (count) => {
    const [block] = parseRaceSpellBlocks([
      { known: { _: [{ choose: 'level=0|class=Sorcerer', count }] } },
    ])
    expect(block.choices).toEqual([])
  })

  test('returns empty for undefined input', () => {
    expect(parseRaceSpellBlocks(undefined)).toEqual([])
  })

  test('parses single block with fixed grants', () => {
    const blocks = parseRaceSpellBlocks([
      {
        known: { '1': ['light#c'] },
        ability: 'cha',
      },
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0].grants).toEqual([
      {
        spellName: 'light',
        level: 1,
        isCantrip: true,
        castingAbility: 'cha',
        source: 'known',
      },
    ])
    expect(blocks[0].choices).toEqual([])
    expect(blocks[0].ability).toBe('cha')
  })

  test('parses single block with choose filter (High Elf pattern)', () => {
    const blocks = parseRaceSpellBlocks([
      {
        known: {
          '1': {
            _: [{ choose: 'level=0|class=Wizard' }],
          },
        } as Record<string, string[] | { _: Array<string | { choose: string }> }>,
        ability: 'int',
      },
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0].grants).toEqual([])
    expect(blocks[0].choices).toHaveLength(1)
    expect(blocks[0].choices[0]).toEqual({
      id: 'choose-0',
      level: 1,
      count: 1,
      isCantrip: true,
      filter: { level: 0, classes: ['Wizard'] },
    })
  })

  test('parses mixed fixed and choose in single block', () => {
    const blocks = parseRaceSpellBlocks([
      {
        known: {
          '1': {
            _: ['dancing lights#c', { choose: 'level=0|class=Wizard' }],
          },
        } as Record<string, string[] | { _: Array<string | { choose: string }> }>,
        ability: 'int',
      },
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0].grants).toHaveLength(1)
    expect(blocks[0].grants[0].spellName).toBe('dancing lights')
    expect(blocks[0].choices).toHaveLength(1)
  })

  test('parses mutually exclusive blocks (Astral Elf pattern)', () => {
    const blocks = parseRaceSpellBlocks([
      {
        known: { '1': ['dancing lights#c'] },
        ability: 'int',
      },
      {
        known: { '1': ['light#c'] },
        ability: 'int',
      },
      {
        known: { '1': ['sacred flame#c'] },
        ability: 'int',
      },
    ])

    expect(blocks).toHaveLength(3)
    expect(blocks[0].grants[0].spellName).toBe('dancing lights')
    expect(blocks[1].grants[0].spellName).toBe('light')
    expect(blocks[2].grants[0].spellName).toBe('sacred flame')
  })

  test('parses ability choice option', () => {
    const blocks = parseRaceSpellBlocks([
      {
        known: { '1': ['thaumaturgy#c'] },
        ability: { choose: ['int', 'wis', 'cha'] },
      },
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0].ability).toBeUndefined()
    expect(blocks[0].abilityOptions).toEqual(['int', 'wis', 'cha'])
  })
})
