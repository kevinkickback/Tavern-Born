import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ManualAdjustments } from '@/components/character/ManualAdjustments'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { setHintDismissed } from '@/lib/storage/hints'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

let mockClasses: Class5e[] = []

afterEach(() => useGameDataStore.setState({ gameData: null }))

vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () => ({
    classes: mockClasses,
    classFeatures: [],
    optionalfeatures: [],
    spells: [],
    feats: [],
    races: [],
    backgrounds: [],
    items: [],
    itemsBase: [],
  }),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ''}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    children,
  }: {
    children: ReactNode
    value: string
    disabled?: boolean
    className?: string
  }) => <div>{children}</div>,
}))

function resetCharacterStoreWith(character = makeCharacterFixture()) {
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
}

describe('Manual Adjustments multiclass requirements', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      abilityScores: {
        strength: 12,
        dexterity: 12,
        constitution: 10,
        intelligence: 10,
        wisdom: 12,
        charisma: 10,
      },
    })
    resetCharacterStoreWith(character)

    mockClasses = [
      makeClassFixture({ name: 'Fighter', source: 'PHB' }),
      makeClassFixture({
        name: 'Paladin',
        source: 'PHB',
        multiclassing: { requirements: { str: 13 } },
      }),
      makeClassFixture({
        name: 'Ranger',
        source: 'PHB',
        multiclassing: {
          requirements: {
            str: 13,
            or: [{ dex: 13 }, { wis: 13 }],
          },
        },
      }),
    ]
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('shows canonical ability names instead of legacy abbreviations', async () => {
    render(<ManualAdjustments />)
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Multiclass' }))

    expect(screen.getByText(/\(Strength 13\)/)).toBeTruthy()
    expect(screen.queryByText(/\(STR 13\+\)/)).toBeNull()
  })

  test('directs a classless character to Class before offering multiclassing', () => {
    resetCharacterStoreWith(makeCharacterFixture({ classProgression: [] }))
    render(<ManualAdjustments />)

    expect(screen.getByText('Choose your first class on the Class page.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
  })

  test('shows combined OR and base requirements with canonical text', async () => {
    render(<ManualAdjustments />)
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Multiclass' }))

    expect(screen.getByText(/\(Dexterity 13; Wisdom 13; Strength 13\)/)).toBeTruthy()
  })

  test('keeps class printings distinct by source', async () => {
    mockClasses = [
      ...mockClasses,
      makeClassFixture({ name: 'Wizard', source: 'PHB' }),
      makeClassFixture({ name: 'Wizard', source: 'XPHB' }),
    ]

    render(<ManualAdjustments />)
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Multiclass' }))

    expect(screen.getAllByText('Wizard')).toHaveLength(2)
    expect(screen.getByText('(XPHB)')).toBeTruthy()
  })

  test.each([
    'Wizard',
    ' WIZARD ',
  ])('marks only the selected printing as taken after catalog refresh %s', async (name) => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    })
    resetCharacterStoreWith(character)
    mockClasses = [
      makeClassFixture({ name, source: ' phb ' }),
      makeClassFixture({ name: 'Wizard', source: 'XPHB' }),
    ]

    render(<ManualAdjustments />)

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Multiclass' }))
    expect(screen.getAllByText('(already taken)')).toHaveLength(1)
  })
})

