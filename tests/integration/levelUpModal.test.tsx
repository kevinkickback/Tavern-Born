import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LevelUpModal } from '@/components/modals/LevelUpModal'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

let mockClasses: Class5e[] = []

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
})
