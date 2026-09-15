import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  getRequiredChoiceSelectionCount,
  normalizeClassChoices,
} from '@/lib/5etools/classChoiceNormalization'
import { parseClasses } from '@/lib/5etools/parsers'
import type { Class5e, ClassFeatureReference } from '@/types/5etools'

function featureRef(
  name: string,
  level: number,
  entries: unknown[],
  source = 'XPHB',
): ClassFeatureReference {
  return {
    ref: `${name}|Test Class|${source}|${level}`,
    name,
    source,
    className: 'Test Class',
    classSource: source,
    level,
    feature: { name, source, level, entries },
  }
}

function loadParsedClass(fileName: string, name: string, source = 'XPHB'): Class5e {
  const payload = JSON.parse(readFileSync(join(process.cwd(), 'data', 'class', fileName), 'utf8'))
  const parsed = parseClasses(payload) as Class5e[]
  const classData = parsed.find((entry) => entry.name === name && entry.source === source)
  if (!classData) throw new Error(`Missing ${name}|${source} in ${fileName}`)
  return classData
}

describe('class choice normalization', () => {
  test('normalizes source-qualified class feature option references', () => {
    const result = normalizeClassChoices({ name: 'Test Class', source: 'XPHB' }, [
      featureRef('Sacred Order', 1, [
        {
          type: 'options',
          count: 1,
          entries: [
            { type: 'refClassFeature', classFeature: 'Protector|Test Class|XPHB|1|XPHB' },
            { type: 'refClassFeature', classFeature: 'Scholar|Test Class|XPHB|1|XPHB' },
          ],
        },
      ]),
    ])

    expect(result.diagnostics).toEqual([])
    expect(result.choices[0]).toMatchObject({
      id: 'class:test-class|xphb|choice:sacred-order|1',
      label: 'Sacred Order',
      kind: 'class-feature',
      owner: {
        type: 'class',
        name: 'Test Class',
        source: 'XPHB',
        featureName: 'Sacred Order',
      },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      options: [
        { entityType: 'classFeature', name: 'Protector', source: 'XPHB' },
        { entityType: 'classFeature', name: 'Scholar', source: 'XPHB' },
      ],
      source: { kind: 'class-feature-options' },
    })
    expect(getRequiredChoiceSelectionCount(result.choices[0]!, 0)).toBe(0)
    expect(getRequiredChoiceSelectionCount(result.choices[0]!, 1)).toBe(1)
    expect(getRequiredChoiceSelectionCount(result.choices[0]!, 20)).toBe(1)
  })

  test('reports option blocks whose count or references cannot be represented safely', () => {
    const result = normalizeClassChoices({ name: 'Test Class', source: 'HB' }, [
      featureRef('Uncounted Choice', 2, [{ type: 'options', entries: [{ name: 'One' }] }], 'HB'),
      featureRef('Unresolved Choice', 3, [{ type: 'options', count: 1, entries: ['prose'] }], 'HB'),
    ])

    expect(result.choices).toEqual([])
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'invalid-count',
      'unresolved-options',
    ])
  })

  test('normalizes cumulative optional-feature progression and replacement rules', () => {
    const [metamagic] = normalizeClassChoices(
      {
        name: 'Sorcerer',
        source: 'XPHB',
        optionalfeatureProgression: [
          { name: 'Metamagic', featureType: ['MM'], progression: { '2': 2, '10': 4, '17': 6 } },
        ],
      },
      [
        {
          ...featureRef('Metamagic', 2, [
            'Whenever you gain a Sorcerer level, you can replace one of your Metamagic options.',
          ]),
          ref: 'Metamagic|Sorcerer|XPHB|2',
          className: 'Sorcerer',
        },
      ],
    ).choices

    expect(metamagic).toMatchObject({
      kind: 'metamagic',
      level: 2,
      maximumSelections: 6,
      optionFilter: { entityType: 'optionalFeature', featureTypes: ['MM'] },
      replacement: { cadence: 'class-level', maximumPerEvent: 1 },
    })
    expect(getRequiredChoiceSelectionCount(metamagic!, 1)).toBe(0)
    expect(getRequiredChoiceSelectionCount(metamagic!, 2)).toBe(2)
    expect(getRequiredChoiceSelectionCount(metamagic!, 10)).toBe(4)
    expect(getRequiredChoiceSelectionCount(metamagic!, 17)).toBe(6)
  })

  test('normalizes Weapon Mastery capacity from the class table, not as a resource', () => {
    const [mastery] = normalizeClassChoices(
      {
        name: 'Fighter',
        source: 'XPHB',
        classTableGroups: [
          {
            colLabels: ['Second Wind', 'Weapon Mastery'],
            rows: [
              [2, 3],
              [2, 3],
              [2, 3],
              [3, 4],
            ],
          },
        ],
      },
      [
        {
          ...featureRef('Weapon Mastery', 1, [
            'Choose three kinds of {@filter weapons|items|type=simple weapon;martial weapon}. Whenever you finish a Long Rest, you can change one of those weapon choices.',
          ]),
          ref: 'Weapon Mastery|Fighter|XPHB|1',
          className: 'Fighter',
        },
      ],
    ).choices

    expect(mastery).toMatchObject({
      kind: 'weapon-mastery',
      optionFilter: {
        entityType: 'item',
        itemTypes: ['simple weapon', 'martial weapon'],
      },
      replacement: { cadence: 'long-rest', maximumPerEvent: 1 },
    })
    expect(getRequiredChoiceSelectionCount(mastery!, 1)).toBe(3)
    expect(getRequiredChoiceSelectionCount(mastery!, 4)).toBe(4)
  })

  test('normalizes 2024 fighting-style feat filters without guessing option names', () => {
    const [style] = normalizeClassChoices({ name: 'Fighter', source: 'XPHB' }, [
      {
        ...featureRef('Fighting Style', 1, [
          'You gain a {@filter Fighting Style feat|feats|category=FS} of your choice.',
        ]),
        ref: 'Fighting Style|Fighter|XPHB|1',
        className: 'Fighter',
      },
    ]).choices

    expect(style).toMatchObject({
      kind: 'fighting-style',
      level: 1,
      optionFilter: { entityType: 'feat', categories: ['FS'] },
    })
  })

  test('covers the required 2024 core choice families in the configured corpus', () => {
    const cleric = loadParsedClass('class-cleric.json', 'Cleric')
    const druid = loadParsedClass('class-druid.json', 'Druid')
    const sorcerer = loadParsedClass('class-sorcerer.json', 'Sorcerer')
    const warlock = loadParsedClass('class-warlock.json', 'Warlock')
    const fighter = loadParsedClass('class-fighter.json', 'Fighter')

    expect(cleric.normalizedRules?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Divine Order', maximumSelections: 1 }),
      ]),
    )
    expect(druid.normalizedRules?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Primal Order', maximumSelections: 1 }),
        expect.objectContaining({ label: 'Elemental Fury', level: 7, maximumSelections: 1 }),
      ]),
    )
    expect(sorcerer.normalizedRules?.choices).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'metamagic' })]),
    )
    expect(warlock.normalizedRules?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Eldritch Invocations',
          optionFilter: expect.objectContaining({ featureTypes: ['EI'] }),
        }),
      ]),
    )
    expect(fighter.normalizedRules?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'weapon-mastery' }),
        expect.objectContaining({ kind: 'fighting-style' }),
      ]),
    )
  })
})
