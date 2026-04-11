import { describe, expect, test } from 'vitest'
import {
  formatCapitalized,
  getAsiDisplay,
  getAvailableSubraces,
  getDamageTraitDisplay,
  getDarkvisionDisplay,
  getLanguageDisplay,
  getRaceTraits,
  getSkillProfDisplay,
  getSpeedDisplay,
  mergeRaceWithSubrace,
  toTitleCase,
} from '@/lib/calculations/raceUtils'
import type { Race5e, SkillProficiency } from '@/types/5etools'

function makeRace(overrides: Partial<Race5e> = {}): Race5e {
  return { name: 'Test', source: 'PHB', ...overrides } as Race5e
}

describe('toTitleCase', () => {
  test('title-cases multi-word strings', () => {
    expect(toTitleCase('fire damage')).toBe('Fire Damage')
  })

  test('handles single word', () => {
    expect(toTitleCase('poison')).toBe('Poison')
  })

  test('lowercases uppercase input', () => {
    expect(toTitleCase('FIRE')).toBe('Fire')
  })
})

describe('formatCapitalized', () => {
  test('capitalizes first letter only', () => {
    expect(formatCapitalized('common')).toBe('Common')
  })

  test('handles non-string input', () => {
    expect(formatCapitalized(42)).toBe('42')
    expect(formatCapitalized(null)).toBe('null')
  })

  test('handles empty string', () => {
    expect(formatCapitalized('')).toBe('')
  })
})

describe('getSpeedDisplay', () => {
  test('returns dash for undefined race', () => {
    expect(getSpeedDisplay(undefined)).toBe('—')
  })

  test('formats number speed', () => {
    expect(getSpeedDisplay(makeRace({ speed: 30 }))).toBe('30 ft.')
  })

  test('formats object speed with walk', () => {
    expect(getSpeedDisplay(makeRace({ speed: { walk: 25 } }))).toBe('25 ft.')
  })

  test('returns dash for missing speed', () => {
    expect(getSpeedDisplay(makeRace())).toBe('—')
  })
})

describe('getDarkvisionDisplay', () => {
  test('returns dash for no darkvision', () => {
    expect(getDarkvisionDisplay(makeRace())).toBe('—')
  })

  test('formats darkvision distance', () => {
    expect(getDarkvisionDisplay(makeRace({ darkvision: 60 }))).toBe('60 ft.')
  })

  test('returns dash for zero darkvision', () => {
    expect(getDarkvisionDisplay(makeRace({ darkvision: 0 }))).toBe('—')
  })
})

describe('getDamageTraitDisplay', () => {
  test('returns dash for empty array', () => {
    expect(getDamageTraitDisplay([])).toBe('—')
  })

  test('returns dash for undefined', () => {
    expect(getDamageTraitDisplay(undefined)).toBe('—')
  })

  test('deduplicates and title-cases', () => {
    expect(getDamageTraitDisplay(['fire', 'Fire', 'cold'])).toBe('Fire, Cold')
  })

  test('filters non-string entries', () => {
    expect(getDamageTraitDisplay(['fire', { special: true } as unknown as string])).toBe('Fire')
  })
})

describe('getLanguageDisplay', () => {
  test('returns empty string for no language proficiencies', () => {
    expect(getLanguageDisplay(makeRace())).toBe('')
  })

  test('handles lineage race', () => {
    expect(getLanguageDisplay(makeRace({ lineage: 'VRGR' } as Partial<Race5e>))).toBe(
      'Common, + 1 of your choice',
    )
  })

  test('formats basic language proficiencies', () => {
    const race = makeRace({
      languageProficiencies: [{ common: true, elvish: true }],
    })
    const result = getLanguageDisplay(race)
    expect(result).toContain('Common')
    expect(result).toContain('Elvish')
  })
})

describe('getSkillProfDisplay', () => {
  test('returns empty array for no proficiencies', () => {
    expect(getSkillProfDisplay(makeRace())).toEqual([])
  })

  test('formats fixed skill proficiencies', () => {
    const race = makeRace({
      skillProficiencies: [{ perception: true, stealth: true }],
    })
    const result = getSkillProfDisplay(race)
    expect(result).toContain('Perception')
    expect(result).toContain('Stealth')
  })

  test('formats choose blocks', () => {
    const race = makeRace({
      skillProficiencies: [
        { choose: { from: ['athletics', 'acrobatics'], count: 1 } } as unknown as SkillProficiency,
      ],
    })
    const result = getSkillProfDisplay(race)
    expect(result[0]).toContain('Choose 1')
    expect(result[0]).toContain('Athletics')
    expect(result[0]).toContain('Acrobatics')
  })
})

