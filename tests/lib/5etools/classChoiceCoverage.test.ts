import { describe, expect, test } from 'vitest'
import {
  createClassChoiceCoverageMatrix,
  findClassChoiceCoverageGaps,
  getPrimaryClassSourceForEdition,
  getSrdClassCohort,
} from '@/lib/5etools/classChoiceCoverage'
import { makeClassFixture } from '../../fixtures/gameDataFixtures'

describe('class choice coverage', () => {
  test('builds every requested level from source-qualified normalized choices', () => {
    const classData = makeClassFixture({
      name: 'Test Class',
      source: 'TEST',
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [
          {
            id: 'class:test-class|test|choice:path|2',
            label: 'Path',
            kind: 'class-feature',
            owner: { type: 'class', name: 'Test Class', source: 'TEST' },
            level: 2,
            minimumSelections: 2,
            maximumSelections: 2,
            selectionCountByLevel: [0, 1, 1, 2],
            options: [],
            repeatable: false,
            replacement: { cadence: 'never' },
            source: { kind: 'class-feature-options', field: 'fixture' },
          },
        ],
        choiceDiagnostics: [],
      },
    })

    const matrix = createClassChoiceCoverageMatrix([classData], 4)

    expect(matrix[0]?.levels.map((cell) => cell.requiredSelections)).toEqual([0, 1, 1, 2])
    expect(findClassChoiceCoverageGaps([classData], matrix, 4)).toEqual([])
  })

  test('reports diagnostics, incomplete progressions, and mismatched owners', () => {
    const classData = makeClassFixture({
      name: 'Test Class',
      source: 'TEST',
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [
          {
            id: 'invalid-choice',
            label: 'Invalid Choice',
            kind: 'item',
            owner: { type: 'class', name: 'Other Class', source: 'TEST' },
            level: 1,
            minimumSelections: 1,
            maximumSelections: 1,
            selectionCountByLevel: [1],
            options: [],
            repeatable: false,
            replacement: { cadence: 'never' },
            source: { kind: 'class-table', field: 'fixture' },
          },
        ],
        choiceDiagnostics: [
          {
            code: 'unresolved-options',
            className: 'Test Class',
            classSource: 'TEST',
            featureName: 'Unknown Choice',
            level: 1,
            message: 'Choice options are unresolved.',
          },
        ],
      },
    })

    const gaps = findClassChoiceCoverageGaps(
      [classData],
      createClassChoiceCoverageMatrix([classData], 2),
      2,
    )

    expect(gaps.map((gap) => gap.message)).toEqual([
      'Choice options are unresolved.',
      'invalid-choice has a mismatched owner.',
      'invalid-choice has 1 progression entries.',
    ])
  })

  test('derives the primary edition source from the parsed corpus', () => {
    expect(
      getPrimaryClassSourceForEdition(
        [
          makeClassFixture({ name: 'A', source: 'SMALL', edition: 'next' }),
          makeClassFixture({ name: 'A', source: 'CORE', edition: 'next' }),
          makeClassFixture({ name: 'B', source: 'CORE', edition: 'next' }),
        ],
        'next',
      ),
    ).toBe('CORE')
  })

  test('selects only classes carrying the requested upstream SRD marker', () => {
    const legacy = makeClassFixture({ name: 'Legacy', source: 'TEST', srd: true })
    const revised = makeClassFixture({ name: 'Revised', source: 'TEST', srd52: true })
    const expansion = makeClassFixture({ name: 'Expansion', source: 'TEST' })

    expect(getSrdClassCohort([legacy, revised, expansion], 'srd')).toEqual([legacy])
    expect(getSrdClassCohort([legacy, revised, expansion], 'srd52')).toEqual([revised])
  })

  test('reports duplicate source-qualified classes in a coverage cohort', () => {
    const duplicate = makeClassFixture({ name: 'Test Class', source: 'TEST' })
    const classes = [duplicate, { ...duplicate }]

    expect(
      findClassChoiceCoverageGaps(classes, createClassChoiceCoverageMatrix(classes, 1), 1).map(
        (gap) => gap.message,
      ),
    ).toContain('Coverage contains a duplicate source-qualified class.')
  })
})
