import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

describe('BuildReviewPage', () => {
  beforeEach(() => {
    const race = { name: 'Test Race', source: 'TEST', speed: 35 } as Race5e
    const testClass = {
      name: 'Test Class',
      source: 'TEST',
      hd: { faces: 8 },
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [],
        choiceDiagnostics: [],
      },
    } as Class5e
    const background = { name: 'Test Background', source: 'TEST' }
    const gameData = makeGameDataFixture({
      races: [race],
      classes: [testClass],
      backgrounds: [background],
      sources: [{ abbreviation: 'TEST', name: 'Test Source', group: 'Test' }],
    })
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })

    const character = makeCharacterFixture({
      name: 'Test Character',
      race: race.name,
      raceSource: race.source,
      classProgression: [{ name: testClass.name, source: testClass.source, levels: 1 }],
      background: background.name,
      backgroundSource: background.source,
      movement: {
        speeds: { walk: 35 },
        source: { kind: 'race', name: race.name, source: race.source },
      },
      allowedSources: ['TEST'],
      variantRules: { abilityScoreMethod: 'standard-array' },
      abilityScores: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
      manualActions: [
        {
          id: 'manual:test-action',
          name: 'Test Manual Action',
          kind: 'action',
          description: 'Test action description.',
          source: { kind: 'manual', name: 'Test Manual Action' },
          active: true,
          attackBonus: 4,
        },
      ],
      provenance: {
        ...makeCharacterFixture().provenance!,
        choices: [
          {
            id: 'test-language-choice',
            domain: 'languages',
            sourceTag: {
              sourceType: 'background',
              sourceName: background.name,
              sourceRef: background.source,
              grantType: 'choice',
              label: 'Test language choice',
            },
            chooseCount: 1,
            optionPool: ['Test Language'],
            selected: [],
            status: 'pending',
          },
        ],
      },
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  afterEach(() => {
    cleanup()
    useGameDataStore.setState({ gameData: null })
    vi.clearAllMocks()
  })

  test('separates attention items from the character overview and preserves issue links', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/build/review']}>
        <Routes>
          <Route path="/build/review" element={<BuildReviewPage />} />
          <Route path="/build/proficiencies" element={<ProficiencyDestination />} />
        </Routes>
      </MemoryRouter>,
    )

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Needs attention'),
      'Character overview',
    ])
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Character needs attention')).toBeTruthy()
    expect(screen.queryByText('Calculated totals')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Character overview' }))

    expect(screen.getAllByText('Test Manual Action')).toHaveLength(2)
    expect(screen.getByText('+4 to hit')).toBeTruthy()
    expect(screen.getByText('Test Source')).toBeTruthy()
    expect(screen.getByText('walk 35 ft.')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: /Needs attention/ }))

    await user.click(screen.getByRole('button', { name: /Finish Test language choice/i }))
    expect(screen.getByText('Proficiency destination')).toBeTruthy()
    expect(screen.getByTestId('destination-search').textContent).toBe(
      '?attention=choice%3Atest-language-choice',
    )
  })
})

function ProficiencyDestination() {
  const location = useLocation()
  return (
    <div>
      Proficiency destination
      <span data-testid="destination-search">{location.search}</span>
    </div>
  )
}
