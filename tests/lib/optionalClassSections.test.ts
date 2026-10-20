import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { OPTIONAL_CLASS_SECTION_RULES } from '@/lib/5etools/optionalClassSectionRules'
import {
  getCurrentOptionalClassSection,
  parseOptionalClassSections,
} from '@/lib/5etools/optionalClassSectionSource'
import { getOptionalClassSectionMembers } from '@/lib/5etools/optionalClassSectionStructure'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const raw = () =>
  JSON.parse(readFileSync('tests/fixtures/optionalClassSectionSources.json', 'utf8'))
const target = 'book-section|tce|0dc'
function source(change?: (fixture: ReturnType<typeof raw>) => void) {
  const fixture = raw()
  change?.(fixture)
  const parsed = parseClassDocument(fixture)
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    optionalClassFeatureSources: parsed.optionalClassFeatureSources,
    optionalClassSections: parseOptionalClassSections(
      fixture.book,
      fixture.books,
      'fixture:tce-book',
    ),
  })
  return { fixture, data, catalogs: buildClassChoiceFeatureCatalogs(data) }
}
const fighter = (fixture: ReturnType<typeof raw>) =>
  fixture.book.data[0].entries.find((row: { id: string }) => row.id === '0da')
const parent = (fixture: ReturnType<typeof raw>) =>
  fighter(fixture).entries.find((row: { id: string }) => row.id === '0db')
const section = (fixture: ReturnType<typeof raw>) =>
  parent(fixture).entries.find((row: { id?: string }) => row?.id === '0dc')

test('source member decoding preserves upstream printing defaults and rejects malformed references', () => {
  expect(
    getOptionalClassSectionMembers([
      '{@spell Aid}',
      '{@spell Aid|XPHB}',
      '{@optfeature Blessed Warrior|TCE}',
    ]),
  ).toEqual([
    ['spell', 'Aid', 'PHB'],
    ['spell', 'Aid', 'XPHB'],
    ['optionalFeature', 'Blessed Warrior', 'TCE'],
  ])
  expect(getOptionalClassSectionMembers(['{@spell Aid|PHB|display|unexpected}'])).toBeUndefined()
})

test.each([
  'document metadata',
  'root prose',
  'root wrapped prose',
  'chapter prose',
  'chapter wrapped prose',
  'class prose',
  'class wrapped prose',
  'parent wrapped prose',
  'parent unknown node',
])('closed current context rejects added %s rather than dropping its rules', (mode) => {
  const f = source((fixture) => {
    const rule = {
      type: 'entries',
      entries: ['These optional features are unavailable to fighters.'],
    }
    if (mode === 'document metadata') fixture.book.optionalRule = 'No optional features'
    if (mode === 'root prose') fixture.book.data.unshift('No optional features')
    if (mode === 'root wrapped prose') fixture.book.data.unshift(rule)
    if (mode === 'chapter prose') fixture.book.data[0].entries.unshift('No optional features')
    if (mode === 'chapter wrapped prose') fixture.book.data[0].entries.unshift(rule)
    if (mode === 'class prose') fighter(fixture).entries[0] += ' No optional features.'
    if (mode === 'class wrapped prose') fighter(fixture).entries.unshift(rule)
    if (mode === 'parent wrapped prose') parent(fixture).entries.unshift(rule)
    if (mode === 'parent unknown node')
      parent(fixture).entries.push({ ...rule, id: 'unknown-rule', name: 'New restriction' })
  })
  expect(getCurrentOptionalClassSection(f.catalogs, target)).toBeUndefined()
  expect(getCurrentOptionalClassSection(source().catalogs, target)).toBeDefined()
  if (mode.startsWith('class') || mode.startsWith('parent'))
    expect(getCurrentOptionalClassSection(f.catalogs, 'book-section|tce|157')).toBeDefined()
})

