import { expect, test } from 'vitest'
import {
  getConditionalOptionalIdentity,
  getConditionalOptionalSources,
} from '@/lib/5etools/conditionalProficiencySource'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { resolveFeatureTableDefinition } from '@/lib/5etools/featureTableOptions'
import { parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import { isConditionalOnlySubclassProficiencyTarget } from '@/lib/5etools/subclassProficiencyRegistry'
import { getCurrentSubclassProficiencyCertificate } from '@/lib/5etools/subclassProficiencySource'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getClassChoiceOptionKey, getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { OptionalFeatureLike } from '@/types/5etools'
import {
  conditionalSources,
  makeConditionalSourceData,
  makeConditionalSourceLayer,
} from '../fixtures/conditionalProficiencyFixtures'
import { makeFeatureOptionFixture } from '../fixtures/featureOptionFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const FIRE = 'optionalFeature|fire rune|tce'
const DRAGON = 'subclass-feature|dragon ancestor|sorcerer|phb|draconic|phb|1|phb'
function dragonCandidates(catalogs: ClassChoiceFeatureCatalogs) {
  return (
    scopeClassChoiceFeatureCatalogs(
      catalogs,
      getFeatureOwnerKey('Sorcerer', 'PHB', 'Draconic Bloodline', 'PHB'),
    ).subclassFeatureCandidates!.get(DRAGON) ?? []
  )
}
function authority(
  data: ReturnType<typeof makeConditionalSourceLayer>,
  name: string,
  source: string,
  subclassName: string,
) {
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const cls = data.classes.find((row) => row.name === name && row.source === source)!
  const sub = cls.subclasses!.find((row) => row.name === subclassName)!
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(cls.name, cls.source, sub.name, sub.source),
  )
  return getCurrentSubclassProficiencyCertificate(cls, sub, scoped.subclassFeatureCandidates!)
}
test.each([
  [
    'Fighter',
    'PHB',
    'Rune Knight',
    'subclass-feature|rune carver|fighter|phb|rune knight|tce|3|tce',
    3,
  ],
  [
    'Fighter',
    'XPHB',
    'Rune Knight',
    'subclass-feature|rune carver|fighter|phb|rune knight|tce|3|tce',
    3,
  ],
  [
    'Sorcerer',
    'PHB',
    'Draconic Bloodline',
    'subclass-feature|dragon ancestor|sorcerer|phb|draconic|phb|1|phb',
    1,
  ],
  [
    'Sorcerer',
    'XPHB',
    'Draconic Bloodline',
    'subclass-feature|dragon ancestor|sorcerer|phb|draconic|phb|1|phb',
    3,
  ],
] as const)('actual %s %s %s retains original intro, target and enclosing earned level', (name, source, subclassName, target, level) => {
  const { data } = makeConditionalSourceData()
  expect(authority(data, name, source, subclassName)?.paths).toEqual(
    expect.arrayContaining([expect.objectContaining({ target, level })]),
  )
  const missing = makeConditionalSourceData((doc) => {
    const root = doc.subclass.find(
      (row) => row.className === name && row.classSource === source && row.name === subclassName,
    )!
    root.subclassFeatures = []
  }).data
  expect(authority(missing, name, source, subclassName)).toBeUndefined()
})
test('raw optional proof survives cache serialization and current catalog scoping with the exact native option key', () => {
  const original = JSON.stringify(conditionalSources)
  const { data, catalogs } = makeConditionalSourceData()
  const fire = getConditionalOptionalSources(catalogs).get(FIRE)!
  expect(fire).toBeDefined()
  expect(getConditionalOptionalIdentity(fire)).toBe(
    getClassChoiceOptionKey({ entityType: 'optionalFeature', name: 'Fire Rune', source: 'TCE' }),
  )
  expect(fire.conditionalProficiencySourceAudit).toMatchObject({ version: 1, verified: true })
  expect(
    getConditionalOptionalSources(scopeClassChoiceFeatureCatalogs(catalogs)).get(FIRE),
  ).toEqual(fire)
  const cached = JSON.parse(JSON.stringify(data))
  expect(
    getConditionalOptionalSources(
      buildClassChoiceFeatureCatalogs(composeGameDataLayers([cached])),
    ).get(FIRE),
  ).toEqual(fire)
  expect(JSON.stringify(conditionalSources)).toBe(original)
})
test.each([
  'identical',
  'conflicting',
  'injected audit',
  'extra qualifier',
  'metadata',
])('every raw Fire occurrence is audited before collapse: %s', (mode) => {
  const { catalogs } = makeConditionalSourceData((doc) => {
    const fire = doc.optionalfeature.find((row) => row.name === 'Fire Rune')!
    if (mode === 'identical' || mode === 'conflicting')
      doc.optionalfeature.push({
        ...structuredClone(fire),
        ...(mode === 'conflicting' ? { entries: ['Only at night.'] } : {}),
      })
    if (mode === 'injected audit')
      fire.conditionalProficiencySourceAudit = {
        version: 1,
        verified: true,
        certificate: 'forged',
        origin: 'forged',
      }
    if (mode === 'extra qualifier') fire.condition = 'Only at night'
    if (mode === 'metadata') fire.page = { condition: 'Only at night' }
  })
  expect(getConditionalOptionalSources(catalogs).get(FIRE)).toBeUndefined()
})
test('current empty collection/index, absent context and each explicit optional target conflict stay unavailable', () => {
  const { catalogs } = makeConditionalSourceData()
  const fire = getConditionalOptionalSources(catalogs).get(FIRE)!
  for (const missing of [
    { ...catalogs, optionalFeatures: [] },
    { ...catalogs, optionalFeatureCandidates: new Map() },
    { ...catalogs, optionalFeatures: undefined },
  ])
    expect(getConditionalOptionalSources(missing).get(FIRE)).toBeUndefined()
  for (const changed of [{ name: 'Other Rune' }, { source: 'PHB' }, { ref: 'Fire Rune|PHB' }]) {
    const bad = { ...fire, ...changed }
    expect(
      getConditionalOptionalSources({
        ...catalogs,
        optionalFeatures: [bad],
        optionalFeatureCandidates: new Map([[FIRE, [bad]]]),
      }).get(FIRE),
    ).toBeUndefined()
  }
  expect(getConditionalOptionalSources(catalogs).get(FIRE)).toEqual(fire)
})
test('distinct winning-layer optional origins invalidate every mirror; later exact overlays and restoration remain valid', () => {
  const base = makeConditionalSourceLayer(undefined, 'fixture:base')
  const other = makeConditionalSourceLayer(undefined, 'fixture:other')
  const duplicate = composeGameDataLayers([
    { ...base, optionalfeatures: [...base.optionalfeatures, ...other.optionalfeatures] },
  ])
  expect(
    getConditionalOptionalSources(buildClassChoiceFeatureCatalogs(duplicate)).get(FIRE),
  ).toBeUndefined()
  const original = base.optionalfeatures.find(
    (row) => getConditionalOptionalIdentity(row) === FIRE,
  ) as OptionalFeatureLike
  const sameOrigin = composeGameDataLayers([
    { ...base, optionalfeatures: [...base.optionalfeatures, structuredClone(original)] },
  ])
  expect(
    getConditionalOptionalSources(buildClassChoiceFeatureCatalogs(sameOrigin)).get(FIRE),
  ).toEqual(original)
  const raw = conditionalSources.optionalfeature.find((row) => row.name === 'Fire Rune')!
  const invalid = makeGameDataFixture({
    optionalfeatures: parseOptionalFeatures(
      [{ ...raw, entries: ['Changed rules.'] }],
      'fixture:overlay',
    ),
  })
  const lost = composeGameDataLayers([base, invalid])
  expect(
    getConditionalOptionalSources(buildClassChoiceFeatureCatalogs(lost)).get(FIRE),
  ).toBeUndefined()
  const restored = composeGameDataLayers([
    base,
    invalid,
    makeGameDataFixture({ optionalfeatures: parseOptionalFeatures([raw], 'fixture:restored') }),
  ])
  expect(
    getConditionalOptionalSources(buildClassChoiceFeatureCatalogs(restored)).get(FIRE)?.entries,
  ).toEqual(raw.entries)
})
test('conditional parent/root/consumed targets reject distinct same-layer producers before class Maps', () => {
  const base = makeConditionalSourceLayer(undefined, 'fixture:base')
  const other = makeConditionalSourceLayer(undefined, 'fixture:other')
  const duplicated = composeGameDataLayers([
    { ...base, classes: [...base.classes, ...other.classes] },
  ])
  for (const source of ['PHB', 'XPHB']) {
    expect(authority(duplicated, 'Fighter', source, 'Rune Knight')).toBeUndefined()
    expect(authority(duplicated, 'Sorcerer', source, 'Draconic Bloodline')).toBeUndefined()
  }
  const mirror = structuredClone(base)
  const rune = mirror.classes
    .find((row) => row.name === 'Fighter' && row.source === 'PHB')!
    .subclasses!.find((row) => row.name === 'Rune Knight')!
  const group = rune.levelFeatures!.find((row) => row.level === 3)!
  group.features.push(structuredClone(group.features[0]))
  expect(authority(composeGameDataLayers([mirror]), 'Fighter', 'PHB', 'Rune Knight')).toBeDefined()
  const roots = structuredClone(base)
  const cls = roots.classes.find((row) => row.name === 'Fighter' && row.source === 'PHB')!
  cls.subclasses!.push(structuredClone(cls.subclasses!.find((row) => row.name === 'Rune Knight')!))
  expect(authority(composeGameDataLayers([roots]), 'Fighter', 'PHB', 'Rune Knight')).toBeUndefined()
})

