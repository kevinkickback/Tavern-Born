import { describe, expect, test } from 'vitest'
import { getClassSummary, getEntitySummary, getRaceSummary } from '@/lib/calculations/entrySummary'

describe('getEntitySummary', () => {
  test('extracts summary from primary entries', () => {
    const result = getEntitySummary({
      entries: [
        {
          type: 'entries',
          name: 'Overview',
          entries: [
            'A disciplined arcane scholar who specializes in prepared spellcasting and flexible utility magic.',
          ],
        },
      ],
    })

    expect(result).toContain('disciplined arcane scholar')
  })

  test('falls back to fluff entries when primary entries are missing', () => {
    const result = getEntitySummary({
      fluffEntries: [
        {
          type: 'entries',
          entries: [
            'Raised in ancient halls, these folk keep old traditions alive while adapting to new threats.',
          ],
        },
      ],
    })

    expect(result).toContain('ancient halls')
  })

  test('returns null when no usable text exists', () => {
    expect(getEntitySummary({ entries: [] })).toBeNull()
  })
})

describe('getClassSummary', () => {
  test('prefers fluff entries over primary entries', () => {
    const result = getClassSummary({
      entries: ['Short generic class summary.'],
      fluffEntries: [
        'Wizards are supreme magic-users, defined and united as a class by the spells they cast.',
      ],
    })

    expect(result).toContain('supreme magic-users')
    expect(result).not.toContain('Short generic')
  })
})

describe('getRaceSummary', () => {
  test('prefers fluff entries over primary entries', () => {
    const result = getRaceSummary({
      entries: ['Short generic race text.'],
      fluffEntries: [
        'Sequestered in high mountains atop tall trees, the aarakocra, sometimes called birdfolk, evoke fear and wonder.',
      ],
    })

    expect(result).toContain('aarakocra')
    expect(result).not.toContain('Short generic')
  })
})
