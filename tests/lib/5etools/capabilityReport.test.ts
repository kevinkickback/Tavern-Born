import { describe, expect, it } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import type { Race5e } from '@/types/5etools'
import type { NormalizedClassRules } from '@/types/classRules'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeRaceFixture,
} from '../../fixtures/gameDataFixtures'

const EMPTY_RULES: NormalizedClassRules = {
  resources: [],
  asiLevels: [],
  ritualCasting: false,
  choices: [],
  choiceDiagnostics: [],
}

describe('createCorpusCapabilityReport', () => {
  it('inventories choice, movement, and unknown field shapes without guessing', () => {
    const classData = makeClassFixture({
      name: 'Test Adept',
      source: 'TST',
      classFeatureRefs: [
        {
          ref: 'Resolved Feature|Test Adept|TST|1',
          name: 'Resolved Feature',
          source: 'TST',
          className: 'Test Adept',
          classSource: 'TST',
          level: 1,
          feature: { name: 'Resolved Feature', source: 'TST' },
        },
      ],
      normalizedRules: {
        ...EMPTY_RULES,
        choices: [
          {
            id: 'test-choice',
            label: 'Test Choice',
            kind: 'feat',
            owner: { type: 'class', name: 'Test Adept', source: 'TST' },
            level: 1,
            minimumSelections: 1,
            maximumSelections: 1,
            selectionCountByLevel: [1],
            options: [{ entityType: 'feat', name: 'Resolved Option', source: 'TST' }],
            repeatable: false,
            replacement: { cadence: 'never' },
            source: { kind: 'class-feature-options', field: 'test.options' },
          },
        ],
      },
    })
    const numeric = makeRaceFixture({ name: 'Numeric Walker', source: 'TST', speed: 25 })
    const structured = makeRaceFixture({
      name: 'Structured Walker',
      source: 'TST',
      speed: { walk: 30, glide: 40 } as Race5e['speed'],
      novelEffect: { amount: 1 },
    })

    const report = createCorpusCapabilityReport(
      makeGameDataFixture({
        classes: [classData],
        races: [numeric, structured],
        feats: [{ name: 'Resolved Option', source: 'TST' }],
      }),
    )

    expect(report.classChoices).toMatchObject({ total: 1, byKind: { feat: 1 } })
    expect(report.movement).toMatchObject({
      numeric: 1,
      structured: 1,
      modes: { walk: 2, glide: 1 },
      customModes: { glide: 1 },
    })
    expect(report.fields).toContainEqual({
      collection: 'races',
      field: 'novelEffect',
      shapes: { object: 1 },
    })
    expect(report.issues).toEqual([])
  })

  it('reports unresolved, unqualified, and unsupported shapes explicitly', () => {
    const unresolvedClass = makeClassFixture({
      name: 'Reference Tester',
      source: 'TST',
      classFeatureRefs: [
        {
          ref: 'Missing Feature|Reference Tester|TST|1',
          name: 'Missing Feature',
          source: 'TST',
          className: 'Reference Tester',
          classSource: 'TST',
          level: 1,
        },
      ],
      normalizedRules: {
        ...EMPTY_RULES,
        choices: [
          {
            id: 'reference-test',
            label: 'Reference Test',
            kind: 'item',
            owner: { type: 'class', name: 'Reference Tester', source: 'TST' },
            level: 1,
            minimumSelections: 2,
            maximumSelections: 2,
            selectionCountByLevel: [2],
            options: [
              { entityType: 'item', name: 'Missing Source' },
              { entityType: 'item', name: 'Missing Catalog Entry', source: 'TST' },
            ],
            repeatable: false,
            replacement: { cadence: 'never' },
            source: { kind: 'class-feature-options', field: 'test.options' },
          },
        ],
        choiceDiagnostics: [
          {
            code: 'unresolved-options',
            className: 'Reference Tester',
            classSource: 'TST',
            featureName: 'Reference Test',
            message: 'Synthetic diagnostic.',
          },
        ],
      },
    })
    const unsupportedMovement = makeRaceFixture({
      name: 'Unsupported Walker',
      source: 'TST',
      speed: 'fast' as unknown as Race5e['speed'],
    })
    const inheritedMovement = makeRaceFixture({
      name: 'Inherited Walker',
      source: 'TST',
      speed: { fly: true },
    })

    const report = createCorpusCapabilityReport(
      makeGameDataFixture({
        classes: [unresolvedClass, { ...makeClassFixture(), normalizedRules: undefined }],
        races: [unsupportedMovement, inheritedMovement],
      }),
    )

    expect(report.movement).toMatchObject({ unsupported: 1, unresolvedInherited: 1 })
    expect(new Set(report.issues.map((issue) => issue.code))).toEqual(
      new Set([
        'choice-diagnostic',
        'missing-normalized-rules',
        'unqualified-reference',
        'unresolved-inherited-movement',
        'unresolved-reference',
        'unsupported-movement-shape',
      ]),
    )
  })

  it('reports source-less entities instead of using name-only identity', () => {
    const report = createCorpusCapabilityReport(
      makeGameDataFixture({
        optionalfeatures: [{ name: 'Unqualified Option' }],
      }),
    )

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'unqualified-entity',
        collection: 'optionalfeatures',
        entity: 'Unqualified Option',
      }),
    )
  })
})