test('the actual packaged ancestry table stays supported without conditional-note certification', () => {
  const packaged = makeFeatureOptionFixture()
  expect(packaged.choice!.options).toHaveLength(10)
  expect(authority(packaged.data, 'Sorcerer', 'PHB', 'Draconic Bloodline')).toBeUndefined()
  expect(isConditionalOnlySubclassProficiencyTarget(DRAGON)).toBe(true)
  for (const target of [
    'subclass-feature|blessings of knowledge|cleric|phb|knowledge|phb|1|phb',
    'subclass-feature|survivalist|rogue|phb|scout|xge|3|xge',
    'subclass-feature|royal envoy|fighter|phb|banneret|scag|7|scag',
  ])
    expect(isConditionalOnlySubclassProficiencyTarget(target)).toBe(false)
})

test.each([
  'page omitted',
  'identical raw duplicate',
  'conditional clause changed',
])('independent table proof survives conditional-only uncertainty: %s', (mode) => {
  const { data, catalogs } = makeConditionalSourceData((doc) => {
    const dragon = doc.subclassFeature.find((row) => row.name === 'Dragon Ancestor')!
    if (mode === 'page omitted') delete dragon.page
    if (mode === 'identical raw duplicate') doc.subclassFeature.push(structuredClone(dragon))
    if (mode === 'conditional clause changed')
      (dragon.entries as unknown[]).push('Only while speaking Draconic.')
  })
  expect(resolveFeatureTableDefinition(dragonCandidates(catalogs))?.rows).toHaveLength(10)
  expect(authority(data, 'Sorcerer', 'PHB', 'Draconic Bloodline')).toBeUndefined()
  expect(authority(data, 'Sorcerer', 'XPHB', 'Draconic Bloodline')).toBeUndefined()
  const exact = makeConditionalSourceData().data
  expect(authority(exact, 'Sorcerer', 'PHB', 'Draconic Bloodline')).toBeDefined()
  expect(authority(exact, 'Sorcerer', 'XPHB', 'Draconic Bloodline')).toBeDefined()
})

