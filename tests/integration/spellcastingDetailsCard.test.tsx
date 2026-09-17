import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { SpellcastingDetailsCard } from '@/pages/spells/components/SpellcastingDetailsCard'

describe('SpellcastingDetailsCard slot capacities', () => {
  afterEach(() => cleanup())

  test('shows shared slot capacity without live-session controls', () => {
    render(
      <SpellcastingDetailsCard
        isSpellcaster
        spellcastingDetails={[]}
        hasMultipleSpellcastingClasses={false}
        sharedSlots={[{ level: 2, max: 3 }]}
        pactSlots={[]}
      />,
    )

    expect(screen.getByText('Level 2 slots').parentElement?.textContent).toBe('3Level 2 slots')
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('shows Pact Magic capacity without checking a class name', () => {
    render(
      <SpellcastingDetailsCard
        isSpellcaster
        spellcastingDetails={[]}
        hasMultipleSpellcastingClasses
        sharedSlots={[]}
        pactSlots={[{ level: 3, max: 2 }]}
      />,
    )

    expect(screen.getByText('Pact Magic Slots')).toBeTruthy()
    expect(screen.getByText('Level 3 slots').parentElement?.textContent).toBe('2Level 3 slots')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
