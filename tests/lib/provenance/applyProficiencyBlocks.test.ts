import { describe, expect, test } from 'vitest'
import { iterateProficiencyBlocks, toProficiencyBlocks } from '@/lib/provenance'

describe('iterateProficiencyBlocks', () => {
  test('yields fixed, generic, choose, and any-standard entries for tool blocks', () => {
    const blocks = toProficiencyBlocks([
      {
        "thieves' tools": true,
        anyMusicalInstrument: 2,
        choose: { from: ["artisan's tools"], count: 1 },
        anyStandard: 1,
      },
    ])

    const entries = [...iterateProficiencyBlocks(blocks, 'tools')]

    expect(entries).toEqual(
      expect.arrayContaining([
        { kind: 'fixed', key: "thieves' tools" },
        { kind: 'generic-tool', genericKey: 'musical instrument', count: 2 },
        { kind: 'choose', from: ["artisan's tools"], count: 1, fromFilter: undefined },
        { kind: 'any-standard', count: 1 },
      ]),
    )
  })

  test('yields any-standard for { any: N } in skill blocks', () => {
    const blocks = toProficiencyBlocks([{ any: 2 }])
    const entries = [...iterateProficiencyBlocks(blocks, 'skills')]
    expect(entries).toEqual([{ kind: 'any-standard', count: 2 }])
  })

  test('yields choose entries with fromFilter for armor blocks', () => {
    const blocks = toProficiencyBlocks([
      {
        choose: { fromFilter: 'type=light armor|miscellaneous=mundane', count: 1 },
      },
    ])

    const entries = [...iterateProficiencyBlocks(blocks, 'armor')]
    expect(entries).toEqual([
      {
        kind: 'choose',
        from: [],
        fromFilter: 'type=light armor|miscellaneous=mundane',
        count: 1,
      },
    ])
  })
})
