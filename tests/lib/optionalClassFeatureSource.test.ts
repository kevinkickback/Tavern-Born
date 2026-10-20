import { expect, test } from 'vitest'
import { getCurrentCannyChoices } from '@/lib/5etools/cannyChoices'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { getNaturalExplorerSources } from '@/lib/5etools/naturalExplorerSource'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import { getCurrentOptionalClassDeclaration } from '@/lib/5etools/optionalClassFeatureSource'
import {
  buildClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import {
  makeOptionalClassSourceData,
  makeOptionalClassSourceLayer,
  optionalClassSources,
} from '../fixtures/optionalClassFeatureFixtures'

const OWNER: ['class', string, string] = ['class', 'ranger', 'phb']
const DEFT = 'class-feature|deft explorer|ranger|phb|1|tce'
const FOE = 'class-feature|favored foe|ranger|phb|1|tce'
const FOCUS = 'class-feature|spellcasting focus|ranger|phb|2|tce'
const CHILD = 'class-feature|deft explorer improvement|ranger|phb|10|tce'
const current = (
  catalogs: Parameters<typeof getCurrentOptionalClassDeclaration>[0],
  target = DEFT,
) => getCurrentOptionalClassDeclaration(catalogs, OWNER, target)

test('actual Ranger declarations independently certify three roots and earned children without changing old source bodies', () => {
  const before = JSON.stringify(optionalClassSources)
  const { catalogs, data } = makeOptionalClassSourceData()
  for (const [target, level] of [
    [DEFT, 1],
    [FOE, 1],
    [FOCUS, 2],
    [CHILD, 10],
  ] as const)
    expect(current(catalogs, target)).toMatchObject({ level, feature: { level } })
  const cls = data.classes.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
  expect(getCurrentCannyChoices(cls, true, catalogs)).toHaveLength(2)
  expect(
    getNaturalExplorerSources(catalogs).get('class-feature|natural explorer|ranger|phb|1|phb'),
  ).toBeDefined()
  expect(
    catalogs.classFeatures.find((row) => row.name === 'Deft Explorer' && row.source === 'TCE'),
  ).not.toHaveProperty('optionalClassFeatureSources')
  expect(JSON.stringify(optionalClassSources)).toBe(before)
})

test('source proofs survive actual cache serialization and catalog scoping; source absence restores without a read write', () => {
  const original = makeOptionalClassSourceLayer()
  const cache = JSON.parse(JSON.stringify(original))
  const catalogs = buildClassChoiceFeatureCatalogs(composeGameDataLayers([cache]))
  const before = JSON.stringify(cache)
  expect(current(scopeClassChoiceFeatureCatalogs(catalogs))).toBeDefined()
  for (const missing of [
    { ...catalogs, optionalClassFeatureSources: [] },
    { ...catalogs, optionalClassFeatureSources: undefined },
    { ...catalogs, classes: [] },
    { ...catalogs, classFeatures: [] },
    { ...catalogs, classFeatureCandidates: new Map() },
  ])
    expect(current(missing)).toBeUndefined()
  expect(current(catalogs)).toBeDefined()
  expect(JSON.stringify(cache)).toBe(before)
})

test.each([
  'missing child body',
  'missing child declaration',
])('%s affects only that child and does not invalidate the earned root or independent roots', (mode) => {
  const { catalogs } = makeOptionalClassSourceData((doc) => {
    if (mode === 'missing child body')
      doc.classFeature = doc.classFeature.filter(
        (row) =>
          !(
            row.name === 'Deft Explorer Improvement' &&
            row.classSource === 'PHB' &&
            row.level === 10
          ),
      )
    else {
      const cls = doc.class.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
      cls.classFeatures = (cls.classFeatures as unknown[]).filter(
        (row) => row !== 'Deft Explorer Improvement|Ranger||10|TCE',
      )
    }
  })
  expect(current(catalogs, CHILD)).toBeUndefined()
  for (const target of [DEFT, FOE, FOCUS]) expect(current(catalogs, target)).toBeDefined()
})

test.each([
  'duplicate class',
  'duplicate feature',
  'canonical duplicate feature',
  'wrapped root',
  'extra root qualifier',
  'copied parent',
])('raw uncertainty is retained before any lookup collapse: %s', (mode) => {
  const { catalogs } = makeOptionalClassSourceData((doc) => {
    const cls = doc.class.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
    const deft = doc.classFeature.find(
      (row) => row.name === 'Deft Explorer' && row.classSource === 'PHB',
    )!
    if (mode === 'duplicate class') doc.class.push(structuredClone(cls))
    if (mode === 'duplicate feature' || mode === 'canonical duplicate feature')
      doc.classFeature.unshift({
        ...structuredClone(deft),
        ...(mode === 'canonical duplicate feature'
          ? { name: ' DEFT EXPLORER ', source: 'tce' }
          : {}),
      })
    if (mode === 'wrapped root')
      cls.classFeatures = (cls.classFeatures as unknown[]).map((row) =>
        row === 'Deft Explorer|Ranger||1|TCE'
          ? { classFeature: row, condition: 'Only at night' }
          : row,
      )
    if (mode === 'extra root qualifier') deft.condition = 'Only at night'
    if (mode === 'copied parent') cls._copy = { name: 'Ranger', source: 'XPHB' }
  })
  expect(current(catalogs)).toBeUndefined()
})

test.each([
  'name',
  'className',
  'classSource',
  'source',
  'level',
] as const)('a unique retained UID cannot repair an explicit reference %s conflict', (field) => {
  const { data } = makeOptionalClassSourceData()
  const changed = structuredClone(data)
  const ref = changed.classes
    .find((row) => row.name === 'Ranger' && row.source === 'PHB')!
    .classFeatureRefs!.find((row) => row.name === 'Deft Explorer' && row.source === 'TCE')!
  Object.assign(ref, { [field]: field === 'level' ? 2 : 'Other' })
  expect(current(buildClassChoiceFeatureCatalogs(changed))).toBeUndefined()
  expect(current(buildClassChoiceFeatureCatalogs(data))).toBeDefined()
})

test('winning raw overlays replace their evidence too, including missing proof; exact later restoration works', () => {
  const base = makeOptionalClassSourceLayer(undefined, 'fixture:base')
  const overlay = makeOptionalClassSourceLayer(undefined, 'fixture:overlay')
  const withoutProof = { ...overlay, optionalClassFeatureSources: [] }
  expect(
    current(buildClassChoiceFeatureCatalogs(composeGameDataLayers([base, withoutProof]))),
  ).toBeUndefined()
  const changed = makeOptionalClassSourceLayer((doc) => {
    const row = doc.classFeature.find(
      (row) => row.name === 'Deft Explorer' && row.source === 'TCE',
    )!
    ;(row.entries as unknown[]).push('Only at night.')
  }, 'fixture:changed')
  expect(
    current(buildClassChoiceFeatureCatalogs(composeGameDataLayers([base, changed]))),
  ).toBeUndefined()
  expect(
    current(buildClassChoiceFeatureCatalogs(composeGameDataLayers([base, changed, overlay]))),
  ).toBeDefined()
})

test('same-layer competing parsed producers cannot lend an agreeing proof through first-match composition', () => {
  const base = makeOptionalClassSourceLayer(undefined, 'fixture:base')
  const other = makeOptionalClassSourceLayer(undefined, 'fixture:other')
  const duplicate = {
    ...base,
    classes: [...base.classes, ...other.classes],
    classFeatures: [...base.classFeatures, ...other.classFeatures],
    optionalClassFeatureSources: [
      ...base.optionalClassFeatureSources!,
      ...other.optionalClassFeatureSources!,
    ],
  }
  expect(
    current(buildClassChoiceFeatureCatalogs(composeGameDataLayers([duplicate]))),
  ).toBeUndefined()
  expect(
    current(buildClassChoiceFeatureCatalogs(composeGameDataLayers([duplicate, base]))),
  ).toBeDefined()
})

test.each([
  'direct builder',
  'complete index',
  'listed collection',
])('duplicate current feature producers cannot borrow an earlier single raw proof: %s', (mode) => {
  const { data, catalogs } = makeOptionalClassSourceData()
  const feature = catalogs.classFeatures.find(
    (row) => row.name === 'Deft Explorer' && row.source === 'TCE',
  )!
  const candidates = new Map(catalogs.classFeatureCandidates)
  candidates.set(DEFT, [feature, structuredClone(feature)])
  const changed =
    mode === 'direct builder'
      ? buildClassChoiceFeatureCatalogs({
          ...data,
          classFeatures: [...data.classFeatures, structuredClone(feature)],
        })
      : mode === 'complete index'
        ? { ...catalogs, classFeatureCandidates: candidates }
        : { ...catalogs, classFeatures: [...catalogs.classFeatures, structuredClone(feature)] }
  expect(current(changed)).toBeUndefined()
  for (const target of [FOE, FOCUS, CHILD]) expect(current(changed, target)).toBeDefined()
  expect(current(buildClassChoiceFeatureCatalogs(data))).toBeDefined()
  expect(current(catalogs)).toBeDefined()
})

test('current metadata and source proof fields cannot be injected into an otherwise matching producer', () => {
  const { data } = makeOptionalClassSourceData()
  for (const corrupt of [
    { version: 2 },
    { certificate: 'forged' },
    { origin: '' },
    { verified: false },
    { unknownCondition: true },
  ]) {
    const changed = structuredClone(data)
    changed.optionalClassFeatureSources = changed.optionalClassFeatureSources!.map((row) =>
      row.kind === 'feature' && row.target === DEFT ? ({ ...row, ...corrupt } as typeof row) : row,
    )
    expect(current(buildClassChoiceFeatureCatalogs(changed))).toBeUndefined()
  }
  expect(current(buildClassChoiceFeatureCatalogs(data))).toBeDefined()
})

test('the source classifier includes nonpilot optional routes without making them adoptable or conflating revised standards', () => {
  expect(OPTIONAL_CLASS_FEATURE_RULES.roots.map((row) => [row.target, row.level])).toEqual([
    [DEFT, 1],
    [FOE, 1],
    [FOCUS, 2],
  ])
  const known = new Set(OPTIONAL_CLASS_FEATURE_RULES.knownOptionalTargets.map((row) => row.target))
  expect(known.size).toBe(50)
  expect(known.has('class-feature|bardic versatility|bard|phb|4|tce')).toBe(true)
  expect(known.has('class-feature|deft explorer|ranger|xphb|2|xphb')).toBe(false)
  expect(known.has('class-feature|expertise|ranger|xphb|9|xphb')).toBe(false)
})
