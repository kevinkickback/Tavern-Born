import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ManualActionsModal } from '@/components/modals/ManualActionsModal'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => undefined
Element.prototype.releasePointerCapture = () => undefined
Element.prototype.scrollIntoView = () => undefined

function resetCharacter() {
  const character = makeCharacterFixture({ manualActions: [] })
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
}

describe('ManualActionsModal', () => {
  beforeEach(resetCharacter)

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('creates, disables, re-enables, and removes a fully described action', async () => {
    const user = userEvent.setup()
    render(<ManualActionsModal open={true} onOpenChange={() => {}} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test maneuver' } })
    await user.click(screen.getByRole('combobox', { name: 'Attack or save behavior' }))
    await user.click(screen.getByRole('option', { name: 'Attack roll' }))
    fireEvent.change(screen.getByLabelText('Attack bonus'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Range (optional)'), { target: { value: 'Test range' } })
    fireEvent.change(screen.getByLabelText('Damage dice'), { target: { value: '1d6' } })
    fireEvent.change(screen.getByLabelText('Damage bonus'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Damage type'), {
      target: { value: 'test damage' },
    })
    fireEvent.change(screen.getByLabelText('Resource ID'), {
      target: { value: 'test-resource' },
    })
    await user.click(screen.getByRole('combobox', { name: 'Recovery rest' }))
    await user.click(screen.getByRole('option', { name: 'Short rest' }))
    fireEvent.change(screen.getByLabelText('Recharge note (optional)'), {
      target: { value: 'Test recharge.' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Test description.' },
    })
    await user.click(screen.getByRole('button', { name: 'Add action' }))

    const action = useCharacterStore.getState().activeCharacter?.manualActions?.[0]
    expect(action).toMatchObject({
      name: 'Test maneuver',
      kind: 'action',
      attackBonus: 4,
      range: 'Test range',
      damage: [{ dice: '1d6', bonus: 2, damageType: 'test damage' }],
      resourceCost: { resourceId: 'test-resource', amount: 1 },
      recharge: { rest: 'short', note: 'Test recharge.' },
      description: 'Test description.',
      source: { kind: 'manual', name: 'Test maneuver' },
      active: true,
    })

    await user.click(screen.getByRole('switch', { name: 'Disable Test maneuver' }))
    expect(useCharacterStore.getState().activeCharacter?.manualActions?.[0]?.active).toBe(false)
    await user.click(screen.getByRole('switch', { name: 'Enable Test maneuver' }))
    expect(useCharacterStore.getState().activeCharacter?.manualActions?.[0]?.active).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Remove Test maneuver' }))
    expect(useCharacterStore.getState().activeCharacter?.manualActions).toEqual([])
  })
})
