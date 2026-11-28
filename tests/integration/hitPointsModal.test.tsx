import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HitPointsModal } from '@/components/modals/HitPointsModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useCharacterStore } from '@/store/characterStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function renderLevelLogModal() {
  render(
    <TooltipProvider>
      <HitPointsModal open onOpenChange={() => {}} />
    </TooltipProvider>,
  )
}

vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () => ({
    classes: [{ name: 'Fighter', source: 'PHB', hd: { faces: 10, number: 1 } }],
    classFeatures: [],
    items: [],
    itemsBase: [],
  }),
}))

vi.mock('@/hooks/data/useGameData', () => ({
  useClassLookup: () => ({
    'Fighter|PHB': { name: 'Fighter', source: 'PHB', hd: { faces: 10, number: 1 } },
  }),
}))

function resetCharacter() {
  const character = makeCharacterFixture({
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
    hitPoints: { current: 8, temporary: 0 },
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

  test('edits starting HP and rerolls a later level while preserving the earned record', async () => {
    const gain = {
      className: 'Fighter',
      classSource: 'PHB',
      classLevel: 2,
      characterLevel: 2,
      hitDie: 10,
      dieResult: 6,
      method: 'average' as const,
    }
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 2 }],
      hitPointGains: [gain],
      hitPoints: { current: 14, temporary: 3 },
      hitPointsInitialized: true,
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacter: character,
      activeCharacterId: character.id,
    })
    const user = userEvent.setup()
    renderLevelLogModal()
    await user.click(screen.getByRole('tab', { name: 'Level log' }))
    const roll = screen.getByRole('button', { name: 'Roll d10 for Fighter level 2 (PHB)' })
    await user.hover(roll)
    expect((await screen.findByRole('tooltip')).textContent).toContain(
      'Roll a d10 and replace this level’s hit die result.',
    )
    const starting = screen.getByLabelText(
      'Hit die result for Fighter level 1 (PHB)',
    ) as HTMLInputElement
    expect(starting.value).toBe('10')
    await user.clear(starting)
    await user.type(starting, '11')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(useCharacterStore.getState().activeCharacter).toBe(character)
    await user.clear(starting)
    await user.type(starting, '8')
    const seededRoll = vi.spyOn(Math, 'random').mockReturnValue(0.9)
    try {
      await user.click(roll)
      expect(screen.queryByRole('button', { name: /Reset hit die/ })).toBeNull()
    } finally {
      seededRoll.mockRestore()
    }
    await user.click(screen.getByRole('tab', { name: 'Overview' }))
    expect((screen.getByLabelText('Current HP') as HTMLInputElement).value).toBe('16')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const saved = useCharacterStore.getState().activeCharacter
    expect(saved?.hitPointGains).toEqual([gain])
    expect(saved?.hitPointLevelOverrides).toEqual([
      expect.objectContaining({ classLevel: 1, dieResult: 8, method: 'manual' }),
      expect.objectContaining({ classLevel: 2, dieResult: 10, method: 'rolled' }),
    ])
    expect(saved?.hitPoints).toEqual({ current: 16, temporary: 3 })
    expect(characterPersistenceSchema.safeParse(JSON.parse(JSON.stringify(saved))).success).toBe(
      true,
    )
  })

  test('keeps the common lasting HP change flow simple', async () => {
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('Maximum HP')).toBeTruthy()
    expect(screen.getByLabelText('Current HP').closest('details')).toBeNull()
    expect(screen.getByLabelText('Temporary HP').closest('details')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
    await user.type(screen.getByLabelText('What caused it?'), 'Divine blessing')
    await user.type(screen.getByLabelText('HP change'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Divine blessing')).toBeTruthy()
    expect(screen.getByText('+5 HP')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Overview' }))
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
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      hitPoints: { current: 0, temporary: 0 },
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

  test('keeps an edited offline hit die available while repairing an invalid draft', async () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'OFFLINE', levels: 1 }],
      hitPointLevelOverrides: [
        {
          className: 'Fighter',
          classSource: 'OFFLINE',
          classLevel: 1,
          hitDie: 10,
          dieResult: 7,
          method: 'manual',
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacter: character,
      activeCharacterId: character.id,
    })
    const user = userEvent.setup()
    renderLevelLogModal()
    await user.click(screen.getByRole('tab', { name: 'Level log' }))
    const result = screen.getByLabelText('Hit die result for Fighter level 1 (OFFLINE)')
    await user.clear(result)
    expect(result.getAttribute('aria-invalid')).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Roll d10 for Fighter level 1 (OFFLINE)' }),
    ).toBeTruthy()
    await user.type(result, '6')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      useCharacterStore.getState().activeCharacter?.hitPointLevelOverrides?.[0].dieResult,
    ).toBe(6)
  })

  test('lets a manual Current HP edit replace the automatic maximum change', async () => {
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
    await user.type(screen.getByLabelText('What caused it?'), 'Divine blessing')
    await user.type(screen.getByLabelText('HP change'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('tab', { name: 'Overview' }))
    const currentHP = screen.getByLabelText('Current HP')
    await user.clear(currentHP)
    await user.type(currentHP, '8')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.hitPoints.current).toBe(8)
  })

  test('allows a negative permanent HP adjustment', async () => {
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
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

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
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

  test('shows active typed HP effects with their source', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      hitPoints: { current: 10, temporary: 0 },
      manualEffects: [
        {
          id: 'test-hp-source',
          label: 'Test maximum HP effect',
          target: { kind: 'hit-point-maximum' },
          operation: { kind: 'add', value: 3 },
          source: { kind: 'item', name: 'Test Vitality Item', entityId: 'test-item' },
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('Current maximum-HP sources')).toBeTruthy()
    expect(screen.getByText('Test maximum HP effect')).toBeTruthy()
    expect(screen.getByText('Test Vitality Item', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove Test Vitality Item' })).toBeNull()
    expect(screen.queryByLabelText('What caused it?')).toBeNull()
  })

  test('includes active typed effects when creating a lasting direct maximum', async () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      hitPoints: { current: 13, temporary: 0 },
      manualEffects: [
        {
          id: 'typed-hp-bonus',
          label: 'Typed HP bonus',
          target: { kind: 'hit-point-maximum' },
          operation: { kind: 'add', value: 3 },
          source: { kind: 'manual', name: 'Typed HP bonus' },
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const user = userEvent.setup()
    render(<HitPointsModal open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('tab', { name: 'Manual changes' }))
    await user.click(screen.getByText('More HP options'))
    const desiredMaximum = screen.getByLabelText('Set maximum HP directly')
    await user.clear(desiredMaximum)
    await user.type(desiredMaximum, '18')
    await user.click(screen.getByRole('button', { name: 'Set Maximum' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(useCharacterStore.getState().activeCharacter?.hitPointAdjustments).toEqual([
      expect.objectContaining({ label: 'Custom maximum', amount: 5 }),
    ])
    expect(useCharacterStore.getState().activeCharacter?.hitPoints.current).toBe(18)
  })
})
