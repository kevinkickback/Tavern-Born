import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { DataFilter } from '@/lib/5etools/filters'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { XPHB_LEGACY_SUBCLASS_KEYS } from '@/lib/5etools/rulesetMetadata'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import {
  buildClassChoiceFeatureCatalogs,
  getClassChoiceCandidates,
} from '@/lib/character/classChoiceOptions'
import type { Class5e } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { makeKnowledgeFixture } from '../fixtures/knowledgeProficiencyFixtures'

const filters = {
  sources: ['XPHB', 'PSA', 'FRHoF'],
  allowedSubclassKeys: XPHB_LEGACY_SUBCLASS_KEYS,
}
const selected = (classes: ReturnType<typeof makeKnowledgeFixture>['data']['classes']) =>
  classes.find((c) => c.source === 'XPHB')!.subclasses!.find((s) => s.source === 'PSA')!

test('an enabled supplemental subclass retains its exact declared automatic PHB dependencies, not PHB class availability', () => {
  const f = makeKnowledgeFixture('XPHB', 'PSA', 'Knowledge Domain (PSA)')
  const before = structuredClone(f.data.classes)
  const classes = DataFilter.filterClasses(f.data.classes, filters)
  const owner = classes.find((c) => c.source === 'XPHB')!,
    subclass = selected(classes)
  expect(classes.map((c) => c.source)).toEqual(['XPHB'])
  expect(
    getClassChoiceCandidates(
      owner,
      subclass,
      buildClassChoiceFeatureCatalogs({ ...f.data, classes }),
    )
      .filter((c) => c.kind === 'proficiency')
      .map((c) => [c.proficiencyDomain, c.maximumSelections, c.level]),
  ).toEqual([
    ['expertise', 2, 3],
    ['languages', 2, 3],
  ])
  expect(
    collectUnconditionalFeatureReferences(subclass.subclassFeatureRefs!, 'subclassFeature').map(
      (r) => r.target,
    ),
  ).toContain('subclass-feature|knowledge domain|cleric|phb|knowledge|phb|1|phb')
  expect(f.data.classes).toEqual(before)
})

test('source OFF and explicit root/ancestor/leaf suppression remove dependency setup, and exact restoration restores it', () => {
  const f = makeKnowledgeFixture('XPHB', 'PSA', 'Knowledge Domain (PSA)')
  expect(
    DataFilter.filterClasses(f.data.classes, { ...filters, sources: ['XPHB'] })[0].subclasses?.some(
      (s) => s.source === 'PSA',
    ),
  ).toBe(false)
  for (const key of [
    'Knowledge Domain (PSA)|PSA',
    'Knowledge Domain|PHB',
    'Blessings of Knowledge|PHB',
  ]) {
    const classes = DataFilter.filterClasses(f.data.classes, {
      ...filters,
      suppressedKeys: new Set([key]),
    })
    expect(
      selected(classes)?.normalizedRules?.choices.filter((c) => c.kind === 'proficiency') ?? [],
    ).toEqual([])
  }
  expect(
    selected(DataFilter.filterClasses(f.data.classes, filters)).normalizedRules!.choices.filter(
      (c) => c.kind === 'proficiency',
    ),
  ).toHaveLength(2)
})

test.each([
  'name',
  'source',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
] as const)('an explicit nested %s conflict cannot borrow its encoded PHB target', (field) => {
  const f = makeKnowledgeFixture('XPHB', 'PSA', 'Knowledge Domain (PSA)')
  const intro = selected(f.data.classes).subclassFeatureRefs![0].feature!
  const reference = (intro.entries as Array<Record<string, unknown>>).find(
    (e) => e.type === 'refSubclassFeature',
  )!
  reference[field] = field === 'level' ? 2 : 'Other'
  const filtered = selected(DataFilter.filterClasses(f.data.classes, filters))
  expect(filtered.normalizedRules!.choices.filter((c) => c.kind === 'proficiency')).toEqual([])
  expect(JSON.stringify(filtered.entries)).not.toContain('Blessings of Knowledge')
})

test('an attached different printing and an options-only PHB reference cannot acquire dependency permission', () => {
  for (const mode of ['body', 'options'] as const) {
    const f = makeKnowledgeFixture('XPHB', 'PSA', 'Knowledge Domain (PSA)')
    const intro = selected(f.data.classes).subclassFeatureRefs![0].feature!
    const reference = (intro.entries as Array<Record<string, unknown>>).find(
      (e) => e.type === 'refSubclassFeature',
    )!
    if (mode === 'body') (reference.feature as Record<string, unknown>).source = 'Other'
    else intro.entries = [{ type: 'options', count: 1, entries: [reference] }]
    const subclass = selected(DataFilter.filterClasses(f.data.classes, filters))
    expect(subclass.normalizedRules!.choices.filter((c) => c.kind === 'proficiency')).toEqual([])
    expect(JSON.stringify(subclass.entries)).not.toContain('Blessings of Knowledge')
  }
})

