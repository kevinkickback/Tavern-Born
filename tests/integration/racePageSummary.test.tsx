import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BuildRacePage } from '@/pages/build/race/RacePage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture, makeRaceFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

Element.prototype.scrollIntoView = () => undefined

describe('Race page summary', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      race: 'Choice Lineage',
      raceSource: 'TEST',
      allowedSources: ['TEST'],
      raceAsiChoices: [],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        races: [
          makeRaceFixture({
            name: 'Choice Lineage',
            source: 'TEST',
            ability: [{ choose: { count: 1, amount: 2, from: ['str', 'dex'] } }],
            size: ['M'],
            speed: 30,
          }),
        ],
      }),
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('shows unresolved parsed bonus options and keeps related actions in their cells', () => {
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )

    const abilityValue = screen.getByText('Choose 1 × +2 from STR/DEX')
    const abilityCell = abilityValue.closest('div.flex.min-h-16')
    expect(abilityCell?.textContent).toContain('Choose bonuses')

    const speedValue = screen.getByText(/^walk 30 ft/i)
    const speedCell = speedValue.closest('div.flex.min-h-16')
    expect(speedCell?.textContent).toContain('Edit movement')
  })
})
