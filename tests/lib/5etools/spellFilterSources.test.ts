import { expect, test } from 'vitest'
import { matchesJoinedSpellClassFilter } from '@/lib/5etools/spellFilterSources'
import type { ClassSpellRoute } from '@/types/spellRoutes'

// Expected classifications captured from pinned upstream SourceUtil/Parser static metadata.
test.each([
  ['class', 'phb', null, true],
  ['class', 'xphb', null, true],
  ['classVariant', 'phb', 'xge', true],
  ['classVariant', 'phb', 'tce', true],
  ['classVariant', 'phb', null, false],
  ['classVariant', 'phb', 'aatm', false],
  ['classVariant', 'phb', 'xmts', false],
  ['class', 'UAExample', null, false],
  ['class', 'XUAExample', null, false],
  ['class', 'PSA', null, false],
  ['class', 'MCVExample', null, false],
  ['class', 'aatm', null, false],
  ['class', 'new-standard-book', null, true],
] as const)('joined class filter: %s %s %s', (kind, classSource, defined, expected) => {
  const route: ClassSpellRoute = [
    'classSpellRoute',
    'test',
    'phb',
    'cleric',
    classSource,
    kind,
    defined,
  ]
  expect(matchesJoinedSpellClassFilter(route, ['Cleric'])).toBe(expected)
})
test('upstream strips route-name parentheses and matches canonical source/name casing', () => {
  expect(
    matchesJoinedSpellClassFilter(
      ['classSpellRoute', 'test', 'phb', 'Cleric (Revised)', 'PHB', 'classVariant', 'XGE'],
      ['cleric'],
    ),
  ).toBe(true)
})
