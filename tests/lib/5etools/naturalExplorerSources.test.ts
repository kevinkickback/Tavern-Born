import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  decodeFeatureOptionReference,
  getFeatureOptionKey,
} from '@/lib/5etools/featureOptionIdentity'
import { isNaturalExplorerReplaced } from '@/lib/5etools/naturalExplorerChoices'
import { getNaturalExplorerSources } from '@/lib/5etools/naturalExplorerSource'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { CharacterClassChoiceSelection } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

const bundled = 'resources/srd/core/data/class/class-ranger.json'
const configured = 'data/class/class-ranger.json'
function parse(
  file = bundled,
  change?: (data: { classFeature: ClassFeature[]; subclassFeature?: unknown[] }) => void,
) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  change?.(raw)
  const parsed = parseClassDocument(raw)
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
  })
  return {
    data,
    cls: data.classes.find((row) => row.source === 'PHB')!,
    catalogs: createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(data)),
  }
}
const pool = 'class-feature|natural explorer|ranger|phb|1|phb'
const grants = [
  pool,
  'class-feature|favored enemy and natural explorer improvements|ranger|phb|6|phb',
  'class-feature|natural explorer improvement|ranger|phb|10|phb',
]
function saved(level = 1, literal = 'forest'): CharacterClassChoiceSelection {
  const grant = grants[[1, 6, 10].indexOf(level)]
  return {
    choiceId: `feature-literals:${encodeURIComponent(JSON.stringify([['ranger', 'phb', '', ''], pool, 'favored-terrain', grant, level]))}`,
    label: 'Natural Explorer',
    kind: 'feature-option',
    className: 'Ranger',
    classSource: 'PHB',
    classLevel: level,
    selected: [
      {
        entityType: 'featureOption',
        name: literal,
        source: 'PHB',
        slotLevel: level,
        ref: JSON.stringify([
          'source-group',
          'classFeature',
          'natural explorer|ranger|phb|1|phb',
          'favored-terrain',
          literal,
        ]),
      },
    ],
  }
}
function admit(selections: CharacterClassChoiceSelection[]) {
  return characterPersistenceSchema.safeParse(
    makeCharacterFixture({
      classProgression: [{ name: 'Ranger', source: 'PHB', levels: 10 }],
      classChoiceSelections: selections,
    }),
  ).success
}