test('duplicate current parent or selected owner cannot confer dependency permission', () => {
  for (const mode of ['parent', 'owner'] as const) {
    const f = makeKnowledgeFixture('XPHB', 'PSA', 'Knowledge Domain (PSA)')
    const cls = f.data.classes.find((c) => c.source === 'XPHB')!
    if (mode === 'parent') f.data.classes.push(structuredClone(cls))
    else cls.subclasses!.push(structuredClone(selected(f.data.classes)))
    const subclass = selected(DataFilter.filterClasses(f.data.classes, filters))
    expect(subclass.normalizedRules!.choices.filter((c) => c.kind === 'proficiency')).toEqual([])
  }
})

function automaticLayer(mode: 'unique' | 'duplicate' | 'missing' = 'unique') {
  const leaf = {
    name: 'Automatic Insight',
    className: 'Cleric',
    classSource: 'PHB',
    subclassShortName: 'Study',
    subclassSource: 'PHB',
    source: 'PHB',
    level: 6,
    entries: [
      mode === 'duplicate'
        ? 'As an action, recall this ambiguous winning declaration.'
        : 'As an action, recall the declared lesson.',
    ],
  }
  const parsed = parseClassDocument({
    class: [{ name: 'Cleric', source: 'XPHB', classFeatures: [] }],
    subclass: [
      {
        name: 'Study',
        shortName: 'Study',
        source: 'TCE',
        className: 'Cleric',
        classSource: 'XPHB',
        subclassFeatures: [
          'Study|Cleric|XPHB|Study|TCE|3|TCE',
          'Automatic Insight|Cleric|PHB|Study|PHB|6|PHB',
        ],
      },
    ],
    subclassFeature: [
      {
        name: 'Study',
        className: 'Cleric',
        classSource: 'XPHB',
        subclassShortName: 'Study',
        subclassSource: 'TCE',
        source: 'TCE',
        level: 3,
        entries: ['A distinct enabled supplemental owner.'],
      },
      ...(mode === 'missing' ? [] : [leaf]),
      ...(mode === 'duplicate' ? [structuredClone(leaf)] : []),
    ],
  })
  return makeGameDataFixture({ classes: parsed.classes as Class5e[] })
}

test('an ambiguous automatic target cannot be refilled from an earlier layer, but an omitted target can', () => {
  const base = automaticLayer()
  const ambiguous = composeGameDataLayers([base, automaticLayer('duplicate')])
  const reference = ambiguous.classes[0].subclasses![0].subclassFeatureRefs![1]
  expect(reference.sourceIdentityConflict).toBe(true)
  expect(reference.feature?.sourceIdentityConflict).toBe(true)
  expect(reference.feature?.entries).toEqual([
    'As an action, recall this ambiguous winning declaration.',
  ])
  const result = DataFilter.filterClasses(ambiguous.classes, { sources: ['XPHB', 'TCE'] })[0]
    .subclasses![0]
  expect(result.subclassFeatureRefs!.map((r) => r.name)).toEqual(['Study'])
  const missing = composeGameDataLayers([base, automaticLayer('missing')])
  expect(
    DataFilter.filterClasses(missing.classes, {
      sources: ['XPHB', 'TCE'],
    })[0].subclasses![0].subclassFeatureRefs!.map((r) => r.name),
  ).toEqual(['Study', 'Automatic Insight'])
  const restored = composeGameDataLayers([ambiguous, automaticLayer()])
  expect(
    DataFilter.filterClasses(restored.classes, { sources: ['XPHB', 'TCE'] })[0].subclasses![0]
      .subclassFeatureRefs![1].feature?.entries,
  ).toEqual(['As an action, recall the declared lesson.'])
})

test.each([
  'parent',
  'owner',
] as const)('composition preserves raw %s ambiguity before its identity Map', (mode) => {
  const layer = automaticLayer()
  if (mode === 'parent') layer.classes.push(structuredClone(layer.classes[0]))
  else layer.classes[0].subclasses!.push(structuredClone(layer.classes[0].subclasses![0]))
  const composed = composeGameDataLayers([layer])
  const subclass = DataFilter.filterClasses(composed.classes, { sources: ['XPHB', 'TCE'] })[0]
    .subclasses![0]
  expect(subclass.sourceIdentityConflict).toBe(true)
  expect(subclass.subclassFeatureRefs!.map((r) => r.name)).toEqual(['Study'])
})

