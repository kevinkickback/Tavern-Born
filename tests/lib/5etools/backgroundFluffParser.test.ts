import { describe, expect, test } from 'vitest'
import { parseBackgroundFluff } from '@/lib/5etools/parsers'

describe('parseBackgroundFluff', () => {
  test('preserves full source-qualified background narrative entries', () => {
    expect(
      parseBackgroundFluff({
        backgroundFluff: [
          {
            name: 'Acolyte',
            source: 'XPHB',
            entries: [
              'You devoted yourself to service in a temple.',
              { type: 'entries', name: 'Service', entries: ['Additional detail.'] },
            ],
          },
          { name: 'Incomplete', entries: ['Missing source.'] },
        ],
      }),
    ).toEqual([
      {
        name: 'Acolyte',
        source: 'XPHB',
        entries: [
          'You devoted yourself to service in a temple.',
          { type: 'entries', name: 'Service', entries: ['Additional detail.'] },
        ],
      },
    ])
  })
})