test('distinct-origin layer duplicates invalidate conditional certificates without poisoning agreeing tables', () => {
  const base = makeConditionalSourceLayer(undefined, 'fixture:base')
  const other = makeConditionalSourceLayer(undefined, 'fixture:other')
  const data = composeGameDataLayers([{ ...base, classes: [...base.classes, ...other.classes] }])
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  expect(resolveFeatureTableDefinition(dragonCandidates(catalogs))?.rows).toHaveLength(10)
  expect(authority(data, 'Sorcerer', 'PHB', 'Draconic Bloodline')).toBeUndefined()
  expect(authority(data, 'Sorcerer', 'XPHB', 'Draconic Bloodline')).toBeUndefined()
})

test('genuine table-body conflicts still reject both proofs after conditional-only isolation', () => {
  const { data, catalogs } = makeConditionalSourceData((doc) => {
    const dragon = doc.subclassFeature.find((row) => row.name === 'Dragon Ancestor')!
    doc.subclassFeature.push({ ...structuredClone(dragon), entries: ['Conflicting rules.'] })
  })
  const candidates = dragonCandidates(catalogs)
  expect(candidates.length).toBeGreaterThan(0)
  expect(candidates.every((row) => row.featureOptionSourceConflict)).toBe(true)
  expect(resolveFeatureTableDefinition(candidates)).toBeUndefined()
  expect(authority(data, 'Sorcerer', 'PHB', 'Draconic Bloodline')).toBeUndefined()
})
