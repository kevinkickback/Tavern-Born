import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { DataFilter } from '@/lib/5etools/filters'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { OPTIONAL_CLASS_SECTION_RULES } from '@/lib/5etools/optionalClassSectionRules'
import { parseSpells, type SpellSourceLookup } from '@/lib/5etools/parsers/spells'
import {
  auditSpellRouteMultiplicity,
  filterSpellRouteSources,
} from '@/lib/5etools/spellRouteSources'
import { OPTIONAL_CLASS_ADOPTION_ROOTS } from '@/lib/character/optionalClassAdoptionRules'
import type { Spell5e } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const native = JSON.parse(readFileSync('tests/fixtures/spellRouteSources.json', 'utf8')) as {
  spell: Spell5e[]
  lookup: SpellSourceLookup
}
const aid = native.spell.find((row) => row.name === 'Aid')!
const parse = (spell: Spell5e = aid, lookup?: SpellSourceLookup, origin = 'route-test') =>
  (
    parseSpells([spell], {
      origin,
      ...(lookup === undefined ? {} : { sourceLookup: lookup }),
    }) as Spell5e[]
  )[0]
const synthetic = (classes?: Spell5e['classes']): Spell5e => ({
  ...structuredClone(aid),
  ...(classes ? { classes } : {}),
})
const root = (predicate: unknown): SpellSourceLookup => ({
  phb: { aid: { class: { PHB: { Cleric: true } }, classVariant: { PHB: { Ranger: predicate } } } },
})
const route = (name: string, source: string, channel = 'class', defining: string | null = null) => [
  'classSpellRoute',
  'aid',
  'phb',
  name,
  source,
  channel,
  defining,
]

function preservedViews(spell: Spell5e): Spell5e[] {
  const lookup = Object.values(buildSpellLookup([spell]))[0]
  const layer = composeGameDataLayers([makeGameDataFixture({ spells: [spell] })]).spells[0]
  return [lookup, layer, Object.values(buildSpellLookup([JSON.parse(JSON.stringify(layer))]))[0]]
}

test('source-excluded targets avoid cloning while eligible invalid audits still fail closed', () => {
  const excluded = parse(aid, native.lookup)
  const eligible = parse(native.spell[1], native.lookup)
  eligible.classSpellRouteSource!.sourceDigest = '0'.repeat(64)
  const before = JSON.stringify([excluded, eligible])
  const clone = vi.spyOn(globalThis, 'structuredClone')
  try {
    expect(DataFilter.filterSpells([excluded], { sources: [' tce '] })).toEqual([])
    expect(clone).not.toHaveBeenCalled()
    const current = DataFilter.filterSpells([eligible], { sources: [' tce '] })
    expect(current).toHaveLength(1)
    expect(current[0].classSpellRoutes).toEqual([])
    expect(current[0].classes?.fromClassList).toEqual([])
    expect(current[0].classSpellRouteDiagnostics).toContainEqual({
      code: 'invalid-package',
      path: 'classSpellRouteSource',
    })
    expect(JSON.stringify([excluded, eligible])).toBe(before)
  } finally {
    clone.mockRestore()
  }
})

test.each([
  'digest',
  'target',
  'routes',
  'invalid-target',
])('singleton lookup, layer and cached views deny invalid audited %s without input mutation', (mutation) => {
  const spell = parse(aid, native.lookup)
  if (mutation === 'digest') spell.classSpellRouteSource!.sourceDigest = '0'.repeat(64)
  if (mutation === 'target') spell.classSpellRouteSource!.target[1] = 'xphb'
  if (mutation === 'routes') spell.classSpellRouteSource!.sourceRoutes = []
  if (mutation === 'invalid-target') spell.source = 'PHB|XPHB'
  const before = JSON.stringify(spell)
  for (const view of preservedViews(spell)) {
    expect(view.classSpellRoutes).toEqual([])
    expect(view.classes?.fromClassList).toEqual([])
    expect(view.classes?.fromClassListVariant).toEqual([])
    expect(view.classSpellRouteDiagnostics).toContainEqual({
      code: 'invalid-package',
      path: 'classSpellRouteSource',
    })
  }
  expect(JSON.stringify(spell)).toBe(before)
})

