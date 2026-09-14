import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { GenericEquipmentSelect } from '@/components/character/GenericEquipmentSelect'

describe('GenericEquipmentSelect', () => {
  test('provides a caller-specific accessible name for shared class/background choices', () => {
    render(
      <GenericEquipmentSelect
        choice={{
          key: '0:a:0',
          token: 'weaponSimpleMelee',
          quantity: 1,
          candidates: [{ name: 'Club', source: 'PHB' }],
        }}
        value=""
        ariaLabel="Equipment choice 1 specific item"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Equipment choice 1 specific item' })).toBeTruthy()
  })
})
