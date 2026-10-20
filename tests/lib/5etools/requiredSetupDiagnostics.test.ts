import { existsSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import {
  createClassChoiceCoverageMatrix,
  findClassChoiceCoverageGaps,
} from '@/lib/5etools/classChoiceCoverage'
import {
  normalizeClassChoices,
  normalizeSubclassRules,
} from '@/lib/5etools/classChoiceNormalization'
import { DataFilter } from '@/lib/5etools/filters'
import { parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  getClassChoiceDiagnosticCandidateSide,
} from '@/lib/character/classChoiceOptions'
import type {
  Class5e,
  ClassFeature,
  ClassFeatureReference,
  SubclassFeatureReference,
} from '@/types/5etools'
import { installDeftDiagnosticSourceDouble } from '../../fixtures/deftDiagnosticSourceDouble'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'
import {
  classSetupRef,
  deftEntries,
  dragonEntries,
  dragonSetupDocument,
  enemyEntries,
  rangerSetupDocument,
  stormEntries,
  subclassSetupRef,
} from '../../fixtures/requiredSetupFixtures'

beforeEach(installDeftDiagnosticSourceDouble)
afterEach(() => vi.restoreAllMocks())

const owner = { name: 'Sorcerer', source: 'XPHB' }
const subclass = { name: 'Draconic Bloodline', source: 'PHB' }
function subclassDiagnostics(refs: SubclassFeatureReference[]) {
  return normalizeSubclassRules(owner, subclass, refs).choiceDiagnostics.filter(
    (d) => d.requiredChoice,
  )
}
function rangerData() {
  const doc = rangerSetupDocument()
  return {
    ranger: parseClasses(doc)[0] as Class5e,
    features: parseClassFeatures(doc) as ClassFeature[],
  }
}
function names(ranger: Class5e, includeVariants: boolean, features?: readonly ClassFeature[]) {
  return getClassChoiceDiagnosticCandidateSide(
    ranger,
    undefined,
    includeVariants,
    features ? { classFeatures: features } : undefined,
  )
    .map((d) => d.featureName)
    .sort()
}

describe('source-confirmed required setup', () => {
  test('keeps copied target level and selected owner distinct, at the enclosing earned level', () => {
    const parsed = parseClasses(dragonSetupDocument())[0] as Class5e
    const rules = parsed.subclasses![0].normalizedRules!
    expect(rules.choiceDiagnostics).toEqual([])
    expect(rules.choices[0]).toMatchObject({
      kind: 'feature-option',
      owner: {
        name: 'Sorcerer',
        source: 'XPHB',
        subclassName: 'Draconic Bloodline',
        subclassSource: 'PHB',
      },
      label: 'Dragon Ancestor',
      level: 3,
      minimumSelections: 1,
      maximumSelections: 1,
      options: [
        { entityType: 'featureOption', name: 'Black', source: 'PHB' },
        { entityType: 'featureOption', name: 'Red', source: 'PHB' },
      ],
    })
    expect(rules.choices).toHaveLength(1)
  })

  test.each([
    false,
    true,
  ])('earliest grant is independent of duplicate path order and cycles: %s', (reverse) => {
    const dragon = subclassSetupRef('Dragon Ancestor|Sorcerer||Draconic||1', dragonEntries)
    const roots = [6, 3].map((level) =>
      subclassSetupRef(`Root ${level}|Sorcerer|XPHB|Draconic|PHB|${level}|PHB`, [
        { type: 'refSubclassFeature', subclassFeature: dragon.ref, feature: dragon.feature },
      ]),
    )
    dragon.feature!.entries = [
      ...dragonEntries,
      { type: 'refSubclassFeature', subclassFeature: roots[0].ref, feature: roots[0].feature },
    ]
    if (reverse) roots.reverse()
    const rules = normalizeSubclassRules(owner, subclass, roots)
    expect(rules.choiceDiagnostics).toEqual([])
    expect(rules.choices).toMatchObject([
      { level: 3, label: 'Dragon Ancestor', kind: 'feature-option' },
    ])
  })

  test.each([
    'name',
    'className',
    'classSource',
    'subclassShortName',
    'subclassSource',
    'level',
    'source',
  ] as const)('a conflicting resolved subclass %s cannot confirm the known target', (field) => {
    const ref = subclassSetupRef('Dragon Ancestor|Sorcerer||Draconic||1', dragonEntries)
    Object.assign(ref.feature!, { [field]: field === 'level' ? 2 : 'Other' })
    expect(subclassDiagnostics([ref])).toMatchObject([
      { code: 'unverified-required-choice', level: 1 },
    ])
    // A different requested target is outside this known registry; it cannot borrow PHB rules.
    const parts = ref.ref!.split('|')
    const index = {
      name: 0,
      className: 1,
      classSource: 2,
      subclassShortName: 3,
      subclassSource: 4,
      level: 5,
      source: 6,
    }[field]
    while (parts.length <= index) parts.push('')
    parts[index] = field === 'level' ? '2' : 'Other'
    ref.ref = parts.join('|')
    expect(subclassDiagnostics([ref])).toEqual([])
  })

  test.each([
    'name',
    'className',
    'classSource',
    'level',
    'source',
  ] as const)('a conflicting resolved class %s cannot confirm the known target', (field) => {
    const ref = classSetupRef('Favored Enemy|Ranger||1', enemyEntries)
    Object.assign(ref.feature!, { [field]: field === 'level' ? 2 : 'Other' })
    expect(
      normalizeClassChoices({ name: 'Ranger', source: 'PHB' }, [ref]).diagnostics.filter(
        (d) => d.requiredChoice,
      ),
    ).toMatchObject([{ code: 'unverified-required-choice' }])
  })

  test('accepts UID defaults/case while retaining the original source-qualified reference', () => {
    const ref = subclassSetupRef(
      ' dragon ancestor | sorcerer || draconic || 1 | | Display',
      dragonEntries,
    )
    const rules = normalizeSubclassRules(owner, subclass, [ref])
    expect(rules.choiceDiagnostics).toEqual([])
    expect(JSON.parse(rules.choices[0].options[0].ref!)).toEqual([
      'subclassFeature',
      'dragon ancestor|sorcerer|phb|draconic|phb|1|phb',
      'draconic ancestry',
      'black',
    ])
  })

  test('missing, changed and exactly restored source bodies never silently qualify known setup', () => {
    const ref = subclassSetupRef('Dragon Ancestor|Sorcerer||Draconic||1', dragonEntries)
    const before = structuredClone(ref)
    expect(subclassDiagnostics([{ ...ref, feature: undefined }])[0].code).toBe(
      'unverified-required-choice',
    )
    expect(
      subclassDiagnostics([
        { ...ref, feature: { ...ref.feature!, entries: [dragonEntries[0]] } },
      ])[0].code,
    ).toBe('unverified-required-choice')
    expect(subclassDiagnostics([ref])).toEqual([])
    expect(normalizeSubclassRules(owner, subclass, [ref]).choices[0].kind).toBe('feature-option')
    expect(ref).toEqual(before)
    const storm = subclassSetupRef('Storm Aura|Barbarian||Storm Herald|XGE|3', stormEntries)
    expect(subclassDiagnostics([storm])[0].code).toBe('unsupported-required-choice')
    const broken = structuredClone(storm)
    ;(broken.feature!.entries![1] as { entries: unknown[] }).entries.pop()
    expect(subclassDiagnostics([broken])[0].code).toBe('unverified-required-choice')
  })

  test('malformed non-array source bodies remain unverified rather than throwing or confirming', () => {
    const dragon = subclassSetupRef('Dragon Ancestor|Sorcerer||Draconic||1', dragonEntries)
    dragon.feature!.entries = JSON.stringify(dragonEntries) as unknown as unknown[]
    expect(subclassDiagnostics([dragon])[0].code).toBe('unverified-required-choice')
    const enemy = classSetupRef('Favored Enemy|Ranger||1', enemyEntries)
    enemy.feature!.entries = JSON.stringify(enemyEntries) as unknown as unknown[]
    expect(
      normalizeClassChoices({ name: 'Ranger', source: 'PHB' }, [enemy]).diagnostics.filter(
        (d) => d.requiredChoice,
      )[0].code,
    ).toBe('unverified-required-choice')
  })

  test('preserves presentation-only options and does not earn unselected alternatives', () => {
    const dragon = subclassSetupRef('Dragon Ancestor|Sorcerer||Draconic||1', dragonEntries)
    const rules = normalizeSubclassRules(owner, subclass, [
      subclassSetupRef('Presentation|Sorcerer|XPHB|Draconic|PHB|3|PHB', [
        {
          type: 'options',
          entries: [
            { type: 'refSubclassFeature', subclassFeature: dragon.ref, feature: dragon.feature },
          ],
        },
      ]),
    ])
    expect(rules.choices).toEqual([])
    expect(rules.choiceDiagnostics).toEqual([])
  })

  test('Ranger variants use exact active source targets and retain genuine Canny setup', () => {
    const { ranger, features } = rangerData()
    expect(names(ranger, false, features)).toEqual(['Favored Enemy', 'Natural Explorer'])
    expect(names(ranger, true, features)).toEqual([])
    expect(names(ranger, true, [])).toEqual(['Deft Explorer', 'Favored Enemy', 'Natural Explorer'])
    expect(names(ranger, true)).toEqual(['Deft Explorer', 'Favored Enemy', 'Natural Explorer'])
    expect(
      names(
        ranger,
        true,
        features.filter((f) => f.name === 'Favored Foe'),
      ),
    ).toEqual(['Deft Explorer', 'Natural Explorer'])
    expect(
      names(
        ranger,
        true,
        features.filter((f) => f.name === 'Deft Explorer'),
      ),
    ).toEqual(['Favored Enemy'])
    expect(
      names(
        {
          ...ranger,
          classFeatureRefs: ranger.classFeatureRefs!.filter((ref) => ref.name !== 'Deft Explorer'),
        },
        true,
        features,
      ),
    ).toEqual(['Natural Explorer'])
    expect(names(ranger, true, features)).toEqual([])
  })

  test.each([
    'name',
    'className',
    'classSource',
    'level',
    'source',
    'isClassFeatureVariant',
    'entries',
  ] as const)('Ranger replacement with conflicting %s cannot waive base setup', (field) => {
    const { ranger, features } = rangerData()
    const foe = features.find((f) => f.name === 'Favored Foe')!
    Object.assign(foe, {
      [field]:
        field === 'level'
          ? 2
          : field === 'isClassFeatureVariant'
            ? false
            : field === 'entries'
              ? ['Unrelated prose.']
              : 'Other',
    })
    expect(names(ranger, true, features)).toEqual(['Favored Enemy'])
  })

  test('duplicate exact replacements and generic name-only warnings cannot waive known setup', () => {
    const { ranger, features } = rangerData()
    const foe = features.find((f) => f.name === 'Favored Foe')!
    expect(names(ranger, true, [...features, { ...foe }])).toEqual(['Favored Enemy'])
    ranger.normalizedRules!.choiceDiagnostics.push({
      code: 'unresolved-options',
      className: 'Ranger',
      classSource: 'PHB',
      featureName: 'Unrelated replacement',
      message: 'Unresolved.',
      featureVariant: { replacesFeatureName: 'Favored Enemy' },
    })
    expect(names(ranger, true, [])).toEqual([
      'Deft Explorer',
      'Favored Enemy',
      'Natural Explorer',
      'Unrelated replacement',
    ])
    const missing = {
      ...ranger,
      classFeatureRefs: ranger.classFeatureRefs!.map((ref) =>
        ref.name === 'Favored Foe' ? { ...ref, feature: undefined } : ref,
      ),
    }
    expect(names(missing, true, features)).toEqual(['Favored Enemy', 'Unrelated replacement'])
  })

  test.each([
    'Favored Foe',
    'Deft Explorer',
  ])('production catalog retains %s ambiguity and exact restoration', (name) => {
    const doc = rangerSetupDocument()
    const original = doc.classFeature.find((feature) => feature!.name === name)!
    doc.classFeature.push({
      ...original,
      name: original.name.toUpperCase(),
      className: ' RANGER ',
      classSource: '',
      source: ' tce ',
      entries: ['Conflicting replacement body.'],
    })
    const ranger = parseClasses(doc)[0] as Class5e
    const features = DataFilter.filterClassFeatures(parseClassFeatures(doc) as ClassFeature[], {
      sources: ['PHB', 'TCE'],
    })
    const catalogs = buildClassChoiceFeatureCatalogs({ classes: [ranger], classFeatures: features })
    expect(catalogs.ambiguousClassFeatureTargets.size).toBe(1)
    expect(
      getClassChoiceDiagnosticCandidateSide(ranger, undefined, true, catalogs)
        .map((d) => d.featureName)
        .sort(),
    ).toEqual(name === 'Favored Foe' ? ['Favored Enemy'] : ['Deft Explorer', 'Natural Explorer'])
    const restoredDocument = rangerSetupDocument()
    const restoredRanger = parseClasses(restoredDocument)[0] as Class5e
    const restored = buildClassChoiceFeatureCatalogs({
      classes: [restoredRanger],
      classFeatures: parseClassFeatures(restoredDocument) as ClassFeature[],
    })
    expect(
      getClassChoiceDiagnosticCandidateSide(restoredRanger, undefined, true, restored).map(
        (d) => d.featureName,
      ),
    ).toEqual([])
    expect(
      getClassChoiceDiagnosticCandidateSide(ranger, undefined, true, {
        ...catalogs,
        classFeatures: [],
        classFeatureCandidates: new Map(),
      })
        .map((d) => d.featureName)
        .sort(),
    ).toEqual(['Deft Explorer', 'Favored Enemy', 'Natural Explorer'])
  })

  test('a different complete target does not mark the valid replacement ambiguous', () => {
    const { ranger, features } = rangerData()
    const foe = features.find((feature) => feature.name === 'Favored Foe')!
    const catalogs = buildClassChoiceFeatureCatalogs({
      classes: [ranger],
      classFeatures: [...features, { ...foe, source: 'OTHER' }],
    })
    expect(catalogs.ambiguousClassFeatureTargets.size).toBe(0)
    expect(
      getClassChoiceDiagnosticCandidateSide(ranger, undefined, true, catalogs).map(
        (d) => d.featureName,
      ),
    ).toEqual([])
  })

  test('changed Canny declarations cannot waive the original terrain setup', () => {
    const { ranger, features } = rangerData()
    const ref = ranger.classFeatureRefs!.find((ref) => ref.name === 'Deft Explorer')!
    ref.feature!.entries = [deftEntries[0]]
    ranger.normalizedRules = {
      ...ranger.normalizedRules!,
      ...{
        choices: normalizeClassChoices(ranger, ranger.classFeatureRefs!).choices,
        choiceDiagnostics: normalizeClassChoices(ranger, ranger.classFeatureRefs!).diagnostics,
      },
    }
    expect(
      getClassChoiceDiagnosticCandidateSide(ranger, undefined, true, { classFeatures: features }),
    ).toMatchObject([
      { featureName: 'Natural Explorer', code: 'unverified-required-choice' },
      { featureName: 'Deft Explorer', code: 'unverified-required-choice' },
    ])
  })

  test.each([
    null,
    8,
    {},
  ])('rejects non-string UIDs without borrowing known metadata or crashing on a neighbor: %s', (uid) => {
    const malformed = {
      ...classSetupRef('Favored Enemy|Ranger||1', enemyEntries),
      ref: uid,
    } as unknown as ClassFeatureReference
    expect(normalizeClassChoices({ name: 'Ranger', source: 'PHB' }, [malformed])).toEqual({
      choices: [],
      diagnostics: [],
    })
    const { ranger, features } = rangerData()
    ranger.classFeatureRefs = [malformed, ...ranger.classFeatureRefs!]
    expect(names(ranger, true, features)).toEqual([])
  })

  test('malformed scalar replacement bodies cannot waive setup on either catalog boundary', () => {
    const { ranger, features } = rangerData()
    const foe = features.find((feature) => feature.name === 'Favored Foe')!
    const scalar = JSON.stringify(foe.entries) as unknown as unknown[]
    const malformedCatalog = features.map((feature) =>
      feature === foe ? { ...feature, entries: scalar } : feature,
    )
    expect(names(ranger, true, malformedCatalog)).toEqual(['Favored Enemy'])
    const malformedOwner = {
      ...ranger,
      classFeatureRefs: ranger.classFeatureRefs!.map((ref) =>
        ref.name === 'Favored Foe'
          ? { ...ref, feature: { ...ref.feature!, entries: scalar } }
          : ref,
      ),
    }
    expect(names(malformedOwner, true, features)).toEqual(['Favored Enemy'])
    expect(names(ranger, true, features)).toEqual([])
  })

  test('capability and coverage audits report setup gaps rather than fabricated choices', () => {
    const { ranger, features } = rangerData()
    const report = createCorpusCapabilityReport(
      makeGameDataFixture({ classes: [ranger], classFeatures: features }),
    )
    expect(report.classChoices.diagnostics).toBe(2)
    expect(report.issues.filter((i) => i.code === 'choice-diagnostic')).toHaveLength(2)
    const matrix = createClassChoiceCoverageMatrix([ranger], 20)
    expect(matrix[0].levels[0]).toMatchObject({
      requiredSelections: 3,
      choices: [{ kind: 'proficiency' }, { kind: 'proficiency' }],
    })
    expect(findClassChoiceCoverageGaps([ranger], matrix, 20).map((gap) => gap.level)).toEqual([
      1, 1,
    ])
  })

  test.runIf(existsSync('data/class/class-mystic.json'))(
    'actual configured source recognizes known gaps without borrowing revised printings',
    () => {
      const expectations = [
        ['barbarian', 'Barbarian', 'PHB', 'Path of the Storm Herald', 'XGE', 'Storm Aura', 3],
        ['barbarian', 'Barbarian', 'XPHB', 'Path of the Storm Herald', 'XGE', 'Storm Aura', 3],
        ['sorcerer', 'Sorcerer', 'PHB', 'Draconic Bloodline', 'PHB', 'Dragon Ancestor', 1],
        ['sorcerer', 'Sorcerer', 'XPHB', 'Draconic Bloodline', 'PHB', 'Dragon Ancestor', 3],
        ['mystic', 'Mystic', 'UATheMysticClass', undefined, undefined, 'Psionics', 1],
      ] as const
      for (const [file, name, source, subName, subSource, featureName, level] of expectations) {
        const classes = parseClasses(
          JSON.parse(readFileSync(`data/class/class-${file}.json`, 'utf8')),
        ) as Class5e[]
        const cls = classes.find((c) => c.name === name && c.source === source)!
        const rules = subName
          ? cls.subclasses!.find((s) => s.name === subName && s.source === subSource)!
              .normalizedRules
          : cls.normalizedRules
        if (featureName === 'Dragon Ancestor') {
          expect(rules!.choiceDiagnostics).toEqual([])
          expect(rules!.choices).toMatchObject([
            { kind: 'feature-option', label: featureName, level },
          ])
          expect(rules!.choices[0].options).toHaveLength(10)
        } else if (featureName === 'Storm Aura') {
          expect(rules!.choiceDiagnostics).toEqual([])
          expect(rules!.choices).toMatchObject([
            { kind: 'subclass-feature', label: 'Storm Aura', level: 3 },
          ])
          expect(rules!.choices[0].options.map((option) => option.ref)).toEqual([
            'Desert|Barbarian|PHB|Storm Herald|XGE|3|XGE',
            'Sea|Barbarian|PHB|Storm Herald|XGE|3|XGE',
            'Tundra|Barbarian|PHB|Storm Herald|XGE|3|XGE',
          ])
        } else {
          expect(rules!.choiceDiagnostics.filter((d) => d.requiredChoice)).toMatchObject([
            { code: 'unsupported-required-choice', featureName, level },
          ])
        }
        if (source === 'XPHB' && name === 'Sorcerer')
          expect(
            cls.subclasses!.find((s) => s.source === 'XPHB' && s.name === 'Draconic Sorcery')!
              .normalizedRules!.choiceDiagnostics,
          ).toEqual([])
      }
      const classes = parseClasses(
        JSON.parse(readFileSync('data/class/class-ranger.json', 'utf8')),
      ) as Class5e[]
      expect(
        classes
          .find((c) => c.source === 'PHB')!
          .normalizedRules!.choiceDiagnostics.map((d) => d.featureName)
          .sort(),
      ).toEqual(['Favored Enemy'])
      expect(
        classes
          .find((c) => c.source === 'PHB')!
          .normalizedRules!.choices.filter((choice) => choice.kind === 'proficiency')
          .map((choice) => [choice.label, choice.level, choice.minimumSelections]),
      ).toEqual([
        ['Canny expertise', 1, 1],
        ['Canny languages', 1, 2],
      ])
      expect(classes.find((c) => c.source === 'XPHB')!.normalizedRules!.choiceDiagnostics).toEqual(
        [],
      )
    },
  )
})
