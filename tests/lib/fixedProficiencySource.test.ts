import { expect, test } from 'vitest'
import * as identity from '@/lib/5etools/classFeatureIdentity'
import {
  assessConcreteToolProficiency,
  getConcreteToolProficiencyName,
} from '@/lib/5etools/concreteToolProficiencies'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { resolveCopiedRecords } from '@/lib/5etools/copyResolution'
import { getCurrentDirectFixedClassRules } from '@/lib/5etools/fixedProficiencySource'
import { getCurrentSubclassProficiencyCertificate } from '@/lib/5etools/subclassProficiencySource'
import { preserveToolSourcePresentation } from '@/lib/5etools/toolProficiencySource'
import {
  buildClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { GameData, Item5e } from '@/types/5etools'
import { makeFixedSourceData, makeFixedSourceLayer } from '../fixtures/fixedProficiencyFixtures'

const toolRef = 'Tool Expertise|Artificer|TCE|6'
function direct(data: GameData) {
  return getCurrentDirectFixedClassRules(
    data.classes.find((row) => row.name === 'Artificer' && row.source === 'TCE')!,
    buildClassChoiceFeatureCatalogs(data),
  )
}
function subclass(data: GameData, name: string, source = 'PHB') {
  const cls = data.classes.find((row) => row.name === name && row.source === source)!
  const sub = cls.subclasses!.find((row) =>
    name === 'Rogue' ? row.name === 'Scout' : row.name === 'Purple Dragon Knight (Banneret)',
  )!
  const catalogs = scopeClassChoiceFeatureCatalogs(
    buildClassChoiceFeatureCatalogs(data),
    getFeatureOwnerKey(cls.name, cls.source, sub.name, sub.source),
  )
  return {
    cls,
    sub,
    catalogs,
    certificate: getCurrentSubclassProficiencyCertificate(
      cls,
      sub,
      catalogs.subclassFeatureCandidates!,
    ),
  }
}
test.each([
  'Rogue',
  'Fighter',
])('actual %s legacy and copied owners require the original current intro', (name) => {
  const { data } = makeFixedSourceData()
  for (const source of ['PHB', 'XPHB']) {
    const { cls, sub, catalogs, certificate } = subclass(data, name, source)
    expect(certificate?.paths).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: name === 'Rogue' ? 3 : 7 })]),
    )
    for (const field of ['subclassFeatures', 'subclassFeatureRefs'] as const) {
      const changed = structuredClone(sub)
      if (field === 'subclassFeatures') changed.subclassFeatures = []
      else changed.subclassFeatureRefs = []
      expect(
        getCurrentSubclassProficiencyCertificate(cls, changed, catalogs.subclassFeatureCandidates!),
      ).toBeUndefined()
    }
    const missing = new Map(catalogs.subclassFeatureCandidates)
    missing.delete(
      identity.getSubclassFeatureIdentity(
        identity.decodeSubclassFeatureReference(sub.introFeatureRef!),
      )!,
    )
    expect(getCurrentSubclassProficiencyCertificate(cls, sub, missing)).toBeUndefined()
    expect(subclass(data, name, source).certificate).toBeDefined()
  }
})
test.each([
  'Rogue',
  'Fighter',
])('two actual %s parent producers in one layer remain ambiguous; removal and later replacement restore', (name) => {
  const one = makeFixedSourceLayer(undefined, 'source-one')
  const two = makeFixedSourceLayer(undefined, 'source-two')
  const together = {
    ...one,
    classes: [...one.classes, ...two.classes.filter((row) => row.name === name)],
  }
  const composed = composeGameDataLayers([together])
  for (const source of ['PHB', 'XPHB'])
    expect(subclass(composed, name, source).certificate).toBeUndefined()
  expect(subclass(composeGameDataLayers([one]), name).certificate).toBeDefined()
  expect(subclass(composeGameDataLayers([together, two]), name).certificate).toBeDefined()
})
test.each([
  'Rogue',
  'Fighter',
])('same-layer %s subclass and consumed feature duplicates cannot be revived by re-enrichment', (name) => {
  for (const mode of ['root', 'feature']) {
    const one = makeFixedSourceLayer(undefined, 'source-one')
    const other = makeFixedSourceLayer(undefined, 'source-two')
    const cls = one.classes.find((row) => row.name === name && row.source === 'PHB')!
    const second = subclass(other, name).sub
    if (mode === 'root') cls.subclasses!.push(second)
    else {
      // A distinct raw producer carried in another projection must not hide behind the final Map.
      cls.subclasses!.push({ ...second, name: 'Unrelated source carrier' })
    }
    expect(subclass(composeGameDataLayers([one]), name).certificate).toBeUndefined()
  }
})
test('actual direct TCE owner qualifies with current complete references and no alternate printing owner', () => {
  const { data, catalogs } = makeFixedSourceData()
  expect(direct(data)).toHaveLength(1)
  const cls = data.classes.find((row) => row.name === 'Artificer' && row.source === 'TCE')!
  for (const field of ['name', 'className', 'classSource', 'source', 'level'] as const) {
    const changed = structuredClone(cls)
    Object.assign(changed.classFeatureRefs!.find((row) => row.ref === toolRef)!, {
      [field]: field === 'level' ? 7 : 'Conflict',
    })
    expect(getCurrentDirectFixedClassRules(changed, catalogs)).toEqual([])
  }
  for (const field of ['classFeatures', 'classFeatureRefs'])
    expect(getCurrentDirectFixedClassRules({ ...cls, [field]: [] }, catalogs)).toEqual([])
  expect(
    getCurrentDirectFixedClassRules(cls, { ...catalogs, classFeatureCandidates: new Map() }),
  ).toEqual([])
  expect(getCurrentDirectFixedClassRules({ ...cls, source: 'ERLW' }, catalogs)).toEqual([])
  expect(getCurrentDirectFixedClassRules({ ...cls, source: 'EFA' }, catalogs)).toEqual([])
})
test.each([
  'conditional wrapper',
  'declaration',
  'class',
  'feature',
])('raw direct %s conflict rejects before parsing or layer projection', (mode) => {
  const { data } = makeFixedSourceData((doc) => {
    const root = doc.class.find((row) => row.name === 'Artificer' && row.source === 'TCE')!
    const refs = root.classFeatures as unknown[]
    const index = refs.indexOf(toolRef)
    if (mode === 'conditional wrapper')
      refs[index] = { classFeature: toolRef, condition: 'Only at night' }
    if (mode === 'declaration') refs.push(toolRef)
    if (mode === 'class') doc.class.push(structuredClone(root))
    if (mode === 'feature')
      doc.classFeature.push(
        structuredClone(doc.classFeature.find((row) => row.name === 'Tool Expertise')!),
      )
  })
  expect(direct(data)).toEqual([])
  expect(direct(makeFixedSourceData().data)).toHaveLength(1)
})
test('direct same-layer duplicates reject while independently qualified later layers replace', () => {
  const one = makeFixedSourceLayer(undefined, 'one')
  const two = makeFixedSourceLayer(undefined, 'two')
  for (const field of ['classes', 'classFeatures'] as const) {
    const duplicate = { ...one, [field]: [...one[field], ...two[field]] }
    expect(direct(composeGameDataLayers([duplicate]))).toEqual([])
    expect(direct(composeGameDataLayers([duplicate, two]))).toHaveLength(1)
  }
})
const tool = (data: GameData, name: string, source: string) =>
  [...data.items, ...data.itemsBase].find((row) => row.name === name && row.source === source)!
