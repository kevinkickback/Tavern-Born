import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { composeGameDataLayers, findLayerDependencyIssues } from '@/lib/5etools/contentLayers'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

function parse(refs: unknown[], features: unknown[], source = 'PHB'): Class5e {
  return (
    parseClasses({
      class: [{ name: 'Wizard', source, classFeatures: refs }],
      classFeature: features,
    }) as Class5e[]
  )[0]
}

const feature: ClassFeature = {
  name: 'Shared',
  source: 'PHB',
  className: 'Wizard',
  classSource: 'PHB',
  level: 8,
  entries: ['Wizard level eight rules'],
}

describe('class-feature encoded identity', () => {
  test.each([
    false,
    true,
  ])('resolves owner, level and printing independently of order (%s)', (reverse) => {
    const features = [
      { ...feature, className: 'Bard', entries: ['Bard rules'] },
      { ...feature, level: 4, entries: ['Wizard level four'] },
      { ...feature, classSource: 'XPHB', entries: ['Revised class rules'] },
      { ...feature, source: 'XPHB', entries: ['Revised feature rules'] },
      feature,
    ]
    if (reverse) features.reverse()
    const before = structuredClone(features)
    const parsed = parse(['Shared|Wizard|PHB|8'], features)
    expect(parsed.classFeatureRefs?.[0]).toMatchObject({
      name: 'Shared',
      className: 'Wizard',
      classSource: 'PHB',
      source: 'PHB',
      level: 8,
      feature,
    })
    expect(features).toEqual(before)
  })

  test.each([
    { className: 'Bard' },
    { classSource: 'XPHB' },
    { level: 4 },
    { source: 'XPHB' },
    { className: undefined },
    { classSource: 7 },
    { source: 7 },
    { level: undefined },
  ])('keeps an unavailable exact target unresolved: %j', (change) => {
    const reference = parse(['Shared|Wizard|PHB|8'], [{ ...feature, ...change }])
      .classFeatureRefs?.[0]
    expect(reference).toMatchObject({
      ref: 'Shared|Wizard|PHB|8',
      name: 'Shared',
      className: 'Wizard',
      classSource: 'PHB',
      source: 'PHB',
      level: 8,
    })
    expect(reference?.feature).toBeUndefined()
  })

  test('defaults packed class and feature sources to PHB independently of the surrounding class', () => {
    const parsed = parse(
      ['Shared|Wizard||8'],
      [{ ...feature, classSource: 'XPHB', source: 'XPHB', entries: ['Revised rules'] }, feature],
      'XPHB',
    )
    expect(parsed.classFeatureRefs?.[0]).toMatchObject({
      classSource: 'PHB',
      source: 'PHB',
      feature,
    })
  })

  test('defaults an omitted feature source to the encoded class source', () => {
    const target = { ...feature, classSource: 'TCE', source: 'TCE' }
    const parsed = parse(['Shared|Wizard|TCE|8'], [feature, target])
    expect(parsed.classFeatureRefs?.[0]).toMatchObject({
      classSource: 'TCE',
      source: 'TCE',
      feature: target,
    })
  })

  test('trims UID fields, matches case-insensitively, and retains raw refs and subclass-gain flags', () => {
    const rawRef = {
      classFeature: ' shared | wizard | phb | 8 | PHB | Display label ',
      gainSubclassFeature: true,
    }
    const before = structuredClone(rawRef)
    const reference = parse([rawRef], [feature]).classFeatureRefs?.[0]
    expect(reference).toMatchObject({
      ref: rawRef.classFeature,
      name: 'shared',
      className: 'wizard',
      classSource: 'phb',
      source: 'PHB',
      level: 8,
      gainSubclassFeature: true,
      feature,
    })
    expect(rawRef).toEqual(before)
  })

  test.each([
    '',
    '8junk',
    'Infinity',
    '-1',
    '1.5',
    '0',
  ])('does not bind an invalid gain level %j', (level) => {
    const reference = parse([`Shared|Wizard|PHB|${level}`], [feature]).classFeatureRefs?.[0]
    expect(reference?.ref).toBe(`Shared|Wizard|PHB|${level}`)
    expect(reference?.feature).toBeUndefined()
  })

  test.each([
    'Shared||PHB|8',
    '|Wizard|PHB|8',
    'Shared|Wizard|PHB',
  ])('does not infer missing UID fields: %s', (ref) => {
    expect(parse([ref], [feature]).classFeatureRefs?.[0]?.feature).toBeUndefined()
  })

  test('preserves every repeated ASI reference and its encoded gain level', () => {
    const levels = [4, 8, 12, 16, 19]
    const features = levels.map((level) => ({
      ...feature,
      name: 'Ability Score Improvement',
      level,
    }))
    const refs = levels.map((level) => `Ability Score Improvement|Wizard||${level}`)
    const parsed = parse(refs, features)
    expect(parsed.classFeatureRefs?.map((ref) => [ref.level, ref.feature?.level])).toEqual(
      levels.map((level) => [level, level]),
    )
    expect(parsed.normalizedRules?.asiLevels).toEqual(levels)
  })
})

