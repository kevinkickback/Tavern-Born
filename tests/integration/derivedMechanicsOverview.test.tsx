import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import {
  SourceDerivedActions,
  SourceDerivedEffects,
} from '@/pages/adjustments/components/DerivedMechanicsOverview'
import type { CharacterAction } from '@/types/actions'
import type { CharacterEffect } from '@/types/effects'

afterEach(cleanup)

describe('source-derived mechanics overview', () => {
  test('shows source-owned actions without edit controls and omits manual actions', () => {
    const actions: CharacterAction[] = [
      {
        id: 'item-action',
        name: 'Fixture weapon',
        kind: 'attack',
        description: 'Derived attack description',
        source: { kind: 'item', name: 'Fixture weapon', source: 'TEST' },
        active: false,
        inactiveReason: 'Equip this item to use it.',
        attackBonus: 4,
        damage: [{ dice: '1d6', bonus: 2, damageType: 'fixture' }],
      },
      {
        id: 'manual-action',
        name: 'Manual fixture action',
        kind: 'action',
        description: '',
        source: { kind: 'manual', name: 'Manual' },
        active: true,
      },
    ]

    render(<SourceDerivedActions actions={actions} />)

    expect(screen.getByText('Fixture weapon')).toBeTruthy()
    expect(screen.getByText('Inactive')).toBeTruthy()
    expect(screen.queryByText('Manual fixture action')).toBeNull()
    expect(screen.getAllByRole('button')).toEqual([
      screen.getByRole('button', { name: /Source-derived actions/ }),
    ])
  })

  test('shows source-owned effects and evaluates their current active state', () => {
    const effects: CharacterEffect[] = [
      {
        id: 'item-effect',
        label: 'Fixture armor class',
        source: { kind: 'item', name: 'Fixture shield', source: 'TEST' },
        target: { kind: 'armor-class' },
        operation: { kind: 'add', value: 1 },
        requirements: [{ kind: 'equipment', itemId: 'fixture-shield', state: 'equipped' }],
      },
      {
        id: 'manual-effect',
        label: 'Manual fixture effect',
        source: { kind: 'manual', name: 'Manual' },
        target: { kind: 'speed' },
        operation: { kind: 'add', value: 5 },
      },
    ]

    render(
      <SourceDerivedEffects
        effects={effects}
        resolutionContext={{ equipment: { 'fixture-shield': { equipped: true } } }}
      />,
    )

    expect(screen.getByText('Fixture armor class')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.queryByText('Manual fixture effect')).toBeNull()
    expect(screen.getAllByRole('button')).toEqual([
      screen.getByRole('button', { name: /Source-derived effects/ }),
    ])
  })
})