test.each([
  'empty',
  'subset',
])('singleton %s current routes rebuild stale lists without restoring hidden routes', (mode) => {
  const spell = parse(aid, native.lookup)
  const auditBefore = JSON.stringify(spell.classSpellRouteSource)
  spell.classSpellRoutes = mode === 'empty' ? [] : [route('cleric', 'phb') as never]
  spell.classes = {
    fromClassList: [{ name: 'Wizard', source: 'PHB' }],
    fromClassListVariant: [{ name: 'Sorcerer', source: 'XPHB' }],
  }
  const before = JSON.stringify(spell)
  for (const view of preservedViews(spell)) {
    expect(view.classSpellRoutes).toEqual(spell.classSpellRoutes)
    expect(view.classes?.fromClassList).toEqual(
      mode === 'empty' ? [] : [{ name: 'Cleric', source: 'PHB' }],
    )
    expect(view.classes?.fromClassListVariant).toEqual([])
    expect(JSON.stringify(view.classSpellRouteSource)).toBe(auditBefore)
    expect(Object.values(buildSpellLookup([view]))[0]).toEqual(view)
    expect(filterSpellRouteSources(view).classSpellRoutes).toHaveLength(5)
  }
  expect(JSON.stringify(spell)).toBe(before)
})

test.each([
  null,
  {},
  undefined,
  [route('wizard', 'phb')],
  [['classSpellRoute', 'aid']],
])('malformed or unsupported explicit current routes %j fail closed with a visible diagnostic', (current) => {
  const spell = parse(aid, native.lookup)
  spell.classSpellRoutes = current as never
  for (const view of preservedViews(spell)) {
    expect(view.classSpellRoutes).toEqual([])
    expect(view.classes?.fromClassList).toEqual([])
    expect(view.classSpellRouteDiagnostics).toContainEqual({
      code: 'invalid-current-view',
      path: 'classSpellRoutes',
    })
  }
})

test('an absent current field derives verified source routes while unique unaudited legacy input remains identical', () => {
  const spell = parse(aid, native.lookup)
  delete spell.classSpellRoutes
  for (const view of preservedViews(spell)) expect(view.classSpellRoutes).toHaveLength(5)
  const legacy = synthetic({ fromClassList: [{ name: 'Wizard', source: 'PHB' }] })
  expect(Object.values(buildSpellLookup([legacy]))[0]).toBe(legacy)
})

test.each([
  { classes: 'bad' },
  { classes: true },
  { classes: 42 },
  { classes: [] },
  { classes: null },
])('malformed embedded classes $classes produce a diagnostic without throwing', ({ classes }) => {
  const result = parse({ ...synthetic(), classes: classes as never })
  expect(result.classSpellRoutes).toEqual([])
  expect(result.classSpellRouteDiagnostics).toContainEqual({
    code: 'invalid-embedded-container',
    path: 'classes',
  })
  expect(
    parse({ ...synthetic(), classes: classes as never }, root(false)).classSpellRoutes,
  ).toEqual([route('cleric', 'phb')])
})

test('an explicitly resupplied changed lookup object withdraws stale routes and exact restoration recovers them', () => {
  const lookup = root(true)
  const first = parse(aid, lookup)
  const entry = lookup.phb.aid as { classVariant: { PHB: { Ranger: unknown } } }
  entry.classVariant.PHB.Ranger = false
  const removed = parse(first, lookup)
  expect(removed.classSpellRoutes).toEqual([route('cleric', 'phb')])
  entry.classVariant.PHB.Ranger = true
  expect(parse(removed, lookup).classSpellRoutes).toEqual(first.classSpellRoutes)
  lookup[' PHB '] = { aid: { classVariant: { PHB: { Ranger: false } } } }
  expect(parse(first, lookup).classSpellRoutes).toEqual([route('cleric', 'phb')])
  delete lookup[' PHB ']
  delete lookup.phb
  const empty = parse(first, lookup)
  expect(empty.classSpellRoutes).toEqual([])
  Object.assign(lookup, root(true))
  expect(parse(empty, lookup).classSpellRoutes).toEqual(first.classSpellRoutes)
})