test.each([
  'gallery',
  'statblock',
  'image',
])('an entry-less known %s cannot hide a new body field', (type) => {
  for (const entries of [
    [],
    null,
    'No optional features',
    {},
    [{ type: 'entries', entries: ['No optional features'] }],
  ]) {
    const f = source((fixture) => {
      const inventory = OPTIONAL_CLASS_SECTION_RULES.sections.find((row) => row.target === target)!
        .locator.contextInventory
      const frames = type === 'image' ? inventory.chapterSiblings : inventory.classSiblings
      const frame = frames.find(
        (row) => row.metadata.type === type && row.entriesKind === 'absent',
      )!
      const list = type === 'image' ? fixture.book.data[0].entries : fighter(fixture).entries
      list.push({ ...structuredClone(frame.metadata), entries })
    })
    expect(
      getCurrentOptionalClassSection(f.catalogs, target),
      `${type}: ${JSON.stringify(entries)}`,
    ).toBeUndefined()
    if (type === 'image')
      expect(getCurrentOptionalClassSection(f.catalogs, 'book-section|tce|157')).toBeUndefined()
    else expect(getCurrentOptionalClassSection(f.catalogs, 'book-section|tce|157')).toBeDefined()
  }
  const restored = source((fixture) => {
    const inventory = OPTIONAL_CLASS_SECTION_RULES.sections.find((row) => row.target === target)!
      .locator.contextInventory
    const frame = (type === 'image' ? inventory.chapterSiblings : inventory.classSiblings).find(
      (row) => row.metadata.type === type && row.entriesKind === 'absent',
    )!
    ;(type === 'image' ? fixture.book.data[0].entries : fighter(fixture).entries).push(
      structuredClone(frame.metadata),
    )
  })
  expect(getCurrentOptionalClassSection(restored.catalogs, target)).toBeDefined()
})

test.each([
  'root',
  'chapter',
  'parent',
])('reviewed %s sibling bodies may change or disappear, but their field kinds stay bounded', (level) => {
  for (const mode of [
    'absent',
    'empty',
    'changed',
    'null',
    'scalar',
    'object',
    'unknown key',
    'wrong type',
    'nested metadata',
  ]) {
    const f = source((fixture) => {
      const descriptor = OPTIONAL_CLASS_SECTION_RULES.sections.find(
        (row) => row.target === (level === 'parent' ? 'book-section|tce|131' : target),
      )!
      const inv = descriptor.locator.contextInventory
      const frame = (
        level === 'root'
          ? inv.rootSiblings
          : level === 'chapter'
            ? inv.chapterSiblings
            : inv.parentSiblings
      ).find((row) => typeof row.metadata.id === 'string' && row.entriesKind === 'array')!
      const node: Record<string, unknown> = {
        ...structuredClone(frame.metadata),
        entries: ['Changed independent body'],
      }
      if (mode === 'absent') delete node.entries
      if (mode === 'empty') node.entries = []
      if (mode === 'null') node.entries = null
      if (mode === 'scalar') node.entries = 'No optional features'
      if (mode === 'object') node.entries = { entries: ['No optional features'] }
      if (mode === 'unknown key') node.optionalRule = 'No optional features'
      if (mode === 'wrong type') node.type = 'unknown'
      if (mode === 'nested metadata') node.name = { text: 'No optional features' }
      if (level === 'root') fixture.book.data.push(node)
      if (level === 'chapter') {
        fixture.book.data[0].entries = fixture.book.data[0].entries.filter(
          (row: { id?: string }) => row?.id !== node.id,
        )
        fixture.book.data[0].entries.push(node)
      }
      if (level === 'parent') {
        const cls = fixture.book.data[0].entries.find((row: { id?: string }) => row?.id === '12d')
        const p = cls.entries.find((row: { id?: string }) => row?.id === '12e')
        p.entries = p.entries.filter((row: { id?: string }) => row?.id !== node.id)
        p.entries.push(node)
      }
    })
    const current = getCurrentOptionalClassSection(
      f.catalogs,
      level === 'parent' ? 'book-section|tce|131' : target,
    )
    if (['absent', 'empty', 'changed'].includes(mode))
      expect(current, `${level}: ${mode}`).toBeDefined()
    else expect(current, `${level}: ${mode}`).toBeUndefined()
    if (level === 'parent') expect(getCurrentOptionalClassSection(f.catalogs, target)).toBeDefined()
  }
  expect(getCurrentOptionalClassSection(source().catalogs, target)).toBeDefined()
})

