import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SpellcastingDetailsCard } from '@/pages/spells/components/SpellcastingDetailsCard'

describe('SpellcastingDetailsCard slot controls', () => {
  afterEach(() => cleanup())

  test('spends and manually restores shared slots with clear availability', async () => {
    const user = userEvent.setup()
    const onSpendSlot = vi.fn()
    const onRestoreSlot = vi.fn()

    render(
      <SpellcastingDetailsCard
        isSpellcaster
        spellcastingDetails={[]}
        hasMultipleSpellcastingClasses={false}
        sharedSlots={[{ level: 2, max: 3, used: 1, available: 2 }]}
        pactSlots={[]}
        onSpendSlot={onSpendSlot}
        onRestoreSlot={onRestoreSlot}
      />,
    )

    expect(screen.getByText('2/3')).toBeTruthy()
    expect(screen.getByText('Lvl 2 available')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Spend one level 2 shared spell slot' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Manually restore one level 2 shared spell slot',
      }),
    )

    expect(onSpendSlot).toHaveBeenCalledWith('shared', 2, 3)
    expect(onRestoreSlot).toHaveBeenCalledWith('shared', 2, 3)
  })

  test('shows pact controls from derived pool data without checking a class name', async () => {
    const user = userEvent.setup()
    const onSpendSlot = vi.fn()

    render(
      <SpellcastingDetailsCard
        isSpellcaster
        spellcastingDetails={[]}
        hasMultipleSpellcastingClasses
        sharedSlots={[]}
        pactSlots={[{ level: 3, max: 2, used: 0, available: 2 }]}
        onSpendSlot={onSpendSlot}
      />,
    )

    expect(screen.getByText('Pact Magic Slots')).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Manually restore one level 3 Pact Magic spell slot' })
        .hasAttribute('disabled'),
    ).toBe(true)

    await user.click(
      screen.getByRole('button', { name: 'Spend one level 3 Pact Magic spell slot' }),
    )
    expect(onSpendSlot).toHaveBeenCalledWith('pact', 3, 2)
  })
})
