import { describe, expect, test } from 'vitest'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetPdf'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import type { CharacterReadinessResult } from '@/lib/readiness/characterReadiness'
import type { CharacterEffect } from '@/types/effects'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const READY: CharacterReadinessResult = {
  status: 'ready',
  issues: [],
  blockingIssues: [],
  recommendations: [],
}

function createViewModel(equipmentCount = 0) {
  return createCharacterSheetViewModel(
    makeCharacterFixture({
      equipment: Array.from({ length: equipmentCount }, (_, index) => ({
        id: `item-${index}`,
        name: `Item ${index}`,
        type: 'G',
        quantity: 1,
        equipped: false,
      })),
    }),
    {},
  )
}

describe('getPdfExportPreflight', () => {
  test('returns a clean result when readiness, effects, and capacities are representable', () => {
    expect(getPdfExportPreflight('2014', createViewModel(), READY, [])).toEqual({
      issues: [],
      blockingCount: 0,
      warningCount: 0,
    })
  })

  test('categorizes readiness, dependency, unsupported-effect, and truncation issues', () => {
    const readiness: CharacterReadinessResult = {
      status: 'incomplete',
      issues: [
        {
          id: 'identity:test',
          severity: 'blocking',
          section: 'identity',
          title: 'Complete identity',
          explanation: 'A required identity choice is missing.',
          navigationTarget: '/builder',
        },
        {
          id: 'source:test',
          severity: 'recommendation',
          section: 'sources',
          title: 'Resolve source',
          explanation: 'A referenced source entity is unavailable.',
          navigationTarget: '/settings',
        },
      ],
      blockingIssues: [],
      recommendations: [],
    }
    const effects: CharacterEffect[] = [
      {
        id: 'active-initiative',
        label: 'Initiative adjustment',
        source: { kind: 'manual', name: 'Test adjustment' },
        target: { kind: 'initiative' },
        operation: { kind: 'add', value: 1 },
      },
      {
        id: 'inactive-sense',
        label: 'Inactive sense',
        source: { kind: 'manual', name: 'Test adjustment' },
        requirements: [{ kind: 'flag', key: 'enabled', expected: true }],
        target: { kind: 'sense', sense: 'test sense' },
        operation: { kind: 'add', value: 1 },
      },
    ]

    const result = getPdfExportPreflight('2014', createViewModel(91), readiness, effects)

    expect(result.issues.map((issue) => issue.category)).toEqual([
      'readiness',
      'dependency',
      'unsupported',
      'truncation',
    ])
    expect(result.blockingCount).toBe(1)
    expect(result.warningCount).toBe(3)
    expect(result.issues.some((issue) => issue.id.includes('inactive-sense'))).toBe(false)
  })
})
