import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { BuildAbilityScoresPage } from '@/pages/build/ability-scores/AbilityScoresPage'
import { BuildRacePage } from '@/pages/build/race/RacePage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture, makeRaceFixture } from '../fixtures/gameDataFixtures'

Element.prototype.scrollIntoView = () => undefined
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => undefined
Element.prototype.releasePointerCapture = () => undefined

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

  test.each([
    'parent',
    'child',
  ])('displays the exact saved selection when its %s printing is filtered out', async (filtered) => {
    const savedChild = {
      name: 'Saved child',
      source: 'CHILD',
      ability: [{ con: 1 }],
      entries: ['Saved child details'],
    } as Race5e
    const parent = makeRaceFixture({
      name: 'Choice Lineage',
      source: 'TEST',
      ability: [{ choose: { count: 1, amount: 2, from: ['str', 'dex'] } }],
      subraces: [savedChild, { ...savedChild, source: 'TEST', entries: ['Competing details'] }],
    })
    const character = buildInitialCharacter(
      {
        initial: {
          name: 'Filtered selection',
          originSystem: '2014',
          allowedSources: filtered === 'parent' ? ['OTHER'] : ['TEST'],
        },
        race: parent,
        subrace: savedChild,
        raceAsiChoices: [['strength']],
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
    const data = makeGameDataFixture({ races: [parent] })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    expect.soft(screen.queryByRole('heading', { name: 'Choice Lineage' })).not.toBeNull()
    expect.soft(screen.queryByText('Saved child details')).not.toBeNull()
    expect.soft(screen.queryByText('Competing details')).toBeNull()
    expect.soft(screen.queryByText('Select a race to view details')).toBeNull()
    expect(useCharacterStore.getState().activeCharacter).toBe(character)
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
    if (filtered === 'parent') {
      expect(screen.queryByRole('combobox', { name: 'Subrace' })).toBeNull()
    } else {
      const user = userEvent.setup()
      const selector = screen.getByRole('combobox', { name: 'Subrace' })
      expect(selector.textContent).toBe('Saved child')
      await user.click(selector)
      expect(screen.getAllByRole('option')).toHaveLength(1)
      await user.click(screen.getByRole('option', { name: 'Saved child' }))
      const changed = characterPersistenceSchema.parse(
        JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
      )
      expect(changed.subraceSource).toBe('TEST')
      expect(screen.getByText('Competing details')).toBeTruthy()
      expect(screen.queryByText('Saved child details')).toBeNull()
    }
  })

  test('child selection distinguishes complete name/source pairs with the same joined text', async () => {
    const children = [
      { name: 'A|B', source: 'C', ability: [{ con: 1 }] },
      { name: 'A', source: 'B|C', ability: [{ wis: 1 }] },
    ] as Race5e[]
    const parent = makeRaceFixture({ name: 'Parent', source: 'TEST', subraces: children })
    const character = characterPersistenceSchema.parse(
      buildInitialCharacter(
        {
          initial: {
            name: 'Literal choice',
            originSystem: '2014',
            allowedSources: ['TEST', 'C', 'B|C'],
          },
          race: parent,
          subrace: children[0],
        },
        new Map(),
        () => [],
      ),
    )
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const data = makeGameDataFixture({ races: [parent] })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Subrace' }))
    await user.click(screen.getByRole('option', { name: /^A$/ }))
    const changed = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
    )
    expect(changed.subrace).toBe('A')
    expect(changed.subraceSource).toBe('B|C')
    expect(changed.provenance!.abilityBonuses).toContainEqual(
      expect.objectContaining({
        ability: 'wisdom',
        value: 1,
        sourceTag: expect.objectContaining({ sourceName: 'A', sourceRef: 'B|C' }),
      }),
    )
  })

  test.each([
    'parsed-name-trim',
    'loaded-name-case',
    'loaded-source-case',
  ])('resolves the complete normalized nested child after selection and reopen: %s', async (variant) => {
    const child = {
      name: variant === 'parsed-name-trim' ? ' Child|Exact ' : 'Child|Exact',
      source: 'CASE',
      ability: [{ con: 1 }],
      entries: ['Normalized child details'],
    }
    const parent = parseRaces({
      race: [
        {
          name: 'Parent',
          source: 'TEST',
          ability: [{ choose: { from: ['str', 'dex'], amount: 2 } }],
          subraces: [
            { name: 'Other', source: 'CASE', ability: [{ wis: 1 }], entries: ['Other details'] },
            child,
          ],
        },
      ],
    })[0] as Race5e
    const character = characterPersistenceSchema.parse(
      buildInitialCharacter(
        {
          initial: {
            name: 'Normalized selection',
            originSystem: '2014',
            allowedSources: ['TEST', 'CASE', 'case'],
          },
          race: parent,
          subrace: parent.subraces![variant === 'parsed-name-trim' ? 0 : 1],
          raceAsiChoices: [['strength']],
        },
        new Map(),
        () => [],
      ),
    )
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
      isActiveCharacterDirty: false,
    })
    const loaded = {
      ...parent,
      subraces: [
        parent.subraces![0],
        {
          ...parent.subraces![1],
          ...(variant === 'loaded-name-case' ? { name: child.name.toLowerCase() } : {}),
          ...(variant === 'loaded-source-case' ? { source: child.source.toLowerCase() } : {}),
        },
      ],
    }
    const data = makeGameDataFixture({ races: [loaded] })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildRacePage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    if (variant === 'parsed-name-trim') {
      const user = userEvent.setup()
      await user.click(screen.getByRole('combobox', { name: 'Subrace' }))
      await user.click(screen.getByRole('option', { name: 'Child|Exact' }))
    } else {
      expect(useCharacterStore.getState().activeCharacter).toBe(character)
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
    }
    const reopened = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
    )
    expect([reopened.subrace, reopened.subraceSource]).toEqual([child.name, child.source])
    expect.soft(screen.queryByText('Normalized child details')).not.toBeNull()
    expect.soft(screen.queryByText('Other details')).toBeNull()
    const context = createCharacterCalculationContext(reopened, data.lookups!)
    expect.soft(context.raceResolution.subraceData).toBe(loaded.subraces[1])
    expect(context.abilityScores.racialBonuses.constitution).toBe(1)
    cleanup()
    render(
      <MemoryRouter>
        <BuildAbilityScoresPage />
      </MemoryRouter>,
    )
    expect.soft(screen.queryByTestId('race-ability-choices')).not.toBeNull()
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
    'sibling',
  ] as const)('opening the race summary with %s child metadata preserves the selection and shows saved bonuses', async (missing) => {
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
          {
            ...parent,
            subraces:
              missing === 'absent'
                ? []
                : missing === 'other-printing'
                  ? [{ ...child, source: 'OTHER' }]
                  : [{ ...child, name: 'Sibling' }],
          },
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
    if (missing === 'absent') {
      expect(screen.queryByRole('combobox', { name: 'Subrace' })).toBeNull()
    } else {
      const user = userEvent.setup()
      const selector = screen.getByRole('combobox', { name: 'Subrace' })
      expect(selector.textContent).toBe('Child')
      await user.click(selector)
      expect(screen.getAllByRole('option')).toHaveLength(1)
      expect(
        screen.getByRole('option', { name: missing === 'sibling' ? 'Sibling' : 'Child' }),
      ).toBeTruthy()
      await user.keyboard('{Escape}')
      expect(useCharacterStore.getState().activeCharacter).toBe(character)
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
      const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
      expect([reopened.subrace, reopened.subraceSource]).toEqual(['Child', 'TEST'])
    }
    act(() => {
      useGameDataStore.setState({ gameData: makeGameDataFixture({ races: [parent] }) })
    })
    expect(useCharacterStore.getState().activeCharacter).toBe(character)
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
    expect(screen.getByRole('combobox', { name: 'Subrace' }).textContent).toBe('Child')
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
