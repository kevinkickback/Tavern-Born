import { describe, expect, test } from 'vitest'
import { DRAGON_ANCESTOR_REF, ELEMENTAL_AFFINITY_REF } from '@/lib/5etools/featureTableOptions'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getFeatureActionGroupId } from '@/lib/calculations/featureActionGroups'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import { makeFeatureOptionFixture, selectFeatureOption } from '../../fixtures/featureOptionFixtures'

describe('audited literal source producer boundary', () => {
  test.each([
    'conflict-first',
    'conflict-last',
    'invalid-first',
    'invalid-last',
  ])('%s cannot disappear through first-match enrichment', (mode) => {
    const fixture = makeFeatureOptionFixture(1, (document) => {
      const source = document.subclassFeature.find(
        (row) => row.name === 'Dragon Ancestor' && row.source === 'PHB',
      )!
      const other = {
        ...source,
        entries: mode.startsWith('invalid') ? undefined : [...source.entries!, 'Conflicting rule.'],
      }
      if (mode.endsWith('first')) document.subclassFeature.unshift(other)
      else document.subclassFeature.push(other)
    })
    expect(fixture.choice).toBeUndefined()
    expect(fixture.subclass.normalizedRules!.choiceDiagnostics).toMatchObject([
      { code: 'unverified-required-choice' },
    ])
    const clean = makeFeatureOptionFixture()
    const saved = selectFeatureOption(clean)
    expect(
      getFeatureOptionSelectionStates(saved, fixture.data.classes, fixture.catalogs)[0].recovery,
    ).toBe(true)
    expect(
      getFeatureOptionSelectionStates(saved, clean.data.classes, clean.catalogs)[0].details[0],
    ).toMatchObject({ damageType: 'Fire', available: true })
  })
  test('equivalent clones and incoming or inherited marker values do not create source conflict', () => {
    const fixture = makeFeatureOptionFixture(1, (document) => {
      const source = document.subclassFeature.find(
        (row) => row.name === 'Dragon Ancestor' && row.source === 'PHB',
      )!
      source.featureOptionSourceConflict = true
      document.subclassFeature.push(structuredClone(source))
    })
    expect(fixture.choice!.options).toHaveLength(10)
    const parsed = fixture.catalogs.subclassFeatures.find((row) => row.name === 'Dragon Ancestor')!
    expect(parsed.featureOptionSourceConflict).toBeUndefined()
  })
  test.each([
    'name',
    'className',
    'classSource',
    'subclassShortName',
    'subclassSource',
    'level',
    'source',
  ] as const)('different complete %s does not poison the correct target', (field) => {
    const fixture = makeFeatureOptionFixture(1, (document) => {
      const source = document.subclassFeature.find(
        (row) => row.name === 'Dragon Ancestor' && row.source === 'PHB',
      )!
      document.subclassFeature.push({
        ...source,
        [field]: field === 'level' ? 2 : 'Other',
        entries: ['Other source body.'],
      })
    })
    expect(fixture.choice!.options).toHaveLength(10)
  })
  test('Affinity conflicts leave ancestry verified, with later context explicitly unverified until restoration', () => {
    const clean = makeFeatureOptionFixture(6)
    const saved = selectFeatureOption(clean)
    const conflict = makeFeatureOptionFixture(6, (document) => {
      const source = document.subclassFeature.find(
        (row) => row.name === 'Elemental Affinity' && row.source === 'PHB',
      )!
      document.subclassFeature.unshift({
        ...source,
        entries: [...source.entries!, 'Conflicting rule.'],
      })
    })
    const state = getFeatureOptionSelectionStates(
      saved,
      conflict.data.classes,
      conflict.catalogs,
    )[0]
    expect(state.details[0]).toMatchObject({ damageType: 'Fire', available: true })
    expect(state.affinity?.available).toBe(false)
    expect(
      getFeatureOptionSelectionStates(saved, clean.data.classes, clean.catalogs)[0].affinity
        ?.available,
    ).toBe(true)
  })
  test('both actual parser projections carry uncertainty while enclosing action identity ignores only derived metadata', () => {
    let document: unknown
    makeFeatureOptionFixture(1, (source) => {
      const ancestor = source.subclassFeature.find(
        (row) => row.name === 'Dragon Ancestor' && row.source === 'PHB',
      )!
      source.classFeature.push({
        name: 'Enclosing action',
        source: 'PHB',
        className: 'Sorcerer',
        classSource: 'PHB',
        level: 1,
        entries: [
          'As an action, invoke this power.',
          { type: 'refSubclassFeature', subclassFeature: DRAGON_ANCESTOR_REF },
        ],
      })
      document = source
      source.subclassFeature.push({ ...ancestor, entries: [...ancestor.entries!, 'Conflict.'] })
    })
    const parsed = parseClassDocument(document)
    const action = (parsed.classFeatures as ClassFeature[]).find(
      (row) => row.name === 'Enclosing action',
    )!
    const nested = action.entries![1] as { feature: SubclassFeature }
    expect(nested.feature.featureOptionSourceConflict).toBe(true)
    const cls = (parsed.classes as Class5e[]).find((row) => row.source === 'PHB')!
    expect(
      cls.subclasses!.find((row) => row.shortName === 'Draconic')!.normalizedRules!.choices,
    ).toEqual([])
    const original = getFeatureActionGroupId(
      'Sorcerer|PHB',
      'class-feature|enclosing action|sorcerer|phb|1|phb',
      action.entries!,
    )
    const cleared = structuredClone(action.entries!)
    delete (cleared[1] as { feature: SubclassFeature }).feature.featureOptionSourceConflict
    expect(
      getFeatureActionGroupId(
        'Sorcerer|PHB',
        'class-feature|enclosing action|sorcerer|phb|1|phb',
        cleared,
      ),
    ).toBe(original)
    ;(cleared[1] as { feature: SubclassFeature }).feature.entries!.push('A genuine changed rule.')
    expect(
      getFeatureActionGroupId(
        'Sorcerer|PHB',
        'class-feature|enclosing action|sorcerer|phb|1|phb',
        cleared,
      ),
    ).not.toBe(original)
    expect(ELEMENTAL_AFFINITY_REF).toBe('Elemental Affinity|Sorcerer|PHB|Draconic|PHB|6|PHB')
  })
})