test.each([
  bundled,
  ...(existsSync(configured) ? [configured] : []),
])('real %s normalizes independent source literals and preserves original targets', (file) => {
  const f = parse(file)
  const choices = getClassChoiceCandidates(f.cls, undefined, f.catalogs).filter(
    (choice) => choice.label === 'Natural Explorer',
  )
  expect(choices.map((choice) => choice.level)).toEqual([1, 6, 10])
  choices.forEach((choice, index) => {
    expect(choice.id).toBe(saved([1, 6, 10][index]).choiceId)
    expect(choice.minimumSelections).toBe(1)
    expect(choice.maximumSelections).toBe(1)
    expect(choice.selectionCountByLevel).toEqual(
      Array.from({ length: 20 }, (_, i) => (i + 1 >= choice.level ? 1 : 0)),
    )
    expect(choice.options.map((option) => option.name)).toEqual([
      'Arctic',
      'Coast',
      'Desert',
      'Forest',
      'Grassland',
      'Mountain',
      'Swamp',
      'Underdark',
    ])
    expect(
      resolveClassChoiceOptions(choice, f.catalogs).every(
        (option) =>
          option.availability === 'eligible' &&
          option.sourceGroup?.group === 'favored-terrain' &&
          !option.featureOption,
      ),
    ).toBe(true)
  })
  expect(getNaturalExplorerSources(f.catalogs).get(pool)).toBeTruthy()
  expect(
    f.data.classes
      .find((row) => row.source === 'XPHB')
      ?.normalizedRules?.choices.some((choice) => choice.label === 'Natural Explorer'),
  ).toBe(false)
})
test.each([
  'condition',
  'nested-feature',
  'duplicate-metadata',
  'duplicate-body',
  'no-subclasses',
])('source %s cannot hide behind first-match while exact restoration works', (kind) => {
  const f = parse(bundled, (raw) => {
    const row = raw.classFeature.find((row) => row.name === 'Natural Explorer')!
    if (kind === 'condition')
      row.entries = ['The benefits apply only after level18.', ...row.entries!]
    if (kind === 'nested-feature')
      row.entries = row.entries!.map((entry, index) =>
        index === 2
          ? { ...(entry as Record<string, unknown>), feature: { condition: 'only underwater' } }
          : entry,
      )
    if (kind === 'duplicate-metadata')
      raw.classFeature.push({ ...row, ...{ prerequisite: [{ level: 18 }] } })
    if (kind === 'duplicate-body') raw.classFeature.push({ ...row, entries: ['Changed body'] })
    if (kind === 'no-subclasses') {
      raw.subclassFeature = []
      Object.assign(row, { activation: 'only underwater' })
    }
  })
  expect(getNaturalExplorerSources(f.catalogs).get(pool)).toBeUndefined()
  expect(f.cls.normalizedRules?.choices.some((choice) => choice.label === 'Natural Explorer')).toBe(
    false,
  )
  expect(
    f.cls.normalizedRules?.choiceDiagnostics
      .filter((row) => row.featureName === 'Natural Explorer')
      .every((row) => row.code === 'unverified-required-choice'),
  ).toBe(true)
  expect(getNaturalExplorerSources(parse().catalogs).get(pool)).toBeTruthy()
})
test('audited equivalent base duplicates agree but an explicit empty current candidate map stays absent', () => {
  const f = parse(bundled, (raw) => {
    const row = raw.classFeature.find((row) => row.name === 'Natural Explorer')!
    raw.classFeature.push(Object.fromEntries(Object.entries(row).reverse()) as ClassFeature)
  })
  expect(getNaturalExplorerSources(f.catalogs).get(pool)).toBeTruthy()
  expect(
    getNaturalExplorerSources({ ...f.catalogs, classFeatureCandidates: new Map() }).get(pool),
  ).toBeUndefined()
  expect(getNaturalExplorerSources(undefined).size).toBe(0)
})
test.skipIf(!existsSync(configured))(
  'exact current replacement needs declaration, singular candidates and full audited body/shape',
  () => {
    const f = parse(configured)
    expect(isNaturalExplorerReplaced(f.cls, true, f.catalogs)).toBe(true)
    expect(isNaturalExplorerReplaced(f.cls, false, f.catalogs)).toBe(false)
    expect(isNaturalExplorerReplaced(f.cls, true, undefined)).toBe(false)
    expect(isNaturalExplorerReplaced({ ...f.cls, classFeatureRefs: [] }, true, f.catalogs)).toBe(
      false,
    )
    for (const mutation of ['metadata', 'body', 'duplicate', 'flag']) {
      const changed = parse(configured, (raw) => {
        const row = raw.classFeature.find(
          (row) => row.name === 'Deft Explorer' && row.source === 'TCE' && row.level === 1,
        )!
        if (mutation === 'metadata') Object.assign(row, { prerequisite: [{ level: 18 }] })
        if (mutation === 'body') row.entries = ['Only underwater', ...row.entries!]
        if (mutation === 'duplicate') raw.classFeature.push({ ...row })
        if (mutation === 'flag') row.isClassFeatureVariant = false
      })
      expect(isNaturalExplorerReplaced(changed.cls, true, changed.catalogs)).toBe(false)
    }
  },
)
test('offline literal relations preserve valid defaults while rejecting spoofed fields, duplicates and slots', () => {
  expect(admit([saved(1), saved(6, 'coast'), saved(10, 'arctic')])).toBe(true)
  const defaults = saved()
  defaults.selected[0].source = ''
  defaults.selected[0].name = ' Forest '
  defaults.selected[0].ref =
    '["source-group","classFeature","Natural Explorer|Ranger||1|","favored-terrain","FOREST"]'
  expect(admit([defaults])).toBe(true)
  expect(getFeatureOptionKey(defaults.selected[0])).toBe(getFeatureOptionKey(saved().selected[0]))
  expect(decodeFeatureOptionReference(defaults.selected[0])).toMatchObject({
    format: 'source-group',
    group: 'favored-terrain',
    literal: 'forest',
  })
  expect(admit([saved(1), saved(6)])).toBe(false)
  expect(admit([saved(1), saved(1, 'coast')])).toBe(false)
  for (const mutate of [
    (row: CharacterClassChoiceSelection) => {
      row.classSource = 'XPHB'
    },
    (row: CharacterClassChoiceSelection) => {
      row.selected[0].source = 'TCE'
    },
    (row: CharacterClassChoiceSelection) => {
      row.selected[0].slotLevel = 6
    },
    (row: CharacterClassChoiceSelection) => {
      row.kind = 'class-feature'
    },
    (row: CharacterClassChoiceSelection) => {
      row.selected[0].entityType = 'classFeature'
    },
    (row: CharacterClassChoiceSelection) => {
      row.choiceId = 'feature-literals:broken'
    },
    (row: CharacterClassChoiceSelection) => {
      row.selected[0].ref =
        '["source-group","classFeature","Natural Explorer|Ranger|XPHB|1|PHB","favored-terrain","forest"]'
    },
  ]) {
    const row = saved()
    mutate(row)
    expect(admit([row])).toBe(false)
  }
})

test.each([
  'name',
  'className',
  'classSource',
  'level',
  'source',
] as const)('one otherwise matching %s conflict cannot replace the exact requested target', (field) => {
  const f = parse(bundled, (raw) => {
    const row = raw.classFeature.find((row) => row.name === 'Natural Explorer')!
    Object.assign(row, { [field]: field === 'level' ? 2 : 'Other' })
  })
  expect(getNaturalExplorerSources(f.catalogs).get(pool)).toBeUndefined()
  expect(
    getClassChoiceCandidates(f.cls, undefined, f.catalogs).filter(
      (choice) => choice.label === 'Natural Explorer',
    ),
  ).toEqual([])
  expect(getNaturalExplorerSources(parse().catalogs).get(pool)).toBeTruthy()
})
test('raw UID defaults and canonical row fields keep the same exact target', () => {
  const f = parse(bundled, (raw) => {
    for (const row of raw.classFeature.filter((row) => row.name === 'Natural Explorer'))
      Object.assign(row, {
        name: ' natural explorer ',
        className: ' RANGER ',
        classSource: '',
        source: '',
      })
  })
  expect(getNaturalExplorerSources(f.catalogs).get(pool)).toBeTruthy()
  expect(
    getClassChoiceCandidates(f.cls, undefined, f.catalogs).filter(
      (choice) => choice.label === 'Natural Explorer',
    ),
  ).toHaveLength(3)
})
