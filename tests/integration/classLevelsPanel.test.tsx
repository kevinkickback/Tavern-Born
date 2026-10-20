import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { BuildClassLevelsPanel } from '@/pages/build/class/components/LevelsPanel'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

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
  test('dormant saved spell intent stays editable while only active choices count toward completion', () => {
    const fixture = makeManagedClassSpellFixtures()
    const initial = makeCharacterFixture({
      classProgression: [{ name: 'Bard', source: 'PHB', levels: 1 }],
    })
    const result = setManagedClassSpellChoiceCommand(
      initial,
      initial.provenance,
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    const character = { ...initial, ...result.characterPatch, provenance: result.provenanceUpdate }
    const props = makeProps({
      character,
      classProgression: character.classProgression,
      viewingClass: 'Bard',
      viewingClassSource: 'PHB',
      viewingClassLevel: 1,
      selectedClassTab: 'Bard|PHB',
      levelsToShow: [1],
      asiLevels: [],
      spellChoicesByLevel: new Map([
        [1, { cantrips: 2, spells: 4, maxSpellLevel: 1, canSwap: false }],
      ]),
      managedSpellStatuses: projectManagedClassSpellState(character, {
        ...fixture.context,
        spellsByKey: {},
      }).statuses,
    })
    const { rerender } = render(<BuildClassLevelsPanel {...props} />)
    expect(screen.getByText(/6 pending choices/)).toBeTruthy()
    fireEvent.click(
      screen.getByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' }),
    )
    expect(screen.getByText(/1 saved choice unavailable/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    rerender(
      <BuildClassLevelsPanel
        {...props}
        managedSpellStatuses={projectManagedClassSpellState(character, fixture.context).statuses}
      />,
    )
    expect(screen.getByText(/5 pending choices/)).toBeTruthy()
    expect(screen.queryByText(/saved choice unavailable/)).toBeNull()
  })
  test('shows the selected class icon, level and chosen subclass without a header details action', () => {
    const { rerender } = render(
      <BuildClassLevelsPanel
        {...makeProps({ viewingClass: 'Ranger', viewingClassLevel: 6, viewingSubclass: 'Hunter' })}
      />,
    )
    const header = screen.getByRole('region', { name: 'Selected class' })
    expect(within(header).getByRole('heading', { name: 'Ranger Level 6' })).toBeTruthy()
    expect(within(header).getByText('PHB · Hunter')).toBeTruthy()
    expect(header.querySelector('img')?.getAttribute('src')).toContain('/ranger.svg')
    expect(within(header).queryByRole('button')).toBeNull()
    expect(within(header).queryByRole('link')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Switch class' })).toBeNull()
    rerender(
      <BuildClassLevelsPanel
        {...makeProps({
          classProgression: [
            { name: 'Ranger', source: 'PHB', levels: 6 },
            { name: 'Rogue', source: 'PHB', levels: 1 },
          ],
          viewingClass: 'Rogue',
          viewingClassLevel: 1,
          viewingSubclass: undefined,
        })}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Switch class' })).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Selected class' })).queryByText(/Hunter/),
    ).toBeNull()
  })

  test('offers subclass selection at the encoded gain level rather than stale metadata', () => {
    const info = getSubclassSelectionInfo({
      name: 'Artificer',
      source: 'PHB',
      classFeatureRefs: [
        {
          ref: 'Specialty|Artificer||8',
          name: 'Specialty',
          className: 'Artificer',
          level: 4,
          gainSubclassFeature: true,
        },
      ],
    })
    const onOpenSubclassPicker = vi.fn()
    const { rerender } = render(
      <BuildClassLevelsPanel
        {...makeProps({
          ...info,
          asiLevels: [],
          onOpenSubclassPicker,
        })}
      />,
    )
    fireEvent.click(
      screen.getByText('Level 4', { selector: '[data-slot="accordion-trigger"] span' }),
    )
    expect(screen.queryByRole('button', { name: 'Choose' })).toBeNull()
    rerender(
      <BuildClassLevelsPanel
        {...makeProps({
          ...info,
          levelsToShow: [8],
          viewingClassLevel: 8,
          asiLevels: [],
          onOpenSubclassPicker,
        })}
      />,
    )
    fireEvent.click(
      screen.getByText('Level 8', { selector: '[data-slot="accordion-trigger"] span' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
    expect(onOpenSubclassPicker).toHaveBeenCalledOnce()
  })

  test('does not offer subclass selection when a marked reference has an invalid level', () => {
    const info = getSubclassSelectionInfo({
      name: 'Artificer',
      source: 'PHB',
      classFeatureRefs: [
        {
          ref: 'Specialty|Artificer||invalid',
          name: 'Specialty',
          className: 'Artificer',
          level: 4,
          gainSubclassFeature: true,
        },
      ],
    })
    render(<BuildClassLevelsPanel {...makeProps({ ...info, asiLevels: [] })} />)
    fireEvent.click(
      screen.getByText('Level 4', { selector: '[data-slot="accordion-trigger"] span' }),
    )
    expect(screen.queryByRole('button', { name: 'Choose' })).toBeNull()
    expect(screen.queryByText('Subclass')).toBeNull()
  })

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
    await waitFor(() =>
      expect(label.closest('.rounded-lg')?.className).toContain('animate-route-focus'),
    )
  })

  test('marks the level choice badge complete only after its ASI choice is resolved', () => {
    const { rerender } = render(<BuildClassLevelsPanel {...makeProps()} />)

    const incompleteBadge = screen.getByText(/1 pending choice/).closest('[data-slot="badge"]')
    expect(incompleteBadge?.className).toContain('text-warning-foreground')

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

    const completeBadge = screen.getByText('All choices made').closest('[data-slot="badge"]')
    expect(completeBadge?.className).toContain('text-success')
    expect(completeBadge?.querySelector('svg')).toBeTruthy()
  })

  test('a level without a numeric gain does not invent a replacement event', () => {
    render(
      <BuildClassLevelsPanel
        {...makeProps({
          levelsToShow: [12],
          viewingClassLevel: 12,
          asiLevels: [],
          spellChoicesByLevel: new Map(),
        })}
      />,
    )
    fireEvent.click(
      screen.getByText('Level 12', { selector: '[data-slot="accordion-trigger"] span' }),
    )
    expect(screen.queryByText('Spell Replacement')).toBeNull()
    expect(screen.queryByText('Replace a spell')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Choose' })).toBeNull()
  })
  test('offers required numeric choices without an unimplemented replacement event', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Sorcerer', source: 'PHB', levels: 2 }],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Sorcerer|PHB',
            type: 'class',
            label: 'Sorcerer (Lv 2)',
            className: 'Sorcerer',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Chromatic Orb'],
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
          classProgression: character.classProgression,
          selectedClassTab: 'Sorcerer|PHB',
          viewingClass: 'Sorcerer',
          viewingClassSource: 'PHB',
          viewingClassLevel: 2,
          levelsToShow: [2],
          asiLevels: [],
          spellChoicesByLevel: new Map([
            [2, { cantrips: 0, spells: 1, maxSpellLevel: 1, canSwap: true }],
          ]),
        })}
      />,
    )

    fireEvent.click(
      screen.getByText('Level 2', { selector: '[data-slot="accordion-trigger"] span' }),
    )
    expect(screen.queryByText('Replace a spell')).toBeNull()
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

    const badge = screen.getByText(/1 pending choice/).closest('[data-slot="badge"]')
    expect(badge?.className).toContain('text-warning-foreground')
    fireEvent.click(
      screen.getByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' }),
    )
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
    await waitFor(() => expect(container.querySelectorAll('.animate-route-focus')).toHaveLength(1))
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
    fireEvent.click(
      screen.getByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' }),
    )
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

    fireEvent.click(
      screen.getByText('Level 2', { selector: '[data-slot="accordion-trigger"] span' }),
    )
    expect(screen.getByText('Unresolved Training')).toBeTruthy()
    expect(screen.getByText(/No rule was guessed/)).toBeTruthy()
  })
})
