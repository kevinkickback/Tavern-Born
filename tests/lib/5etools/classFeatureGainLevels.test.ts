import { describe, expect, test } from 'vitest'
import {
  normalizeClassChoices,
  normalizeSubclassRules,
} from '@/lib/5etools/classChoiceNormalization'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { getExpertiseSlotsFromClasses } from '@/lib/calculations/skills'
import type { Class5e, ClassFeatureReference, SubclassFeatureReference } from '@/types/5etools'

const owner = { name: 'Wizard', source: 'PHB' }
const optionEntries = [
  {
    type: 'options',
    count: 1,
    entries: [
      { type: 'refOptionalfeature', optionalfeature: 'First Path|PHB' },
      { type: 'refOptionalfeature', optionalfeature: 'Second Path|PHB' },
    ],
  },
]

function reference(name: string, ref: string, level?: number): ClassFeatureReference {
  return {
    ref,
    name,
    className: 'Wizard',
    source: 'PHB',
    ...(level !== undefined ? { level } : {}),
    feature: { name, source: 'PHB', level: 8, entries: optionEntries },
  }
}

function expertise(refs: ClassFeatureReference[], level: number): number {
  return getExpertiseSlotsFromClasses([{ ...owner, levels: level }], {
    'Wizard|PHB': { ...owner, classFeatureRefs: refs },
  })
}

