import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { parseConditions } from '@/lib/5etools/parsers'
import { CompendiumPage } from '@/pages/compendium/CompendiumPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const gameData = {
  classes: [
    { name: 'Legacy Fighter', source: 'PHB', fluffEntries: ['Legacy class'] },
    {
      name: 'Revised Fighter',
      source: 'XPHB',
      edition: 'one',
      fluffEntries: ['Revised class'],
    },
  ],
  sources: [
    { abbreviation: 'PHB', name: "Player's Handbook", group: 'core' },
    { abbreviation: 'XPHB', name: "Player's Handbook (2024)", group: 'core' },
  ],
} as GameData

function renderPage() {
  return render(
    <MemoryRouter>
      <CompendiumPage />
    </MemoryRouter>,
  )
}

describe('CompendiumPage edition filtering', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    })
    useGameDataStore.setState({ gameData })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('defaults to Both without a character and filters when an edition is selected', () => {
    renderPage()

    expect(screen.getByRole('radio', { name: 'Both editions' }).getAttribute('data-state')).toBe(
      'on',
    )
    expect(screen.getByText('Legacy Fighter')).toBeTruthy()
    expect(screen.getByText('Revised Fighter')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: '5e edition' }))
    expect(screen.getByText('Legacy Fighter')).toBeTruthy()
    expect(screen.queryByText('Revised Fighter')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: '5.5e edition' }))
    expect(screen.queryByText('Legacy Fighter')).toBeNull()
    expect(screen.getByText('Revised Fighter')).toBeTruthy()
  })

  test('filters status records by their true category and opens their complete rules', () => {
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        conditions: parseConditions({
          condition: [{ name: 'Prone', source: 'PHB', entries: ['Condition rules.'] }],
          disease: [{ name: 'Sight Rot', source: 'DMG', entries: ['Disease rules.'] }],
          status: [
            { name: 'Concentration', source: 'PHB', entries: ['Status rules are retained.'] },
          ],
        }),
      }),
    })
    render(
      <MemoryRouter initialEntries={['/compendium?type=Status']}>
        <CompendiumPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Prone')).toBeNull()
    expect(screen.queryByText('Sight Rot')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Concentration/ }))
    expect(screen.getAllByRole('heading', { name: 'Concentration' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Status rules are retained.').length).toBeGreaterThan(0)
  })

  test('remains global when the active character restricts ruleset and sources', () => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['PHB'],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage()

    expect(screen.getByRole('radio', { name: 'Both editions' }).getAttribute('data-state')).toBe(
      'on',
    )
    expect(screen.getByText('Legacy Fighter')).toBeTruthy()
    expect(screen.getByText('Revised Fighter')).toBeTruthy()
  })

  test('shows full source names for mixed-case adventure IDs and filters their entries', async () => {
    useGameDataStore.setState({
      gameData: {
        classes: [
          { name: 'Tiamat Option', source: 'RoT' },
          { name: 'Storm Option', source: 'SLW' },
          { name: 'Tomb Option', source: 'ToA' },
        ],
        sources: [
          { abbreviation: 'ROT', name: 'The Rise of Tiamat', group: 'adventure' },
          { abbreviation: 'SLW', name: "Storm Lord's Wrath", group: 'adventure' },
          { abbreviation: 'TOA', name: 'Tomb of Annihilation', group: 'adventure' },
        ],
      } as GameData,
    })

    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sources' }))

    expect(screen.getByText('The Rise of Tiamat')).toBeTruthy()
    expect(screen.getByText("Storm Lord's Wrath")).toBeTruthy()
    expect(screen.getByText('Tomb of Annihilation')).toBeTruthy()

    await user.click(screen.getByRole('menuitemcheckbox', { name: /The Rise of Tiamat/ }))
    expect(screen.getByText('Tiamat Option')).toBeTruthy()
    expect(screen.queryByText('Storm Option')).toBeNull()
    expect(screen.queryByText('Tomb Option')).toBeNull()
  })
})
