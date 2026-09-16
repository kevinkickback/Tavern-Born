import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MovementModal } from '@/components/modals/MovementModal'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

describe('MovementModal', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      id: 'movement-character',
      movement: {
        speeds: { walk: 25, climb: 15 },
        source: { kind: 'race', name: 'Dwarf', source: 'PHB' },
      },
      movementAdjustments: [],
      movementOverrides: {},
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('saves labeled changes and exact overrides without replacing racial movement', async () => {
    const user = userEvent.setup()
    render(<MovementModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('Base source: Dwarf (PHB)')).toBeTruthy()
    await user.type(screen.getByLabelText('What caused it?'), 'Training')
    await user.clear(screen.getByLabelText('Feet'))
    await user.type(screen.getByLabelText('Feet'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(screen.getByText('Exact movement overrides'))
    await user.type(screen.getByLabelText(/swim/i), '30')
    await user.click(screen.getByRole('button', { name: 'Save movement' }))

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.movement).toMatchObject({
      speeds: { walk: 25, climb: 15 },
      source: { name: 'Dwarf', source: 'PHB' },
    })
    expect(updated?.movementAdjustments).toEqual([
      expect.objectContaining({ label: 'Training', mode: 'walk', amount: 5 }),
    ])
    expect(updated?.movementOverrides).toEqual({ swim: 30 })
    expect(updated?.movement.speeds.walk).toBe(25)
  })

  test('preserves active typed speed effects in the preview', async () => {
    const character = makeCharacterFixture({
      id: 'movement-character-with-effect',
      movement: {
        speeds: { walk: 25 },
        source: { kind: 'race', name: 'Dwarf', source: 'PHB' },
      },
      manualEffects: [
        {
          id: 'typed-speed-bonus',
          label: 'Typed speed bonus',
          target: { kind: 'speed', mode: 'walk' },
          operation: { kind: 'add', value: 10 },
          source: { kind: 'manual', name: 'Typed speed bonus' },
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const user = userEvent.setup()
    render(<MovementModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText(/walk 35 ft\./i)).toBeTruthy()
    await user.type(screen.getByLabelText('What caused it?'), 'Training')
    await user.clear(screen.getByLabelText('Feet'))
    await user.type(screen.getByLabelText('Feet'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText(/walk 40 ft\./i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save movement' }))

    expect(useCharacterStore.getState().activeCharacter?.movement.speeds.walk).toBe(25)
  })
})
