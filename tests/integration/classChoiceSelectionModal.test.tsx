import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildCreatureChoiceSummary } from '@/lib/5etools/creatureStatBlock'
import {
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
} from '@/lib/character/classChoiceOptions'
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
      canSelect: (
        item: ClassChoiceOptionView,
        selected: Set<string>,
        allItems: ClassChoiceOptionView[],
      ) => boolean
    }
    expect(props.filterSections).toEqual([expect.objectContaining({ key: 'prerequisite' })])
    expect(props.matchItem(advanced, '', {})).toBe(false)
    expect(props.matchItem(advanced, '', { prerequisite: new Set(['showUnmet']) })).toBe(true)
    expect(props.canSelect(advanced, new Set(), [available, advanced])).toBe(false)
    expect(props.canSelect(available, new Set(), [available, advanced])).toBe(true)
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

  test('keeps a retained selection selected without consuming an eligible slot', () => {
    const retained: ClassChoiceOptionView = {
      availability: 'retained',
      reference: { entityType: 'item', name: 'Archived Blade', source: 'OLD' },
      entries: [],
    }
    const replacement: ClassChoiceOptionView = {
      availability: 'eligible',
      reference: { entityType: 'item', name: 'Current Blade', source: 'TEST' },
      entries: [],
    }
    const retainedKey = getClassChoiceOptionKey(retained.reference)
    render(
      <ClassChoiceSelectionModal
        choice={choice}
        options={[retained, replacement]}
        maximumSelections={1}
        initialSelectedIds={[retainedKey]}
        characterSnapshot={makePrereqCharacterSnapshotFixture()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    const props = selectionModalCapture.props as {
      categories: Array<{ test: (item: ClassChoiceOptionView) => boolean }>
      initialSelectedIds: string[]
      canSelect: (
        item: ClassChoiceOptionView,
        selected: Set<string>,
        allItems: ClassChoiceOptionView[],
      ) => boolean
      renderCard: (item: ClassChoiceOptionView, selected: boolean) => ReactNode
    }
    expect(props.initialSelectedIds).toEqual([retainedKey])
    expect(props.categories[0]?.test(retained)).toBe(false)
    expect(props.canSelect(retained, new Set(), [retained, replacement])).toBe(false)
    expect(props.canSelect(replacement, new Set([retainedKey]), [retained, replacement])).toBe(true)
    render(props.renderCard(retained, true))
    expect(screen.getByText('Unavailable')).toBeTruthy()
    expect(screen.getByText('Selected')).toBeTruthy()
    expect(screen.getByText(/no longer eligible/i)).toBeTruthy()
  })

  test('shows companion combat facts and supports creature capability filters and search', () => {
    const wolf: ClassChoiceOptionView = {
      availability: 'eligible',
      reference: { entityType: 'creature', name: 'Wolf', source: 'MM' },
      entries: [],
      presentation: {
        kind: 'creature',
        summary: buildCreatureChoiceSummary({
          name: 'Wolf',
          source: 'MM',
          size: ['M'],
          type: 'beast',
          cr: '1/4',
          ac: [13],
          hp: { average: 11, formula: '2d8 + 2' },
          speed: { walk: 40 },
          trait: [{ name: 'Pack Tactics', entries: ['The wolf has advantage.'] }],
          action: [{ name: 'Bite', entries: ['Melee Weapon Attack.'] }],
        }),
      },
      searchText: 'Wolf beast Pack Tactics Bite',
    }
    const hawk: ClassChoiceOptionView = {
      availability: 'eligible',
      reference: { entityType: 'creature', name: 'Hawk', source: 'MM' },
      entries: [],
      presentation: {
        kind: 'creature',
        summary: buildCreatureChoiceSummary({
          name: 'Hawk',
          source: 'MM',
          size: ['T'],
          type: 'beast',
          cr: '0',
          ac: [13],
          hp: { average: 1, formula: '1d4 - 1' },
          speed: { walk: 10, fly: 60 },
          trait: [{ name: 'Keen Sight', entries: ['The hawk has advantage.'] }],
          action: [{ name: 'Talons', entries: ['Melee Weapon Attack.'] }],
        }),
      },
      searchText: 'Hawk beast fly flight flying Keen Sight Talons',
    }

    render(
      <ClassChoiceSelectionModal
        choice={{ ...choice, label: "Ranger's Companion", kind: 'creature' }}
        options={[wolf, hawk]}
        maximumSelections={1}
        initialSelectedIds={[]}
        characterSnapshot={makePrereqCharacterSnapshotFixture()}
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
      renderCard: (item: ClassChoiceOptionView, selected: boolean) => ReactNode
    }
    expect(props.filterSections.map((section) => section.key)).toEqual([
      'creatureSize',
      'creatureChallenge',
      'creatureMovement',
    ])
    expect(props.matchItem(wolf, 'pack tactics', {})).toBe(true)
    expect(props.matchItem(hawk, 'flight', {})).toBe(true)
    expect(props.matchItem(wolf, '', { creatureMovement: new Set(['fly']) })).toBe(false)
    expect(props.matchItem(hawk, '', { creatureMovement: new Set(['fly']) })).toBe(true)

    render(props.renderCard(wolf, false))
    expect(screen.getByText('Medium beast')).toBeTruthy()
    expect(screen.getByText('CR 1/4')).toBeTruthy()
    expect(screen.getByText('AC')).toBeTruthy()
    expect(screen.getByText('11 (2d8 + 2)')).toBeTruthy()
    expect(screen.getByText('40 ft.')).toBeTruthy()
    expect(screen.getByText('Pack Tactics')).toBeTruthy()
    expect(screen.getByText('Bite.')).toBeTruthy()
    expect(screen.getByText('Melee Weapon Attack.')).toBeTruthy()
  })

  test('shows optional-feature type and multiple rules paragraphs for runes', () => {
    const rune: ClassChoiceOptionView = {
      availability: 'eligible',
      reference: { entityType: 'optionalFeature', name: 'Cloud Rune', source: 'TCE' },
      entries: ['Passive skill benefit.', 'Invoked reaction benefit.'],
      presentation: { kind: 'feature', featureTypeLabels: ['Rune Knight Rune'] },
    }

    render(
      <ClassChoiceSelectionModal
        choice={{ ...choice, label: 'Runes' }}
        options={[rune]}
        maximumSelections={2}
        initialSelectedIds={[]}
        characterSnapshot={makePrereqCharacterSnapshotFixture()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    const props = selectionModalCapture.props as {
      renderCard: (item: ClassChoiceOptionView, selected: boolean) => ReactNode
    }
    render(props.renderCard(rune, false))
    expect(screen.getByText('Rune Knight Rune')).toBeTruthy()
    expect(screen.getByText('Passive skill benefit.')).toBeTruthy()
    expect(screen.getByText('Invoked reaction benefit.')).toBeTruthy()
  })
})
