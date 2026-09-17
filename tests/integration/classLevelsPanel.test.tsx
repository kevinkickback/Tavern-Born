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
    spellByReference: new Map(),
    appliedAsiChoicesForClass: [],
    classAsiFeats: [],
    asiModeByLevel: {},
    usedASI: 0,
    totalASIAcrossClasses: 1,
    classChoices: [],
    classChoiceDiagnostics: [],
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

  test('renders replacement without an empty choose action at replacement-only levels', () => {
    const onOpenSpellSwap = vi.fn()
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Bard', source: 'PHB', levels: 12 }],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Bard|PHB',
            type: 'class',
            label: 'Bard (Lv 12)',
            className: 'Bard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Charm Person'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
    })
    render(
      <BuildClassLevelsPanel
        {...makeProps({
          character,
          classProgression: character.classProgression ?? [],
          selectedClassTab: 'Bard|PHB',
          viewingClass: 'Bard',
          viewingClassSource: 'PHB',
          viewingClassLevel: 12,
          levelsToShow: [12],
          asiLevels: [],
          spellChoicesByLevel: new Map([
            [12, { cantrips: 0, spells: 0, maxSpellLevel: 6, canSwap: true }],
          ]),
          onOpenSpellSwap,
        })}
      />,
    )

    fireEvent.click(screen.getByText('Level 12 Features'))
    expect(screen.getByText('Spell Replacement')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Choose' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Replace at level 12' }))
    expect(onOpenSpellSwap).toHaveBeenCalledWith(12)
  })

  test('does not count a retained unavailable class option as complete', () => {
    render(
      <BuildClassLevelsPanel
        {...makeProps({
          levelsToShow: [1],
          asiLevels: [],
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
              options: [],
              repeatable: false,
              replacement: { cadence: 'never' },
              source: { kind: 'class-feature-options', field: 'fixture' },
            },
          ],
          selectedClassChoiceViewsById: new Map([
            [
              'class:any|hb|choice:path|1',
              [
                {
                  availability: 'retained',
                  reference: {
                    entityType: 'classFeature',
                    name: 'Archived Path',
                    source: 'OLD',
                  },
                  entries: [],
                },
              ],
            ],
          ]),
        })}
      />,
    )

    const badge = screen.getByText(/1 choice/).closest('[data-slot="badge"]')
    expect(badge?.className).toContain('text-warning')
    fireEvent.click(screen.getByText('Level 1 Features'))
    expect(screen.getByText(/Unavailable/)).toBeTruthy()
  })

  test('focuses only the exact feature-owned diagnostic targeted from Review', async () => {
    const { container } = render(
      <BuildClassLevelsPanel
        {...makeProps({
          levelsToShow: [1, 2],
          asiLevels: [],
          focusLevel: 2,
          readinessFocus: 'class-choice-diagnostic:Artificer|PHB:Second Training:invalid-count',
          featuresByLevel: new Map([
            [1, [{ name: 'First Training', source: 'PHB', entries: ['First details'] }]],
            [2, [{ name: 'Second Training', source: 'PHB', entries: ['Second details'] }]],
          ]),
          classChoiceDiagnostics: [
            {
              code: 'invalid-count',
              className: 'Artificer',
              classSource: 'PHB',
              featureName: 'First Training',
              level: 1,
              message: 'First diagnostic',
            },
            {
              code: 'invalid-count',
              className: 'Artificer',
              classSource: 'PHB',
              featureName: 'Second Training',
              level: 2,
              message: 'Second diagnostic',
            },
          ],
        })}
      />,
    )

    await screen.findByText('Second Training')
    expect(container.querySelectorAll('.animate-route-focus')).toHaveLength(1)
    expect(screen.getByText(/No rule was guessed/).closest('.animate-route-focus')).toBeTruthy()
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
