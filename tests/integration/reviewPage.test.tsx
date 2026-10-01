import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { CUSTOM_ORGANIZATION_KEY } from '@/lib/character/organizationConstants'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'

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
    const issueCount = within(screen.getByTestId('readiness-summary')).getAllByRole('button').length
    expect(screen.getByText(new RegExp(`^${issueCount} items? to review`))).toBeTruthy()
    expect(screen.getByText(/You can still save and print this character sheet/)).toBeTruthy()
    expect(screen.queryByText('Calculated totals')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Character overview' }))

    expect(screen.getByText('Proficiencies & skills').closest('details')?.open).toBe(true)
    expect(screen.getByText('Attacks & actions').closest('details')?.open).toBe(false)
    await user.click(screen.getByText('Attacks & actions'))
    expect(screen.getAllByText('Test Manual Action')).toHaveLength(2)
    expect(screen.getByText('+4 to hit')).toBeTruthy()
    await user.click(screen.getByText('Content sources'))
    expect(screen.getByText('Test Source')).toBeTruthy()
    expect(screen.getByText('walk 35 ft.')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: /Needs attention/ }))

    await user.click(screen.getByRole('button', { name: /Finish Test language choice/i }))
    expect(screen.getByText('Proficiency destination')).toBeTruthy()
    expect(screen.getByTestId('destination-search').textContent).toBe(
      '?attention=choice%3Atest-language-choice',
    )
  })

  test('moves keyboard focus between review tabs and labels the selected panel', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/build/review']}>
        <BuildReviewPage />
      </MemoryRouter>,
    )

    const attention = screen.getByRole('tab', { name: /Needs attention/ })
    attention.focus()
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([0, -1])

    await user.keyboard('{ArrowRight}')
    const overview = screen.getByRole('tab', { name: 'Character overview' })
    expect(document.activeElement).toBe(overview)
    expect(overview.getAttribute('aria-selected')).toBe('true')
    const panel = document.getElementById(overview.getAttribute('aria-controls')!)
    expect(panel?.getAttribute('role')).toBe('tabpanel')
    expect(panel?.getAttribute('aria-labelledby')).toBe(overview.id)
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([-1, 0])

    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(attention)
    expect(attention.getAttribute('aria-selected')).toBe('true')
  })

  test('shows the complete character snapshot in expandable gameplay sections', async () => {
    const user = userEvent.setup()
    const gameData = useGameDataStore.getState().gameData!
    const enrichedData = {
      ...gameData,
      organizations: [
        {
          name: 'The Harpers',
          source: 'TEST',
          description: 'A secret network of allies.',
          imagePath: 'assets/images/harpers.png',
        },
      ],
      feats: [{ name: 'Alert', source: 'TEST', entries: ['Always ready for danger.'] }],
      classFeatures: [
        {
          name: 'Second Wind',
          source: 'TEST',
          entries: ['Full feature details remain visible without truncation.'],
        },
      ],
      spells: [makeSpellFixture({ source: 'TEST', entries: ['Three glowing darts.'] })],
      items: [
        { name: 'Magic Wand', source: 'TEST', type: 'WD', entries: ['A carved wand.'] },
        { name: 'Choice Relic', source: 'TEST', type: 'W', entries: ['A chosen relic.'] },
      ],
    }
    enrichedData.lookups = buildGameDataLookups(enrichedData)
    useGameDataStore.setState({ gameData: enrichedData })

    const current = useCharacterStore.getState().activeCharacter!
    const character = {
      ...current,
      portrait: 'assets/images/characters/placeholder_char_card.jpg',
      hitPoints: { current: 7, temporary: 3 },
      details: {
        personality: 'Secret backstory should stay off the overview.',
        organizationSelectionKey: 'The Harpers|TEST',
      },
      proficiencies: { ...current.proficiencies, skills: ['perception'], languages: ['Common'] },
      features: [
        {
          id: 'feature-1',
          name: 'Second Wind',
          source: 'TEST',
          description: '',
        },
      ],
      feats: [{ id: 'feat-1', name: 'Alert', source: 'TEST', description: '' }],
      equipment: [
        {
          id: 'item-1',
          name: 'Magic Wand',
          source: 'TEST',
          type: 'WD',
          quantity: 1,
          equipped: true,
        },
      ],
      conditions: ['Poisoned'],
      classChoiceSelections: [
        {
          choiceId: 'choice-1',
          label: 'Fighting Style',
          kind: 'class-feature' as const,
          className: 'Test Class',
          classSource: 'TEST',
          classLevel: 1,
          selected: [],
        },
        {
          choiceId: 'choice-2',
          label: 'Relic choice',
          kind: 'item' as const,
          className: 'Test Class',
          classSource: 'TEST',
          classLevel: 1,
          selected: [
            { entityType: 'item' as const, name: 'Choice Relic', source: 'TEST', slotLevel: 1 },
          ],
        },
      ],
      spells: {
        ...current.spells,
        spellProfiles: current.spells.spellProfiles.map((profile) =>
          profile.type === 'special'
            ? { ...profile, spellsKnown: ['Magic Missile|TEST'] }
            : profile,
        ),
      },
    }
    useCharacterStore.setState({ characters: [character], activeCharacter: character })

    render(
      <MemoryRouter initialEntries={['/build/review?section=overview']}>
        <BuildReviewPage />
      </MemoryRouter>,
    )

    const portrait = screen.getByRole('img', {
      name: 'Test Character portrait',
    }) as HTMLImageElement
    expect(portrait.className).toContain('object-cover')
    expect(portrait.parentElement?.className).toContain('aspect-[3/2]')
    expect(portrait.style.transform).toBe('')
    expect(screen.getByText('Current HP').parentElement?.textContent).toContain('7')
    expect(screen.getByText('Temporary HP').parentElement?.textContent).toContain('3')
    expect(screen.getByText('Armor Class')).toBeTruthy()
    expect(screen.getByText('Common')).toBeTruthy()
    expect(screen.queryByText(/Secret backstory/)).toBeNull()
    for (const section of [
      'Attacks & actions',
      'Traits & features',
      'Feats',
      'Spells & spellcasting',
      'Equipment',
      'Resources & conditions',
      'Organization',
      'Rules & reminders',
      'Content sources',
    ]) {
      expect(screen.getByText(section).closest('details')?.open).toBe(false)
    }

    const featureSection = screen.getByText('Traits & features').closest('details')!
    expect(featureSection.open).toBe(false)
    await user.click(screen.getByText('Traits & features'))
    expect(featureSection.open).toBe(true)
    expect(screen.getByText('Full feature details remain visible without truncation.')).toBeTruthy()
    expect(screen.getByText('Fighting Style')).toBeTruthy()
    expect(screen.getByText('No option selected.')).toBeTruthy()
    expect(screen.getByText('A chosen relic.')).toBeTruthy()

    await user.click(screen.getByText('Feats'))
    expect(screen.getByText('Always ready for danger.')).toBeTruthy()
    await user.click(screen.getByText('Spells & spellcasting'))
    expect(screen.getAllByText('Three glowing darts.').length).toBeGreaterThan(0)
    await user.click(screen.getByText('Equipment'))
    expect(screen.getByText('A carved wand.')).toBeTruthy()
    await user.click(screen.getByText('Resources & conditions'))
    expect(screen.getByText('Poisoned')).toBeTruthy()
    await user.click(screen.getByText('Organization'))
    expect(screen.getByText('The Harpers')).toBeTruthy()
    expect(screen.getByText('A secret network of allies.')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'The Harpers emblem' })).toBeTruthy()

    const restrictedCharacter = { ...character, allowedSources: ['OTHER'] }
    await act(() => {
      useCharacterStore.setState({
        activeCharacter: restrictedCharacter,
        characters: [restrictedCharacter],
      })
    })
    expect(screen.getAllByText(/Source unavailable/).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('Always ready for danger.')).toBeTruthy()
    expect(screen.getAllByText('Three glowing darts.').length).toBeGreaterThan(0)
    expect(screen.getByText('A carved wand.')).toBeTruthy()
  })

  test('shows custom organization details and falls back to an icon if its image fails', async () => {
    const user = userEvent.setup()
    const current = useCharacterStore.getState().activeCharacter!
    const character = {
      ...current,
      details: {
        ...current.details,
        organizationSelectionKey: CUSTOM_ORGANIZATION_KEY,
        organizationCustomName: 'The Lantern Circle',
        organizationCustomDescription: 'A local group of night watch volunteers.',
        organizationCustomImage: 'data:image/png;base64,custom-emblem',
      },
    }
    useCharacterStore.setState({ characters: [character], activeCharacter: character })

    render(
      <MemoryRouter initialEntries={['/build/review?section=overview']}>
        <BuildReviewPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByText('Organization'))
    expect(screen.getByText('The Lantern Circle')).toBeTruthy()
    expect(screen.getByText('A local group of night watch volunteers.')).toBeTruthy()
    const emblem = screen.getByRole('img', { name: 'The Lantern Circle emblem' })
    expect(emblem.getAttribute('src')).toBe('data:image/png;base64,custom-emblem')
    const iconContainer = emblem.parentElement
    fireEvent.error(emblem)
    expect(screen.queryByRole('img', { name: 'The Lantern Circle emblem' })).toBeNull()
    expect(iconContainer?.querySelector('svg')).not.toBeNull()
  })

  test('shows unnamed custom organization details under the editor fallback title', async () => {
    const user = userEvent.setup()
    const current = useCharacterStore.getState().activeCharacter!
    const character = {
      ...current,
      details: {
        ...current.details,
        faction: 'Old Faction',
        organizationSelectionKey: CUSTOM_ORGANIZATION_KEY,
        organizationCustomName: '',
        organizationCustomDescription: 'A group without a name yet.',
        organizationCustomImage: 'data:image/png;base64,custom-emblem',
      },
    }
    useCharacterStore.setState({ characters: [character], activeCharacter: character })

    render(
      <MemoryRouter initialEntries={['/build/review?section=overview']}>
        <BuildReviewPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByText('Organization'))
    expect(screen.getByText('Custom Organization')).toBeTruthy()
    expect(screen.getByText('A group without a name yet.')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Custom Organization emblem' })).toBeTruthy()
    expect(screen.queryByText('Old Faction')).toBeNull()
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
