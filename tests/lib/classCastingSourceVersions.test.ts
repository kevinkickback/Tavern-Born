import { expect, test } from 'vitest'
import {
  CLASS_CASTING_PRODUCERS,
  getCurrentClassCastingProducer,
} from '@/lib/5etools/classCastingSource'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import {
  type OptionalDeclarationOwner,
  optionalDeclarationKey,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  classCastingDocuments,
  makeBundledClassCastingData,
  makeBundledClassCastingLayer,
  makeClassCastingLayer,
} from '../fixtures/classCastingFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const owner: OptionalDeclarationOwner = ['class', 'wizard', 'phb']
const target = 'class-feature|spellcasting|wizard|phb|1|phb'
const key = optionalDeclarationKey(owner, target, 1)
const catalog = buildClassChoiceFeatureCatalogs

test('all actual bundled packages qualify without adding producers or inferring absent subclasses', () => {
  const data = makeBundledClassCastingData()
  const offered = CLASS_CASTING_PRODUCERS.filter(
    (row) =>
      row.declaration.owner[0] === 'class' &&
      data.classes.some(
        (cls) =>
          cls.name.toLowerCase() === row.declaration.owner[1] &&
          cls.source.toLowerCase() === row.declaration.owner[2],
      ),
  )
  expect(offered).toHaveLength(24)
  expect(CLASS_CASTING_PRODUCERS).toHaveLength(34)
  expect(
    CLASS_CASTING_PRODUCERS.reduce(
      (count, row) => count + (row.declarationAlternatives?.length ?? 0),
      0,
    ),
  ).toBe(24)
  for (const value of [data, JSON.parse(JSON.stringify(data)) as typeof data])
    for (const producer of offered) {
      const d = producer.declaration
      const resolved = getCurrentClassCastingProducer(catalog(value), d.owner, d.target, d.level)
      expect(resolved, JSON.stringify(d.owner) + ' ' + d.target).toBeTruthy()
      expect(resolved?.declaration.certificate.certificate).toBe(
        producer.declarationAlternatives![0].certificate,
      )
    }
  for (const row of CLASS_CASTING_PRODUCERS.filter(
    (row) => row.declaration.owner[0] === 'subclass',
  ))
    expect(row.declarationAlternatives).toBeUndefined()
})

test.each([
  'unknown',
  'duplicate',
  'both-verified',
  'foreign-origin',
  'malformed-false',
  'missing-false',
  'no-verified',
] as const)('complete evidence rejects %s before filtering alternatives', (kind) => {
  const c = catalog(makeBundledClassCastingData())
  const selected = (row: NonNullable<typeof c.classCastingSources>[number]) =>
    row.kind === 'casting-declaration' && row.target === key
  const group = c.classCastingSources!.filter(selected)
  expect(group).toHaveLength(2)
  expect(group.filter((row) => row.verified)).toHaveLength(1)
  expect(getCurrentClassCastingProducer(c, owner, target, 1)).toBeTruthy()
  let changed = group.map((row) => ({ ...row }))
  if (kind === 'unknown')
    changed = changed.map((row) => (row.verified ? row : { ...row, certificate: 'f'.repeat(64) }))
  if (kind === 'duplicate') changed = [changed[0], { ...changed[0] }]
  if (kind === 'both-verified') changed = changed.map((row) => ({ ...row, verified: true }))
  if (kind === 'foreign-origin')
    changed = changed.map((row) =>
      row.verified ? row : { ...row, origin: 'different raw producer' },
    )
  if (kind === 'malformed-false')
    changed = changed.map((row) => (row.verified ? row : { ...row, extra: true }))
  if (kind === 'missing-false') changed = changed.filter((row) => row.verified)
  if (kind === 'no-verified') changed = changed.map((row) => ({ ...row, verified: false }))
  expect(
    getCurrentClassCastingProducer(
      {
        ...c,
        classCastingSources: [
          ...c.classCastingSources!.filter((row) => !selected(row)),
          ...changed,
        ],
      },
      owner,
      target,
      1,
    ),
  ).toBeUndefined()
})

test('unknown bodies/metadata and raw native-plus-bundled duplicates cannot choose a favorable package', () => {
  for (const change of ['metadata', 'body', 'duplicate']) {
    const layer = makeBundledClassCastingLayer('class/class-wizard.json', (document) => {
      const parent = document.class.find((row) => row.name === 'Wizard' && row.source === 'PHB')!
      const feature = document.classFeature.find(
        (row) => row.name === 'Spellcasting' && row.classSource === 'PHB' && row.source === 'PHB',
      )!
      if (change === 'metadata') parent.page = 999
      if (change === 'body') (feature.entries as unknown[]).push('Unreviewed casting meaning')
      if (change === 'duplicate') {
        const native = classCastingDocuments.find(
          (row) => row.file === 'class/class-wizard.json',
        )!.data
        document.class.push(
          structuredClone(
            native.class.find((row) => row.name === 'Wizard' && row.source === 'PHB')!,
          ),
        )
        document.classFeature.push(
          structuredClone(
            native.classFeature.find(
              (row) =>
                row.name === 'Spellcasting' && row.classSource === 'PHB' && row.source === 'PHB',
            )!,
          ),
        )
      }
    })
    expect(getCurrentClassCastingProducer(catalog(layer), owner, target, 1), change).toBeUndefined()
  }
})

test('winning packages replace whole groups without stitching mixed owners and bodies', () => {
  const native = makeClassCastingLayer('class/class-wizard.json'),
    bundle = makeBundledClassCastingLayer('class/class-wizard.json')
  const producer = CLASS_CASTING_PRODUCERS.find(
    (row) => JSON.stringify(row.declaration.owner) === JSON.stringify(owner),
  )!
  const resolve = (layers: Parameters<typeof composeGameDataLayers>[0]) =>
    getCurrentClassCastingProducer(catalog(composeGameDataLayers(layers)), owner, target, 1)
  expect(resolve([native, bundle])?.declaration.certificate.certificate).toBe(
    producer.declarationAlternatives![0].certificate,
  )
  expect(resolve([native, bundle, native])?.declaration.certificate.certificate).toBe(
    producer.declaration.certificate,
  )
  const noProof = { ...bundle, classCastingSources: [] }
  expect(resolve([native, noProof])).toBeUndefined()
  expect(resolve([native, noProof, bundle])?.declaration.certificate.certificate).toBe(
    producer.declarationAlternatives![0].certificate,
  )
  const bodyOnly = makeGameDataFixture({
    classFeatures: bundle.classFeatures,
    classCastingSources: bundle.classCastingSources,
  })
  const ownerOnly = makeGameDataFixture({
    classes: bundle.classes,
    classCastingSources: bundle.classCastingSources,
  })
  expect(resolve([native, bodyOnly])).toBeUndefined()
  expect(resolve([native, ownerOnly])).toBeUndefined()
  expect(resolve([native, ownerOnly, native])?.declaration.certificate.certificate).toBe(
    producer.declaration.certificate,
  )
})
