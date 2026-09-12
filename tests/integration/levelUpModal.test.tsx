import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LevelUpModal } from '@/components/modals/LevelUpModal'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

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

describe('level up modal multiclass requirement text', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      class: 'Fighter',
      classSource: 'PHB',
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

  test('shows canonical ability names instead of legacy abbreviations', () => {
    render(<LevelUpModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText(/\(Strength 13\)/)).toBeTruthy()
    expect(screen.queryByText(/\(STR 13\+\)/)).toBeNull()
  })

  test('shows combined OR and base requirements with canonical text', () => {
    render(<LevelUpModal open={true} onOpenChange={() => {}} />)

    expect(screen.getByText(/\(Dexterity 13; Wisdom 13; Strength 13\)/)).toBeTruthy()
  })

  test('keeps class printings distinct by source', () => {
    mockClasses = [
      ...mockClasses,
      makeClassFixture({ name: 'Wizard', source: 'PHB' }),
      makeClassFixture({ name: 'Wizard', source: 'XPHB' }),
    ]

    render(<LevelUpModal open={true} onOpenChange={() => {}} />)

    expect(screen.getAllByText('Wizard')).toHaveLength(2)
    expect(screen.getByText('(XPHB)')).toBeTruthy()
  })

  test('marks only the already-selected class printing as taken', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    })
    resetCharacterStoreWith(character)
    mockClasses = [
      makeClassFixture({ name: 'Wizard', source: 'PHB' }),
      makeClassFixture({ name: 'Wizard', source: 'XPHB' }),
    ]

    render(<LevelUpModal open={true} onOpenChange={() => {}} />)

    expect(screen.getAllByText('(already taken)')).toHaveLength(1)
  })
})