test('source parsing cannot activate any of the eight spell-section actor roots', () => {
  const spellSections = OPTIONAL_CLASS_SECTION_RULES.sections.filter((section) =>
    section.members.some(([kind]) => kind === 'spell'),
  )
  expect(spellSections).toHaveLength(8)
  expect(
    spellSections.every(
      (section) => !OPTIONAL_CLASS_ADOPTION_ROOTS.some((root) => root.target === section.target),
    ),
  ).toBe(true)
})

test('canonical target and filter aliases preserve exact printing, suppression and pure restoration', () => {
  const aliased = parse({ ...structuredClone(aid), name: ' Aid ', source: ' PHB ' }, native.lookup)
  const before = JSON.stringify(aliased)
  expect(DataFilter.filterSpells([aliased], { sources: ['PHB'] })).toHaveLength(1)
  expect(DataFilter.filterSpells([parse(aid, native.lookup)], { sources: [' phb '] })).toHaveLength(
    1,
  )
  expect(DataFilter.filterSpells([aliased], { sources: ['TCE'] })).toEqual([])
  expect(
    DataFilter.filterSpells([aliased], { sources: ['PHB'], suppressedKeys: new Set(['Aid|PHB']) }),
  ).toEqual([])
  const revised = parse({ ...structuredClone(aid), source: 'XPHB' }, native.lookup)
  expect(DataFilter.filterSpells([revised], { sources: ['PHB'] })).toEqual([])
  expect(
    DataFilter.filterSpells([aliased, revised], {
      sources: ['PHB', 'XPHB'],
      suppressedKeys: new Set(['Aid|PHB']),
    }),
  ).toEqual([revised])
  expect(
    DataFilter.filterSpells(
      [parse({ ...structuredClone(aid), source: 'PHB|XPHB' }, native.lookup)],
      { sources: ['PHB'] },
    ),
  ).toEqual([])
  const restored = DataFilter.filterSpells([aliased], { sources: [' PHB ', 'TCE'] })
  expect(restored).toHaveLength(1)
  expect(restored[0].classSpellRoutes).toContainEqual(route('cleric', 'phb'))
  expect(restored[0].source).toBe(' PHB ')
  expect(JSON.stringify(aliased)).toBe(before)
})

test('actual Aid and Intellect Fortress retain independently qualified base and variant routes without mutating source', () => {
  const before = JSON.stringify(native)
  const spells = parseSpells(native.spell, {
    sourceLookup: native.lookup,
    origin: 'native-excerpts',
  }) as Spell5e[]
  expect(spells[0].classSpellRoutes).toContainEqual(route('cleric', 'phb'))
  expect(spells[0].classSpellRoutes).toContainEqual(route('ranger', 'phb', 'classVariant', 'tce'))
  expect(spells[1].classSpellRoutes).toContainEqual([
    'classSpellRoute',
    'intellect fortress',
    'tce',
    'bard',
    'xphb',
    'classVariant',
    'tce',
  ])
  expect(spells[0].classes?.fromClassList).toContainEqual({ name: 'Cleric', source: 'PHB' })
  expect(JSON.stringify(native)).toBe(before)
  expect(parseSpells(spells)).toEqual(spells)
})

