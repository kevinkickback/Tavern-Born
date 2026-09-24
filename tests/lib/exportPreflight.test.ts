import { describe, expect, test } from 'vitest'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers'
import { deriveStructuredRaceEffects } from '@/lib/calculations/characterEffects'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { getPdfDownloadPreflight, getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import type { CharacterReadinessResult } from '@/lib/readiness/characterReadiness'
import type { Race5e } from '@/types/5etools'
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
  test('download confirmation retains data issues and recalculates counts without fitting issues', () => {
    const issues = [
      { id: 'choice', category: 'readiness', severity: 'blocking' },
      { id: 'source', category: 'dependency', severity: 'warning' },
      { id: 'mechanic', category: 'unsupported', severity: 'warning' },
      { id: 'fit', category: 'truncation', severity: 'warning' },
    ].map((issue) => ({ ...issue, title: issue.id, detail: issue.id }))
    const result = { issues, blockingCount: 1, warningCount: 3 } as Parameters<
      typeof getPdfDownloadPreflight
    >[0]
    expect(getPdfDownloadPreflight(result)).toEqual({
      issues: issues.slice(0, 3),
      blockingCount: 1,
      warningCount: 2,
    })
    expect(result.issues).toHaveLength(4)
  })

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
    for (const templateId of [
      '2014-custom',
      '2014-official',
      '2024-custom',
      '2024-official',
    ] as const) {
      const inactive = effects.map((entry) => ({
        ...entry,
        requirements: [{ kind: 'flag' as const, key: 'enabled', expected: true }],
      }))
      expect(
        getPdfExportPreflight(templateId, createViewModel(), READY, effects).warningCount,
      ).toBe(templateId === '2014-custom' ? 0 : 2)
      expect(
        getPdfExportPreflight(templateId, createViewModel(), READY, inactive).warningCount,
      ).toBe(0)
    }
  })

  test.each([
    '2024-official',
    '2024-custom',
  ] as const)('%s recognizes a lineage sense described by the printed species trait', (templateId) => {
    const races = parseRaces({
      race: [
        {
          name: 'Elf',
          source: 'XPHB',
          entries: [{ name: 'Elven Lineage', type: 'entries', entries: ['Choose a lineage.'] }],
          _versions: [
            {
              name: 'Elf; Drow Lineage',
              source: 'XPHB',
              darkvision: 120,
              _mod: {
                entries: {
                  mode: 'replaceArr',
                  replace: 'Elven Lineage',
                  items: {
                    name: 'Elven Lineage (Drow)',
                    type: 'entries',
                    entries: ['Your Darkvision has a range of 120 feet.'],
                  },
                },
              },
            },
          ],
        },
      ],
    }) as Race5e[]
    const vm = createCharacterSheetViewModel(
      makeCharacterFixture({
        originSystem: '2024',
        race: 'Elf',
        raceSource: 'XPHB',
        subrace: 'Drow Lineage',
        subraceSource: 'XPHB',
      }),
      { racesByKey: buildRaceLookup(races) },
    )
    const effects = deriveStructuredRaceEffects(vm.mergedRace)
    expect(effects).toHaveLength(1)
    expect(effects[0].label).toBe('Drow Lineage sense')
    expect(buildCharacterSheetFieldMap(vm, templateId).textFields.Text_59).toContain(
      'Elven Lineage (Drow): Your Darkvision has a range of 120 feet.',
    )
    expect(getPdfExportPreflight(templateId, vm, READY, effects).issues).toEqual([])

    const manual = effect('Manual darkvision bonus', { kind: 'sense', sense: 'darkvision' })
    const otherPrinting = { ...effects[0], source: { ...effects[0].source, source: 'OTHER' } }
    const result = getPdfExportPreflight(templateId, vm, READY, [...effects, manual, otherPrinting])
    expect(result.issues.map((issue) => issue.title)).toEqual([manual.label, otherPrinting.label])

    vm.racialTraitsSummary = 'Fey Ancestry'
    expect(getPdfExportPreflight(templateId, vm, READY, effects).issues).toEqual([
      expect.objectContaining({ title: 'Drow Lineage sense', category: 'unsupported' }),
    ])
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
