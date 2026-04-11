import { describe, expect, test } from 'vitest'
import {
  featCategoryToFull,
  getFeatureTypes,
  getOptFeatureTotal,
  isNormallySelectableFeat,
  isNormallySelectableFeatCategory,
  optFeatureTypeToFull,
  resolveSubclassFeatureRefs,
} from '@/lib/5etools/classData'

const ABJURATION_REF = {
  type: 'refSubclassFeature',
  subclassFeature: 'Arcane Ward|Wizard||Abjuration|PHB|2',
  feature: { entries: ['Abjuration content here.'] },
}

const CHRONURGY_REF = {
  type: 'refSubclassFeature',
  subclassFeature: 'Chronal Shift|Wizard||Chronurgy|EGW|2',
  feature: { entries: ['Chronurgy content here.'] },
}

describe('resolveSubclassFeatureRefs', () => {
  test('expands refs matching the selected subclass and removes others', () => {
    const entries = ['Some text.', ABJURATION_REF, CHRONURGY_REF]
    const result = resolveSubclassFeatureRefs(entries, 'Abjuration')

    expect(result).toContain('Some text.')
    expect(result).toContain('Abjuration content here.')
    expect(result).not.toContain('Chronurgy content here.')
  })

  test('filters out all refs when no subclass is selected', () => {
    const entries = ['Some text.', ABJURATION_REF, CHRONURGY_REF]
    const result = resolveSubclassFeatureRefs(entries, undefined)

    expect(result).toContain('Some text.')
    expect(result).not.toContain('Abjuration content here.')
    expect(result).not.toContain('Chronurgy content here.')
  })

  test('falls back to feature name string when feature is not yet resolved', () => {
    const unresolved = [
      {
        type: 'refSubclassFeature',
        subclassFeature: 'Arcane Ward|Wizard||Abjuration|PHB|2',
      },
    ]
    const result = resolveSubclassFeatureRefs(unresolved, 'Abjuration')
    expect(result).toContain('Arcane Ward')
  })

  test('passes non-ref string entries through unchanged', () => {
    const result = resolveSubclassFeatureRefs(['plain text'], 'Abjuration')
    expect(result).toEqual(['plain text'])
  })

  test('passes non-ref object entries through unchanged', () => {
    const nested = { type: 'entries', name: 'Foo', entries: ['bar'] }
    const result = resolveSubclassFeatureRefs([nested], 'Abjuration')
    expect(result[0]).toMatchObject({ type: 'entries', name: 'Foo' })
  })

  test('recurses into nested entries objects to resolve inner refs', () => {
    const wrapper = {
      type: 'entries',
      name: 'Wrapper',
      entries: [ABJURATION_REF, CHRONURGY_REF],
    }
    const result = resolveSubclassFeatureRefs([wrapper], 'Abjuration') as Array<{
      entries?: unknown[]
    }>
    expect(result[0]?.entries).toContain('Abjuration content here.')
    expect(result[0]?.entries).not.toContain('Chronurgy content here.')
  })

  test('returns empty array for empty input', () => {
    expect(resolveSubclassFeatureRefs([], 'Abjuration')).toEqual([])
  })
})

describe('getFeatureTypes', () => {
  test('returns the featureType array when it is already an array', () => {
    expect(getFeatureTypes({ name: 'Invocations', featureType: ['EI', 'EI:PB'] })).toEqual([
      'EI',
      'EI:PB',
    ])
  })

  test('wraps a single string featureType in an array', () => {
    expect(getFeatureTypes({ name: 'Fighting Style', featureType: 'FS:F' })).toEqual(['FS:F'])
  })

  test('returns array with empty string when featureType is absent', () => {
    expect(getFeatureTypes({ name: 'Unknown' })).toEqual([''])
  })
})

describe('getOptFeatureTotal', () => {
  test('reads from array progression by level index (1-based)', () => {
    expect(getOptFeatureTotal([1, 1, 2, 2, 3], 3)).toBe(2)
  })

  test('returns 0 for level 0 with array progression', () => {
    expect(getOptFeatureTotal([1, 2, 3], 0)).toBe(0)
  })

  test('reads the highest applicable value from a record progression', () => {
    expect(getOptFeatureTotal({ '1': 1, '5': 2, '11': 3 }, 7)).toBe(2)
  })

  test('returns 0 when no record keys apply for the given level', () => {
    expect(getOptFeatureTotal({ '5': 1, '11': 2 }, 3)).toBe(0)
  })
})

describe('optFeatureTypeToFull', () => {
  test('resolves known abbreviations to full names', () => {
    expect(optFeatureTypeToFull('EI')).toBe('Eldritch Invocation')
    expect(optFeatureTypeToFull('MM')).toBe('Metamagic')
    expect(optFeatureTypeToFull('AI')).toBe('Artificer Infusion')
    expect(optFeatureTypeToFull('FS:F')).toBe('Fighting Style; Fighter')
    expect(optFeatureTypeToFull('PB')).toBe('Pact Boon')
    expect(optFeatureTypeToFull('MV')).toBe('Maneuver')
  })

  test('passes unknown abbreviations through unchanged', () => {
    expect(optFeatureTypeToFull('UNKNOWN')).toBe('UNKNOWN')
    expect(optFeatureTypeToFull('')).toBe('')
  })
})

describe('featCategoryToFull', () => {
  test('resolves known feat category abbreviations', () => {
    expect(featCategoryToFull('D')).toBe('Dragonmark')
    expect(featCategoryToFull('G')).toBe('General')
    expect(featCategoryToFull('O')).toBe('Origin')
    expect(featCategoryToFull('FS')).toBe('Fighting Style')
    expect(featCategoryToFull('EB')).toBe('Epic Boon')
    expect(featCategoryToFull('FS:P')).toBe('Fighting Style Replacement (Paladin)')
  })

  test('passes unknown category abbreviations through unchanged', () => {
    expect(featCategoryToFull('UNKNOWN')).toBe('UNKNOWN')
    expect(featCategoryToFull('')).toBe('')
  })
})

describe('isNormallySelectableFeatCategory', () => {
  test('allows standard feat categories in the generic feat picker', () => {
    expect(isNormallySelectableFeatCategory(undefined)).toBe(true)
    expect(isNormallySelectableFeatCategory('')).toBe(true)
    expect(isNormallySelectableFeatCategory('G')).toBe(true)
    expect(isNormallySelectableFeatCategory('D')).toBe(true)
    expect(isNormallySelectableFeatCategory('FS')).toBe(true)
  })

  test('blocks non-standard feat categories from the generic feat picker', () => {
    expect(isNormallySelectableFeatCategory('O')).toBe(false)
    expect(isNormallySelectableFeatCategory('EB')).toBe(false)
    expect(isNormallySelectableFeatCategory('FS:P')).toBe(false)
    expect(isNormallySelectableFeatCategory('FS:R')).toBe(false)
  })
})

describe('isNormallySelectableFeat', () => {
  test('delegates to category-based feat selection rules', () => {
    expect(isNormallySelectableFeat({ category: 'G' })).toBe(true)
    expect(isNormallySelectableFeat({ category: 'O' })).toBe(false)
  })
})