test.each([
  'index key',
  'index kind',
  'record key',
  'record kind',
  'duplicate identity',
])('closed optional metadata rejects %s without trusting members', (mode) => {
  const f = source((fixture) => {
    if (mode === 'index key') fixture.books.optionalRules = 'No optional features'
    if (mode === 'index kind') fixture.books.book = {}
    if (mode === 'record key') fixture.books.book[0].optionalRules = 'No optional features'
    if (mode === 'record kind') fixture.books.book[0].contents = null
    if (mode === 'duplicate identity')
      fixture.books.book.push(structuredClone(fixture.books.book[0]))
  })
  expect(getCurrentOptionalClassSection(f.catalogs, target)).toBeUndefined()
  expect(getCurrentOptionalClassSection(source().catalogs, target)).toBeDefined()
})

test('publication/navigation metadata values and unrelated books cannot govern current section authority', () => {
  const f = source((fixture) => {
    Object.assign(fixture.books.book[0], {
      published: '2099-01-01',
      group: 'changed',
      author: 'Changed',
      cover: { changed: true },
      contents: [{ changed: true }],
    })
    fixture.books.book.push({ id: 'OTHER', optionalRules: 'Unrelated book' })
  })
  expect(getCurrentOptionalClassSection(f.catalogs, target)).toBeDefined()
})

test.each([
  'missing leaf',
  'changed leaf',
  'missing grant body',
])('known sibling %s cannot remove an independently current section in the same optional parent', (mode) => {
  const f = source((fixture) => {
    const cls = fixture.book.data[0].entries.find((row: { id: string }) => row.id === '12d')
    const optional = cls.entries.find((row: { id?: string }) => row?.id === '12e')
    if (mode === 'missing leaf')
      optional.entries = optional.entries.filter((row: { id?: string }) => row?.id !== '12f')
    if (mode === 'changed leaf')
      optional.entries.find((row: { id?: string }) => row?.id === '12f').entries[1] +=
        ' Changed rules.'
    if (mode === 'missing grant body')
      fixture.classFeature = fixture.classFeature.filter(
        (row: { name: string; className: string }) =>
          !(row.name === 'Spellcasting' && row.className === 'Paladin'),
      )
  })
  expect(getCurrentOptionalClassSection(f.catalogs, 'book-section|tce|12f')).toBeUndefined()
  expect(getCurrentOptionalClassSection(f.catalogs, 'book-section|tce|131')).toBeDefined()
  expect(getCurrentOptionalClassSection(f.catalogs, target)).toBeDefined()
})

test.each([
  'unknown class id',
  'changed class type',
  'unknown class field',
])('new chapter frame %s remains unverified rather than borrowing a known sibling discard', (mode) => {
  const f = source((fixture) => {
    if (mode === 'unknown class id') fighter(fixture).id = 'unknown-class'
    if (mode === 'changed class type') fighter(fixture).type = 'entries'
    if (mode === 'unknown class field')
      fighter(fixture).optionalRules = ['Disable every optional feature']
  })
  expect(getCurrentOptionalClassSection(f.catalogs, target)).toBeUndefined()
  expect(getCurrentOptionalClassSection(f.catalogs, 'book-section|tce|157')).toBeUndefined()
  expect(getCurrentOptionalClassSection(source().catalogs, 'book-section|tce|157')).toBeDefined()
})

test('actual thirteen book sections retain exact owner/gain/member declarations through composition/cache/scoping', () => {
  const { data, catalogs } = source()
  expect(OPTIONAL_CLASS_SECTION_RULES.sections).toHaveLength(13)
  for (const descriptor of OPTIONAL_CLASS_SECTION_RULES.sections) {
    const current = getCurrentOptionalClassSection(catalogs, descriptor.target)
    expect(current?.descriptor).toEqual(descriptor)
    expect(current?.grant.level).toBe(descriptor.level)
  }
  const current = getCurrentOptionalClassSection(catalogs, target)!
  expect(current.descriptor.owner).toEqual(['class', 'fighter', 'phb'])
  expect(current.descriptor.members).toEqual([
    ['optionalFeature', 'Blind Fighting', 'TCE'],
    ['optionalFeature', 'Interception', 'TCE'],
    ['optionalFeature', 'Superior Technique', 'TCE'],
    ['optionalFeature', 'Thrown Weapon Fighting', 'TCE'],
    ['optionalFeature', 'Unarmed Fighting', 'TCE'],
  ])
  const reopened = buildClassChoiceFeatureCatalogs(
    JSON.parse(JSON.stringify(composeGameDataLayers([data]))),
  )
  expect(getCurrentOptionalClassSection(reopened, target)?.descriptor).toEqual(current.descriptor)
  expect(
    getCurrentOptionalClassSection(scopeClassChoiceFeatureCatalogs(reopened), target)?.descriptor,
  ).toEqual(current.descriptor)
  expect(JSON.stringify(data)).not.toContain('Battle Master Builds')
})

