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

  test('2014 official warns about clipped prose and an unresolved organization emblem', () => {
    const viewModel = createCharacterSheetViewModel(
      makeCharacterFixture({
        details: { faction: 'The Harpers' },
      }),
      {},
    )
    viewModel.equipmentSummary = 'A very long equipment entry. '.repeat(30)
    viewModel.featuresSummary = 'A very long feature description. '.repeat(30)
    viewModel.featsSummary = 'An extensive feat description. '.repeat(30)
    viewModel.racialTraitsSummary = 'An extensive ancestry description. '.repeat(30)

    const result = getPdfExportPreflight('2014-official', viewModel, READY, [])

    expect(result.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        'text-limit:Equipment',
        'text-limit:Features and Traits',
        'text-limit:Feat+Traits',
        'organization-image',
      ]),
    )
    expect(result.issues.every((issue) => issue.severity === 'warning')).toBe(true)

    viewModel.organizationImage = 'data:image/png;base64,AAAA'
    expect(
      getPdfExportPreflight('2014-official', viewModel, READY, []).issues.some(
        (issue) => issue.id === 'organization-image',
      ),
    ).toBe(false)
  })

  test('2014 custom warns when ammunition, companions, or description cards overflow', () => {
    const viewModel = createCharacterSheetViewModel(
      makeCharacterFixture({
        equipment: [
          { id: 'arrows', name: 'Arrows (20)', type: 'A', quantity: 1, equipped: false },
          { id: 'bolts', name: 'Crossbow Bolts (20)', type: 'A', quantity: 1, equipped: false },
          { id: 'needles', name: 'Blowgun Needles (50)', type: 'A', quantity: 1, equipped: false },
        ],
      }),
      {},
    )
    viewModel.companions = [
      { name: 'Wolf', source: 'MM' },
      { name: 'Bear', source: 'MM' },
    ]
    viewModel.feats = [
      { id: 'long', name: 'Long Feat', source: 'PHB', description: 'x'.repeat(300) },
    ]
    viewModel.magicItems = [
      {
        id: 'long',
        name: 'Long Item',
        type: 'W',
        quantity: 1,
        equipped: false,
        description: 'x'.repeat(300),
      },
    ]
    const result = getPdfExportPreflight('2014-custom', viewModel, READY, [])
    expect(result.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        'capacity:ammunition',
        'capacity:companions',
        'text-limit:mpmb-feat-0',
        'text-limit:mpmb-magic-item-0',
      ]),
    )
  })

  test('2024 official warns when fixed prose boxes may abbreviate content', () => {
    const viewModel = createViewModel(90)
    viewModel.racialTraitsSummary = 'Long ancestry detail. '.repeat(50)
    viewModel.appearanceSummary = 'A detailed description. '.repeat(20)
    viewModel.historyAndPersonalitySummary = 'A long history. '.repeat(60)

    const official = getPdfExportPreflight('2024-official', viewModel, READY, [])
    expect(official.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        'text-limit:Text_59',
        'text-limit:Text_88',
        'text-limit:Text_89',
        'text-limit:Text_90',
      ]),
    )
    const custom = getPdfExportPreflight('2024-custom', viewModel, READY, [])
    expect(custom.issues.some((issue) => issue.id.startsWith('text-limit:'))).toBe(false)
  })
})
