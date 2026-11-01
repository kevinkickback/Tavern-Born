import { describe, expect, test, vi } from 'vitest'
import { resolveItemReference, resolveItemReferences } from '@/lib/5etools/itemResolvers'
import type { Item5e } from '@/types/5etools'

const item = (name: string, source: string): Item5e => ({ name, source, type: 'G' })

describe('item reference resolution', () => {
  test.each([
    ['Other', 'A'],
    ['sword', 'A'],
    [' Sword ', 'A'],
    ['Sword', 'B'],
    ['Sword', 'a'],
    ['Sword', ' A '],
    ['Sword|A', 'B'],
  ])('does not substitute a lone conflicting record %s/%s', (name, source) => {
    const lookup = new Map([['arbitrary', item(name, source)]])
    const reference = { name: 'Sword', source: 'A' }
    expect(resolveItemReference(reference, lookup)).toBeUndefined()
    expect(resolveItemReferences([reference, {}], lookup)).toEqual([undefined, undefined])
  })

  test('preserves literal fields, request trimming, aligned misses and unresolved manual names', () => {
    const later = item('Sword', 'Z')
    const first = item('Sword', 'A')
    const duplicate = item('Sword', 'A')
    const lowercase = item('sword', 'A')
    const spaced = item(' Sword ', 'A')
    const delimiterName = item('Sword|A', 'B')
    const delimiterSource = item('Sword', 'A|B')
    const lookup = new Map([
      ['arbitrary', later],
      ['first', first],
      ['sword|a', duplicate],
      ['alias', first],
      ['lowercase', lowercase],
      ['spaced', spaced],
      ['name-delimiter', delimiterName],
      ['source-delimiter', delimiterSource],
    ])
    const references = [
      { name: ' Sword ', source: ' A ' },
      { name: 'Sword', source: 'Z' },
      { name: 'Sword', source: 'MISSING' },
      { name: 'Other', source: 'A' },
      { name: 'Sword' },
      { name: 'Sword', source: ' ' },
      { name: 'sword', source: 'A' },
      { name: 'Sword', source: 'a' },
      { name: 'Sword|A', source: 'B' },
      { name: 'Sword', source: 'A|B' },
      { name: ' ', source: 'A' },
      {},
    ]
    const expected = [
      first,
      later,
      undefined,
      undefined,
      undefined,
      undefined,
      lowercase,
      undefined,
      delimiterName,
      delimiterSource,
      undefined,
      undefined,
    ]
    const actual = resolveItemReferences(references, lookup)
    references.forEach((reference, index) => {
      expect(actual[index]).toBe(expected[index])
      expect(resolveItemReference(reference, lookup)).toBe(expected[index])
    })
    expect(resolveItemReferences(references, undefined)).toEqual(references.map(() => undefined))
    expect(resolveItemReferences(references, new Map())).toEqual(references.map(() => undefined))
    expect(resolveItemReferences([], lookup)).toEqual([])
    expect(resolveItemReferences([references[0]], lookup)).toEqual([first])
  })

  test('does not infer a source even when locale ordering ties', () => {
    const first = item('Sword', 'É')
    const second = item('Sword', 'E\u0301')
    expect(first.source.localeCompare(second.source)).toBe(0)
    const lookup = new Map([
      ['first', first],
      ['second', second],
    ])
    expect(
      resolveItemReferences([{ name: 'Sword' }, { name: 'Sword', source: second.source }], lookup),
    ).toEqual([undefined, second])
    expect(resolveItemReference({ name: 'Sword' }, lookup)).toBeUndefined()
  })

  test('observes same-size edits, field changes, removal, restoration and cloned maps', () => {
    const first = item('Sword', 'A')
    const second = item('Sword', 'A')
    const replacement = item('Sword', 'A')
    const lookup = new Map([
      ['first', first],
      ['sword|a', second],
    ])
    const refs = [{ name: 'Sword', source: 'A' }, { name: 'Sword' }]
    const check = (expected: Item5e | undefined) => {
      const actual = resolveItemReferences(refs, lookup)
      expect(actual[0]).toBe(expected)
      expect(actual[1]).toBeUndefined()
      expect(resolveItemReference(refs[0], lookup)).toBe(expected)
    }
    check(first)
    lookup.set('first', replacement)
    check(replacement)
    lookup.delete('first')
    lookup.set('first', replacement)
    check(second)
    second.name = 'Other'
    check(replacement)
    replacement.source = 'Z'
    expect(resolveItemReferences(refs, lookup)).toEqual([undefined, undefined])
    const cloned = structuredClone(lookup)
    expect(resolveItemReferences(refs, cloned)).toEqual([undefined, undefined])
    lookup.clear()
    check(undefined)
    lookup.set('restored', first)
    check(first)
    expect(resolveItemReferences(refs, new Map([['new-map', replacement]]))).toEqual([
      undefined,
      undefined,
    ])
  })

  test('visits the catalog once for a batch and skips it for empty requests', () => {
    const first = item('Sword', 'A')
    const second = item('Shield', 'A')
    const lookup = new Map([
      ['arbitrary', first],
      ['other', second],
    ])
    const values = vi.spyOn(lookup, 'values')
    expect(
      resolveItemReferences(
        [
          { name: 'Sword', source: 'A' },
          { name: 'Shield', source: 'A' },
          { name: 'Sword' },
          { name: 'Missing', source: 'A' },
        ],
        lookup,
      ),
    ).toEqual([first, second, undefined, undefined])
    expect(values).toHaveBeenCalledTimes(1)
    values.mockClear()
    expect(resolveItemReferences([{}, { name: ' ' }], lookup)).toEqual([undefined, undefined])
    expect(values).not.toHaveBeenCalled()
  })
})
