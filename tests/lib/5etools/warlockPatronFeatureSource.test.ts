// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

const introRef = 'The Archfey|Warlock||Archfey||1'
const nestedRef = 'Fey Presence|Warlock||Archfey||1'
const directRef = 'Misty Escape|Warlock||Archfey||6'
const owner = {
  className: 'Warlock',
  classSource: 'PHB',
  source: 'PHB',
}
const featureOwner = { ...owner, subclassShortName: 'Archfey', subclassSource: 'PHB' }
const direct = {
  ...featureOwner,
  name: 'Misty Escape',
  level: 6,
  entries: ['A sample feature with its own source record.'],
}

function parse(name: string, declarations: unknown[], features: unknown[]) {
  const parsed = parseClassDocument({
    class: [{ name: 'Warlock', source: 'PHB', classFeatures: [] }],
    subclass: [{ ...owner, name, shortName: 'Archfey', subclassFeatures: declarations }],
    subclassFeature: features,
  })
  return makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    classCastingSources: parsed.classCastingSources,
  })
}

test('native Archfey attachments require their own source records', () => {
  const nested = { ...featureOwner, name: 'Fey Presence', level: 1, entries: ['Unattested.'] }
  const layer = parse(
    'The Archfey',
    [introRef, directRef],
    [
      {
        ...featureOwner,
        name: 'The Archfey',
        level: 1,
        entries: [{ type: 'refSubclassFeature', subclassFeature: nestedRef, feature: nested }],
      },
    ],
  )
  const refs = layer.classes[0]?.subclasses?.[0]?.subclassFeatureRefs
  expect(refs?.find((row) => row.ref === directRef)).toBeDefined()
  expect(refs?.find((row) => row.ref === directRef)?.feature).toBeUndefined()
  expect(refs?.find((row) => row.ref === introRef)?.feature?.entries).toEqual([
    { type: 'refSubclassFeature', subclassFeature: nestedRef },
  ])
})

test('an unattached native Archfey rule only falls back through the same owner', () => {
  const primary = parse('The Archfey', [directRef], [])
  const feature = (name: string) =>
    composeGameDataLayers([parse(name, [directRef], [direct]), primary])
      .classes[0]?.subclasses?.find((subclass) => subclass.name === 'The Archfey')
      ?.subclassFeatureRefs?.find((row) => row.ref === directRef)?.feature
  expect(feature('Foreign Archfey')).toBeUndefined()
  expect(feature('The Archfey')?.entries).toEqual(direct.entries)
})

test('a copied subclass retains its declared action without granting native patron authority', () => {
  const native = { ...owner, name: 'The Archfey', shortName: 'Archfey' }
  const parsed = parseClassDocument({
    class: [{ name: 'Warlock', source: 'PHB', classFeatures: [] }],
    subclass: [
      { ...native, subclassFeatures: [directRef] },
      { ...native, name: 'The Moon Court', source: 'TCE', _copy: native },
    ],
    subclassFeature: [{ ...direct, entries: ['As a reaction, use the copied rule.'] }],
  })
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    classCastingSources: parsed.classCastingSources,
  })
  const lookups = {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
  const view = (subclass: string, subclassSource: string) =>
    createCharacterSheetViewModel(
      makeCharacterFixture({
        allowedSources: ['PHB', 'TCE'],
        classProgression: [{ name: 'Warlock', source: 'PHB', levels: 6, subclass, subclassSource }],
      }),
      lookups,
      lookups,
    )
  const copied = view('The Moon Court', 'TCE')
  expect(copied.actions.filter((action) => action.name === direct.name)).toEqual([
    expect.objectContaining({
      description: 'As a reaction, use the copied rule.',
      source: expect.objectContaining({ kind: 'subclass' }),
    }),
  ])
  expect(copied.declaredClassFeatureSummaries).toEqual([])
  expect(view('The Archfey', 'PHB').actions.some((action) => action.name === direct.name)).toBe(
    false,
  )
  expect(view('The Moon Court', 'TCE').actions).toEqual(copied.actions)
})
