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
    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
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

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
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

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
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

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
    await user.click(screen.getByText('More AC options'))
    await user.click(screen.getByLabelText('Keep Armor Class fixed'))
    await user.type(screen.getByLabelText('Fixed Armor Class'), '20')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.armorClassOverride).toBe(20)
  })

  test('shows equipped armor sources as read-only calculation entries', () => {
    const character = makeCharacterFixture({
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      equipment: [
        {
          id: 'test-armor',
          name: 'Test Armor',
          type: 'MA',
          armorType: 'medium',
          ac: 14,
          quantity: 1,
          equipped: true,
        },
        {
          id: 'test-shield',
          name: 'Test Shield',
          type: 'S',
          armorType: 'shield',
          quantity: 1,
          equipped: true,
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(<ArmorClassModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('Current calculation sources')).toBeTruthy()
    expect(screen.getByText('Test Armor')).toBeTruthy()
    expect(screen.getByText('Equipped medium armor', { exact: false })).toBeTruthy()
    expect(screen.getByText('Test Shield')).toBeTruthy()
    expect(screen.getByText('Equipped shield', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove Test Shield' })).toBeNull()
    expect(screen.queryByLabelText('What caused it?')).toBeNull()
  })

  test('shows the resolver trace for active and inactive adjustments', () => {
    const character = makeCharacterFixture({
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      hitPoints: { max: 0, current: 0, temporary: 0 },
      manualEffects: [
        {
          id: 'active-test-effect',
          label: 'Active test adjustment',
          target: { kind: 'armor-class' },
          operation: { kind: 'add', value: 2 },
          source: { kind: 'manual', name: 'Test source' },
        },
        {
          id: 'inactive-test-effect',
          label: 'Inactive test adjustment',
          target: { kind: 'armor-class' },
          operation: { kind: 'add', value: 4 },
          source: { kind: 'manual', name: 'Other test source' },
          requirements: [{ kind: 'flag', key: 'inactive-test', expected: true }],
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(<ArmorClassModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('Current calculation sources')).toBeTruthy()
    expect(screen.getByText('Active test adjustment')).toBeTruthy()
    expect(screen.getByText('+2 → 14')).toBeTruthy()
    expect(screen.getByText('1 inactive adjustment')).toBeTruthy()
  })

  test('includes active typed effects when creating a lasting direct Armor Class', async () => {
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
      manualEffects: [
        {
          id: 'typed-ac-bonus',
          label: 'Typed AC bonus',
          target: { kind: 'armor-class' },
          operation: { kind: 'add', value: 2 },
          source: { kind: 'manual', name: 'Typed AC bonus' },
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const user = userEvent.setup()
    render(<ArmorClassModal open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
    await user.click(screen.getByText('More AC options'))
    const directArmorClass = screen.getByLabelText('Set Armor Class directly')
    await user.clear(directArmorClass)
    await user.type(directArmorClass, '18')
    await user.click(screen.getByRole('button', { name: 'Set Armor Class' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.armorClassAdjustments).toEqual([
      expect.objectContaining({ label: 'Custom Armor Class', amount: 4 }),
    ])
  })
})
