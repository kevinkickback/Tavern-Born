import { describe, expect, test } from 'vitest'
import { buildSuppressedKeys, hasAvailableReprintPair } from '@/lib/5etools/reprints'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

describe('5etools/reprints', () => {
  test('suppresses entity when direct reprint source is allowed', () => {
    const suppressed = buildSuppressedKeys(
      [
        {
          name: 'Legacy Race',
          source: 'PHB',
          reprintedAs: ['Legacy Race|XPHB'],
        },
      ],
      new Set(['PHB', 'XPHB']),
    )

    expect(suppressed.has('Legacy Race|PHB')).toBe(true)
  })

  test('does not suppress when reprint source is not allowed', () => {
    const suppressed = buildSuppressedKeys(
      [
        {
          name: 'Legacy Race',
          source: 'PHB',
          reprintedAs: ['Legacy Race|XPHB'],
        },
      ],
      new Set(['PHB']),
    )

    expect(suppressed.has('Legacy Race|PHB')).toBe(false)
  })

  test('suppresses transitive reprint chain', () => {
    const suppressed = buildSuppressedKeys(
      [
        {
          name: 'Feature',
          source: 'OLD',
          reprintedAs: ['Feature|MID'],
        },
        {
          name: 'Feature',
          source: 'MID',
          reprintedAs: ['Feature|NEW'],
        },
      ],
      new Set(['NEW']),
    )

    expect(suppressed.has('Feature|OLD')).toBe(true)
    expect(suppressed.has('Feature|MID')).toBe(true)
  })

  test('parses subclass-style reprint keys', () => {
    const suppressed = buildSuppressedKeys(
      [
        {
          name: 'Alchemist',
          source: 'EFA',
          reprintedAs: ['Alchemist|Artificer|TCE|TCE'],
        },
      ],
      new Set(['TCE']),
    )

    expect(suppressed.has('Alchemist|EFA')).toBe(true)
  })

  test('reports an available preference only when both printings are usable', () => {
    const legacyRace = {
      name: 'Legacy Race',
      source: 'PHB',
      reprintedAs: ['Updated Race|XGE'],
    }
    const withoutTarget = makeGameDataFixture({ races: [legacyRace] })
    const withTarget = makeGameDataFixture({
      races: [legacyRace, { name: 'Updated Race', source: 'XGE' }],
    })

    expect(hasAvailableReprintPair(withoutTarget, ['PHB', 'XGE'])).toBe(false)
    expect(hasAvailableReprintPair(withTarget, ['PHB'])).toBe(false)
    expect(hasAvailableReprintPair(withTarget, ['PHB', 'XGE'])).toBe(true)
  })
})
