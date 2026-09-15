import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import { emptyProvenance } from '@/lib/character/createCharacter'
import { BuildBackgroundPage } from '@/pages/build/background/BackgroundPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, Feat5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/components/modals/FeatOptionsModal', () => ({
  FeatOptionsModal: () => <div data-testid="feat-options-modal">Feat options</div>,
}))

Element.prototype.scrollIntoView = () => undefined

describe('BackgroundPage', () => {
  const background: Background5e = {
    name: 'Fixture Background',
    source: 'TEST',
    edition: 'one',
    ability: [
      { choose: { weighted: { from: ['str', 'dex', 'con'], weights: [2, 1] } } },
      { choose: { weighted: { from: ['str', 'dex', 'con'], weights: [1, 1, 1] } } },
    ],
    feats: [{ 'Configurable Fixture Feat|TEST': true }],
    skillProficiencies: [{ arcana: true }],
    toolProficiencies: [{ tools: true }],
  }
  const feat: Feat5e = {
    name: 'Configurable Fixture Feat',
    source: 'TEST',
    ability: [{ choose: { from: ['str', 'dex'], count: 1, amount: 1 } }],
  }

  beforeEach(() => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      background: '',
      backgroundSource: undefined,
      allowedSources: ['TEST'],
      provenance: ensureOriginLanguageBaseline(emptyProvenance(), '2024'),
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const baseGameData = makeGameDataFixture({ backgrounds: [background], feats: [feat] })
    useGameDataStore.setState({
      gameData: { ...baseGameData, lookups: buildGameDataLookups(baseGameData) },
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('selects a 2024 background without forcing fixed-feat configuration', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildBackgroundPage />
        </MemoryRouter>
      </TooltipProvider>,
    )

    await user.click(screen.getByRole('button', { name: /Fixture Background$/ }))

    await waitFor(() => expect(screen.getByText('Not configured')).toBeTruthy())
    expect(screen.getByText(/\+2\/\+1 across 2 different abilities/)).toBeTruthy()
    expect(screen.getByText(/\+1\/\+1\/\+1 across 3 different abilities/)).toBeTruthy()
    expect(screen.queryByTestId('feat-options-modal')).toBeNull()
    expect(screen.queryByText('Current Bonuses')).toBeNull()
    expect(screen.getAllByText('Origin Feat')).toHaveLength(1)
  })
})
