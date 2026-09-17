import { describe, expect, test } from 'vitest'
import {
  removeManualActionCommand,
  upsertManualActionCommand,
} from '@/lib/character/commands/actionCommands'
import type { CharacterAction } from '@/types/actions'

function testAction(): CharacterAction {
  return {
    id: ' test-action ',
    name: ' Test Action ',
    kind: 'action',
    description: ' Test description. ',
    source: { kind: 'other', name: 'Ignored' },
    active: true,
    range: ' Test range ',
    damage: [{ dice: ' 1d6 ', bonus: 1, damageType: ' test damage ' }],
    resourceCost: { resourceId: ' test-resource ', amount: 1 },
    recharge: { rest: 'short', note: ' Test recharge. ' },
  }
}

describe('manual action commands', () => {
  test('normalizes and upserts manual actions by stable ID', () => {
    const added = upsertManualActionCommand({}, testAction())
    const replaced = upsertManualActionCommand(added, {
      ...testAction(),
      attackBonus: 4,
    })

    expect(replaced.manualActions).toEqual([
      expect.objectContaining({
        id: 'test-action',
        name: 'Test Action',
        description: 'Test description.',
        source: { kind: 'manual', name: 'Test Action' },
        range: 'Test range',
        damage: [{ dice: '1d6', bonus: 1, damageType: 'test damage' }],
        resourceCost: { resourceId: 'test-resource', amount: 1 },
        recharge: { rest: 'short', note: 'Test recharge.' },
        attackBonus: 4,
      }),
    ])
  })

  test('rejects missing identity and removes only the requested action', () => {
    expect(() => upsertManualActionCommand({}, { ...testAction(), id: ' ' })).toThrow('stable ID')
    expect(() => upsertManualActionCommand({}, { ...testAction(), name: ' ' })).toThrow('name')
    const normalized = upsertManualActionCommand({}, testAction()).manualActions ?? []
    expect(
      removeManualActionCommand(
        { manualActions: [...normalized, { ...testAction(), id: 'other-action' }] },
        'test-action',
      ).manualActions,
    ).toEqual([expect.objectContaining({ id: 'other-action' })])
  })
})
