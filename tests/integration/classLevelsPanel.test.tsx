import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BuildClassLevelsPanel } from '@/pages/build/class/components/LevelsPanel'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

afterEach(cleanup)

function makeProps(
  overrides: Partial<ComponentProps<typeof BuildClassLevelsPanel>> = {},
): ComponentProps<typeof BuildClassLevelsPanel> {
  const character = makeCharacterFixture({
    class: 'Artificer',
    classSource: 'PHB',
    level: 4,
    classProgression: [{ name: 'Artificer', source: 'PHB', levels: 4 }],
  })

  return {
    classProgression: character.classProgression ?? [],
    selectedClassTab: 'Artificer|PHB',
    onSelectClassTab: vi.fn(),
    character,
    levelsToShow: [4],
    subclassLevel: -1,
    asiLevels: [4],
    spellChoicesByLevel: new Map(),
    featuresByLevel: new Map(),
    subclassFeatureName: null,
    selectedFeature: null,
    detailCollapsed: false,
    viewingClass: 'Artificer',
    viewingClassSource: 'PHB',
    viewingClassLevel: 4,
    classEquipmentBlockChoices: [],
    feats: [],
    spellByName: new Map(),
    appliedAsiChoicesForClass: [],
    classAsiFeats: [],
    asiModeByLevel: {},
    usedASI: 0,
    totalASIAcrossClasses: 1,
    classChoices: [],
    classChoiceDiagnostics: [],
    classChoiceSelectionById: new Map(),
    selectedClassChoiceViewsById: new Map(),
    onOpenClassPicker: vi.fn(),
    onOpenSubclassPicker: vi.fn(),
    onOpenSpellPicker: vi.fn(),
    onOpenSpellSwap: vi.fn(),
    onOpenFeatPicker: vi.fn(),
    onOpenAsiPicker: vi.fn(),
    onOpenClassChoice: vi.fn(),
    onBlockChoiceChange: vi.fn(),
    onSelectFeature: vi.fn(),
    onExpandDetails: vi.fn(),
    onAsiReset: vi.fn(),
    onSetAsiModeByLevel: vi.fn(),
    onClearFeatSelectionsForAsi: vi.fn(),
    getOrdinalForm: (value) => `${value}th`,
    ...overrides,
  }
}

describe('BuildClassLevelsPanel', () => {
  test('opens and highlights the advancement control targeted from Review', async () => {
    render(
      <BuildClassLevelsPanel
        {...makeProps({
          focusLevel: 4,
          readinessFocus: 'class:asi:Artificer|PHB:4',
        })}
      />,
    )

    const label = await screen.findByText('Ability Score Improvement')
    expect(label.closest('.rounded-lg')?.className).toContain('animate-route-focus')
  })

  test('marks the level choice badge complete only after its ASI choice is resolved', () => {
    const { rerender } = render(<BuildClassLevelsPanel {...makeProps()} />)

    const incompleteBadge = screen.getByText(/1 choice/).closest('[data-slot="badge"]')
    expect(incompleteBadge?.className).toContain('text-warning')

    rerender(
      <BuildClassLevelsPanel
        {...makeProps({
          appliedAsiChoicesForClass: [
            {
              id: 'asi-Artificer-PHB-4',
              className: 'Artificer',
              classSource: 'PHB',
              level: 4,
              abilityChanges: { intelligence: 2 },
            },
          ],
        })}
      />,
    )

    const completeBadge = screen.getByText(/1 choice/).closest('[data-slot="badge"]')
    expect(completeBadge?.className).toContain('text-success')
    expect(completeBadge?.querySelector('svg')).toBeTruthy()
  })

  test('surfaces required normalized choices and unsafe source-data diagnostics', () => {
    const onOpenClassChoice = vi.fn()
    const onSelectFeature = vi.fn()
    render(
      <BuildClassLevelsPanel
        {...makeProps({
          levelsToShow: [1, 2, 4],
          featuresByLevel: new Map([
            [1, [{ name: 'Training Path', source: 'PHB', entries: ['Training details'] }]],
            [2, [{ name: 'Unresolved Training', source: 'PHB', entries: ['More details'] }]],
          ]),
          classChoices: [
            {
              id: 'class:any|hb|choice:path|1',
              label: 'Training Path',
              kind: 'class-feature',
              owner: {
                type: 'class',
                name: 'Artificer',
                source: 'PHB',
                featureName: 'Training Path',
                featureSource: 'PHB',
              },
              level: 1,
              minimumSelections: 1,
              maximumSelections: 1,
              selectionCountByLevel: Array(20).fill(1),
              options: [{ entityType: 'classFeature', name: 'First Path', source: 'PHB' }],
              repeatable: false,
              replacement: { cadence: 'never' },
              source: { kind: 'class-feature-options', field: 'fixture' },
            },
          ],
          classChoiceDiagnostics: [
            {
              code: 'invalid-count',
              className: 'Artificer',
              classSource: 'PHB',
              featureName: 'Unresolved Training',
              level: 2,
              message: 'Fixture diagnostic',
            },
          ],
          onOpenClassChoice,
          onSelectFeature,
        })}
      />,
    )

    expect(screen.queryByText('Required Choices')).toBeNull()
    fireEvent.click(screen.getByText('Level 1 Features'))
    expect(screen.getByText('Training Path')).toBeTruthy()
    expect(screen.getAllByText('Training Path')).toHaveLength(1)
    fireEvent.click(screen.getByText('Training Path'))
    expect(onSelectFeature).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Training Path', entries: ['Training details'] }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
    expect(onOpenClassChoice).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Training Path' }),
    )

    fireEvent.click(screen.getByText('Level 2 Features'))
    expect(screen.getByText('Unresolved Training')).toBeTruthy()
    expect(screen.getByText(/No rule was guessed/)).toBeTruthy()
  })
})
