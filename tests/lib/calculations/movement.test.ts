import { describe, expect, test } from 'vitest'
import {
  formatEffectiveMovement,
  getAdditionalMovementSummary,
  getEffectiveCharacterMovement,
  getWalkingSpeed,
  normalizeRaceMovement,
} from '@/lib/calculations/movement'
import type { Race5e } from '@/types/5etools'

describe('movement calculations', () => {
  test('normalizes numeric race movement without assuming 30 feet', () => {
    const movement = normalizeRaceMovement({ name: 'Dwarf', source: 'PHB', speed: 25 })

    expect(movement).toEqual({
      speeds: { walk: 25 },
      source: { kind: 'race', name: 'Dwarf', source: 'PHB' },
    })
  })

  test('normalizes known modes, hover, inherited modes, and unknown keys', () => {
    const race = {
      name: 'Skykin',
      source: 'HB',
      speed: {
        walk: 35,
        fly: true,
        swim: 20,
        hover: true,
        phase: 15,
        teleport: true,
      },
    } as unknown as Race5e

    const movement = normalizeRaceMovement(race)

    expect(movement.speeds).toEqual({ walk: 35, fly: 35, swim: 20 })
    expect(movement.hover).toBe(true)
    expect(movement.other).toEqual({ phase: 15, teleport: true })
  })

  test('uses a subrace speed override and records its source', () => {
    const parent = { name: 'Elf', source: 'PHB', speed: 30 } as Race5e
    const subrace = { name: 'Sea Elf', source: 'MPMM', speed: { walk: 30, swim: 30 } } as Race5e

    expect(normalizeRaceMovement(parent, subrace)).toMatchObject({
      speeds: { walk: 30, swim: 30 },
      source: { kind: 'race', name: 'Sea Elf', source: 'MPMM' },
    })
  })

  test('applies adjustments before exact overrides and formats every mode', () => {
    const effective = getEffectiveCharacterMovement({
      movement: {
        speeds: { walk: 25, climb: 15 },
        source: { kind: 'race', name: 'Test Dwarf', source: 'HB' },
      },
      movementAdjustments: [
        {
          id: 'longstrider',
          label: 'Longstrider',
          mode: 'walk',
          amount: 10,
          sourceType: 'other',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'phase',
          label: 'Phase training',
          mode: 'phase',
          amount: 5,
          sourceType: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      movementOverrides: { climb: 40 },
    })

    expect(effective.speeds).toEqual({ walk: 35, climb: 40, phase: 5 })
    expect(getWalkingSpeed(effective)).toBe(35)
    expect(formatEffectiveMovement(effective)).toBe('walk 35 ft., climb 40 ft., phase 5 ft.')
    expect(getAdditionalMovementSummary(effective)).toBe('climb 40 ft., phase 5 ft.')
  })

  test('routes typed speed effects through the same adjustment and override stack', () => {
    const effective = getEffectiveCharacterMovement({
      movement: {
        speeds: { walk: 20 },
        source: { kind: 'manual', name: 'Test' },
      },
      manualEffects: [
        {
          id: 'walk-addition',
          label: 'Walk addition',
          target: { kind: 'speed', mode: 'walk' },
          operation: { kind: 'add', value: 5 },
          source: { kind: 'manual', name: 'User adjustment' },
        },
        {
          id: 'custom-mode',
          label: 'Custom mode',
          target: { kind: 'speed', mode: 'phase' },
          operation: { kind: 'override', value: 15 },
          source: { kind: 'manual', name: 'User adjustment' },
        },
      ],
    })

    expect(effective.speeds).toEqual({ walk: 25, phase: 15 })
  })
})
