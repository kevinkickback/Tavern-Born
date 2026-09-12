import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ArmorClassModal } from '@/components/modals/ArmorClassModal'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

function resetCharacter() {
  const character = makeCharacterFixture({
    abilityScores: {
      strength: 10,
      dexterity: 14,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    equipment: [],
    armorClassOverride: undefined,
    armorClassAdjustments: [],
  })
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
}

describe('ArmorClassModal', () => {
  beforeEach(resetCharacter)

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('adds a lasting Armor Class bonus without fixing the calculated value', async () => {
    const user = userEvent.setup()
    render(<ArmorClassModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('Armor Class')).toBeTruthy()
    await user.type(screen.getByLabelText('What caused it?'), 'Ring of protection')
    await user.type(screen.getByLabelText('AC change'), '1')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('+1 AC')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.armorClassAdjustments).toEqual([
      expect.objectContaining({ label: 'Ring of protection', amount: 1 }),
    ])
    expect(updated?.armorClassOverride).toBeUndefined()
  })

  test('allows a negative lasting Armor Class change', async () => {
    const user = userEvent.setup()
    render(<ArmorClassModal open={true} onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText('What caused it?'), 'Lingering curse')
    await user.type(screen.getByLabelText('AC change'), '-2')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.armorClassAdjustments).toEqual([
      expect.objectContaining({ label: 'Lingering curse', amount: -2 }),
    ])
  })

  test('turns a directly entered Armor Class into a lasting adjustment', async () => {
    const user = userEvent.setup()
    render(<ArmorClassModal open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByText('More AC options'))
    const directAC = screen.getByLabelText('Set Armor Class directly')
    await user.clear(directAC)
    await user.type(directAC, '18')
    await user.click(screen.getByRole('button', { name: 'Set Armor Class' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.armorClassAdjustments).toEqual([
      expect.objectContaining({ label: 'Custom Armor Class', amount: 6 }),
    ])
  })

  test('keeps a fixed Armor Class available as an advanced option', async () => {
    const user = userEvent.setup()
    render(<ArmorClassModal open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByText('More AC options'))
    await user.click(screen.getByLabelText('Keep Armor Class fixed'))
    await user.type(screen.getByLabelText('Fixed Armor Class'), '20')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.armorClassOverride).toBe(20)
  })
})
