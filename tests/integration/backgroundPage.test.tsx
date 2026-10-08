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
    fluffEntries: ['A 2024 background description from the source data.'],
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
    expect(screen.getByText(/\+2\/\+1 from STR, DEX, CON/)).toBeTruthy()
    expect(screen.getByText(/\+1\/\+1\/\+1 from STR, DEX, CON/)).toBeTruthy()
    expect(screen.queryByTestId('feat-options-modal')).toBeNull()
    expect(screen.queryByText('Current Bonuses')).toBeNull()
    expect(screen.queryByText('Provided by background')).toBeNull()
    const configureLink = screen.getByRole('link', { name: 'Configure feat' })
    expect(configureLink.getAttribute('href')).toBe(
      '/feats?view=character&feat=Configurable+Fixture+Feat&source=TEST&focus=feat',
    )
    expect(configureLink.parentElement?.className).toContain('flex-col')
    expect(screen.getByRole('link', { name: 'Edit bonuses' }).getAttribute('href')).toBe(
      '/build/ability-scores?focus=background-bonuses',
    )
    expect(screen.getAllByText('Origin Feat')).toHaveLength(1)
    expect(screen.getByText('A 2024 background description from the source data.')).toBeTruthy()
  })

  test('reports a missing fixed feat instead of configuring a different source', async () => {
    const character = useCharacterStore.getState().activeCharacter!
    useCharacterStore.setState({
      activeCharacter: { ...character, allowedSources: ['TEST', 'OTHER'] },
    })
    const data = makeGameDataFixture({
      backgrounds: [background],
      feats: [{ ...feat, source: 'OTHER' }],
    })
    useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildBackgroundPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /Fixture Background$/ }))
    expect(screen.getByText('Feat data unavailable (TEST).')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Configure feat' })).toBeNull()
    expect(
      useCharacterStore.getState().activeCharacter?.provenance?.feats[
        'configurable fixture feat'
      ]?.[0].sourceRef,
    ).toBe('TEST')
  })

  test('explains an unqualified fixed grant even when its unique feat printing is loaded', async () => {
    const data = makeGameDataFixture({
      backgrounds: [{ ...background, feats: [{ 'Configurable Fixture Feat': true }] }],
      feats: [feat],
    })
    useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildBackgroundPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /Fixture Background$/ }))
    expect(
      screen.getByText(
        'The granted feat does not identify its source. Reload its granting content before configuring it.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/Feat data unavailable/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Configure feat' })).toBeNull()
    expect(
      useCharacterStore.getState().activeCharacter?.provenance?.feats[
        'configurable fixture feat'
      ]?.[0],
    ).toMatchObject({ sourceRef: 'TEST', grantSource: '' })
  })

  test('retains exact fixed feat configuration when its source is filtered out', async () => {
    const data = makeGameDataFixture({
      backgrounds: [{ ...background, feats: [{ 'Configurable Fixture Feat|OTHER': true }] }],
      feats: [{ ...feat, source: 'OTHER' }],
    })
    useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildBackgroundPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /Fixture Background$/ }))
    expect(screen.getByRole('link', { name: 'Configure feat' }).getAttribute('href')).toBe(
      '/feats?view=character&feat=Configurable+Fixture+Feat&source=OTHER&focus=feat',
    )
    expect(screen.queryByText(/Feat data unavailable/)).toBeNull()
  })
})
