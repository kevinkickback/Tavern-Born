import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { BuildRacePage } from '@/pages/build/race/RacePage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture, makeRaceFixture } from '../fixtures/gameDataFixtures'

Element.prototype.scrollIntoView = () => undefined

describe('Race page summary', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      originSystem: '2014',
      race: 'Choice Lineage',
      raceSource: 'TEST',
      allowedSources: ['TEST'],
      raceAsiChoices: [],
      variantRules: { abilityScoreMethod: 'custom' },
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

  test('shows unresolved parsed bonus options under the custom score method', () => {
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
    expect(screen.getByRole('link', { name: 'Choose bonuses' }).className).toContain(
      'border-accent',
    )
    expect(screen.getByRole('link', { name: 'Choose bonuses' }).getAttribute('href')).toBe(
      '/build/ability-scores?focus=race-bonuses',
    )

    const speedValue = screen.getByText(/^walk 30 ft/i)
    const speedCell = speedValue.closest('div.flex.min-h-16')
    expect(speedCell?.textContent).toContain('Edit movement')
    expect(screen.getByRole('button', { name: 'Edit movement' }).className).toContain(
      'border-accent',
    )
  })

  test('hides bonus editing after a parsed race choice is complete', () => {
    const character = makeCharacterFixture({
      originSystem: '2014',
      race: 'Choice Lineage',
      raceSource: 'TEST',
      allowedSources: ['TEST'],
      raceAsiChoices: [['strength']],
      variantRules: { abilityScoreMethod: 'custom' },
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )

    expect(screen.getByText('STR +2')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Choose bonuses' })).toBeNull()
  })

  test('does not offer editing for fixed race bonuses', () => {
    const character = makeCharacterFixture({
      originSystem: '2014',
      race: 'Fixed Lineage',
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
            name: 'Fixed Lineage',
            source: 'TEST',
            ability: [{ str: 2 }],
            size: ['M'],
            speed: 30,
          }),
        ],
      }),
    })

    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )

    expect(screen.getByText('STR +2')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Choose bonuses' })).toBeNull()
  })

  test.each([
    0, 1,
  ] as const)('shows accepted parent choices alongside ordinary child bonuses in mode %s', (mode) => {
    const child = makeRaceFixture({ name: 'Child', source: 'TEST', ability: [{ con: 1 }] })
    const parent = makeRaceFixture({
      name: 'Flexible Parent',
      source: 'TEST',
      lineage: true,
      ability: undefined,
      subraces: [child],
    })
    const character = buildInitialCharacter(
      {
        initial: { name: 'Summary', originSystem: '2014', allowedSources: ['TEST'] },
        race: parent,
        subrace: child,
        raceAsiBlockIndex: mode,
        raceAsiChoices:
          mode === 0 ? [['strength'], ['dexterity']] : [['strength', 'dexterity', 'wisdom']],
      },
      new Map(),
      () => [],
    )
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({ gameData: makeGameDataFixture({ races: [parent] }) })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    expect(
      screen.getByText(
        mode === 0 ? 'CON +1 · STR +2 · DEX +1' : 'CON +1 · STR +1 · DEX +1 · WIS +1',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Choose bonuses' })).toBeNull()
  })

  test.each([
    'absent',
    'other-printing',
  ] as const)('opening the race summary with %s child metadata preserves the selection and shows saved bonuses', (missing) => {
    const child = {
      ...makeRaceFixture({ name: 'Child', source: 'TEST', ability: [{ con: 1 }] }),
      _isVersion: true,
    } as Race5e
    const parent = makeRaceFixture({
      name: 'Parent',
      source: 'TEST',
      lineage: true,
      ability: undefined,
      subraces: [child],
    })
    const character = buildInitialCharacter(
      {
        initial: {
          name: 'Missing summary',
          originSystem: '2014',
          allowedSources: ['TEST', 'OTHER'],
        },
        race: parent,
        subrace: child,
      },
      new Map(),
      () => [],
    )
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
      isActiveCharacterDirty: false,
    })
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        races: [
          { ...parent, subraces: missing === 'absent' ? [] : [{ ...child, source: 'OTHER' }] },
        ],
      }),
    })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    expect.soft(useCharacterStore.getState().activeCharacter).toEqual(character)
    expect.soft(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
    expect.soft(screen.queryByRole('link', { name: 'Choose bonuses' })).toBeNull()
    expect(screen.getByText('CON +1')).toBeTruthy()
    act(() => {
      useGameDataStore.setState({ gameData: makeGameDataFixture({ races: [parent] }) })
    })
    expect(useCharacterStore.getState().activeCharacter).toEqual(character)
    expect(screen.getByText('CON +1')).toBeTruthy()
  })

  test('does not offer race bonus editing when revised bonuses come from the background', () => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      race: 'Revised Lineage',
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
            name: 'Revised Lineage',
            source: 'TEST',
            edition: 'one',
            ability: undefined,
            size: ['M'],
            speed: 30,
          }),
        ],
      }),
    })

    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )

    expect(screen.getByText('Provided by background')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Choose bonuses' })).toBeNull()
  })
})