describe('strict predicates and independent channels', () => {
  test.each([
    false,
    [],
    {},
    { definedInSources: [] },
    { definedInSources: ['TCE', false] },
    { definedInSource: 'TCE', definedInSources: ['TCE'] },
    { definedInSource: 'TCE', extra: true },
    { definedInSource: 'TCE|PHB' },
  ])('rejects an invalid variant without deleting Cleric base: %j', (predicate) => {
    const result = parse(aid, root(predicate))
    expect(result.classSpellRoutes).toEqual([route('cleric', 'phb')])
    expect(result.classSpellRouteDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-predicate' }),
    )
  })
  test('null and distinct alternatives are OR, repetitions within one plural deduplicate', () => {
    const spell = parse(aid, root({ definedInSources: ['TCE', null, ' tce '] }))
    expect(spell.classSpellRoutes).toEqual(
      expect.arrayContaining([
        route('cleric', 'phb'),
        route('ranger', 'phb', 'classVariant', null),
        route('ranger', 'phb', 'classVariant', 'tce'),
      ]),
    )
    expect(spell.classSpellRoutes).toHaveLength(3)
    expect(filterSpellRouteSources(spell, ['PHB']).classSpellRoutes).toContainEqual(
      route('ranger', 'phb', 'classVariant', null),
    )
  })
  test.each([
    'source',
    'spell',
    'classSource',
    'className',
  ])('retains conflicts before canonical %s aliases collapse', (field) => {
    const lookup = root({ definedInSource: 'TCE' })
    const entry = lookup.phb.aid as Record<string, unknown>
    if (field === 'source') lookup[' PHB '] = { aid: { classVariant: { PHB: { Ranger: true } } } }
    if (field === 'spell') lookup.phb[' Aid '] = { classVariant: { PHB: { Ranger: true } } }
    if (field === 'classSource')
      (entry.classVariant as Record<string, unknown>)[' phb '] = { Ranger: true }
    if (field === 'className')
      (entry.classVariant as Record<string, Record<string, unknown>>).PHB[' ranger '] = true
    const spell = parse(aid, lookup)
    expect(spell.classSpellRoutes).toEqual([route('cleric', 'phb')])
    expect(spell.classSpellRouteDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'producer-conflict' }),
    )
  })
  test('agreeing aliases keep native labels and class filtering uses canonical identity', () => {
    const lookup = root(true)
    lookup[' PHB '] = { ' Aid ': { class: { ' PHB ': { ' cleric ': true } } } }
    const spell = parse(aid, lookup)
    expect(spell.classSpellRoutes).toHaveLength(2)
    expect(DataFilter.filterSpells([spell], { classes: [' cLeRiC '] })).toHaveLength(1)
    expect(JSON.stringify(parse(aid, lookup))).toBe(
      JSON.stringify(parse(aid, Object.fromEntries(Object.entries(lookup).reverse()))),
    )
  })
})

test('embedded producers allow disjoint alternatives, reject cross-row overlap, and cannot overrule lookup', () => {
  const make = (rows: unknown[]) => synthetic({ fromClassListVariant: rows as never })
  const row = { name: 'Ranger', source: 'PHB' }
  const disjoint = parse(make([{ ...row, definedInSources: ['TCE', ' tce '] }, row]))
  expect(disjoint.classSpellRoutes).toHaveLength(2)
  const overlap = parse(
    make([
      { ...row, definedInSources: ['TCE', null] },
      { ...row, definedInSource: 'TCE' },
    ]),
  )
  expect(overlap.classSpellRoutes).toEqual([])
  expect(overlap.classSpellRouteDiagnostics).toContainEqual(
    expect.objectContaining({ code: 'duplicate-embedded-alternative' }),
  )
  const conflict = parse(make([row]), root({ definedInSource: 'TCE' }))
  expect(conflict.classSpellRoutes).toEqual([route('cleric', 'phb')])
  const agreement = parse(
    make([{ ...row, definedInSource: 'TCE' }]),
    root({ definedInSource: 'TCE' }),
  )
  expect(agreement.classSpellRoutes).toHaveLength(2)
})

test('reparse retains original evidence; explicit fresh lookup including empty replaces only old lookup', () => {
  const raw = synthetic({ fromClassList: [{ name: 'Wizard', source: 'PHB' }] })
  const before = JSON.stringify(raw)
  const initial = parse(raw, root({ definedInSource: 'TCE' }))
  expect(parse(initial)).toEqual(initial)
  const empty = parse(initial, {})
  expect(empty.classSpellRoutes).toEqual([route('wizard', 'phb')])
  expect(empty.classes?.fromClassList).toEqual([{ name: 'Wizard', source: 'PHB' }])
  expect(parse(initial, root(false)).classSpellRoutes).toEqual(
    expect.arrayContaining([route('wizard', 'phb'), route('cleric', 'phb')]),
  )
  expect(JSON.stringify(raw)).toBe(before)
})

