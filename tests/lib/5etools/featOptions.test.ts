import { describe, expect, test } from 'vitest'
import {
  deriveFeatOptionSteps,
  deriveSpellStepsForClass,
  hasFeatOptions,
  parseFeatSpellFilter,
} from '@/lib/5etools/parsers/featOptions'
import type { Feat5e } from '@/types/5etools'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFeat(overrides: Partial<Feat5e> = {}): Feat5e {
  return {
    name: 'Test Feat',
    source: 'PHB',
    ...overrides,
  } as Feat5e
}

// ── parseFeatSpellFilter ──────────────────────────────────────────────────────

describe('parseFeatSpellFilter', () => {
  test('parses a single level filter', () => {
    expect(parseFeatSpellFilter('level=0')).toEqual({ level: [0] })
  })

  test('parses multiple levels separated by semicolon', () => {
    expect(parseFeatSpellFilter('level=1;2')).toEqual({ level: [1, 2] })
  })

  test('parses school filter', () => {
    expect(parseFeatSpellFilter('school=V')).toEqual({ school: ['V'] })
  })

  test('parses class filter', () => {
    expect(parseFeatSpellFilter('class=Wizard')).toEqual({ className: 'Wizard' })
  })

  test('parses combined level and class filter', () => {
    expect(parseFeatSpellFilter('level=0|class=Bard')).toEqual({
      level: [0],
      className: 'Bard',
    })
  })

  test('returns empty object for empty string', () => {
    expect(parseFeatSpellFilter('')).toEqual({})
  })

  test('ignores unknown filter segments', () => {
    expect(parseFeatSpellFilter('unknown=foo')).toEqual({})
  })
})

// ── deriveFeatOptionSteps ─────────────────────────────────────────────────────

describe('deriveFeatOptionSteps', () => {
  test('returns [] for a feat with no choices', () => {
    expect(deriveFeatOptionSteps(makeFeat())).toEqual([])
  })

  test('derives an abilityScore step from ability[].choose', () => {
    const feat = makeFeat({
      ability: [{ choose: { from: ['str', 'dex', 'con'], count: 1 } }],
    })
    const steps = deriveFeatOptionSteps(feat)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('abilityScore')
    expect((steps[0] as { from: string[] }).from).toEqual(['str', 'dex', 'con'])
  })

  test('derives a skill proficiency step from skillProficiencies[].choose', () => {
    const feat = makeFeat({
      skillProficiencies: [{ choose: { from: ['Acrobatics', 'Athletics'], count: 1 } }],
    })
    const steps = deriveFeatOptionSteps(feat)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('proficiency')
    expect((steps[0] as { domain: string }).domain).toBe('skills')
    expect((steps[0] as { count: number }).count).toBe(1)
  })

  test('derives a language proficiency step from languageProficiencies[].any', () => {
    const feat = makeFeat({ languageProficiencies: [{ any: 1 }] })
    const steps = deriveFeatOptionSteps(feat)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('proficiency')
    expect((steps[0] as { domain: string }).domain).toBe('languages')
  })

  test('derives a spellcastingClass step for multi-entry additionalSpells', () => {
    const feat = makeFeat({
      additionalSpells: [
        { name: 'Bard', known: { _: [{ choose: 'level=0', count: 1 }] } },
        { name: 'Wizard', known: { _: [{ choose: 'level=0', count: 1 }] } },
      ],
    })
    const steps = deriveFeatOptionSteps(feat)
    expect(steps[0].kind).toBe('spellcastingClass')
    expect(
      (steps[0] as { classOptions: Array<{ name: string }> }).classOptions.map((c) => c.name),
    ).toEqual(['Bard', 'Wizard'])
  })

  test('derives spell steps directly for a single-entry additionalSpells', () => {
    const feat = makeFeat({
      additionalSpells: [{ known: { _: [{ choose: 'level=1', count: 1 }] } }],
    })
    const steps = deriveFeatOptionSteps(feat)
    expect(steps[0].kind).toBe('spells')
    expect((steps[0] as { count: number }).count).toBe(1)
  })

  test('derives an expertise step', () => {
    const feat = makeFeat({ expertise: [{ skills: ['anyProficientSkill'] }] })
    const steps = deriveFeatOptionSteps(feat)
    expect(steps[0].kind).toBe('expertise')
  })

  test('derives an optionalFeature step', () => {
    const feat = makeFeat({
      optionalfeatureProgression: [{ name: 'Fighting Style', featureType: ['FS:F'] }],
    })
    const steps = deriveFeatOptionSteps(feat)
    expect(steps[0].kind).toBe('optionalFeature')
    expect((steps[0] as { featureType: string }).featureType).toBe('FS:F')
  })
})

// ── hasFeatOptions ────────────────────────────────────────────────────────────

describe('hasFeatOptions', () => {
  test('returns false for a feat with no choices', () => {
    expect(hasFeatOptions(makeFeat())).toBe(false)
  })

  test('returns true for a feat with ability choices', () => {
    const feat = makeFeat({ ability: [{ choose: { from: ['str', 'dex'], count: 1 } }] })
    expect(hasFeatOptions(feat)).toBe(true)
  })
})

// ── deriveSpellStepsForClass ──────────────────────────────────────────────────

describe('deriveSpellStepsForClass', () => {
  const magicInitiateFeat = makeFeat({
    additionalSpells: [
      {
        name: 'Bard',
        known: {
          _: [
            { choose: 'level=0', count: 2 },
            { choose: 'level=1', count: 1 },
          ],
        },
      },
      {
        name: 'Wizard',
        known: { _: [{ choose: 'level=0', count: 2 }] },
      },
    ],
  })

  test('returns spell steps for the matching class name', () => {
    const steps = deriveSpellStepsForClass(magicInitiateFeat, 'Bard')
    expect(steps).toHaveLength(2)
    expect(steps[0].count).toBe(2)
    expect(steps[0].chooseFilter).toBe('level=0')
    expect(steps[1].count).toBe(1)
    expect(steps[1].chooseFilter).toBe('level=1')
  })

  test('returns [] for an unknown class name', () => {
    expect(deriveSpellStepsForClass(magicInitiateFeat, 'Sorcerer')).toEqual([])
  })

  test('returns [] when feat has no additionalSpells', () => {
    expect(deriveSpellStepsForClass(makeFeat(), 'Bard')).toEqual([])
  })

  test('includes human-readable labels on each step', () => {
    const steps = deriveSpellStepsForClass(magicInitiateFeat, 'Bard')
    expect(steps[0].label).toContain('cantrip')
    expect(steps[1].label).toContain('1st-level')
  })
})