describe('getAsiDisplay', () => {
  test('returns empty array for undefined race', () => {
    expect(getAsiDisplay(undefined)).toEqual([])
  })

  test('returns lineage options for lineage races', () => {
    const race = makeRace({ lineage: true } as Partial<Race5e>)
    const result = getAsiDisplay(race)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('+1/+2')
  })

  test('formats fixed ability increases', () => {
    const race = makeRace({
      ability: [{ dex: 2 }],
    })
    const result = getAsiDisplay(race)
    expect(result.some((l) => l.includes('DEX') && l.includes('+2'))).toBe(true)
  })
})

describe('getRaceTraits', () => {
  test('returns empty array for undefined race', () => {
    expect(getRaceTraits(undefined)).toEqual([])
  })

  test('filters out Age/Alignment/Size/Speed/Languages entries', () => {
    const race = makeRace({
      entries: [
        { type: 'entries', name: 'Age', entries: ['...'] },
        { type: 'entries', name: 'Darkvision', entries: ['See in dark.'] },
        { type: 'entries', name: 'Size', entries: ['...'] },
      ],
    })
    const traits = getRaceTraits(race)
    expect(traits).toHaveLength(1)
    expect(traits[0].name).toBe('Darkvision')
  })

  test('synthesizes darkvision trait when not in entries', () => {
    const race = makeRace({ darkvision: 60, entries: [] })
    const traits = getRaceTraits(race)
    expect(traits.some((t) => t.name === 'Darkvision')).toBe(true)
  })

  test('does not duplicate darkvision trait', () => {
    const race = makeRace({
      darkvision: 60,
      entries: [
        {
          type: 'entries',
          name: 'Darkvision',
          entries: ['Custom darkvision text.'],
        },
      ],
    })
    const traits = getRaceTraits(race)
    const dvTraits = traits.filter((t) => t.name === 'Darkvision')
    expect(dvTraits).toHaveLength(1)
  })

  test('synthesizes Tool Proficiency from traitTags', () => {
    const race = makeRace({
      traitTags: ['Tool Proficiency'],
      entries: [],
    })
    const traits = getRaceTraits(race)
    expect(traits.some((t) => t.name === 'Tool Proficiency')).toBe(true)
  })
})

describe('mergeRaceWithSubrace', () => {
  test('merges entries from both parent and subrace', () => {
    const parent = makeRace({
      entries: [{ type: 'entries', name: 'A', entries: ['a'] }],
    })
    const subrace = makeRace({
      entries: [{ type: 'entries', name: 'B', entries: ['b'] }],
    })
    const merged = mergeRaceWithSubrace(parent, subrace)
    expect(merged.entries).toHaveLength(2)
  })

  test('unions abilities by default', () => {
    const parent = makeRace({ ability: [{ str: 2 }] })
    const subrace = makeRace({ ability: [{ dex: 1 }] })
    const merged = mergeRaceWithSubrace(parent, subrace)
    expect(merged.ability).toHaveLength(2)
  })

  test('replaces abilities when overwrite flag is set', () => {
    const parent = makeRace({ ability: [{ str: 2 }] })
    const subrace = {
      ...makeRace({ ability: [{ dex: 1 }] }),
      overwrite: { ability: true },
    } as unknown as Race5e
    const merged = mergeRaceWithSubrace(parent, subrace)
    expect(merged.ability).toHaveLength(1)
    expect(merged.ability?.[0]).toEqual({ dex: 1 })
  })

  test('subrace speed overrides parent speed', () => {
    const parent = makeRace({ speed: 30 })
    const subrace = makeRace({ speed: 25 })
    const merged = mergeRaceWithSubrace(parent, subrace)
    expect(merged.speed).toBe(25)
  })

  test('unions resist arrays and deduplicates', () => {
    const parent = makeRace({ resist: ['fire', 'cold'] })
    const subrace = makeRace({ resist: ['fire', 'poison'] })
    const merged = mergeRaceWithSubrace(parent, subrace)
    expect(merged.resist).toEqual(['fire', 'cold', 'poison'])
  })
})

describe('getAvailableSubraces', () => {
  test('returns empty array for no race', () => {
    expect(getAvailableSubraces(undefined)).toEqual([])
  })

  test('filters out subraces without names', () => {
    const race = makeRace({
      subraces: [{ name: 'Wood' } as Race5e, {} as Race5e],
    })
    expect(getAvailableSubraces(race)).toHaveLength(1)
  })
})
