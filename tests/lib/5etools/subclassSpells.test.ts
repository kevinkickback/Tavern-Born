import { describe, expect, test } from 'vitest'
import { parseSubclassSpells } from '@/lib/5etools/subclassSpells'

describe('parseSubclassSpells', () => {
  test('parses prepared, known, and expanded spells up to current class level', () => {
    const grants = parseSubclassSpells(
      [
        {
          prepared: {
            '1': ['bless', 'cure wounds'],
            '5': ['beacon of hope'],
          },
          known: {
            '3': ['misty step'],
          },
          expanded: {
            '1': ['burning hands|PHB', 'light#c'],
          },
          innate: {
            '3': {
              daily: {
                '1': ['misty step'],
              },
            },
          },
        },
      ],
      3,
    )

    expect(grants).toEqual([
      { spellName: 'bless', level: 1, isCantrip: false, mode: 'prepared' },
      { spellName: 'cure wounds', level: 1, isCantrip: false, mode: 'prepared' },
      { spellName: 'misty step', level: 3, isCantrip: false, mode: 'known' },
      { spellName: 'burning hands', level: 1, isCantrip: false, mode: 'expanded' },
      { spellName: 'light', level: 1, isCantrip: true, mode: 'expanded' },
      { spellName: 'misty step', level: 3, isCantrip: false, mode: 'innate' },
    ])
  })

  test('returns no grants for missing additional spells or invalid class level', () => {
    expect(parseSubclassSpells(undefined, 2)).toEqual([])
    expect(parseSubclassSpells([], 2)).toEqual([])
    expect(parseSubclassSpells([{ prepared: { '1': ['bless'] } }], 0)).toEqual([])
  })

  test('source-preserving decoding retains printings and accepts cantrip suffixes on either side', () => {
    const blocks = [
      {
        prepared: { 1: ['light#c|PHB', 'druidcraft|XPHB#c', 'bless|PHB#2', '|PHB'] },
        known: { 1: ['misty step|TCE'] },
        expanded: { 1: ['burning hands|PHB'] },
        innate: { 1: { daily: { '1': ['mage hand|XPHB#c'] } } },
      },
    ]
    expect(parseSubclassSpells(blocks, 1, { preserveSource: true })).toEqual([
      { spellName: 'light|PHB', level: 1, isCantrip: true, mode: 'prepared' },
      { spellName: 'druidcraft|XPHB', level: 1, isCantrip: true, mode: 'prepared' },
      { spellName: 'bless|PHB', level: 1, isCantrip: false, mode: 'prepared' },
      { spellName: 'misty step|TCE', level: 1, isCantrip: false, mode: 'known' },
      { spellName: 'burning hands|PHB', level: 1, isCantrip: false, mode: 'expanded' },
      { spellName: 'mage hand|XPHB', level: 1, isCantrip: true, mode: 'innate' },
    ])
    expect(parseSubclassSpells(blocks, 1)).toEqual([
      { spellName: 'light', level: 1, isCantrip: true, mode: 'prepared' },
      { spellName: 'druidcraft', level: 1, isCantrip: false, mode: 'prepared' },
      { spellName: 'bless', level: 1, isCantrip: false, mode: 'prepared' },
      { spellName: 'misty step', level: 1, isCantrip: false, mode: 'known' },
      { spellName: 'burning hands', level: 1, isCantrip: false, mode: 'expanded' },
      { spellName: 'mage hand', level: 1, isCantrip: false, mode: 'innate' },
    ])
  })
})
