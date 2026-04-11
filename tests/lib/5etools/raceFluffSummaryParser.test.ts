import { describe, expect, test } from 'vitest'
import { parseRaceFluffSummaries } from '@/lib/5etools/parsers'

describe('parseRaceFluffSummaries', () => {
  test('extracts the first paragraph from nested race fluff entries', () => {
    const result = parseRaceFluffSummaries({
      raceFluff: [
        {
          name: 'Aarakocra',
          source: 'EEPC',
          entries: [
            {
              type: 'entries',
              entries: [
                {
                  type: 'entries',
                  entries: [
                    'Sequestered in high mountains atop tall trees, the aarakocra, sometimes called birdfolk, evoke fear and wonder.',
                    {
                      type: 'entries',
                      name: 'Beak and Feather',
                      entries: ['Secondary text.'],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result).toEqual([
      {
        name: 'Aarakocra',
        source: 'EEPC',
        summary:
          'Sequestered in high mountains atop tall trees, the aarakocra, sometimes called birdfolk, evoke fear and wonder.',
      },
    ])
  })

  test('extracts the first direct paragraph when race fluff is flat', () => {
    const result = parseRaceFluffSummaries({
      raceFluff: [
        {
          name: 'Aasimar',
          source: 'MPMM',
          entries: [
            'Whether descended from a celestial being or infused with heavenly power, aasimar are mortals who carry a spark of the Upper Planes within their souls.',
            'Second paragraph.',
          ],
        },
      ],
    })

    expect(result[0]?.summary).toContain('spark of the Upper Planes')
  })
})
