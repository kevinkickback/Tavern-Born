import { describe, expect, test } from 'vitest'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetPdf'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import type { CharacterReadinessResult } from '@/lib/readiness/characterReadiness'
import type { CharacterEffect, NumericEffectTarget } from '@/types/effects'
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

function effect(id: string, target: NumericEffectTarget): CharacterEffect {
  return {
    id,
    label: id,
    source: { kind: 'manual', name: 'Test adjustment' },
    target,
    operation: { kind: 'add', value: 1 },
  }
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
      effect('active-initiative', { kind: 'initiative' }),
      effect('active-carrying-capacity', { kind: 'carrying-capacity' }),
      {
        ...effect('inactive-sense', { kind: 'sense', sense: 'test sense' }),
        requirements: [{ kind: 'flag', key: 'enabled', expected: true }],
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
    expect(result.issues.some((issue) => issue.id.includes('active-initiative'))).toBe(false)
  })

  test('only warns about template-specific unsupported effects', () => {
    const effects = [
      effect('sense', { kind: 'sense', sense: 'darkvision' }),
      effect('resource', { kind: 'resource-maximum', resourceId: 'test' }),
    ]

    expect(getPdfExportPreflight('2014', createViewModel(), READY, effects).warningCount).toBe(0)
    expect(getPdfExportPreflight('2024', createViewModel(), READY, effects).warningCount).toBe(2)
  })
})
