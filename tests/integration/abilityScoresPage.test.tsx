import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { setCollapseState } from '@/lib/storage/collapseState'
import { BuildAbilityScoresPage } from '@/pages/build/ability-scores/AbilityScoresPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, GameData, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => undefined
Element.prototype.releasePointerCapture = () => undefined
Element.prototype.scrollIntoView = () => undefined

const ability = [
  {
    choose: {
      weighted: { from: ['str', 'dex', 'con'], weights: [2, 1] },
    },
  },
]
const testRace: Race5e = { name: 'Test Race', source: 'TEST' }
const testBackground: Background5e = {
  name: 'Test Background',
  source: 'XPHB',
  edition: 'one',
  ability,
  feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
}

describe('BuildAbilityScoresPage', () => {
  const renderPage = (initialEntry = '/build/ability-scores') =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <BuildAbilityScoresPage />
      </MemoryRouter>,
    )

  beforeEach(() => {
    setCollapseState('sources:build-ability-scores', true)
    const character = makeCharacterFixture({
      originSystem: '2024',
      race: testRace.name,
      raceSource: testRace.source,
      background: testBackground.name,
      backgroundSource: testBackground.source,
      backgroundAsiChoices: [],
      allowedSources: ['XPHB'],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: {
        races: [testRace],
        classes: [],
        backgrounds: [testBackground],
        organizations: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        itemProperties: [],
        itemTypes: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        sources: [{ abbreviation: 'XPHB', name: 'Player’s Handbook (2024)', group: 'core' }],
      } as GameData,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('commits the displayed Standard Array when an older character has no method', async () => {
    const user = userEvent.setup()
    const character = useCharacterStore.getState().activeCharacter!
    const legacy = {
      ...character,
      variantRules: { ...character.variantRules, abilityScoreMethod: undefined },
    }
    useCharacterStore.setState({ characters: [legacy], activeCharacter: legacy })

    renderPage('/build/ability-scores?attention=rules:ability-score-method')
    const methods = screen.getByRole('tablist', { name: 'Ability score method' })
    for (const tab of within(methods).getAllByRole('tab')) {
      expect(document.getElementById(tab.getAttribute('aria-controls') ?? '')).not.toBeNull()
    }
    const standardArray = within(methods).getByRole('tab', { name: 'Standard Array' })
    expect(standardArray.getAttribute('aria-selected')).toBe('true')
    standardArray.focus()
    await user.keyboard('{Enter}')

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.variantRules?.abilityScoreMethod).toBe('standard-array')
    expect(updated?.abilityScores).toEqual(legacy.abilityScores)
  })

  test('edits revised background bonuses in the canonical ability-score section', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByTestId('background-ability-choices')).toBeTruthy()
    await user.click(screen.getByLabelText('Background ability bonus +2'))
    await user.click(screen.getByRole('option', { name: 'STR' }))

    expect(useCharacterStore.getState().activeCharacter?.backgroundAsiChoices).toEqual([
      'strength',
      '',
    ])
  })

  test('shows the unresolved parsed background bonus pattern in Sources', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Sources/ }))

    const sources = within(screen.getByRole('region', { name: /Sources/ }))
    expect(
      sources.getByText(
        /Choose 2 abilities from STR, DEX, CON \(\+2 and \+1, one bonus per ability\)/,
      ),
    ).toBeTruthy()
    await user.click(screen.getByLabelText('Background ability bonus +2'))
    await user.click(screen.getByRole('option', { name: 'STR' }))
    expect(screen.getByTestId('background-ability-choices')).toBeTruthy()
    expect(await screen.findByText('Choose 1 more ability from DEX, CON (+1)')).toBeTruthy()
    expect(screen.getByText(/\(background\)/i)).toBeTruthy()
  })

  test('uses background-specific empty guidance for revised characters', async () => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      race: testRace.name,
      raceSource: testRace.source,
      background: '',
      backgroundSource: undefined,
      backgroundAsiChoices: [],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Sources' }))

    expect(
      screen.getByText('No ability bonus sources recorded. Select a background to get started.'),
    ).toBeTruthy()
  })

  test('temporarily highlights the revised background bonus destination', () => {
    vi.useFakeTimers()
    const view = renderPage('/build/ability-scores?focus=background-bonuses')

    try {
      const destination = screen.getByTestId('background-ability-choices')
      act(() => vi.advanceTimersByTime(48))
      expect(destination.className).toContain('animate-route-focus')

      act(() => vi.advanceTimersByTime(1_199))

      expect(destination.className).toContain('animate-route-focus')

      act(() => vi.advanceTimersByTime(1))

      expect(destination.className).not.toContain('animate-route-focus')
    } finally {
      view.unmount()
      vi.useRealTimers()
    }
  })

  test('highlights the legacy race bonus destination from its configuration link', () => {
    vi.useFakeTimers()
    const legacyRace: Race5e = {
      name: 'Legacy Choice Race',
      source: 'TEST',
      ability: [{ choose: { count: 1, amount: 2, from: ['str', 'dex'] } }],
    }
    const character = makeCharacterFixture({
      originSystem: '2014',
      race: legacyRace.name,
      raceSource: legacyRace.source,
      background: '',
      backgroundSource: undefined,
      raceAsiChoices: [],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: {
        ...useGameDataStore.getState().gameData!,
        races: [legacyRace],
        backgrounds: [],
      },
    })

    const view = renderPage('/build/ability-scores?focus=race-bonuses')

    try {
      act(() => vi.advanceTimersByTime(48))
      expect(screen.getByTestId('race-ability-choices').className).toContain('animate-route-focus')
      expect(screen.getByRole('combobox', { name: /Racial ability bonus \+2/ })).toBeTruthy()
      expect(screen.queryByText(/Choose 1 ability from/)).toBeNull()
    } finally {
      view.unmount()
      vi.useRealTimers()
    }
  })
})
