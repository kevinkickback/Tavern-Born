import { describe, expect, test } from 'vitest'
import type { ChoiceRecord } from '@/lib/provenance/types'
import {
  buildArtisanChoiceMap,
  buildChoiceCounts,
  buildOptionalToolNamesFromChoices,
  buildSkillDescriptions,
  buildToolChoiceSlots,
  buildToolSubtypeOptionsByKind,
  buildVisibleToolCandidates,
  dedupeByNorm,
  getSelectedToolNames,
  hasUnresolvedChoiceForKind,
  normalizeGenericToolKind,
} from '@/pages/build/proficiencies/model/data'

describe('buildProficienciesData', () => {
  test('buildSkillDescriptions supports object and array input', () => {
    expect(
      buildSkillDescriptions({
        arcana: { name: 'Arcana', entries: ['lore'] },
      }),
    ).toEqual({ arcana: ['lore'] })

    expect(buildSkillDescriptions([{ name: 'Stealth', entries: ['hide'] }])).toEqual({
      stealth: ['hide'],
    })
  })

  test('buildChoiceCounts returns remaining picks per domain', () => {
    const counts = buildChoiceCounts([
      {
        id: 'skills-1',
        domain: 'skills',
        sourceTag: {
          sourceType: 'class',
          sourceName: 'Rogue',
          grantType: 'choice',
          label: 'Rogue',
        },
        chooseCount: 2,
        optionPool: ['Stealth', 'Acrobatics'],
        selected: ['Stealth'],
        status: 'partially-resolved',
      },
      {
        id: 'tools-1',
        domain: 'tools',
        sourceTag: {
          sourceType: 'background',
          sourceName: 'Urchin',
          grantType: 'choice',
          label: 'Urchin',
        },
        chooseCount: 1,
        optionPool: ["Thieves' Tools"],
        selected: [],
        status: 'pending',
      },
    ])

    expect(counts).toEqual({
      skills: 1,
      armor: 0,
      weapons: 0,
      tools: 1,
      languages: 0,
    })
  })

  test('normalizeGenericToolKind recognizes known generic tokens', () => {
    expect(normalizeGenericToolKind('Any Musical Instrument')).toBe('musical instrument')
    expect(normalizeGenericToolKind("any artisan's tool")).toBe("artisan's tools")
    expect(normalizeGenericToolKind('Any Gaming Set')).toBe('gaming set')
    expect(normalizeGenericToolKind('anyTool')).toBe('tool')
    expect(normalizeGenericToolKind("Thieves' Tools")).toBeNull()
  })

  test('buildToolSubtypeOptionsByKind filters by allowed sources and deduplicates names', () => {
    const byKind = buildToolSubtypeOptionsByKind({
      itemsBase: [
        { name: 'Lute', type: 'INS|PHB', source: 'PHB' },
        { name: 'Lyre', type: 'INS|PHB', source: 'XGE' },
        { name: "Smith's Tools", type: 'AT|PHB', source: 'PHB' },
        { name: 'Dice Set', type: 'GS|PHB', source: 'PHB' },
      ],
      allowedSources: ['PHB'],
    })

    expect(byKind['musical instrument']).toEqual(['Lute'])
    expect(byKind["artisan's tools"]).toEqual(["Smith's Tools"])
    expect(byKind['gaming set']).toEqual(['Dice Set'])
  })

  test('buildToolSubtypeOptionsByKind falls back to global items when allowed-source subset is empty', () => {
    const byKind = buildToolSubtypeOptionsByKind({
      itemsBase: [{ name: 'Lute', type: 'INS|PHB', source: 'PHB' }],
      items: [{ name: 'Dragonchess Set', type: 'GS|XDMG', source: 'XDMG' }],
      allowedSources: ['XPHB'],
    })

    expect(byKind['musical instrument']).toEqual(['Lute'])
    expect(byKind['gaming set']).toEqual(['Dragonchess Set'])
    expect(byKind.tool).toEqual(['Dragonchess Set', 'Lute'])
  })

  test('buildToolChoiceSlots expands remaining generic tool picks into slots', () => {
    const slots = buildToolChoiceSlots({
      choices: [
        {
          id: 'choice-1',
          domain: 'tools',
          sourceTag: {
            sourceType: 'class',
            sourceName: 'Bard',
            grantType: 'choice',
            label: 'Bard',
          },
          chooseCount: 2,
          optionPool: ['any musical instrument'],
          selected: ['Lute'],
          status: 'partially-resolved',
        },
      ],
      selectedTools: ['Lute'],
      toolSubtypeOptionsByKind: {
        'musical instrument': ['Lute', 'Lyre'],
        "artisan's tools": ["Smith's Tools"],
        'gaming set': ['Dice Set'],
        tool: ['Dice Set', 'Lute', 'Lyre', "Smith's Tools"],
      },
    })

    expect(slots).toEqual([
      {
        id: 'choice-1:0',
        choiceId: 'choice-1',
        label: 'musical instrument',
        sourceName: 'Bard',
        options: ['Lyre'],
      },
    ])
  })

  test('buildToolChoiceSlots supports generic any-tool pools', () => {
    const slots = buildToolChoiceSlots({
      choices: [
        {
          id: 'choice-2',
          domain: 'tools',
          sourceTag: {
            sourceType: 'background',
            sourceName: 'Noble',
            grantType: 'choice',
            label: 'Noble',
          },
          chooseCount: 1,
          optionPool: ['anyTool'],
          selected: [],
          status: 'pending',
        },
      ],
      selectedTools: ['Dice Set'],
      toolSubtypeOptionsByKind: {
        'musical instrument': ['Lute'],
        "artisan's tools": ["Smith's Tools"],
        'gaming set': ['Dice Set'],
        tool: ['Dice Set', 'Dragonchess Set', 'Lute', "Smith's Tools"],
      },
    })

    expect(slots).toEqual([
      {
        id: 'choice-2:0',
        choiceId: 'choice-2',
        label: 'tool',
        sourceName: 'Noble',
        options: ['Dragonchess Set', 'Lute', "Smith's Tools"],
      },
    ])
  })
})