describe('class-feature reference composition', () => {
  test.each([
    false,
    true,
  ])('clears a stale embedded target and its choices (%s incomplete)', (incomplete) => {
    const target = {
      ...feature,
      entries: [
        {
          type: 'options',
          count: 1,
          entries: [{ type: 'refOptionalfeature', optionalfeature: 'Shared Option|PHB' }],
        },
      ],
    }
    const owner = parse(
      [{ classFeature: 'Shared|Wizard|PHB|8', gainSubclassFeature: true }],
      [target],
    )
    expect(owner.normalizedRules?.choices).toHaveLength(1)
    if (incomplete && owner.classFeatureRefs?.[0]) {
      owner.classFeatureRefs[0] = {
        ...owner.classFeatureRefs[0],
        ref: 'Shared||PHB|8',
        className: '',
      }
    }
    const layer = makeGameDataFixture({
      classes: [owner],
      classFeatures: incomplete ? [target] : [{ ...target, className: 'Bard' }],
    })
    const before = structuredClone(layer)
    const composed = composeGameDataLayers([layer])
    const reference = composed.classes[0].classFeatureRefs?.[0]
    expect(reference?.feature).toBeUndefined()
    expect(reference?.ref).toBe(incomplete ? 'Shared||PHB|8' : 'Shared|Wizard|PHB|8')
    expect(reference?.gainSubclassFeature).toBe(true)
    expect(composed.classes[0].normalizedRules?.choices).toEqual([])
    expect(findLayerDependencyIssues(composed, layer)).toEqual([
      { owner: 'Wizard|PHB', path: 'classFeatureRefs[0]', reference: reference?.ref },
    ])
    expect(layer).toEqual(before)
  })

  test.each([
    ['PHB', '', undefined],
    ['PHB', '', ''],
    ['PHB', '', ' '],
    ['TCE', 'TCE', undefined],
    ['TCE', 'TCE', ''],
    ['TCE', 'TCE', ' '],
  ])('qualifies decoded %s source (%s) with blank target source %j', (source, packedSource, rawSource) => {
    const target = {
      ...feature,
      classSource: source,
      source: rawSource,
      entries: [
        {
          type: 'options',
          count: 1,
          entries: [
            { type: 'refOptionalfeature', optionalfeature: 'Shared Option' },
            { type: 'refOptionalfeature', optionalfeature: 'Explicit Option|XPHB' },
          ],
        },
      ],
    }
    const owner = parse([`Shared|Wizard|${packedSource}|8`], [target], 'HB')
    expect(owner.classFeatureRefs?.[0]?.source).toBe(source)
    expect(owner.normalizedRules?.choices[0]?.owner.featureSource).toBe(source)
    expect(owner.normalizedRules?.choices[0]?.options[0]?.source).toBe(source)
    expect(owner.normalizedRules?.choices[0]?.options[1]?.source).toBe('XPHB')

    const unresolved = parse([`Shared|Wizard|${packedSource}|8`], [], 'HB')
    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [unresolved] }),
      // Raw feature metadata can omit its defaulted source before composition.
      makeGameDataFixture({ classFeatures: [target as ClassFeature] }),
    ])
    expect(composed.classes[0].normalizedRules?.choices[0]?.options[0]?.source).toBe(source)
    expect(composed.classes[0].normalizedRules?.choices[0]?.options[1]?.source).toBe('XPHB')
  })

  test('uses the same default owner source for exact overlays and references', () => {
    const original = { ...feature, classSource: undefined }
    const replacement = { ...original, entries: ['Winning default-source rules'] }
    const owner = parse(['Shared|Wizard||8'], [original])
    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [owner], classFeatures: [original] }),
      makeGameDataFixture({ classFeatures: [replacement] }),
    ])
    expect(composed.classes[0].classFeatureRefs?.[0]?.feature?.entries).toEqual(replacement.entries)
  })

  test('resolves default owner-source metadata supplied by another layer', () => {
    const target = { ...feature, classSource: undefined }
    const owner = parse(['Shared|Wizard||8'], [])
    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [owner] }),
      makeGameDataFixture({ classFeatures: [target] }),
    ])
    expect(composed.classes[0].classFeatureRefs?.[0]?.feature).toEqual(target)
  })

  test('keeps an incomplete UID unresolved after composition', () => {
    const owner = parse(['Shared||PHB|8'], [])
    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [owner] }),
      makeGameDataFixture({ classFeatures: [feature] }),
    ])
    expect(composed.classes[0].classFeatureRefs?.[0]?.feature).toBeUndefined()
  })

  test('resolves a missing target from another layer using the retained UID fields', () => {
    const owner = parse(['Shared|Wizard|PHB|8'], [{ ...feature, className: 'Bard', level: 4 }])
    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [owner] }),
      makeGameDataFixture({ classFeatures: [feature] }),
    ])
    expect(composed.classes[0].classFeatureRefs?.[0]).toMatchObject({ level: 8, feature })
  })

  test('rebuilds an exact reference from its winning full-identity overlay', () => {
    const replacement = { ...feature, entries: ['Winning Wizard rules'] }
    const owner = parse(['Shared|Wizard|PHB|8'], [feature, { ...feature, level: 4 }])
    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [owner], classFeatures: [feature] }),
      makeGameDataFixture({ classFeatures: [{ ...feature, level: 4 }, replacement] }),
    ])
    expect(composed.classFeatures).toHaveLength(2)
    expect(composed.classes[0].classFeatureRefs?.[0]).toMatchObject({
      level: 8,
      feature: replacement,
    })
  })
})

