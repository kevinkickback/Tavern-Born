import { cleanup, render, screen } from '@testing-library/react'
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
    optFeatureProgressions: [],
    classFeatProgressions: [],
    featuresByLevel: new Map(),
    subclassFeatureName: null,
    selectedFeature: null,
    detailCollapsed: false,
    viewingClass: 'Artificer',
    viewingClassSource: 'PHB',
    viewingClassLevel: 4,
    classEquipmentBlockChoices: [],
    selectedNames: new Set(),
    optFeatures: [],
    featByCompositeId: new Map(),
    feats: [],
    spellByName: new Map(),
    appliedAsiChoicesForClass: [],
    classAsiFeats: [],
    asiModeByLevel: {},
    usedASI: 0,
    totalASIAcrossClasses: 1,
    onOpenClassPicker: vi.fn(),
    onOpenSubclassPicker: vi.fn(),
    onOpenSpellPicker: vi.fn(),
    onOpenSpellSwap: vi.fn(),
    onOpenFeatPicker: vi.fn(),
    onOpenAsiPicker: vi.fn(),
    onOpenOptPicker: vi.fn(),
    onOpenClassFeatPicker: vi.fn(),
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
})