describe('dedupeByNorm', () => {
  test('removes duplicates by normalised key', () => {
    expect(dedupeByNorm(['Lute', 'lute', 'Lyre'])).toEqual(['Lute', 'Lyre'])
  })

  test('returns empty for empty input', () => {
    expect(dedupeByNorm([])).toEqual([])
  })
})

describe('hasUnresolvedChoiceForKind', () => {
  const choices: ChoiceRecord[] = [
    {
      id: 'c1',
      domain: 'tools',
      sourceTag: {
        sourceType: 'class' as const,
        sourceName: 'Bard',
        grantType: 'choice' as const,
        label: 'Bard',
      },
      chooseCount: 1,
      optionPool: ['any musical instrument'],
      selected: [],
      status: 'pending' as const,
    },
  ]

  test('returns true when an unfilled slot matches the kind', () => {
    expect(hasUnresolvedChoiceForKind(choices, 'musical instrument')).toBe(true)
  })

  test('returns false when no slot matches', () => {
    expect(hasUnresolvedChoiceForKind(choices, 'gaming set')).toBe(false)
  })

  test('returns false when the choice is fully resolved', () => {
    const resolved = [{ ...choices[0], selected: ['Lute'] }]
    expect(hasUnresolvedChoiceForKind(resolved, 'musical instrument')).toBe(false)
  })
})

describe('buildVisibleToolCandidates', () => {
  test('removes abstract tool token and duplicates', () => {
    const result = buildVisibleToolCandidates({
      availableTools: ['Lute', "Thieves' Tools"],
      optionalToolNames: ['Lute', 'Lyre'],
      artisanToolNames: [],
      currentTools: [],
      selectedToolNames: [],
    })

    expect(result).toContain('Lute')
    expect(result).toContain('Lyre')
    expect(result).toContain("Thieves' Tools")
    // No duplicates
    expect(result.filter((n) => n === 'Lute')).toHaveLength(1)
  })

  test('keeps canonical generic labels and filters verbose placeholders', () => {
    const result = buildVisibleToolCandidates({
      availableTools: [],
      optionalToolNames: [],
      artisanToolNames: [],
      currentTools: ['gaming set', 'one type of gaming set of your choice'],
      selectedToolNames: [],
    })

    expect(result).toContain('gaming set')
    expect(result.some((n) => n.toLowerCase().includes('one type'))).toBe(false)
  })
})

describe('buildArtisanChoiceMap', () => {
  test('maps normalised tool names to choice IDs', () => {
    const map = buildArtisanChoiceMap([
      {
        id: 'slot-1',
        choiceId: 'choice-1',
        label: "artisan's tools",
        sourceName: 'Artificer',
        options: ["Smith's Tools", "Brewer's Supplies"],
      },
    ])

    expect(map.get("smith's tools")).toBe('choice-1')
    expect(map.get("brewer's supplies")).toBe('choice-1')
  })
})

describe('getSelectedToolNames', () => {
  test('collects unique tool names from tool choices', () => {
    const result = getSelectedToolNames([
      {
        id: 'c1',
        domain: 'tools',
        sourceTag: {
          sourceType: 'class' as const,
          sourceName: 'Bard',
          grantType: 'choice' as const,
          label: 'Bard',
        },
        chooseCount: 1,
        optionPool: [],
        selected: ['Lute'],
        status: 'resolved' as const,
      },
      {
        id: 'c2',
        domain: 'skills',
        sourceTag: {
          sourceType: 'class' as const,
          sourceName: 'Bard',
          grantType: 'choice' as const,
          label: 'Bard',
        },
        chooseCount: 1,
        optionPool: [],
        selected: ['Stealth'],
        status: 'resolved' as const,
      },
    ])

    expect(result).toEqual(['Lute'])
  })
})

describe('buildOptionalToolNamesFromChoices', () => {
  test('expands generic tool kinds to concrete names', () => {
    const result = buildOptionalToolNamesFromChoices(
      [
        {
          id: 'c1',
          domain: 'tools',
          sourceTag: {
            sourceType: 'class' as const,
            sourceName: 'Bard',
            grantType: 'choice' as const,
            label: 'Bard',
          },
          chooseCount: 1,
          optionPool: ['any musical instrument'],
          selected: ['Lute'],
          status: 'resolved' as const,
        },
      ],
      {
        'musical instrument': ['Lute', 'Lyre'],
        "artisan's tools": [],
        'gaming set': [],
        tool: ['Lute', 'Lyre'],
      },
    )

    expect(result).toContain('Lute')
    expect(result).toContain('Lyre')
  })
})