const classDirectory = join(process.cwd(), 'data/class')
const normalized = (value: string | undefined) => value?.trim().toLowerCase()
test.skipIf(!existsSync(classDirectory))(
  'every available real class reference agrees with its encoded UID',
  () => {
    let resolved = 0
    for (const file of readdirSync(classDirectory).filter((name) =>
      /^class-.*\.json$/.test(name),
    )) {
      const payload = JSON.parse(readFileSync(join(classDirectory, file), 'utf8')) as {
        classFeature?: ClassFeature[]
      }
      for (const cls of parseClasses(payload) as Class5e[]) {
        for (const reference of cls.classFeatureRefs ?? []) {
          const [name, className, classSourcePart, levelPart, sourcePart] = reference.ref
            .split('|')
            .map((part) => part.trim())
          const classSource = classSourcePart || 'PHB'
          const source = sourcePart || classSource
          const target = payload.classFeature?.find(
            (candidate) =>
              normalized(candidate.name) === normalized(name) &&
              normalized(candidate.className) === normalized(className) &&
              normalized(candidate.classSource || 'PHB') === normalized(classSource) &&
              candidate.level === Number(levelPart) &&
              normalized(candidate.source || classSource) === normalized(source),
          )
          if (!target) continue
          resolved++
          expect(reference, `${file}:${reference.ref}`).toMatchObject({
            name,
            className,
            classSource,
            source,
            level: Number(levelPart),
          })
          expect(reference.feature, `${file}:${reference.ref}`).toEqual(target)
        }
      }
    }
    expect(resolved).toBeGreaterThan(500)
  },
)