test('actual concrete mundane tools qualify; inherited magic and enchanted copy do not become proficiency names', () => {
  const { data } = makeFixedSourceData()
  for (const [name, source] of [
    ['Whistle-Stick', 'OGA'],
    ['Three-Dragon Ante Set', 'PHB'],
    ['Three-Dragon Ante Set', 'XPHB'],
  ])
    expect(assessConcreteToolProficiency(tool(data, name, source)).kind).toBe('eligible')
  for (const [name, source] of [
    ['Enchanted Three-Dragon Ante Set', 'LLK'],
    ['Horn of the Endless Maze', 'WDMM'],
  ])
    expect(assessConcreteToolProficiency(tool(data, name, source)).kind).toBe('ineligible')
  expect(
    getConcreteToolProficiencyName(tool(data, 'Enchanted Three-Dragon Ante Set', 'LLK')),
  ).toBeUndefined()
  expect(
    assessConcreteToolProficiency({ name: 'A tool', source: 'PHB', type: 'T', rarity: 'none' })
      .kind,
  ).toBe('unsupported')
})
test('cache reopen preserves actual raw copy proof; missing proof cannot infer a mundane direct source', () => {
  const { data } = makeFixedSourceData()
  const reopened = composeGameDataLayers([JSON.parse(JSON.stringify(data)) as GameData])
  const names = (rows: Item5e[]) => rows.map(getConcreteToolProficiencyName).filter(Boolean).sort()
  expect(names([...reopened.items, ...reopened.itemsBase])).toEqual(
    names([...data.items, ...data.itemsBase]),
  )
  const noProof = JSON.parse(JSON.stringify(data)) as GameData
  for (const item of [...noProof.items, ...noProof.itemsBase])
    delete item.toolProficiencySourceAudit
  expect(
    assessConcreteToolProficiency(tool(composeGameDataLayers([noProof]), 'Whistle-Stick', 'OGA'))
      .kind,
  ).toBe('unsupported')
})
test('copy directive, parent mutation and duplicate parent cannot regenerate trusted semantics', () => {
  for (const mode of ['directive', 'parent', 'duplicate']) {
    const { data } = makeFixedSourceData((doc) => {
      const parent = [...doc.item, ...doc.baseitem].find(
        (row) => row.name === 'Three-Dragon Ante Set' && row.source === 'PHB',
      )!
      if (mode === 'parent')
        parent.entries = [...(parent.entries ?? []), 'Changed source interpretation.']
      if (mode === 'duplicate') doc.baseitem.push(structuredClone(parent))
      if (mode === 'directive') {
        const copied = doc.item.find((row) => row.name === 'Enchanted Three-Dragon Ante Set')!
        const copy = copied._copy as { _mod: { entries: { items: string } } }
        copy._mod.entries.items += ' Changed source interpretation.'
      }
      expect(resolveCopiedRecords([...doc.item, ...doc.baseitem], 'item').records.length).toBe(
        doc.item.length + doc.baseitem.length,
      )
    })
    expect(
      assessConcreteToolProficiency(tool(data, 'Enchanted Three-Dragon Ante Set', 'LLK')).kind,
    ).toBe('unsupported')
  }
})
test('known presentation enrichment preserves proof while a mechanical edit invalidates it', () => {
  const { data } = makeFixedSourceData()
  const original = tool(data, 'Whistle-Stick', 'OGA')
  const shown = preserveToolSourcePresentation(
    [original],
    [{ ...original, entries: ['Presentation detail.'] }],
  )[0]
  expect(assessConcreteToolProficiency(shown).kind).toBe('eligible')
  expect(
    assessConcreteToolProficiency(
      preserveToolSourcePresentation([original], [{ ...original, rarity: 'rare' }])[0],
    ).kind,
  ).toBe('unsupported')
  const empty = composeGameDataLayers([{ ...data, items: [], itemsBase: [] }])
  expect(
    [...empty.items, ...empty.itemsBase].map(getConcreteToolProficiencyName).filter(Boolean),
  ).toEqual([])
})
