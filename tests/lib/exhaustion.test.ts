import { describe, expect, test } from 'vitest'
import { getExhaustionMaximum, getExhaustionTableRows } from '@/pages/details/ConditionsPage'

describe('getExhaustionTableRows', () => {
  test('reads exhaustion levels and effects from a structured game-data table', () => {
    expect(
      getExhaustionTableRows([
        'Introductory rules text',
        {
          type: 'table',
          rows: [
            ['1', 'First loaded effect'],
            ['2', { type: 'entries', entries: ['Second loaded effect'] }],
          ],
        },
      ]),
    ).toEqual([
      { level: 1, effect: 'First loaded effect' },
      { level: 2, effect: { type: 'entries', entries: ['Second loaded effect'] } },
    ])
  })

  test('returns no rows when loaded data has no exhaustion table', () => {
    expect(getExhaustionTableRows(['Formula-based exhaustion rules'])).toEqual([])
  })

  test('derives a formula-based terminal level from loaded rules text', () => {
    expect(
      getExhaustionMaximum([
        { type: 'entries', entries: ['You die if your Exhaustion level is 8.'] },
      ]),
    ).toBe(8)
  })

  test('ignores malformed rows without imposing a hardcoded maximum', () => {
    expect(
      getExhaustionTableRows([
        {
          type: 'table',
          rows: [['0', 'Not a tracked level'], ['3'], ['7', 'Out of range'], null],
        },
      ]),
    ).toEqual([{ level: 7, effect: 'Out of range' }])
  })
})
