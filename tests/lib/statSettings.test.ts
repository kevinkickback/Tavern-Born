import { describe, expect, test } from 'vitest'
import {
  resolveArmorClassSettings,
  resolveHitPointSettings,
  resolveMovementSettings,
} from '@/lib/calculations/statSettings'
import type { CharacterEffect } from '@/types/effects'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const sourceEffects: CharacterEffect[] = [
  {
    id: 'source:test-bonus',
    label: 'Source bonus',
    target: { kind: 'hit-point-maximum' },
    operation: { kind: 'add', value: 3 },
    source: { kind: 'item', name: 'Test source' },
  },
  {
    id: 'source:test-ac',
    label: 'Source Armor Class bonus',
    target: { kind: 'armor-class' },
    operation: { kind: 'add', value: 1 },
    source: { kind: 'item', name: 'Test source' },
  },
  {
    id: 'source:test-speed',
    label: 'Source speed bonus',
    target: { kind: 'speed', mode: 'walk' },
    operation: { kind: 'add', value: 10 },
    source: { kind: 'item', name: 'Test source' },
  },
]

describe('stat settings resolution', () => {
  test('preserves source and manual typed effects in maximum-HP drafts', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'TEST', levels: 1 }],
      manualEffects: [
        {
          id: 'manual:test-hp',
          label: 'Manual typed HP bonus',
          target: { kind: 'hit-point-maximum' },
          operation: { kind: 'add', value: 2 },
          source: { kind: 'manual', name: 'Manual typed HP bonus' },
        },
      ],
    })

    const resolution = resolveHitPointSettings(
      character,
      10,
      { current: 15, temporary: 0, adjustments: [] },
      sourceEffects,
    )

    expect(resolution.value).toBe(15)
    expect(resolution.steps.map((step) => step.effectId)).toEqual([
      'manual:test-hp',
      'source:test-bonus',
    ])
  })

  test('resolves Armor Class drafts with typed and labeled adjustments together', () => {
    const character = makeCharacterFixture()
    const resolution = resolveArmorClassSettings(
      character,
      12,
      {
        adjustments: [
          {
            id: 'lasting-ac',
            label: 'Lasting AC',
            amount: 2,
            sourceType: 'manual',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      sourceEffects,
    )

    expect(resolution.value).toBe(15)
  })

  test('preserves typed movement effects in draft previews', () => {
    const character = makeCharacterFixture({
      movement: { speeds: { walk: 30 }, source: { kind: 'race', name: 'Test species' } },
    })
    const movement = resolveMovementSettings(
      character,
      {
        adjustments: [
          {
            id: 'lasting-speed',
            label: 'Lasting speed',
            mode: 'walk',
            amount: 5,
            sourceType: 'manual',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        overrides: {},
      },
      sourceEffects,
    )

    expect(movement.speeds.walk).toBe(45)
  })
})
