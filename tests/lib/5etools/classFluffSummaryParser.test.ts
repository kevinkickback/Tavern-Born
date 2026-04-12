import { describe, expect, test } from 'vitest'
import { parseClassFluff, parseClassFluffSummaries } from '@/lib/5etools/parsers'

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

describe('parseClassFluff', () => {
  test('extracts summary, sections, and images from class fluff payloads', () => {
    const result = parseClassFluff({
      classFluff: [
        {
          name: 'Wizard',
          source: 'PHB',
          entries: [
            {
              type: 'section',
              name: 'The Magic of Study',
              entries: ['First paragraph.', 'Second paragraph.'],
            },
            {
              type: 'section',
              name: 'Creating a Wizard',
              entries: ['Concept details.'],
            },
          ],
          images: [
            {
              type: 'image',
              href: { path: 'img/classes/wizard.webp' },
              title: 'Wizard art',
            },
          ],
        },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: 'Wizard',
      source: 'PHB',
      summary: 'Second paragraph.',
      sections: [
        {
          name: 'The Magic of Study',
          entries: ['First paragraph.', 'Second paragraph.'],
        },
        {
          name: 'Creating a Wizard',
          entries: ['Concept details.'],
        },
      ],
      images: [
        {
          type: 'image',
          href: { path: 'img/classes/wizard.webp' },
          title: 'Wizard art',
        },
      ],
    })
  })
})