test.each([
  'book source',
  'chapter',
  'class owner',
  'parent prose',
  'leaf prose',
  'leaf identity',
  'duplicate class',
  'duplicate leaf',
])('one current %s conflict cannot borrow a still-matching leaf/member', (mode) => {
  const f = source((fixture) => {
    if (mode === 'book source') fixture.books.book[0].source = 'OTHER'
    if (mode === 'chapter') fixture.book.data[0].name = 'Other chapter'
    if (mode === 'class owner') fighter(fixture).name = 'Paladin'
    if (mode === 'parent prose') parent(fixture).entries[0] += ' Features are automatically active.'
    if (mode === 'leaf prose') section(fixture).entries[1] += ' Gain another style.'
    if (mode === 'leaf identity') section(fixture).id = 'other'
    if (mode === 'duplicate class')
      fixture.book.data[0].entries.push(structuredClone(fighter(fixture)))
    if (mode === 'duplicate leaf') parent(fixture).entries.push(structuredClone(section(fixture)))
  })
  expect(getCurrentOptionalClassSection(f.catalogs, target)).toBeUndefined()
  expect(getCurrentOptionalClassSection(source().catalogs, target)).toBeDefined()
  if (!['book source', 'chapter'].includes(mode))
    expect(getCurrentOptionalClassSection(f.catalogs, 'book-section|tce|157')).toBeDefined()
})

test('book proof cannot supply missing granting declaration/progression/body or invent raw-map authority', () => {
  const { catalogs } = source()
  for (const current of [
    { ...catalogs, classes: [] },
    { ...catalogs, optionalClassFeatureSources: [] },
    { ...catalogs, classFeatureCandidates: new Map() },
    { ...catalogs, optionalClassSections: [] },
    {
      ...catalogs,
      optionalClassSections: [...catalogs.optionalClassSections, ...catalogs.optionalClassSections],
    },
  ])
    expect(getCurrentOptionalClassSection(current, target)).toBeUndefined()
  const changed = source((fixture) => {
    fixture.class.find(
      (row: { name: string }) => row.name === 'Fighter',
    ).optionalfeatureProgression[0].progression = { 1: 2 }
  })
  expect(getCurrentOptionalClassSection(changed.catalogs, target)).toBeUndefined()
})

test('a newly loaded unavailable section replaces old proof; omitted layer identities retain base and exact restoration returns', () => {
  const base = source().data
  const missing = source((fixture) => {
    parent(fixture).entries = parent(fixture).entries.filter(
      (row: { id?: string }) => row?.id !== '0dc',
    )
  }).data
  const unavailable = buildClassChoiceFeatureCatalogs(composeGameDataLayers([base, missing]))
  expect(getCurrentOptionalClassSection(unavailable, target)).toBeUndefined()
  expect(
    getCurrentOptionalClassSection(
      buildClassChoiceFeatureCatalogs(composeGameDataLayers([base, makeGameDataFixture()])),
      target,
    ),
  ).toBeDefined()
  expect(
    getCurrentOptionalClassSection(
      buildClassChoiceFeatureCatalogs(composeGameDataLayers([base, missing, source().data])),
      target,
    ),
  ).toBeDefined()
  const duplicated = {
    ...base,
    optionalClassSections: [
      ...base.optionalClassSections!,
      base.optionalClassSections!.find((row) => row.target === target)!,
    ],
  }
  expect(
    getCurrentOptionalClassSection(
      buildClassChoiceFeatureCatalogs(composeGameDataLayers([base, duplicated])),
      target,
    ),
  ).toBeUndefined()
})
