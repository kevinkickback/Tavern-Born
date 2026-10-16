import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  SourceDerivedActions,
  SourceDerivedEffects,
} from '@/pages/adjustments/components/DerivedMechanicsOverview'
import type { Race5e } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { CharacterEffect } from '@/types/effects'
import { makeNativeRacialCharacter } from '../fixtures/nativeRacialCharacter'

afterEach(cleanup)

describe('source-derived mechanics overview', () => {
  test('contextualizes actual child-owned action, effect and generated sense labels only at display', () => {
    const child = {
      name: 'Dragonborn (Draconblood; Brass)',
      source: 'EGW',
      _isVersion: true,
      darkvision: 60,
      entries: [
        {
          name: 'Breath Weapon',
          type: 'entries',
          entries: ['As an action, exhale magical energy.'],
        },
      ],
    } as Race5e
    const parent = { name: 'Dragonborn', source: 'PHB', subraces: [child] } as Race5e
    const character = characterPersistenceSchema.parse(makeNativeRacialCharacter(parent, child))
    const calculation = createCharacterCalculationContext(character, {
      racesByKey: buildRaceLookup([parent]),
    })
    const actions = deriveRulesTextActions(character, calculation.raceResolution.mergedRace)
    const effects = calculation.effects.declarations
    const before = JSON.stringify({ character, actions, effects })
    render(
      <>
        <SourceDerivedActions actions={actions} selection={character} />
        <SourceDerivedEffects effects={effects} resolutionContext={{}} selection={character} />
      </>,
    )
    expect(screen.getByText('Breath Weapon')).toBeTruthy()
    expect(screen.getAllByText('Dragonborn (Draconblood: Brass) · EGW').length).toBeGreaterThan(0)
    expect(screen.getByText('Dragonborn (Draconblood: Brass) sense')).toBeTruthy()
    expect(JSON.stringify({ character, actions, effects })).toBe(before)
    cleanup()
    const sense = effects.find((effect) => effect.target.kind === 'sense')!
    render(
      <SourceDerivedEffects
        effects={[{ ...sense, label: 'Custom darkvision' }]}
        resolutionContext={{}}
        selection={character}
      />,
    )
    expect(screen.getByText('Custom darkvision')).toBeTruthy()
  })

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
