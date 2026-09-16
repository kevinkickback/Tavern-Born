import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ClassChoiceOptionView } from '@/lib/character/classChoiceOptions'
import { ClassChoiceSelectionModal } from '@/pages/build/class/components/ClassChoiceSelectionModal'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { makePrereqCharacterSnapshotFixture } from '../fixtures/characterFixtures'

const selectionModalCapture = vi.hoisted(() => ({ props: undefined as unknown }))

afterEach(cleanup)

vi.mock('@/components/modals/SelectionModal', () => ({
  SelectionModal: (props: unknown) => {
    selectionModalCapture.props = props
    return null
  },
}))

const choice: NormalizedCharacterChoice = {
  id: 'class:test|test|choice:training|1',
  label: 'Training',
  kind: 'optional-feature',
  owner: { type: 'class', name: 'Test Class', source: 'TEST' },
  level: 1,
  minimumSelections: 1,
  maximumSelections: 1,
  selectionCountByLevel: Array(20).fill(1),
  options: [],
  repeatable: false,
  replacement: { cadence: 'never' },
  source: { kind: 'optional-feature-progression', field: 'fixture' },
}

describe('ClassChoiceSelectionModal', () => {
  test('hides unmet options by default and prevents selecting them when revealed', () => {
    const available: ClassChoiceOptionView = {
      availability: 'eligible',
      reference: {
        entityType: 'optionalFeature' as const,
        name: 'Available Training',
        source: 'TEST',
      },
      entries: [],
    }
    const advanced: ClassChoiceOptionView = {
      availability: 'eligible',
      reference: {
        entityType: 'optionalFeature' as const,
        name: 'Advanced Training',
        source: 'TEST',
      },
      entries: [],
      prerequisite: [{ level: 5 }],
    }
    render(
      <ClassChoiceSelectionModal
        choice={choice}
        options={[available, advanced]}
        maximumSelections={1}
        initialSelectedIds={[]}
        characterSnapshot={makePrereqCharacterSnapshotFixture({
          class: 'Test Class',
          progression: [{ name: 'Test Class', source: 'TEST', levels: 1 }],
        })}
        className="Test Class"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    const props = selectionModalCapture.props as {
      filterSections: Array<{ key: string }>
      matchItem: (
        item: ClassChoiceOptionView,
        search: string,
        filters: Record<string, Set<string>>,
      ) => boolean
      canSelect: (item: ClassChoiceOptionView, selected: Set<string>) => boolean
    }
    expect(props.filterSections).toEqual([expect.objectContaining({ key: 'prerequisite' })])
    expect(props.matchItem(advanced, '', {})).toBe(false)
    expect(props.matchItem(advanced, '', { prerequisite: new Set(['showUnmet']) })).toBe(true)
    expect(props.canSelect(advanced, new Set())).toBe(false)
    expect(props.canSelect(available, new Set())).toBe(true)
  })

  test('shows a weapon mastery property on its option card', () => {
    const weapon: ClassChoiceOptionView = {
      availability: 'eligible',
      reference: { entityType: 'item', name: 'Training Blade', source: 'XPHB' },
      entries: [],
      masteries: [{ name: 'Sap', source: 'XPHB', entries: ['Sap mastery details'] }],
      weaponCategory: 'Simple',
      weaponRange: 'Melee',
    }
    const rangedWeapon: ClassChoiceOptionView = {
      availability: 'eligible',
      reference: { entityType: 'item', name: 'Training Bow', source: 'XPHB' },
      entries: [],
      masteries: [{ name: 'Vex', source: 'XPHB', entries: [] }],
      weaponCategory: 'Martial',
      weaponRange: 'Ranged',
    }
    render(
      <ClassChoiceSelectionModal
        choice={{
          ...choice,
          label: 'Weapon Mastery',
          kind: 'item',
          optionFilter: { entityType: 'item', requiresMastery: true },
        }}
        options={[weapon, rangedWeapon]}
        maximumSelections={1}
        initialSelectedIds={[]}
        characterSnapshot={makePrereqCharacterSnapshotFixture()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    const props = selectionModalCapture.props as {
      title: string
      filterSections: Array<{ key: string; options: Array<{ value: string; label: string }> }>
      matchItem: (
        item: ClassChoiceOptionView,
        search: string,
        filters: Record<string, Set<string>>,
      ) => boolean
      renderCard: (item: ClassChoiceOptionView, selected: boolean) => ReactNode
    }
    render(props.renderCard(weapon, false))
    expect(props.title).toBe('Choose weapons for Weapon Mastery')
    expect(props.filterSections).toEqual([
      expect.objectContaining({
        key: 'mastery',
        options: [
          { value: 'sap|xphb', label: 'Sap' },
          { value: 'vex|xphb', label: 'Vex' },
        ],
      }),
      expect.objectContaining({ key: 'weaponCategory' }),
      expect.objectContaining({ key: 'weaponRange' }),
    ])
    expect(props.matchItem(weapon, '', { mastery: new Set(['sap|xphb']) })).toBe(true)
    expect(props.matchItem(weapon, '', { mastery: new Set(['vex|xphb']) })).toBe(false)
    expect(
      props.matchItem(weapon, '', {
        weaponCategory: new Set(['Martial']),
      }),
    ).toBe(false)
    expect(props.matchItem(weapon, '', { weaponRange: new Set(['Melee']) })).toBe(true)
    expect(screen.getByText('Weapon')).toBeTruthy()
    expect(screen.getByText('Mastery: Sap')).toBeTruthy()
    expect(screen.getByText('Sap mastery details')).toBeTruthy()
  })

  test('keeps a retained selection visible but prevents selecting it again', () => {
    const retained: ClassChoiceOptionView = {
      availability: 'retained',
      reference: { entityType: 'item', name: 'Archived Blade', source: 'OLD' },
      entries: [],
    }
    render(
      <ClassChoiceSelectionModal
        choice={choice}
        options={[retained]}
        maximumSelections={1}
        initialSelectedIds={[]}
        characterSnapshot={makePrereqCharacterSnapshotFixture()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    const props = selectionModalCapture.props as {
      canSelect: (item: ClassChoiceOptionView, selected: Set<string>) => boolean
      renderCard: (item: ClassChoiceOptionView, selected: boolean) => ReactNode
    }
    expect(props.canSelect(retained, new Set())).toBe(false)
    render(props.renderCard(retained, false))
    expect(screen.getByText('Unavailable')).toBeTruthy()
    expect(screen.getByText(/no longer eligible/i)).toBeTruthy()
  })
})
