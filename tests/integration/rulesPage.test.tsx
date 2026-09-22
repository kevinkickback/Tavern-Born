import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RulesPage } from '@/pages/rules/RulesPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

const contentAwareClasses = [
  makeClassFixture({
    name: 'Wizard',
    source: 'PHB',
    subclasses: [
      {
        name: 'Bladesinger',
        shortName: 'Bladesinger',
        source: 'SCAG',
        className: 'Wizard',
        classSource: 'PHB',
      },
    ],
  }),
  makeClassFixture({
    name: 'Barbarian',
    source: 'PHB',
    subclasses: [
      {
        name: 'Battlerager',
        shortName: 'Battlerager',
        source: 'SCAG',
        className: 'Barbarian',
        classSource: 'PHB',
      },
    ],
  }),
]

describe('RulesPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <RulesPage />
      </MemoryRouter>,
    )

  beforeEach(() => {
    const character = makeCharacterFixture({
      originSystem: '2014',
      allowedSources: ['PHB', 'SCAG', 'TCE'],
      variantRules: {
        abilityScoreMethod: 'point-buy',
        averageHitPoints: true,
        optionalClassFeatures: false,
        anyRaceSubclasses: false,
        preferNewerPrintings: true,
        ignoreEquipRestrictions: false,
      },
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        classes: contentAwareClasses,
        classFeatures: [
          {
            name: 'Cantrip Formulas',
            source: 'TCE',
            isClassFeatureVariant: true,
          },
        ],
      }),
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    useGameDataStore.setState({ gameData: null })
  })

  test('shows each Character Rules section in a settings-style tab', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    expect(screen.getByRole('alert').className).toContain('border-warning/35')
    expect(screen.getByRole('alert').className).toContain('bg-warning/10')
    expect(screen.getByRole('tablist', { name: 'Rules category' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Ruleset',
      'Character Options',
    ])
    expect(screen.getByRole('tab', { name: 'Ruleset' }).getAttribute('aria-selected')).toBe('true')
    expect(container.querySelectorAll('[data-slot="rules-section"]')).toHaveLength(1)
    expect(container.querySelector('[data-slot="rules-section"]')?.className).toContain(
      'bg-workspace-pane',
    )
    expect(screen.getByText('5e Legacy (2014)')).toBeTruthy()
    expect(screen.getByText('Fixed').className).toContain('bg-accent')

    await user.click(screen.getByRole('tab', { name: 'Character Options' }))

    expect(screen.getByLabelText('Average Hit Points')).toBeTruthy()
    expect(screen.getByLabelText('Optional Class Features')).toBeTruthy()
    expect(screen.getByLabelText('Any-Race Subclasses')).toBeTruthy()
    expect(screen.getByLabelText('Ignore Equipment Restrictions')).toBeTruthy()
    expect(screen.getByText('Creation & Advancement')).toBeTruthy()
    expect(screen.getByText('Option Restrictions')).toBeTruthy()
    expect(container.querySelectorAll('[data-slot="rules-section"]')).toHaveLength(2)
  })

  test('updates rules on the active character without replacing existing choices', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'Character Options' }))

    await user.click(screen.getByLabelText('Average Hit Points'))
    await user.click(screen.getByLabelText('Optional Class Features'))
    await user.click(screen.getByLabelText('Any-Race Subclasses'))
    await user.click(screen.getByRole('button', { name: /Custom/ }))

    expect(useCharacterStore.getState().activeCharacter?.variantRules).toEqual(
      expect.objectContaining({
        averageHitPoints: false,
        optionalClassFeatures: true,
        anyRaceSubclasses: true,
        abilityScoreMethod: 'custom',
      }),
    )
  })

  test('switches active replacement grants while preserving the dormant choice', async () => {
    const original = {
      id: 'original-training',
      label: 'Original Training',
      kind: 'class-feature' as const,
      owner: {
        type: 'class' as const,
        name: 'Fighter',
        source: 'PHB',
        featureName: 'Original Training',
      },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
      options: [{ entityType: 'classFeature' as const, name: 'Guard Training', source: 'PHB' }],
      repeatable: false,
      replacement: { cadence: 'never' as const },
      source: { kind: 'class-feature-options' as const, field: 'original' },
    }
    const variant = {
      ...original,
      id: 'replacement-training',
      label: 'Replacement Training',
      owner: { ...original.owner, featureName: 'Replacement Training' },
      options: [{ entityType: 'classFeature' as const, name: 'Scholar Training', source: 'TCE' }],
      featureVariant: { replacesFeatureName: 'Original Training' },
      source: { kind: 'class-feature-options' as const, field: 'variant' },
    }
    const fighter = makeClassFixture({
      name: 'Fighter',
      source: 'PHB',
      classFeatures: [],
      classFeatureRefs: [],
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [original, variant],
        choiceDiagnostics: [],
      },
    })
    const character = makeCharacterFixture({
      classChoiceSelections: [
        {
          choiceId: original.id,
          label: original.label,
          kind: original.kind,
          className: 'Fighter',
          classSource: 'PHB',
          classLevel: 1,
          selected: [{ ...original.options[0], slotLevel: 1 }],
        },
        {
          choiceId: variant.id,
          label: variant.label,
          kind: variant.kind,
          inactive: true,
          className: 'Fighter',
          classSource: 'PHB',
          classLevel: 1,
          selected: [{ ...variant.options[0], slotLevel: 1 }],
        },
      ],
      features: [
        {
          id: 'class-choice:original-training:guard-training',
          name: 'Guard Training',
          source: 'PHB',
          description: '',
          level: 1,
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        classes: [fighter],
        classFeatures: [
          { name: 'Replacement Training', source: 'TCE', isClassFeatureVariant: true },
        ],
      }),
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Character Options' }))

    await user.click(screen.getByLabelText('Optional Class Features'))

    let updated = useCharacterStore.getState().activeCharacter
    expect(updated?.features.map((feature) => feature.name)).toEqual(['Scholar Training'])
    expect(
      updated?.classChoiceSelections?.find((selection) => selection.choiceId === original.id)
        ?.inactive,
    ).toBe(true)
    expect(
      updated?.classChoiceSelections?.find((selection) => selection.choiceId === variant.id)
        ?.inactive,
    ).toBeUndefined()

    await user.click(screen.getByLabelText('Optional Class Features'))

    updated = useCharacterStore.getState().activeCharacter
    expect(updated?.features.map((feature) => feature.name)).toEqual(['Guard Training'])
    expect(
      updated?.classChoiceSelections?.find((selection) => selection.choiceId === original.id)
        ?.inactive,
    ).toBeUndefined()
    expect(
      updated?.classChoiceSelections?.find((selection) => selection.choiceId === variant.id)
        ?.inactive,
    ).toBe(true)
  })

  test('disables rules that have no matching content', async () => {
    const user = userEvent.setup()
    useGameDataStore.setState({ gameData: makeGameDataFixture() })
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'Character Options' }))

    expect((screen.getByLabelText('Optional Class Features') as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      screen.getByText(
        'No optional or replacement class features are available from your selected content.',
      ),
    ).toBeTruthy()

    expect((screen.getByLabelText('Any-Race Subclasses') as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByText('No race-restricted subclasses are available from your selected content.'),
    ).toBeTruthy()
  })
})