test.each([
  'digest',
  'target',
  'routes',
  'unknown',
  'input',
])('invalid existing package %s never falls back to enriched arrays', (mutation) => {
  const spell = structuredClone(parse(aid, root(true)))
  const audit = spell.classSpellRouteSource!
  if (mutation === 'digest') audit.sourceDigest = '0'.repeat(64)
  if (mutation === 'target') audit.target[1] = 'xphb'
  if (mutation === 'routes') audit.sourceRoutes = []
  if (mutation === 'unknown') Object.assign(audit, { unknown: true })
  if (mutation === 'input') audit.input.origin = 'forged'
  const result = parse(spell, root(true))
  expect(result.classSpellRoutes).toEqual([])
  expect(result.classes?.fromClassList).toEqual([])
  expect(result.classSpellRouteDiagnostics).toContainEqual({
    code: 'invalid-package',
    path: 'classSpellRouteSource',
  })
  expect(filterSpellRouteSources(result).classSpellRoutes).toEqual([])
})

test('document, cross-file, direct lookup, layer and JSON cache preserve target multiplicity; a fresh layer owns its proof', () => {
  const first = parse(aid, root(true), 'file-a'),
    second = parse(aid, root(true), 'file-b')
  const document = parseSpells([aid, structuredClone(aid)], {
    sourceLookup: root(true),
  }) as Spell5e[]
  const crossFile = auditSpellRouteMultiplicity([first, second], 'loader')
  for (const rows of [document, crossFile, [first, structuredClone(first)]]) {
    const lookup = buildSpellLookup(rows)
    const retained = Object.values(lookup)[0]
    expect(retained.classSpellRoutes).toEqual([])
    const cached = JSON.parse(JSON.stringify(retained)) as Spell5e
    expect(parse(cached).classSpellRoutes).toEqual([])
    expect(filterSpellRouteSources(cached, ['PHB', 'TCE']).classSpellRoutes).toEqual([])
    expect(cached.classSpellRouteSource?.input.targetOccurrences.length).toBeGreaterThanOrEqual(2)
  }
  const ambiguous = composeGameDataLayers([makeGameDataFixture({ spells: [first, second] })])
  expect(ambiguous.spells[0].classSpellRoutes).toEqual([])
  const noProof = composeGameDataLayers([
    makeGameDataFixture({ spells: [first] }),
    makeGameDataFixture({ spells: [synthetic()] }),
  ])
  expect(noProof.spells[0].classSpellRouteSource).toBeUndefined()
  expect(noProof.spells[0].classes).toBeUndefined()
  const restored = composeGameDataLayers([
    ambiguous,
    makeGameDataFixture({
      spells: [parse(synthetic({ fromClassList: [{ name: 'Wizard', source: 'PHB' }] }))],
    }),
  ])
  expect(restored.spells[0].classSpellRoutes).toEqual([route('wizard', 'phb')])
})

test('filtered explicit empty view survives lookups, exact source restoration is pure and owner sources are independent', () => {
  const original = parse(aid, {
    phb: {
      aid: {
        class: { PHB: { Cleric: true } },
        classVariant: { XPHB: { Bard: { definedInSource: 'TCE' } } },
      },
    },
  })
  const before = JSON.stringify(original)
  const phb = filterSpellRouteSources(original, ['PHB', 'TCE'])
  expect(phb.classSpellRoutes).toEqual([route('cleric', 'phb')])
  const empty = filterSpellRouteSources(original, ['TCE'])
  expect(empty.classSpellRoutes).toEqual([])
  expect(Object.values(buildSpellLookup([empty]))[0].classSpellRoutes).toEqual([])
  expect(filterSpellRouteSources(empty, ['PHB', 'XPHB', 'TCE'])).toEqual(original)
  expect(JSON.stringify(original)).toBe(before)
  const legacy = synthetic({ fromClassList: [{ name: 'Wizard', source: 'PHB' }] })
  expect(filterSpellRouteSources(legacy, ['PHB'])).toBe(legacy)
  expect(Object.values(buildSpellLookup([legacy]))[0]).toBe(legacy)
})
