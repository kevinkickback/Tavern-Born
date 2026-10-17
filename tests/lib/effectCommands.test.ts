import { describe, expect, test } from 'vitest'
import { isCharacterEffectActive } from '@/lib/calculations/effects'
import {
  removeManualEffectCommand,
  setEffectSuppressedCommand,
  upsertManualEffectCommand,
} from '@/lib/character/commands/effectCommands'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { CharacterEffect } from '@/types/effects'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

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
  test('editing an admitted spaced ID retains its suppression identity through reopen and removal', () => {
    const original = characterPersistenceSchema.parse(
      makeCharacterFixture({
        manualEffects: [
          {
            ...testEffect(' manual-fixture '),
            source: { kind: 'manual', name: 'Saved adjustment' },
          },
        ],
        suppressedEffectIds: [' manual-fixture ', 'unrelated'],
      }),
    )
    const edited = upsertManualEffectCommand(original, {
      ...original.manualEffects![0],
      id: 'manual-fixture',
      target: { kind: 'initiative' },
      operation: { kind: 'add', value: 3 },
    })
    const reopened = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify({ ...original, ...edited })),
    )
    expect(reopened.manualEffects).toHaveLength(1)
    expect(reopened.manualEffects![0].id).toBe(' manual-fixture ')
    expect(reopened.manualEffects![0].operation).toEqual({ kind: 'add', value: 3 })
    expect(
      isCharacterEffectActive(reopened.manualEffects![0], {
        suppressedEffectIds: reopened.suppressedEffectIds,
      }),
    ).toBe(false)
    const removed = characterPersistenceSchema.parse({
      ...reopened,
      ...removeManualEffectCommand(reopened, reopened.manualEffects![0].id),
    })
    expect(removed.manualEffects).toEqual([])
    expect(removed.suppressedEffectIds).toEqual(['unrelated'])
    expect(
      characterPersistenceSchema.safeParse({
        ...original,
        manualEffects: [{ ...original.manualEffects![0], id: ' ' }],
      }).success,
    ).toBe(false)
  })
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
