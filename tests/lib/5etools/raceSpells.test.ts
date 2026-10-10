import { describe, expect, test } from 'vitest'
import { parseChooseFilter, parseRaceSpellBlocks, parseRaceSpells } from '@/lib/5etools/raceSpells'
import type { RaceSpellSchedule } from '@/types/5etools'

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
          spellName: 'thaumaturgy|PHB',
          level: 1,
          isCantrip: true,
          castingAbility: 'cha',
          source: 'known',
        },
        {
          spellName: 'hellish rebuke|PHB',
          level: 3,
          isCantrip: false,
          castingAbility: 'cha',
          dailyUses: 1,
          source: 'innate',
        },
        {
          spellName: 'darkness|PHB',
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
  test.each([
    'level=0|class=;',
    'level=0|class=   ',
    'class= ; ; ',
    'class=Wizard|class=;',
  ])('rejects an explicitly supplied class constraint without names: %s', (filter) => {
    expect(() => parseChooseFilter(filter)).toThrow()
    expect(() => parseRaceSpellBlocks([{ known: { 1: [{ choose: filter }] } }])).toThrow()
  })

  test('keeps level-only unrestricted and trimmed semicolon class constraints distinct', () => {
    expect(parseChooseFilter('level=1')).toEqual({ level: 1, classes: [] })
    expect(parseChooseFilter('class= ; Wizard ; ; Cleric ; ')).toEqual({
      level: 0,
      classes: ['Wizard', 'Cleric'],
    })
  })

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
      expect.objectContaining({
        spellName: 'light|PHB',
        level: 0,
        isCantrip: true,
        source: 'known',
      }),
    ])
    expect(block.choices).toEqual([
      {
        id: '[0,2,true,"known","direct",null,[0,["sorcerer"]],null]',
        source: 'known',
        usage: 'direct',
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
        spellName: 'misty step|PHB',
        level: 3,
        isCantrip: false,
        castingAbility: 'cha',
        source: 'innate',
      },
      {
        spellName: 'light|PHB',
        level: 0,
        isCantrip: true,
        castingAbility: 'cha',
        source: 'innate',
      },
    ])
  })

  test.each([0, -1, 1.5])('rejects a filtered choice with invalid count %s', (count) => {
    expect(() =>
      parseRaceSpellBlocks([{ known: { _: [{ choose: 'level=0|class=Sorcerer', count }] } }]),
    ).toThrow('Invalid native spell choice count.')
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
        spellName: 'light|PHB',
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
      id: '[1,1,true,"known","direct",null,[0,["wizard"]],null]',
      source: 'known',
      usage: 'direct',
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
    expect(blocks[0].grants[0].spellName).toBe('dancing lights|PHB')
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
    expect(blocks[0].grants[0].spellName).toBe('dancing lights|PHB')
    expect(blocks[1].grants[0].spellName).toBe('light|PHB')
    expect(blocks[2].grants[0].spellName).toBe('sacred flame|PHB')
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

test('native bucket identity preserves rest, will, ritual, daily and upcast differences', () => {
  const schedules: RaceSpellSchedule[string][] = [
    { rest: { 1: ['misty step'] } },
    { will: ['misty step'] },
    { ritual: ['misty step'] },
    { daily: { 1: ['misty step'] } },
    { daily: { '1e': ['misty step'] } },
    { daily: { 1: ['misty step#2'] } },
  ]
  const identities = schedules.map((schedule) =>
    parseRaceSpellBlocks([{ innate: { 1: schedule } }])[0].scheduleIdentity.map((identity) => {
      const [source, level, bucket, targets] = JSON.parse(identity)
      return [source, level, bucket, targets.map((target: string) => JSON.parse(target))]
    }),
  )
  expect(identities).toEqual([
    [['innate', 1, 'rest:1', [['misty step|phb', null]]]],
    [['innate', 1, 'will', [['misty step|phb', null]]]],
    [['innate', 1, 'ritual', [['misty step|phb', null]]]],
    [['innate', 1, 'daily:1', [['misty step|phb', null]]]],
    [['innate', 1, 'daily:1e', [['misty step|phb', null]]]],
    [['innate', 1, 'daily:1', [['misty step|phb', '2']]]],
  ])
})

test.each([
  'level=10|class=Wizard',
  'level=zero|class=Wizard',
  'level=0|school=Evocation',
  'level=',
])('rejects unsupported or invalid filter %s with a diagnostic', (filter) => {
  expect(() => parseRaceSpellBlocks([{ known: { _: [{ choose: filter }] } }])).toThrow(
    /native spell filter/,
  )
})

test('descriptors preserve independent native source and usage scopes and daily metadata', () => {
  const [block] = parseRaceSpellBlocks([
    {
      known: { 1: [{ choose: 'level=0|class=Wizard' }] },
      innate: {
        1: {
          daily: {
            1: [{ choose: 'level=0|class=Wizard' }],
            2: [{ choose: 'level=0|class=Wizard' }],
          },
          rest: { 1: [{ choose: 'level=0|class=Wizard' }] },
        },
      },
    },
  ])
  expect(
    block.choices.map((choice) => ({
      source: choice.source,
      usage: choice.usage,
      dailyUses: choice.dailyUses,
    })),
  ).toEqual([
    { source: 'known', usage: 'direct', dailyUses: undefined },
    { source: 'innate', usage: 'rest:1', dailyUses: undefined },
    { source: 'innate', usage: 'daily:1', dailyUses: 1 },
    { source: 'innate', usage: 'daily:2', dailyUses: 2 },
  ])
  expect(new Set(block.choices.map((choice) => choice.id)).size).toBe(4)
})

test('native proficiency-based daily grants retain the supplied expression', () => {
  const [block] = parseRaceSpellBlocks([
    { innate: { 3: { daily: { pb: ['speak with animals|xphb'] } } } },
  ])
  expect(block.grants).toEqual([
    {
      spellName: 'speak with animals|xphb',
      level: 3,
      isCantrip: false,
      castingAbility: undefined,
      source: 'innate',
      dailyUses: 'pb',
    },
  ])
})