test('a copied owner cannot hide competing raw copy bases', () => {
  const parsed = parseClassDocument({
    class: [{ name: 'Cleric', source: 'XPHB' }],
    subclass: [
      ...[0, 1].map(() => ({
        name: 'Base',
        shortName: 'Base',
        source: 'TCE',
        className: 'Cleric',
        classSource: 'XPHB',
      })),
      {
        name: 'Study',
        shortName: 'Study',
        source: 'TCE',
        className: 'Cleric',
        classSource: 'XPHB',
        _copy: {
          name: 'Base',
          shortName: 'Base',
          source: 'TCE',
          className: 'Cleric',
          classSource: 'XPHB',
        },
        subclassFeatures: ['Automatic Insight|Cleric|PHB|Study|PHB|6|PHB'],
      },
    ],
    subclassFeature: [
      {
        name: 'Automatic Insight',
        className: 'Cleric',
        classSource: 'PHB',
        subclassShortName: 'Study',
        subclassSource: 'PHB',
        source: 'PHB',
        level: 6,
        entries: ['A declared dependency.'],
      },
    ],
  })
  const classes = DataFilter.filterClasses(parsed.classes as Class5e[], {
    sources: ['XPHB', 'TCE'],
  })
  const subclass = classes[0].subclasses!.find((s) => s.name === 'Study')!
  expect(subclass.sourceIdentityConflict).toBe(true)
  expect(subclass.subclassFeatureRefs).toEqual([])
})

test.each([
  'clean',
  'conflicting-root',
  'valid-later-path',
  'empty-refs',
] as const)('automatic dependencies require their complete current ancestor path: %s', (mode) => {
  const leafRef = 'Automatic Insight|Cleric|PHB|Study|PHB|6|PHB'
  const root = (name: string, level: number) => ({
    name,
    source: 'TCE',
    className: 'Cleric',
    classSource: 'XPHB',
    subclassShortName: 'Study',
    subclassSource: 'TCE',
    level,
    entries: [{ type: 'refSubclassFeature', subclassFeature: leafRef }],
  })
  const parsed = parseClassDocument({
    class: [{ name: 'Cleric', source: 'XPHB' }],
    subclass: [
      {
        name: 'Study',
        shortName: 'Study',
        source: 'TCE',
        className: 'Cleric',
        classSource: 'XPHB',
        subclassFeatures: [
          'Study|Cleric|XPHB|Study|TCE|3|TCE',
          ...(mode === 'valid-later-path' ? ['Later Study|Cleric|XPHB|Study|TCE|17|TCE'] : []),
        ],
      },
    ],
    subclassFeature: [
      root('Study', 3),
      root('Later Study', 17),
      {
        name: 'Automatic Insight',
        source: 'PHB',
        className: 'Cleric',
        classSource: 'PHB',
        subclassShortName: 'Study',
        subclassSource: 'PHB',
        level: 6,
        entries: ['As an action, invoke the ancient lesson.'],
      },
    ],
  })
  const classes = parsed.classes as Class5e[]
  const owner = classes[0].subclasses![0]
  if (mode === 'conflicting-root' || mode === 'valid-later-path')
    owner.subclassFeatureRefs![0].className = 'Other'
  if (mode === 'empty-refs') owner.subclassFeatureRefs = []
  const filtered = DataFilter.filterClasses(classes, { sources: ['XPHB', 'TCE'] })[0].subclasses![0]
  const retained = collectUnconditionalFeatureReferences(
    filtered.subclassFeatureRefs!,
    'subclassFeature',
  ).filter((row) => row.target.includes('automatic insight'))
  expect(retained.map((row) => row.level)).toEqual(
    mode === 'clean' ? [6] : mode === 'valid-later-path' ? [17] : [],
  )
  expect(retained.every((row) => !!row.reference.feature)).toBe(true)
  if (mode !== 'clean') expect(JSON.stringify(filtered.entries)).not.toContain('Automatic Insight')
  if (mode !== 'clean')
    expect(
      JSON.stringify(filtered.levelFeatures?.find((group) => group.level === 3)),
    ).not.toContain('Automatic Insight')
  if (mode === 'valid-later-path')
    expect(JSON.stringify(filtered.levelFeatures?.find((group) => group.level === 17))).toContain(
      'Automatic Insight',
    )
})
