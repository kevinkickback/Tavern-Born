import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HitPointsModal } from '@/components/modals/HitPointsModal'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () => ({
    classes: [{ name: 'Fighter', source: 'PHB', hd: { faces: 10, number: 1 } }],
  }),
}))

vi.mock('@/hooks/data/useGameData', () => ({
  useClassLookup: () => ({
    'Fighter|PHB': { name: 'Fighter', source: 'PHB', hd: { faces: 10, number: 1 } },
  }),
}))

function resetCharacter() {
  const character = makeCharacterFixture({
    class: 'Fighter',
    classSource: 'PHB',
    level: 1,
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
    hitPoints: { max: 0, current: 8, temporary: 0 },
    hitPointAdjustments: [],
  })
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
}

describe('HitPointsModal', () => {
  beforeEach(resetCharacter)

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('keeps the common lasting HP change flow simple', async () => {
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('Maximum HP')).toBeTruthy()
    expect(screen.getByLabelText('Current HP').closest('details')).toBeNull()
    expect(screen.getByLabelText('Temporary HP').closest('details')).toBeNull()

    await user.type(screen.getByLabelText('What caused it?'), 'Divine blessing')
    await user.type(screen.getByLabelText('HP change'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Divine blessing')).toBeTruthy()
    expect(screen.getByText('+5 HP')).toBeTruthy()
    expect((screen.getByLabelText('Current HP') as HTMLInputElement).value).toBe('13')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.hitPointAdjustments).toEqual([
      expect.objectContaining({ label: 'Divine blessing', amount: 5, mode: 'flat' }),
    ])
    expect(updated?.hitPoints.current).toBe(13)
    expect(updated?.hitPointsInitialized).toBe(true)
  })

  test('opens an older uninitialized character at full health', async () => {
    const character = makeCharacterFixture({
      class: 'Fighter',
      classSource: 'PHB',
      level: 1,
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      hitPoints: { max: 0, current: 0, temporary: 0 },
      hitPointsInitialized: undefined,
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    expect((screen.getByLabelText('Current HP') as HTMLInputElement).value).toBe('10')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.hitPoints.current).toBe(10)
    expect(updated?.hitPointsInitialized).toBe(true)
  })

  test('lets a manual Current HP edit replace the automatic maximum change', async () => {
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText('What caused it?'), 'Divine blessing')
    await user.type(screen.getByLabelText('HP change'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const currentHP = screen.getByLabelText('Current HP')
    await user.clear(currentHP)
    await user.type(currentHP, '8')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.hitPoints.current).toBe(8)
  })

  test('allows a negative permanent HP adjustment', async () => {
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText('What caused it?'), 'Lingering curse')
    await user.type(screen.getByLabelText('HP change'), '-3')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.hitPointAdjustments).toEqual([
      expect.objectContaining({ label: 'Lingering curse', amount: -3, mode: 'flat' }),
    ])
  })

  test('keeps direct and fixed maximum controls under more options', async () => {
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByText('More HP options'))
    const desiredMaximum = screen.getByLabelText('Set maximum HP directly')
    await user.clear(desiredMaximum)
    await user.type(desiredMaximum, '15')
    await user.click(screen.getByRole('button', { name: 'Set Maximum' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.hitPointAdjustments).toEqual([
      expect.objectContaining({
        label: 'Custom maximum',
        amount: 5,
        mode: 'flat',
      }),
    ])
  })
})