describe('level up hit-point choices', () => {
  beforeEach(() => {
    mockClasses = [
      makeClassFixture({ name: 'Fighter', source: 'PHB', hd: { faces: 10, number: 1 } }),
    ]
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test.each([
    ['an exact class hidden by source filters', 'PHB', false],
    ['a legacy class with an empty source', '', true],
  ])('uses the raw hit die for %s', async (_label, classSource, includeFilteredClass) => {
    const user = userEvent.setup()
    const fighter = makeClassFixture({
      name: 'Fighter',
      source: 'PHB',
      hd: { faces: 10, number: 1 },
    })
    mockClasses = includeFilteredClass ? [fighter] : []
    useGameDataStore.setState({ gameData: makeGameDataFixture({ classes: [fighter] }) })
    resetCharacterStoreWith(
      makeCharacterFixture({
        class: 'Fighter',
        classSource,
        level: 1,
        classProgression: [{ name: 'Fighter', source: classSource, levels: 1 }],
        variantRules: { averageHitPoints: false },
      }),
    )

    render(<LevelUpModal open={true} onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Level Up' }))

    expect(screen.getByRole('button', { name: /Roll d10/ })).toBeTruthy()
  })

  test('asks for and persists a manual roll when fixed average is disabled', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        class: 'Fighter',
        classSource: 'PHB',
        level: 1,
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
        hitPoints: { max: 0, current: 0, temporary: 0 },
        hitPointGains: [],
      }),
    )

    render(<LevelUpModal open={true} onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Level Up' }))

    expect(screen.getByRole('heading', { name: 'Hit Point Increase' })).toBeTruthy()
    await user.type(screen.getByLabelText('Enter a roll'), '7')
    expect(screen.getByText('+9 HP')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }))

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.level).toBe(2)
    expect(updated?.classProgression?.[0]?.levels).toBe(2)
    expect(updated?.hitPointGains).toEqual([
      expect.objectContaining({
        className: 'Fighter',
        classLevel: 2,
        characterLevel: 2,
        hitDie: 10,
        dieResult: 7,
        method: 'manual',
      }),
    ])
  })

  test('records the fixed average without opening the roll dialog', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        class: 'Fighter',
        classSource: 'PHB',
        level: 1,
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
        variantRules: { averageHitPoints: true },
        hitPoints: { max: 0, current: 0, temporary: 0 },
        hitPointGains: [],
      }),
    )

    render(<LevelUpModal open={true} onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Level Up' }))

    expect(screen.queryByRole('heading', { name: 'Hit Point Increase' })).toBeNull()
    expect(useCharacterStore.getState().activeCharacter?.hitPointGains).toEqual([
      expect.objectContaining({ dieResult: 6, method: 'average' }),
    ])
  })

  test('can roll the class hit die and persist the generated result', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        class: 'Fighter',
        classSource: 'PHB',
        level: 1,
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
        variantRules: { averageHitPoints: false },
        hitPoints: { max: 0, current: 0, temporary: 0 },
        hitPointGains: [],
      }),
    )

    render(<LevelUpModal open={true} onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Level Up' }))
    await user.click(screen.getByRole('button', { name: 'Roll d10' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }))

    const gain = useCharacterStore.getState().activeCharacter?.hitPointGains?.[0]
    expect(gain?.method).toBe('rolled')
    expect(gain?.dieResult).toBeGreaterThanOrEqual(1)
    expect(gain?.dieResult).toBeLessThanOrEqual(10)
  })

  test('cancelling the hit-point dialog does not add the level', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        class: 'Fighter',
        classSource: 'PHB',
        level: 1,
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
        variantRules: { averageHitPoints: false },
        hitPointGains: [],
      }),
    )

    render(<LevelUpModal open={true} onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Level Up' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(useCharacterStore.getState().activeCharacter?.level).toBe(1)
    expect(useCharacterStore.getState().activeCharacter?.hitPointGains).toEqual([])
  })

  test('removes a legacy source-less HP gain from its matching multiclass entry', async () => {
    const user = userEvent.setup()
    resetCharacterStoreWith(
      makeCharacterFixture({
        class: 'Fighter',
        classSource: 'PHB',
        level: 3,
        classProgression: [
          { name: 'Fighter', source: 'PHB', levels: 2 },
          { name: 'Wizard', source: 'XPHB', levels: 1 },
        ],
        hitPointGains: [
          {
            className: 'Fighter',
            classLevel: 2,
            characterLevel: 3,
            hitDie: 10,
            dieResult: 6,
            method: 'average',
          },
        ],
      }),
    )

    render(<LevelUpModal open={true} onOpenChange={() => {}} />)
    await user.click(screen.getByText('Remove last level'))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(useCharacterStore.getState().activeCharacter?.classProgression).toEqual([
      { name: 'Fighter', source: 'PHB', levels: 1 },
      { name: 'Wizard', source: 'XPHB', levels: 1 },
    ])
  })

  test('clears level history when the active character changes', async () => {
    const user = userEvent.setup()
    const fighter = makeCharacterFixture({
      id: 'fighter-id',
      name: 'Fighter Hero',
      class: 'Fighter',
      classSource: 'PHB',
      level: 1,
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      variantRules: { averageHitPoints: true },
      hitPointGains: [],
    })
    const wizard = makeCharacterFixture({
      id: 'wizard-id',
      name: 'Wizard Hero',
      class: 'Wizard',
      classSource: 'PHB',
      level: 3,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
      variantRules: { averageHitPoints: true },
      hitPointGains: [],
    })
    mockClasses = [
      makeClassFixture({ name: 'Fighter', source: 'PHB' }),
      makeClassFixture({ name: 'Wizard', source: 'PHB' }),
    ]
    resetCharacterStoreWith(fighter)
    function CharacterScopedLevelUpModal() {
      const activeCharacterId = useCharacterStore((state) => state.activeCharacter?.id)
      return (
        <LevelUpModal
          key={activeCharacterId ?? 'no-character'}
          open={true}
          onOpenChange={() => {}}
        />
      )
    }

    render(<CharacterScopedLevelUpModal />)

    await user.click(screen.getByRole('button', { name: 'Level Up' }))
    const updatedFighter = useCharacterStore.getState().activeCharacter
    act(() => {
      useCharacterStore.setState({
        characters: [updatedFighter!, wizard],
        activeCharacterId: wizard.id,
        activeCharacter: wizard,
      })
    })
    await user.click(screen.getByText('Remove last level'))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(useCharacterStore.getState().activeCharacter?.classProgression).toEqual([
      { name: 'Wizard', source: 'PHB', levels: 2 },
    ])
  })
})
