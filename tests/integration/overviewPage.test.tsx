import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import type { CharacterReadinessIssue } from '@/lib/readiness/types'
import { BuildBackgroundPage } from '@/pages/build/background/BackgroundPage'
import { OverviewAttention } from '@/pages/build/overview/OverviewAttention'
import { BuildOverviewPage as OverviewPage } from '@/pages/build/overview/OverviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeSpellFixture,
} from '../fixtures/gameDataFixtures'

function BuildOverviewPage() {
  return (
    <RulesPreviewManager>
      <OverviewPage />
    </RulesPreviewManager>
  )
}

describe('BuildOverviewPage', () => {
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

  test('formats derived overview labels without rewriting the saved proficiencies', async () => {
    const current = useCharacterStore.getState().activeCharacter!
    const character = {
      ...current,
      proficiencies: {
        ...current.proficiencies,
        languages: ['deep speech', 'Draconic (SRD)', 'iSpeak (NPC)'],
      },
    }
    useCharacterStore.setState({ activeCharacter: character })
    render(
      <MemoryRouter>
        <BuildOverviewPage />
      </MemoryRouter>,
    )

    await userEvent.setup().click(screen.getByText('Proficiencies & skills', { exact: true }))
    expect(screen.getByText('Deep Speech, Draconic (SRD), iSpeak (NPC)')).toBeTruthy()
    expect(screen.getByTestId('overview-movement-walk').textContent).toBe('Walk 35 ft.')
    expect(screen.getByText(/Strength \+2/)).toBeTruthy()
    expect(useCharacterStore.getState().activeCharacter).toBe(character)
  })

  test('shares the Background equipment picker and updates readiness from Overview', async () => {
    const user = userEvent.setup()
    const current = useGameDataStore.getState().gameData!
    const gameData = {
      ...current,
      backgrounds: current.backgrounds.map((background) => ({
        ...background,
        startingEquipment: [{ a: [{ value: 100 }], b: [{ value: 200 }] }],
      })),
    }
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })
    const saved = useCharacterStore.getState().activeCharacter!
    const before = { ...saved, background: ` ${saved.background} `, backgroundSource: ' TEST ' }
    useCharacterStore.setState({ activeCharacter: before, characters: [before] })

    render(
      <TooltipProvider>
        <MemoryRouter initialEntries={['/build/overview']}>
          <Routes>
            <Route path="/build/overview" element={<BuildOverviewPage />} />
            <Route path="/build/background" element={<BuildBackgroundPage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Choose equipment here' })
    expect(screen.getByRole('link', { name: 'Open Background' }).getAttribute('href')).toBe(
      '/build/background?attention=starting-equipment%3Abackground',
    )
    await user.click(trigger)
    const dialog = () =>
      within(screen.getByRole('dialog', { name: 'Background starting equipment' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(useCharacterStore.getState().activeCharacter).toBe(before)
    await user.click(trigger)
    await user.click(dialog().getByRole('tab', { name: 'Package B' }))
    expect(dialog().getByText('Equipment choice resolved.')).toBeTruthy()
    await user.click(dialog().getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('button', { name: 'Choose equipment here' })).toBeNull()
    expect(useCharacterStore.getState().activeCharacter?.backgroundEquipmentChoices).toEqual(['b'])
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Needs attention' }))
  })

  test('links to Background from the full setup list when fixed equipment rules are missing', async () => {
    const user = userEvent.setup()
    const current = useGameDataStore.getState().gameData!
    const gameData = {
      ...current,
      backgrounds: current.backgrounds.map((background) => ({
        ...background,
        startingEquipment: [{ _: [{ item: 'Unavailable Item|TEST' }] }],
      })),
    }
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })
    render(
      <MemoryRouter>
        <BuildOverviewPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /View all .* actions/ }))
    const setup = within(screen.getByRole('dialog', { name: 'Character setup' }))
    expect(setup.getByText(/Restore the exact item rules for unavailable item/i)).toBeTruthy()
    expect(setup.queryByRole('button', { name: 'Choose equipment here' })).toBeNull()
    expect(setup.getByRole('link', { name: /^Finish Background starting equipment/ })).toBeTruthy()
  })

  test('confirms a fixed package application while the Overview dialog stays open', async () => {
    const user = userEvent.setup()
    const current = useGameDataStore.getState().gameData!
    const gameData = {
      ...current,
      backgrounds: current.backgrounds.map((background) => ({
        ...background,
        startingEquipment: [{ _: [{ value: 100 }] }],
      })),
    }
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <BuildOverviewPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Choose equipment here' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Background starting equipment' }))
    await user.click(dialog.getByRole('button', { name: 'Apply current package' }))
    expect(dialog.getByText('Equipment choice resolved.')).toBeTruthy()
    expect(dialog.queryByText(/rules are unavailable/)).toBeNull()
  })

  test('shows one additional-content note on Overview until the exact rules return', async () => {
    const exact = useGameDataStore.getState().gameData!
    const other = { ...exact, races: exact.races.map((race) => ({ ...race, source: 'OTHER' })) }
    other.lookups = buildGameDataLookups(other)
    const character = useCharacterStore.getState().activeCharacter!
    const filteredCharacter = { ...character, allowedSources: ['OTHER'] }
    useCharacterStore.setState({ activeCharacter: filteredCharacter })
    useGameDataStore.setState({ gameData: other })
    render(
      <MemoryRouter>
        <BuildOverviewPage />
      </MemoryRouter>,
    )

    const note = () => screen.getByRole('complementary', { name: 'Unavailable saved content' })
    expect(within(note()).getByText('Additional content')).toBeTruthy()
    expect(note().textContent).toContain('Your choices are still saved')
    expect(
      screen.getAllByRole('complementary', { name: 'Unavailable saved content' }),
    ).toHaveLength(1)
    expect(screen.getByRole('heading', { name: filteredCharacter.name })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Setup items' })).toBeTruthy()
    await act(() => useGameDataStore.setState({ gameData: exact }))
    expect(screen.queryByRole('complementary', { name: 'Unavailable saved content' })).toBeNull()
    expect(useCharacterStore.getState().activeCharacter).toBe(filteredCharacter)
  })

  test('keeps equipment details source-qualified across catalog removal and restoration', async () => {
    const user = userEvent.setup()
    const base = useGameDataStore.getState().gameData!
    const first = {
      name: 'Review Relic',
      source: 'TEST',
      type: 'WO',
      entries: ['Exact review rules.'],
    }
    const other = { ...first, source: 'OTHER', entries: ['Other printing rules.'] }
    const publish = (includeExact: boolean) => {
      const data = { ...base, items: includeExact ? [first, other] : [other] }
      data.lookups = buildGameDataLookups(data)
      useGameDataStore.setState({ gameData: data })
    }
    publish(true)
    const current = useCharacterStore.getState().activeCharacter!
    const character = {
      ...current,
      equipment: [
        {
          id: 'exact-relic',
          name: first.name,
          source: first.source,
          type: 'WO',
          quantity: 1,
          equipped: true,
          description: 'Saved review fallback.',
        },
        {
          id: 'missing-relic',
          name: first.name,
          source: 'MISSING',
          type: 'WO',
          quantity: 1,
          equipped: false,
          description: 'Unavailable saved rules.',
        },
      ],
    }
    useCharacterStore.setState({ characters: [character], activeCharacter: character })
    const unchanged = JSON.stringify(character)
    render(
      <MemoryRouter initialEntries={['/build/overview']}>
        <BuildOverviewPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('Equipment'))
    await user.click(screen.getByRole('button', { name: /^Review Relic ×1, MISSING/ }))
    expect(screen.getByText('Unavailable saved rules.')).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /^Review Relic ×1, TEST/ }))
    expect(screen.getByText('Exact review rules.')).toBeTruthy()
    expect(screen.queryByText('Other printing rules.')).toBeNull()
    await user.keyboard('{Escape}')
    await act(() => publish(false))
    await user.click(screen.getByRole('button', { name: /^Review Relic ×1, TEST/ }))
    expect(screen.queryByText('Exact review rules.')).toBeNull()
    expect(screen.getByText('Saved review fallback.')).toBeTruthy()
    expect(screen.queryByText('Other printing rules.')).toBeNull()
    await user.keyboard('{Escape}')
    await act(() => publish(true))
    await user.click(screen.getByRole('button', { name: /^Review Relic ×1, TEST/ }))
    expect(screen.getByText('Exact review rules.')).toBeTruthy()
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(unchanged)
  })

  test('shows character details alongside readiness and preserves issue links', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/build/overview']}>
        <Routes>
          <Route path="/build/overview" element={<BuildOverviewPage />} />
          <Route path="/build/proficiencies" element={<ProficiencyDestination />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Test Character' })).toBeTruthy()
    const issues = within(screen.getByRole('list', { name: 'Setup items' }))
    const blocked = issues.getByRole('link', { name: /Finish Test language choice/i })
    expect(within(blocked).queryByText('Needs attention')).toBeNull()
    expect(issues.queryByText('Suggestion', { exact: true })).toBeNull()
    expect(blocked.querySelectorAll('svg')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /View all .* actions/ }))
    const fullList = within(screen.getByRole('dialog', { name: 'Character setup' }))
    const suggestion = fullList.getByRole('link', { name: /Add a portrait/i })
    expect(within(suggestion).getByText('Suggestion')).toBeTruthy()
    expect(suggestion.querySelectorAll('svg')).toHaveLength(1)
    await user.keyboard('{Escape}')

    expect(screen.getByText('Proficiencies & skills').closest('details')?.open).toBe(false)
    expect(screen.getByText('Attacks & actions').closest('details')?.open).toBe(false)
    await user.click(screen.getByText('Attacks & actions'))
    expect(screen.getAllByText('Test Manual Action')).toHaveLength(2)
    expect(screen.getByText('+4 to hit')).toBeTruthy()
    await user.click(screen.getByText('Content sources'))
    expect(screen.getByText('Test Source').closest('li')?.textContent).toContain('TEST')
    expect(screen.queryByText('Rules & reminders')).toBeNull()
    expect(screen.getByText('Walk 35 ft.')).toBeTruthy()

    await user.click(blocked)
    expect(screen.getByText('Proficiency destination')).toBeTruthy()
    expect(screen.getByTestId('destination-search').textContent).toBe(
      '?attention=choice%3Atest-language-choice',
    )
  })

  test('keeps required work in the preview when a suggestion precedes a blocker', async () => {
    const user = userEvent.setup()
    const character = useCharacterStore.getState().activeCharacter!
    const blockingIssues: CharacterReadinessIssue[] = [
      'Choose a class',
      'Finish point buy',
      'Choose a skill',
      'Restore unavailable equipment',
    ].map((title, index) => ({
      id: `blocking-${index}`,
      severity: 'blocking',
      section: 'equipment',
      title,
      explanation: 'This choice is required.',
      navigationTarget: '/equipment',
    }))
    const recommendation: CharacterReadinessIssue = {
      id: 'prepare-spells',
      severity: 'recommendation',
      section: 'spells',
      title: 'Prepare spells',
      explanation: 'This choice is optional.',
      navigationTarget: '/spells',
    }
    render(
      <MemoryRouter>
        <OverviewAttention
          character={character}
          background={undefined}
          readiness={{
            status: 'incomplete',
            issues: [...blockingIssues.slice(0, 3), recommendation, blockingIssues[3]],
            blockingIssues,
            recommendations: [recommendation],
          }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Restore unavailable equipment/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Prepare spells/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'View all 5 actions' }))
    const complete = within(screen.getByRole('dialog', { name: 'Character setup' }))
    expect(complete.getByRole('link', { name: /Prepare spells/ })).toBeTruthy()
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
        { name: 'Magic Wand', source: 'TEST', type: 'WD', weight: 1, entries: ['A carved wand.'] },
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
      proficiencies: {
        ...current.proficiencies,
        skills: ['perception', 'investigation'],
        expertise: ['investigation'],
        languages: ['Common'],
      },
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
          rarity: 'none',
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
      <MemoryRouter initialEntries={['/build/overview']}>
        <BuildOverviewPage />
      </MemoryRouter>,
    )

    const portrait = screen.getByRole('img', {
      name: 'Test Character portrait',
    }) as HTMLImageElement
    expect(portrait.className).toContain('object-cover')
    expect(portrait.style.transform).toBe('')
    expect(screen.queryByText('Current HP')).toBeNull()
    expect(screen.queryByText('Temp HP')).toBeNull()
    const summary = within(screen.getByRole('region', { name: 'Character overview' }))
    const passives = within(summary.getByRole('region', { name: 'Passive scores' }))
    expect(passives.getByText('Passive:')).toBeTruthy()
    expect(passives.getByText('Perception 12')).toBeTruthy()
    expect(passives.getByText('Investigation 15')).toBeTruthy()
    expect(passives.getByText('Insight 10')).toBeTruthy()
    const armorCard = screen.getByText('Armor Class', { exact: true }).parentElement!
    const hpCard = screen.getByText('Max HP', { exact: true }).parentElement!
    expect(armorCard.nextElementSibling).toBe(hpCard)
    expect(within(armorCard).queryByRole('button')).toBeNull()
    expect(within(hpCard).queryByRole('button')).toBeNull()
    const manualAdjustments = within(
      screen.getByRole('complementary', { name: 'Manual Adjustments' }),
    )
    expect(
      screen.queryByRole('button', { name: /^Manage (Armor Class|Hit Points|Movement)$/ }),
    ).toBeNull()
    await user.click(manualAdjustments.getByRole('tab', { name: 'Stats' }))
    const stats = within(manualAdjustments.getByRole('tabpanel', { name: 'Stats' }))
    const armorButton = stats.getByRole('button', { name: 'Manage Armor Class' })
    const hpButton = stats.getByRole('button', { name: 'Manage Hit Points' })
    const movementButton = stats.getByRole('button', { name: 'Manage Movement' })
    await user.click(armorButton)
    expect(screen.getByRole('dialog', { name: 'Manage Armor Class' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(armorButton)
    await user.click(hpButton)
    const hp = within(screen.getByRole('dialog', { name: 'Manage Hit Points' }))
    expect((hp.getByLabelText('Current HP') as HTMLInputElement).value).toBe('7')
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(hpButton)
    await user.click(movementButton)
    expect(screen.getByRole('dialog', { name: 'Manage Movement' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(movementButton)
    const skillsSummary = screen.getByText('Proficiencies & skills', { exact: true })
    await user.click(skillsSummary)
    expect(within(skillsSummary.closest('details')!).queryByText(/Passive Perception/)).toBeNull()
    expect(screen.getByText('◆ Expertise · ● Proficient')).toBeTruthy()
    expect(screen.getByText('Common')).toBeTruthy()
    expect(screen.queryByText(/Secret backstory/)).toBeNull()
    for (const section of [
      'Attacks & actions',
      'Traits & features',
      'Feats',
      'Spells & spellcasting',
      'Equipment',
      'Resources & conditions',
      'Content sources',
    ]) {
      expect(screen.getByText(section).closest('details')?.open).toBe(false)
    }

    const featureSection = screen.getByText('Traits & features').closest('details')!
    expect(featureSection.open).toBe(false)
    await user.click(screen.getByText('Traits & features'))
    expect(featureSection.open).toBe(true)
    expect(screen.queryByText('Full feature details remain visible without truncation.')).toBeNull()
    await user.click(within(featureSection).getByRole('button', { name: 'Second Wind' }))
    expect(screen.getByText('Full feature details remain visible without truncation.')).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Fighting Style' }))
    expect(screen.getByText('No option selected.')).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Relic choice' }))
    expect(screen.getByText('A chosen relic.')).toBeTruthy()
    await user.keyboard('{Escape}')

    await user.click(screen.getByText('Feats'))
    await user.click(screen.getByRole('button', { name: 'Alert' }))
    expect(screen.getByText('Always ready for danger.')).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.click(screen.getByText('Spells & spellcasting'))
    await user.click(screen.getByRole('button', { name: 'Magic Missile' }))
    expect(screen.getByText('Three glowing darts.')).toBeTruthy()
    await user.keyboard('{Escape}')
    const attacksHeading = screen.getByText('Attacks & actions')
    await user.click(attacksHeading)
    const attacks = within(attacksHeading.closest('details')!)
    expect(attacks.queryByText('Magic Missile')).toBeNull()
    expect(attacks.getByText('Test action description.')).toBeTruthy()
    await user.click(screen.getByText('Equipment'))
    await user.click(screen.getByRole('button', { name: 'Magic Wand ×1' }))
    expect(screen.getByText('A carved wand.')).toBeTruthy()
    expect(screen.getByText('1 lb each')).toBeTruthy()
    expect(
      within(screen.getByRole('dialog', { name: 'Magic Wand ×1 preview' })).queryByText('None'),
    ).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(screen.getByText('Resources & conditions'))
    expect(screen.getByText('Poisoned')).toBeTruthy()
    expect(screen.queryByText('Organization')).toBeNull()

    const restrictedCharacter = { ...character, allowedSources: ['OTHER'] }
    await act(() => {
      useCharacterStore.setState({
        activeCharacter: restrictedCharacter,
        characters: [restrictedCharacter],
      })
    })
    for (const [name, description] of [
      ['Alert', 'Always ready for danger.'],
      ['Magic Missile', 'Three glowing darts.'],
      ['Magic Wand ×1', 'A carved wand.'],
    ]) {
      await user.click(screen.getByRole('button', { name }))
      const preview = within(await screen.findByRole('dialog', { name: `${name} preview` }))
      expect(preview.getByText(/Source unavailable/)).toBeTruthy()
      expect(preview.getByText(description)).toBeTruthy()
      await user.keyboard('{Escape}')
    }
  })

  test.each([
    ['2014', 'PHB'],
    ['2024', 'XPHB'],
  ] as const)('retains loaded subclass-choice details when their source is disabled and re-enabled for %s', async (originSystem, classSource) => {
    const feature = {
      name: 'Scholar Option',
      source: 'SUPP',
      level: 3,
      className: 'Wizard',
      classSource,
      subclassShortName: 'Scholar',
      subclassSource: 'SUPP',
      entries: ['Retained subclass option details.'],
    }
    const classData = makeClassFixture({
      source: classSource,
      subclasses: [
        {
          name: 'Scholar',
          shortName: 'Scholar',
          source: 'SUPP',
          className: 'Wizard',
          classSource,
          subclassFeatures: [feature],
        },
      ],
    })
    const data = makeGameDataFixture({
      classes: [classData],
      sources: [
        { name: 'Player Handbook', abbreviation: classSource, group: 'core' },
        { name: 'Supplement', abbreviation: 'SUPP', group: 'supplement' },
      ],
    })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    const character = makeCharacterFixture({
      originSystem,
      allowedSources: [classSource, 'SUPP'],
      classProgression: [
        {
          name: 'Wizard',
          source: classSource,
          levels: 3,
          subclass: 'Scholar',
          subclassSource: 'SUPP',
        },
      ],
      classChoiceSelections: [
        {
          choiceId: 'scholar-option',
          label: 'Scholar Choice',
          kind: 'subclass-feature',
          className: 'Wizard',
          classSource,
          classLevel: 3,
          subclassName: 'Scholar',
          subclassSource: 'SUPP',
          selected: [
            {
              entityType: 'subclassFeature',
              name: 'Scholar Option',
              source: 'SUPP',
              ref: `Scholar Option|Wizard|${classSource}|Scholar|SUPP|3|SUPP`,
              slotLevel: 3,
            },
            {
              entityType: 'subclassFeature',
              name: 'Unloaded Option',
              source: 'SUPP',
              ref: `Unloaded Option|Wizard|${classSource}|Scholar|SUPP|3|SUPP`,
              slotLevel: 3,
            },
          ],
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    render(
      <MemoryRouter initialEntries={['/build/overview']}>
        <BuildOverviewPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Traits & features'))
    const inspect = (restricted: boolean) => {
      fireEvent.click(screen.getByRole('button', { name: 'Scholar Choice' }))
      const preview = within(screen.getByRole('dialog', { name: 'Scholar Choice preview' }))
      expect(preview.getByText('Scholar Option (SUPP)')).toBeTruthy()
      expect(preview.getByText('Unloaded Option (SUPP)')).toBeTruthy()
      expect(preview.getByText('Retained subclass option details.')).toBeTruthy()
      expect(preview.getAllByText('Unresolved source')).toHaveLength(1)
      expect(!!preview.queryByText('Source unavailable')).toBe(restricted)
      fireEvent.keyDown(document.body, { key: 'Escape' })
    }
    inspect(false)
    await act(() => {
      const restricted = { ...character, allowedSources: [] }
      useCharacterStore.setState({ characters: [restricted], activeCharacter: restricted })
    })
    inspect(true)
    expect(useCharacterStore.getState().activeCharacter?.classChoiceSelections).toEqual(
      character.classChoiceSelections,
    )
    await act(() => {
      useCharacterStore.setState({ characters: [character], activeCharacter: character })
    })
    inspect(false)
    expect(useGameDataStore.getState().gameData).toBe(data)
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
