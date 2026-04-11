import { describe, expect, test } from 'vitest'
import { parseClassFluffSummaries } from '@/lib/5etools/parsers'

describe('parseClassFluffSummaries', () => {
  test('extracts the last paragraph from the first class section entry', () => {
    const result = parseClassFluffSummaries({
      classFluff: [
        {
          name: 'Wizard',
          source: 'PHB',
          entries: [
            {
              type: 'section',
              entries: [
                'First paragraph.',
                'Second paragraph.',
                'Wizards are supreme magic-users, defined and united as a class by the spells they cast.',
                {
                  type: 'entries',
                  name: 'Nested section',
                  entries: ['Nested content that should not override the direct last paragraph.'],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result).toEqual([
      {
        name: 'Wizard',
        source: 'PHB',
        summary:
          'Wizards are supreme magic-users, defined and united as a class by the spells they cast.',
      },
    ])
  })
})