describe('class-feature gain levels', () => {
  test.each([
    '',
    '8junk',
    'Infinity',
    '-1',
    '0',
    '1.5',
    'NaN',
    '1e309',
  ])('does not schedule ASIs or expertise from a malformed packed level: %s', (level) => {
    const parsed = (
      parseClasses({
        class: [
          {
            ...owner,
            classFeatures: [
              `Ability Score Improvement|Wizard||${level}`,
              `Expertise|Wizard||${level}`,
            ],
          },
        ],
      }) as Class5e[]
    )[0]
    expect(parsed.normalizedRules?.asiLevels).toEqual([])
    expect(expertise(parsed.classFeatureRefs ?? [], 20)).toBe(0)
  })

  test.each([
    'Choices|Wizard||8junk',
    'Choices||PHB|8',
    'Choices|Wizard',
    '|Wizard||8',
  ])('does not repair an incomplete packed identity with numeric metadata: %s', (uid) => {
    const ref = reference('Choices', uid, 4)
    expect(normalizeClassChoices(owner, [ref]).choices).toEqual([])
    expect(
      normalizeClassRules(owner, [{ ...ref, name: 'Ability Score Improvement' }]).asiLevels,
    ).toEqual([])
    expect(expertise([{ ...ref, name: 'Expertise' }], 20)).toBe(0)
  })

  test.each([
    '8',
    '08',
    ' 8 ',
    '8.0',
    '8e0',
    '0x8',
    '0b1000',
  ])('uses the full upstream numeric level across all consumers: %s', (packedLevel) => {
    const ref = reference('Choices', `Choices|Wizard||${packedLevel}||2`, 4)
    const before = structuredClone(ref)
    expect(
      normalizeClassRules(owner, [{ ...ref, name: 'Ability Score Improvement' }]).asiLevels,
    ).toEqual([8])
    expect(expertise([{ ...ref, name: 'Expertise' }], 7)).toBe(0)
    expect(expertise([{ ...ref, name: 'Expertise' }], 8)).toBe(2)
    const choice = normalizeClassChoices(owner, [ref]).choices[0]
    expect(choice).toMatchObject({ level: 8, minimumSelections: 1, maximumSelections: 1 })
    expect(choice.selectionCountByLevel.slice(0, 9)).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1])
    expect(ref).toEqual(before)
  })

  test('does not use numeric display text as a feature gain level', () => {
    const ref = reference('Choices', 'Choices|Wizard||8||2')
    expect(normalizeClassChoices(owner, [ref]).choices[0]?.level).toBe(8)
  })

  test.each([
    '8',
    '8junk',
  ])('validates the gain level before creating filtered choices: %s', (packedLevel) => {
    const ref = reference('Paths', `Paths|Wizard||${packedLevel}`, 4)
    ref.feature!.entries = ['Choose one {@filter tool|items|type=tool}.']
    const choices = normalizeClassChoices(owner, [ref]).choices
    if (packedLevel === '8junk') expect(choices).toEqual([])
    else expect(choices[0]).toMatchObject({ level: 8, kind: 'item' })
  })

  test.each([
    '8',
    '8junk',
  ])('does not use a malformed reference to create a table-backed choice: %s', (packedLevel) => {
    const ref = reference('Paths', `Paths|Wizard||${packedLevel}`, 4)
    ref.feature!.entries = [
      { type: 'table', rows: [['{@filter tools|items|type=tool}', '{@item Hammer|PHB}']] },
    ]
    const choices = normalizeClassChoices(
      { ...owner, classTableGroups: [{ colLabels: ['Paths'], rows: [[1], [1]] }] },
      [ref],
    ).choices
    if (packedLevel === '8junk') expect(choices).toEqual([])
    else {
      expect(choices[0]).toMatchObject({ level: 1, source: { kind: 'class-table' } })
      expect(choices[0].options).toEqual([
        { entityType: 'item', name: 'Hammer', source: 'PHB', minimumClassLevel: 8 },
      ])
    }
  })

  test.each([
    { uid: '', level: 4, expected: 4 },
    { uid: '   ', level: 4, expected: 4 },
    { uid: '', level: undefined, expected: 8 },
  ])('supports numeric materialized rows without an encoded UID: %j', ({
    uid,
    level,
    expected,
  }) => {
    const ref = reference('Choices', uid, level)
    expect(normalizeClassChoices(owner, [ref]).choices[0]?.level).toBe(expected)
    expect(
      normalizeClassRules(owner, [{ ...ref, name: 'Ability Score Improvement' }]).asiLevels,
    ).toEqual([expected])
    expect(expertise([{ ...ref, name: 'Expertise' }], expected - 1)).toBe(0)
    expect(expertise([{ ...ref, name: 'Expertise' }], expected)).toBe(2)
  })

  test.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '8',
    null,
  ])('rejects an invalid explicit materialized level without falling back: %s', (level) => {
    const ref = { ...reference('Choices', ''), level } as ClassFeatureReference
    expect(normalizeClassChoices(owner, [ref]).choices).toEqual([])
    expect(
      normalizeClassRules(owner, [{ ...ref, name: 'Ability Score Improvement' }]).asiLevels,
    ).toEqual([])
    expect(expertise([{ ...ref, name: 'Expertise' }], 20)).toBe(0)
  })

  test.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '8',
    null,
  ])('validates the attached feature level when explicit metadata and UID are absent: %s', (level) => {
    const ref = reference('Choices', '')
    ref.feature!.level = level as number
    expect(normalizeClassChoices(owner, [ref]).choices).toEqual([])
    expect(expertise([{ ...ref, name: 'Expertise' }], 20)).toBe(0)
  })

  test.each([null, 8])('does not treat a non-string UID as absent: %s', (uid) => {
    const ref = { ...reference('Choices', '', 4), ref: uid } as unknown as ClassFeatureReference
    expect(normalizeClassChoices(owner, [ref]).choices).toEqual([])
    expect(expertise([{ ...ref, name: 'Expertise' }], 20)).toBe(0)
  })

  test('preserves an independently structured progression when feature gain metadata is invalid', () => {
    const counts = [0, 0, 1, 1]
    const choices = normalizeClassChoices(
      {
        ...owner,
        optionalfeatureProgression: [{ name: 'Paths', featureType: ['TST'], progression: counts }],
      },
      [reference('Paths', 'Paths|Wizard||8junk', 4)],
    ).choices
    expect(choices).toHaveLength(1)
    expect(choices[0]).toMatchObject({ level: 3, source: { kind: 'optional-feature-progression' } })
    expect(choices[0].selectionCountByLevel.slice(0, 4)).toEqual(counts)
  })

  test('counts repeated expertise levels by their source-qualified class progression', () => {
    const classes: Record<string, Class5e> = {
      'Rogue|PHB': {
        name: 'Rogue',
        source: 'PHB',
        classFeatureRefs: [1, 6].map((level) =>
          reference('Expertise', `Expertise|Rogue||${level}`, 1),
        ),
      },
      'Bard|PHB': {
        name: 'Bard',
        source: 'PHB',
        classFeatureRefs: [3, 10].map((level) =>
          reference('Expertise', `Expertise|Bard||${level}`, 1),
        ),
      },
      'Rogue|XPHB': { name: 'Rogue', source: 'XPHB', classFeatureRefs: [] },
    }
    const progression = [
      { name: 'Rogue', source: 'PHB', levels: 5 },
      { name: 'Bard', source: 'PHB', levels: 3 },
      { name: 'Rogue', source: 'XPHB', levels: 10 },
    ]
    expect(getExpertiseSlotsFromClasses(progression, classes)).toBe(4)
    expect(
      getExpertiseSlotsFromClasses([{ ...progression[0], levels: 6 }, progression[1]], classes),
    ).toBe(6)
    expect(
      getExpertiseSlotsFromClasses([progression[0], { ...progression[1], levels: 10 }], classes),
    ).toBe(6)
  })

  test('preserves the separate subclass reference layout', () => {
    const ref: SubclassFeatureReference = {
      ...reference('Paths', 'Paths|Wizard|PHB|School|PHB|3|PHB'),
      subclassShortName: 'School',
      subclassSource: 'PHB',
      feature: { name: 'Paths', source: 'PHB', entries: optionEntries },
    }
    const rules = normalizeSubclassRules(owner, { name: 'School', source: 'PHB' }, [ref])
    expect(rules.choices[0]).toMatchObject({ level: 3, owner: { type: 'subclass' } })
  })
})
