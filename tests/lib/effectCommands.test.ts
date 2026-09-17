import { describe, expect, test } from 'vitest'
import {
  removeManualEffectCommand,
  setEffectSuppressedCommand,
  upsertManualEffectCommand,
} from '@/lib/character/commands/effectCommands'
import type { CharacterEffect } from '@/types/effects'

function testEffect(id = 'test-effect'): CharacterEffect {
  return {
    id,
    label: ' Test adjustment ',
    target: { kind: 'initiative' },
    operation: { kind: 'add', value: 1 },
    source: { kind: 'other', name: '' },
    condition: ' Test condition ',
  }
}

describe('manual effect commands', () => {
  test('normalizes and upserts user-authored declarations by stable ID', () => {
    const added = upsertManualEffectCommand({ manualEffects: [] }, testEffect())
    const replaced = upsertManualEffectCommand(added, {
      ...testEffect(),
      operation: { kind: 'override', value: 4 },
    } as CharacterEffect)

    expect(replaced.manualEffects).toEqual([
      expect.objectContaining({
        id: 'test-effect',
        label: 'Test adjustment',
        source: { kind: 'manual', name: 'Test adjustment' },
        condition: 'Test condition',
        operation: { kind: 'override', value: 4 },
      }),
    ])
  })

  test('rejects declarations without stable identity or a visible label', () => {
    expect(() => upsertManualEffectCommand({}, { ...testEffect(), id: ' ' })).toThrow('stable ID')
    expect(() => upsertManualEffectCommand({}, { ...testEffect(), label: ' ' })).toThrow('label')
  })

  test('suppresses deterministically and cleans suppression when a declaration is removed', () => {
    const suppressed = setEffectSuppressedCommand(
      { suppressedEffectIds: ['other-effect'] },
      'test-effect',
      true,
    )
    expect(suppressed.suppressedEffectIds).toEqual(['other-effect', 'test-effect'])
    expect(setEffectSuppressedCommand(suppressed, 'test-effect', false)).toEqual({
      suppressedEffectIds: ['other-effect'],
    })
    expect(
      removeManualEffectCommand(
        { manualEffects: [testEffect()], suppressedEffectIds: ['test-effect', 'other-effect'] },
        'test-effect',
      ),
    ).toEqual({ manualEffects: [], suppressedEffectIds: ['other-effect'] })
  })
})
