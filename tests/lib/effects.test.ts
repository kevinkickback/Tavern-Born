import { describe, expect, test } from 'vitest'
import {
  isCharacterEffectActive,
  resolveGrantedTrait,
  resolveNumericEffect,
  resolveRollEffect,
} from '@/lib/calculations/effects'
import type { CharacterEffect } from '@/types/effects'

function effect(overrides: Partial<CharacterEffect>): CharacterEffect {
  return {
    id: 'effect',
    label: 'Test effect',
    target: { kind: 'armor-class' },
    operation: { kind: 'add', value: 1 },
    source: { kind: 'manual', name: 'Test source' },
    ...overrides,
  } as CharacterEffect
}

describe('typed character effects', () => {
  test('applies numeric operations in a deterministic stacking order', () => {
    const effects = [
      effect({ id: 'set', operation: { kind: 'set', value: 11 } }),
      effect({ id: 'base', operation: { kind: 'base', value: 12 } }),
      effect({ id: 'add', operation: { kind: 'add', value: 2 } }),
      effect({ id: 'multiply', operation: { kind: 'multiply', value: 2 } }),
      effect({ id: 'minimum', operation: { kind: 'minimum', value: 20 } }),
      effect({ id: 'maximum', operation: { kind: 'maximum', value: 25 } }),
    ]

    const result = resolveNumericEffect(10, { kind: 'armor-class' }, effects)

    expect(result.value).toBe(25)
    expect(result.steps.map((step) => step.operation.kind)).toEqual([
      'set',
      'base',
      'add',
      'multiply',
      'minimum',
      'maximum',
    ])
  })

  test('uses priority and stable IDs for competing setters and overrides', () => {
    const result = resolveNumericEffect(10, { kind: 'initiative' }, [
      effect({
        id: 'lower',
        target: { kind: 'initiative' },
        operation: { kind: 'set', value: 12 },
      }),
      effect({
        id: 'higher',
        target: { kind: 'initiative' },
        operation: { kind: 'set', value: 15 },
        priority: 1,
      }),
      effect({
        id: 'override-a',
        target: { kind: 'initiative' },
        operation: { kind: 'override', value: 19 },
        priority: 2,
      }),
      effect({
        id: 'override-b',
        target: { kind: 'initiative' },
        operation: { kind: 'override', value: 21 },
        priority: 2,
      }),
    ])

    expect(result.value).toBe(21)
    expect(result.steps.map((step) => step.effectId)).toEqual(['higher', 'override-b'])
  })

  test('uses the highest eligible base and lets unscoped effects apply to scoped targets', () => {
    const result = resolveNumericEffect(8, { kind: 'attack-roll', attackId: 'attack-1' }, [
      effect({
        id: 'lower-base',
        target: { kind: 'attack-roll' },
        operation: { kind: 'base', value: 10 },
        priority: 10,
      }),
      effect({
        id: 'higher-base',
        target: { kind: 'attack-roll' },
        operation: { kind: 'base', value: 12 },
      }),
      effect({
        id: 'other-attack',
        target: { kind: 'attack-roll', attackId: 'attack-2' },
        operation: { kind: 'add', value: 20 },
      }),
    ])

    expect(result.value).toBe(12)
    expect(result.steps.map((step) => step.effectId)).toEqual(['higher-base'])
  })

  test('requires declared equipment and manual flags before applying an effect', () => {
    const guarded = effect({
      requirements: [
        { kind: 'equipment', itemId: 'item-1', state: 'equipped-and-attuned' },
        { kind: 'flag', key: 'enabled', expected: true },
      ],
    })

    expect(isCharacterEffectActive(guarded)).toBe(false)
    expect(
      isCharacterEffectActive(guarded, {
        equipment: { 'item-1': { equipped: true, attuned: true } },
        flags: { enabled: true },
      }),
    ).toBe(true)
    expect(
      isCharacterEffectActive(guarded, {
        equipment: { 'item-1': { equipped: true, attuned: true } },
        flags: { enabled: true },
        suppressedEffectIds: ['effect'],
      }),
    ).toBe(false)
  })

  test('cancels advantage and disadvantage and retains conditional notes', () => {
    const target = { kind: 'skill-check' as const, skill: 'test skill' }
    const result = resolveRollEffect(target, [
      effect({ id: 'advantage', target, operation: { kind: 'advantage' } }),
      effect({ id: 'disadvantage', target, operation: { kind: 'disadvantage' } }),
      effect({
        id: 'note',
        target,
        operation: { kind: 'conditional-note', note: 'Only in the declared situation.' },
      }),
    ])

    expect(result.mode).toBe('normal')
    expect(result.advantageSources).toHaveLength(1)
    expect(result.disadvantageSources).toHaveLength(1)
    expect(result.conditionalNotes).toEqual([
      expect.objectContaining({ effectId: 'note', note: 'Only in the declared situation.' }),
    ])
  })

  test('grants typed traits only from active effects', () => {
    const target = { kind: 'damage-resistance' as const, damageType: 'test' }
    const result = resolveGrantedTrait(target, [
      effect({ id: 'active', target, operation: { kind: 'grant' } }),
      effect({
        id: 'inactive',
        target,
        operation: { kind: 'grant' },
        requirements: [{ kind: 'flag', key: 'inactive', expected: true }],
      }),
    ])

    expect(result.granted).toBe(true)
    expect(result.sources.map((source) => source.id)).toEqual(['active'])
    expect(result.inactiveEffects.map((source) => source.id)).toEqual(['inactive'])
  })
})
