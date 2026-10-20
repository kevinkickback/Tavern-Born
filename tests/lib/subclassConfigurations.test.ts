import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import {
  getCharacterClassChoices,
  getClassChoiceCandidates,
} from '@/lib/character/classChoiceOptions'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  getSubclassConfigurations,
  hasUnavailableSubclassConfiguration,
} from '@/lib/character/subclassConfigurations'
import type { Class5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeFeatureOptionFixture,
  pruneFeatureOptionDeclaration,
  selectFeatureOption,
} from '../fixtures/featureOptionFixtures'

function grouped(fixture = makeFeatureOptionFixture()) {
  return getSubclassConfigurations(
    getClassChoiceCandidates(fixture.classData, fixture.subclass, fixture.catalogs),
    fixture.classData,
    fixture.subclass,
  )
}

describe('stable subclass configuration', () => {
  test('uses the full selected owner and earned level while leaving the PHB target unchanged', () => {
    const fixture = makeFeatureOptionFixture()
    expect(grouped(fixture).map((choice) => [choice.label, choice.level])).toEqual([
      ['Dragon Ancestor', 1],
    ])
    const choice = fixture.choice!
    for (const field of ['name', 'source', 'subclassName', 'subclassSource'] as const) {
      expect(
        getSubclassConfigurations(
          [{ ...choice, owner: { ...choice.owner, [field]: 'Other' } }],
          fixture.classData,
          fixture.subclass,
        ),
      ).toEqual([])
    }
    expect(
      getSubclassConfigurations(
        [choice],
        { ...fixture.classData, classFeatureRefs: [] },
        fixture.subclass,
      ),
    ).toEqual([])
  })

  test('leaves regular, later, repeated, cumulative and incomplete schedules independent', () => {
    const fixture = makeFeatureOptionFixture()
    const choice = fixture.choice!
    const invalid = [
      { ...choice, level: 6 },
      { ...choice, repeatable: true },
      ...(['class-level', 'asi-level', 'long-rest'] as const).map((cadence) => ({
        ...choice,
        replacement: { cadence },
      })),
      { ...choice, selectionCountByLevel: [] },
      { ...choice, selectionCountByLevel: [1] },
      { ...choice, selectionCountByLevel: Array(20) },
      { ...choice, selectionCountByLevel: [...Array(19).fill(1), 2] },
      { ...choice, minimumSelections: 0, maximumSelections: 0 },
    ]
    for (const candidate of invalid)
      expect(getSubclassConfigurations([candidate], fixture.classData, fixture.subclass)).toEqual(
        [],
      )
  })

  test.runIf(existsSync('data/class/class-ranger.json'))(
    'permission alone preserves classic/copy companion setup while source candidates retain real rest wording',
    () => {
      const classes = parseClasses(
        JSON.parse(readFileSync('data/class/class-ranger.json', 'utf8')),
      ) as Class5e[]
      for (const classData of classes) {
        for (const subclass of classData.subclasses ?? []) {
          if (subclass.name !== 'Beast Master') continue
          const all = subclass.normalizedRules!.choices
          for (const primal of all.filter((choice) => choice.label === 'Primal Companion'))
            expect(primal.replacement.cadence).toBe('long-rest')
          const character = makeCharacterFixture({
            classProgression: [
              {
                name: classData.name,
                source: classData.source,
                levels: 20,
                subclass: subclass.name,
                subclassSource: subclass.source,
              },
            ],
          })
          const classic = getCharacterClassChoices(
            classData,
            subclass,
            createOptionalClassFeatureActivity(character),
          )
          const optional = getCharacterClassChoices(
            classData,
            subclass,
            createOptionalClassFeatureActivity({
              ...character,
              variantRules: { optionalClassFeatures: true },
            }),
          )
          const classicGroups = getSubclassConfigurations(classic, classData, subclass)
          expect(classicGroups.map((choice) => choice.label)).toEqual(
            subclass.source === 'PHB' ? ["Ranger's Companion"] : [],
          )
          expect(getSubclassConfigurations(optional, classData, subclass)).toEqual(classicGroups)
        }
      }
    },
  )

  test.runIf(existsSync('data/class/class-sorcerer.json'))(
    'copied Dragon choices group at their actual XPHB earned level, retaining the PHB1 target',
    () => {
      const classes = parseClasses(
        JSON.parse(readFileSync('data/class/class-sorcerer.json', 'utf8')),
      ) as Class5e[]
      const classData = classes.find((row) => row.source === 'XPHB')!
      const subclass = classData.subclasses!.find(
        (row) => row.name === 'Draconic Bloodline' && row.source === 'PHB',
      )!
      const choices = getSubclassConfigurations(
        getClassChoiceCandidates(classData, subclass),
        classData,
        subclass,
      )
      expect(choices).toHaveLength(1)
      expect(choices[0]).toMatchObject({
        label: 'Dragon Ancestor',
        level: 3,
        owner: { source: 'XPHB', subclassSource: 'PHB' },
      })
      expect(JSON.parse(choices[0].options[0].ref!)[1]).toContain('sorcerer|phb|draconic|phb|1|phb')
    },
  )
})

test('only same-owner initial stable saved recovery changes parent status; exact restoration restores completeness', () => {
  const fixture = makeFeatureOptionFixture()
  const saved = selectFeatureOption(fixture)
  const missing = makeFeatureOptionFixture(1, pruneFeatureOptionDeclaration)
  const states = getFeatureOptionSelectionStates(saved, missing.data.classes, missing.catalogs)
  expect(
    hasUnavailableSubclassConfiguration(
      states.map((state) => ({
        ...state,
        selection: { ...state.selection, choiceId: 'feature-table:invalid' },
      })),
      missing.classData,
      missing.subclass,
    ),
  ).toBe(false)
  expect(hasUnavailableSubclassConfiguration(states, missing.classData, missing.subclass)).toBe(
    true,
  )
  expect(
    hasUnavailableSubclassConfiguration(states, fixture.classData, {
      ...fixture.subclass,
      source: 'OTHER',
    }),
  ).toBe(false)
  expect(
    hasUnavailableSubclassConfiguration(
      states.map((state) => ({ ...state, selection: { ...state.selection, classLevel: 6 } })),
      missing.classData,
      missing.subclass,
    ),
  ).toBe(false)
  expect(
    hasUnavailableSubclassConfiguration(
      states.map((state) => ({
        ...state,
        selection: {
          ...state.selection,
          kind: 'subclass-feature',
          choiceId: 'subclass-options:regular',
        },
      })),
      missing.classData,
      missing.subclass,
    ),
  ).toBe(false)
  expect(
    hasUnavailableSubclassConfiguration(
      getFeatureOptionSelectionStates(saved, fixture.data.classes, fixture.catalogs),
      fixture.classData,
      fixture.subclass,
    ),
  ).toBe(false)
})