describe('Manual Adjustments level changes', () => {
  beforeEach(() => {
    mockClasses = [
      makeClassFixture({ name: 'Fighter', source: 'PHB', hd: { faces: 10, number: 1 } }),
    ]
    useGameDataStore.getState().setGameData(makeGameDataFixture({ classes: mockClasses }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('increments and decrements one level per action', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
        variantRules: { averageHitPoints: true },
        hitPointGains: [],
      }),
    )
    render(<ManualAdjustments />)

    expect(screen.queryByRole('spinbutton')).toBeNull()
    const add = screen.getByRole('button', { name: 'Add a level to Fighter' })
    await user.click(add)
    await user.click(add)
    await user.click(add)
    expect(
      useCharacterStore
        .getState()
        .activeCharacter?.hitPointGains?.map((gain) => [gain.classLevel, gain.dieResult]),
    ).toEqual([
      [2, 6],
      [3, 6],
      [4, 6],
    ])

    const remove = screen.getByRole('button', { name: 'Remove a level from Fighter' })
    for (let step = 0; step < 2; step++) {
      await user.click(remove)
      await user.click(screen.getByRole('button', { name: 'Remove' }))
    }
    expect(useCharacterStore.getState().activeCharacter?.classProgression[0].levels).toBe(2)
    expect(
      useCharacterStore.getState().activeCharacter?.hitPointGains?.map((gain) => gain.classLevel),
    ).toEqual([2])
  })

  test('the minus button removes the named class level and preserves later gains from another class', async () => {
    const user = userEvent.setup()
    const fighter = { name: 'Fighter', source: 'PHB' }
    const rogue = { name: 'Rogue', source: 'PHB' }
    const rogueGain = {
      className: rogue.name,
      classSource: rogue.source,
      classLevel: 1,
      characterLevel: 3,
      hitDie: 8,
      dieResult: 5,
      method: 'average' as const,
    }
    mockClasses.push(makeClassFixture({ ...rogue, hd: { faces: 8, number: 1 } }))
    useGameDataStore.getState().setGameData(makeGameDataFixture({ classes: mockClasses }))
    resetCharacterStoreWith(
      makeCharacterFixture({
        initialClass: fighter,
        classProgression: [
          { ...fighter, levels: 2 },
          { ...rogue, levels: 1 },
        ],
        hitPoints: { current: 21, temporary: 0 },
        hitPointGains: [
          {
            ...rogueGain,
            className: fighter.name,
            classLevel: 2,
            characterLevel: 2,
            hitDie: 10,
            dieResult: 6,
          },
          rogueGain,
        ],
      }),
    )
    render(<ManualAdjustments />)

    const minus = screen.getByRole('button', { name: 'Remove a level from Fighter' })
    await user.click(minus)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useCharacterStore.getState().activeCharacter?.classProgression[0].levels).toBe(2)
    await user.click(minus)
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const character = useCharacterStore.getState().activeCharacter
    expect(character?.initialClass).toEqual(fighter)
    expect(character?.classProgression).toEqual([
      { ...fighter, levels: 1 },
      { ...rogue, levels: 1 },
    ])
    expect(character?.hitPointGains).toEqual([{ ...rogueGain, characterLevel: 2 }])
    expect((minus as HTMLButtonElement).disabled).toBe(true)
  })

  test.each([
    'Fighter',
    ' FIGHTER ',
  ])('uses the exact raw hit die after filtering and catalog refresh %s', async (name) => {
    const user = userEvent.setup()
    const classSource = 'PHB'
    const fighter = makeClassFixture({
      name,
      source: ' phb ',
      hd: { faces: 10, number: 1 },
    })
    mockClasses = []
    const data = makeGameDataFixture({ classes: [fighter] })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    resetCharacterStoreWith(
      makeCharacterFixture({
        classProgression: [{ name: 'Fighter', source: classSource, levels: 1 }],
        variantRules: { averageHitPoints: false },
      }),
    )

    render(<ManualAdjustments />)
    await user.click(screen.getByRole('button', { name: 'Add a level to Fighter' }))

    expect(useCharacterStore.getState().activeCharacter?.hitPointGains?.[0]).toMatchObject({
      hitDie: 10,
      dieResult: 6,
      method: 'average',
    })
  })

  test('uses the fixed average even when the wizard rule uses manually entered HP', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 14,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        variantRules: { averageHitPoints: false },
        hitPoints: { current: 0, temporary: 0 },
        hitPointGains: [],
      }),
    )

    render(<ManualAdjustments />)
    await user.click(screen.getByRole('button', { name: 'Add a level to Fighter' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.classProgression?.[0]?.levels).toBe(2)
    expect(updated?.hitPointGains).toEqual([
      expect.objectContaining({
        className: 'Fighter',
        classLevel: 2,
        characterLevel: 2,
        hitDie: 10,
        dieResult: 6,
        method: 'average',
      }),
    ])
    expect(updated?.hitPoints).toEqual({ current: 20, temporary: 0 })
    expect(updated?.hitPointsInitialized).toBe(true)
  })

  test('records the fixed average without opening the roll dialog', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
        variantRules: { averageHitPoints: true },
        hitPoints: { current: 0, temporary: 0 },
        hitPointGains: [],
      }),
    )

    render(<ManualAdjustments />)
    await user.click(screen.getByRole('button', { name: 'Add a level to Fighter' }))

    expect(screen.queryByRole('heading', { name: 'Hit Point Increase' })).toBeNull()
    expect(useCharacterStore.getState().activeCharacter?.hitPointGains).toEqual([
      expect.objectContaining({ dieResult: 6, method: 'average' }),
    ])
    expect(useCharacterStore.getState().activeCharacter?.hitPoints.current).toBe(16)
  })

  test('remembers skipping removal confirmation only after confirming', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 3 }],
      }),
    )
    render(<ManualAdjustments />)
    const minus = screen.getByRole('button', { name: 'Remove a level from Fighter' })
    try {
      await user.click(minus)
      await user.click(screen.getByRole('checkbox', { name: 'Don’t ask me again' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(useCharacterStore.getState().activeCharacter?.classProgression[0].levels).toBe(3)
      await user.click(minus)
      const optOut = screen.getByRole('checkbox', { name: 'Don’t ask me again' })
      expect(optOut.getAttribute('aria-checked')).toBe('false')
      await user.click(optOut)
      await user.click(screen.getByRole('button', { name: 'Remove' }))
      expect(useCharacterStore.getState().activeCharacter?.classProgression[0].levels).toBe(2)
      await user.click(minus)
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(useCharacterStore.getState().activeCharacter?.classProgression[0].levels).toBe(1)
    } finally {
      setHintDismissed('quick-actions-remove-level', false)
    }
  })

  test('clamps current hit points to the new maximum when a level is removed', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 2 }],
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        variantRules: { averageHitPoints: true },
        hitPoints: { current: 16, temporary: 0 },
        hitPointGains: [
          {
            className: 'Fighter',
            classSource: 'PHB',
            classLevel: 2,
            characterLevel: 2,
            hitDie: 10,
            dieResult: 6,
            method: 'average',
          },
        ],
      }),
    )

    render(<ManualAdjustments />)
    await user.click(screen.getByRole('button', { name: 'Remove a level from Fighter' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.classProgression).toEqual([{ name: 'Fighter', source: 'PHB', levels: 1 }])
    expect(updated?.hitPoints.current).toBe(10)
  })

  test('clears level history when the active character changes', async () => {
    const user = userEvent.setup()
    const fighter = makeCharacterFixture({
      id: 'fighter-id',
      name: 'Fighter Hero',
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      variantRules: { averageHitPoints: true },
      hitPointGains: [],
    })
    const wizard = makeCharacterFixture({
      id: 'wizard-id',
      name: 'Wizard Hero',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
      variantRules: { averageHitPoints: true },
      hitPointGains: [],
    })
    mockClasses = [
      makeClassFixture({ name: 'Fighter', source: 'PHB' }),
      makeClassFixture({ name: 'Wizard', source: 'PHB' }),
    ]
    resetCharacterStoreWith(fighter)
    function CharacterScopedManualAdjustments() {
      const activeCharacterId = useCharacterStore((state) => state.activeCharacter?.id)
      return <ManualAdjustments key={activeCharacterId ?? 'no-character'} />
    }

    render(<CharacterScopedManualAdjustments />)

    await user.click(screen.getByRole('button', { name: 'Add a level to Fighter' }))
    const updatedFighter = useCharacterStore.getState().activeCharacter
    act(() => {
      useCharacterStore.setState({
        characters: [updatedFighter!, wizard],
        activeCharacterId: wizard.id,
        activeCharacter: wizard,
      })
    })
    await user.click(screen.getByRole('button', { name: 'Remove a level from Wizard' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(useCharacterStore.getState().activeCharacter?.classProgression).toEqual([
      { name: 'Wizard', source: 'PHB', levels: 2 },
    ])
  })
})
