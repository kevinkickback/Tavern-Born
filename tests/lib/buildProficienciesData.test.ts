import { describe, expect, test } from 'vitest'
import { prepareToolProficiencySources } from '@/lib/5etools/toolProficiencySource'
import { resolveConcreteToolChoiceCommand } from '@/lib/character/commands/featCommands'
import { addGrant, applyRaceGrants, makeSourceTag } from '@/lib/provenance'
import {
  buildChoiceCounts,
  buildOptionalToolNamesFromChoices,
  buildSkillDescriptions,
  buildToolChoiceSlots,
  buildToolSubtypeOptionsByKind,
  buildVisibleToolCandidates,
  dedupeByNorm,
  formatWeaponCategoryLabel,
  getSelectedToolNames,
  normalizeGenericToolKind,
} from '@/pages/build/proficiencies/model/data'
import type { Item5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const audit = (items: Item5e[]) => prepareToolProficiencySources(items, items)

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
      itemsBase: audit([
        { name: 'Lute', type: 'INS|PHB', rarity: 'none', source: 'PHB' },
        { name: 'Lyre', type: 'INS|PHB', rarity: 'none', source: 'XGE' },
        { name: "Smith's Tools", type: 'AT|PHB', rarity: 'none', source: 'PHB' },
        { name: 'Dice Set', type: 'GS|PHB', rarity: 'none', source: 'PHB' },
        { name: "Thieves' Tools", type: 'T', rarity: 'none', source: 'PHB' },
      ]),
      allowedSources: ['PHB'],
    })

    expect(byKind['musical instrument']).toEqual(['Lute'])
    expect(byKind["artisan's tools"]).toEqual(["Smith's Tools"])
    expect(byKind['gaming set']).toEqual(['Dice Set'])
    expect(byKind.tool).toContain("Thieves' Tools")
  })

  test('buildToolSubtypeOptionsByKind excludes wondrous instruments from musical instrument list', () => {
    const byKind = buildToolSubtypeOptionsByKind({
      itemsBase: audit([{ name: 'Drum', type: 'INS', rarity: 'none', source: 'PHB' }]),
      items: [
        { name: 'Instrument of Illusions', type: 'INS', source: 'XGE', wondrous: true },
        { name: 'Horn of Silent Alarm', type: 'INS|XPHB', source: 'XDMG', wondrous: true },
        { name: "+1 Rhythm-Maker's Drum", type: 'INS', source: 'TCE', wondrous: true },
      ],
    })

    expect(byKind['musical instrument']).toEqual(['Drum'])
  })

  test('buildToolSubtypeOptionsByKind keeps explicit empty source scope empty', () => {
    const byKind = buildToolSubtypeOptionsByKind({
      itemsBase: [{ name: 'Lute', type: 'INS|PHB', rarity: 'none', source: 'PHB' }],
      items: [{ name: 'Dragonchess Set', type: 'GS|XDMG', rarity: 'none', source: 'XDMG' }],
      allowedSources: ['XPHB'],
    })

    expect(byKind['musical instrument']).toEqual([])
    expect(byKind['gaming set']).toEqual([])
    expect(byKind.tool).toEqual([])
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
        id: 'choice-1',
        remaining: 1,
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
        id: 'choice-2',
        remaining: 1,
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

describe('buildVisibleToolCandidates', () => {
  test('removes abstract tool token and duplicates', () => {
    const result = buildVisibleToolCandidates({
      availableTools: ['Lute', "Thieves' Tools"],
      optionalToolNames: ['Lute', 'Lyre'],
      currentTools: [],
      selectedToolNames: [],
    })

    expect(result).toContain('Lute')
    expect(result).toContain('Lyre')
    expect(result).toContain("Thieves' Tools")
    // No duplicates
    expect(result.filter((n) => n === 'Lute')).toHaveLength(1)
  })

  test('keeps abstract categories out of the concrete rows', () => {
    const result = buildVisibleToolCandidates({
      availableTools: [],
      optionalToolNames: [],
      currentTools: ['gaming set', 'one type of gaming set of your choice'],
      selectedToolNames: [],
    })

    expect(result).not.toContain('gaming set')
    expect(result.some((n) => n.toLowerCase().includes('one type'))).toBe(false)
  })

  test("filters out the artisan's tools category label", () => {
    const result = buildVisibleToolCandidates({
      availableTools: ["artisan's tools"],
      optionalToolNames: ["Smith's Tools", "Brewer's Supplies"],
      currentTools: [],
      selectedToolNames: [],
    })

    expect(result).not.toContain("artisan's tools")
    expect(result).toContain("Smith's Tools")
    expect(result).toContain("Brewer's Supplies")
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

describe('formatWeaponCategoryLabel', () => {
  test('returns null for unrecognised keys', () => {
    expect(formatWeaponCategoryLabel('handaxe')).toBeNull()
    expect(formatWeaponCategoryLabel('')).toBeNull()
    expect(formatWeaponCategoryLabel('light crossbow')).toBeNull()
  })

  test('returns broad category label for simple/martial keys', () => {
    expect(formatWeaponCategoryLabel('simple')).toBe('All Simple Weapons')
    expect(formatWeaponCategoryLabel('simple weapons')).toBe('All Simple Weapons')
    expect(formatWeaponCategoryLabel('martial')).toBe('All Martial Weapons')
    expect(formatWeaponCategoryLabel('martial weapons')).toBe('All Martial Weapons')
  })

  test('returns melee/ranged scoped label when qualifier is present', () => {
    expect(formatWeaponCategoryLabel('simple melee')).toBe('All Simple Melee Weapons')
    expect(formatWeaponCategoryLabel('simple ranged')).toBe('All Simple Ranged Weapons')
    expect(formatWeaponCategoryLabel('martial melee')).toBe('All Martial Melee Weapons')
    expect(formatWeaponCategoryLabel('martial ranged')).toBe('All Martial Ranged Weapons')
  })

  test('is case-insensitive', () => {
    expect(formatWeaponCategoryLabel('Simple Melee')).toBe('All Simple Melee Weapons')
    expect(formatWeaponCategoryLabel('MARTIAL')).toBe('All Martial Weapons')
  })
})

const toolPools = {
  tool: ['Drum', 'Flute', 'Dice Set', "Thieves' Tools"],
  'musical instrument': ['Drum', 'Flute'],
  'gaming set': ['Dice Set'],
  "artisan's tools": [],
}

test.each([
  'ERLW',
  'EFA',
])('Warforged %s exact tool grant can be selected, reopened, and removed', (source) => {
  const race = { name: 'Warforged', source, toolProficiencies: [{ any: 1 }] }
  const original = makeCharacterFixture({ race: race.name, raceSource: source })
  const character = {
    ...original,
    provenance: applyRaceGrants(race, undefined, original.provenance),
  }
  const requested = character.provenance.choices.find((row) => row.domain === 'tools')!
  expect(requested).toMatchObject({
    id: 'race:warforged:tools:generic:0',
    chooseCount: 1,
    optionPool: ['tool'],
  })
  const stale = {
    ...requested,
    sourceTag: { ...requested.sourceTag, sourceRef: source === 'ERLW' ? 'EFA' : 'ERLW' },
  }
  expect(
    resolveConcreteToolChoiceCommand(character, stale, 'Drum', true, toolPools).provenanceUpdate,
  ).toBe(character.provenance)
  const tool = "Thieves' Tools"
  const result = resolveConcreteToolChoiceCommand(character, requested, tool, true, toolPools)
  const saved = characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(saved.proficiencies.tools).toContain(tool)
  expect(saved.provenance.proficiencies.tools["thieves' tools"]).toEqual([
    expect.objectContaining({ sourceName: 'Warforged', sourceRef: source, grantType: 'choice' }),
  ])
  expect(
    resolveConcreteToolChoiceCommand(saved, requested, 'Drum', true, toolPools).provenanceUpdate,
  ).toBe(saved.provenance)
  const independentlyGranted = {
    ...saved,
    provenance: addGrant(
      saved.provenance,
      'tools',
      tool,
      makeSourceTag('manual', 'User Choice', 'fixed'),
    ),
  }
  const removed = resolveConcreteToolChoiceCommand(independentlyGranted, requested, tool, false)
  expect(removed.characterPatch.proficiencies?.tools).toContain(tool)
  expect(removed.provenanceUpdate.choices.find((row) => row.id === requested.id)?.selected).toEqual(
    [],
  )
  expect(removed.provenanceUpdate.proficiencies.tools["thieves' tools"]).toEqual([
    expect.objectContaining({ sourceType: 'manual' }),
  ])
})

test('an explicit mixed tool pool spends each declared category only once', () => {
  const original = makeCharacterFixture()
  const choice = {
    id: 'background:urban:tools:choose:0',
    domain: 'tools' as const,
    sourceTag: makeSourceTag('background', 'Urban Bounty Hunter', 'placeholder', 'SCAG'),
    chooseCount: 2,
    optionPool: ['gaming set', 'musical instrument', "Thieves' Tools"],
    selected: ['Drum'],
    status: 'partially-resolved' as const,
  }
  const character = { ...original, provenance: { ...original.provenance, choices: [choice] } }
  expect(
    resolveConcreteToolChoiceCommand(character, choice, 'Flute', true, toolPools).provenanceUpdate,
  ).toBe(character.provenance)
  expect(
    resolveConcreteToolChoiceCommand(character, choice, 'Dice Set', true, toolPools)
      .provenanceUpdate.choices[0]?.selected,
  ).toEqual(['Drum', 'Dice Set'])
})

test('retained item classification can fill a branch without widening new options', () => {
  const original = makeCharacterFixture()
  const choice = {
    id: 'background:urban:tools:choose:0',
    domain: 'tools' as const,
    sourceTag: makeSourceTag('background', 'Urban Bounty Hunter', 'placeholder', 'SCAG'),
    chooseCount: 2,
    optionPool: ['gaming set', 'musical instrument', "Thieves' Tools"],
    selected: ['Bandore'],
    status: 'partially-resolved' as const,
  }
  const character = { ...original, provenance: { ...original.provenance, choices: [choice] } }
  const retained = {
    ...toolPools,
    tool: [...toolPools.tool, 'Bandore'],
    'musical instrument': ['Bandore', ...toolPools['musical instrument']],
  }
  expect(
    resolveConcreteToolChoiceCommand(
      character,
      choice,
      'Flute',
      true,
      toolPools,
      undefined,
      retained,
    ).provenanceUpdate,
  ).toBe(character.provenance)
  expect(
    resolveConcreteToolChoiceCommand(
      character,
      choice,
      'Dice Set',
      true,
      toolPools,
      undefined,
      retained,
    ).provenanceUpdate.choices[0]?.selected,
  ).toEqual(['Bandore', 'Dice Set'])
})

test('an unresolved explicit tool filter cannot grant an unrestricted pick', () => {
  const original = makeCharacterFixture()
  const choice = {
    id: 'background:test:tools:choose:0',
    domain: 'tools' as const,
    sourceTag: makeSourceTag('background', 'Test', 'placeholder', 'TEST'),
    chooseCount: 1,
    optionPool: [],
    selected: [],
    status: 'pending' as const,
  }
  const character = { ...original, provenance: { ...original.provenance, choices: [choice] } }
  expect(
    resolveConcreteToolChoiceCommand(character, choice, 'Drum', true, toolPools).provenanceUpdate,
  ).toBe(character.provenance)
})
