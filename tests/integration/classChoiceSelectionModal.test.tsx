import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { ClassChoiceOptionView } from '@/lib/character/classChoiceOptions'
import { ClassChoiceSelectionModal } from '@/pages/build/class/components/ClassChoiceSelectionModal'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { makePrereqCharacterSnapshotFixture } from '../fixtures/characterFixtures'

const selectionModalCapture = vi.hoisted(() => ({ props: undefined as unknown }))

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
      reference: {
        entityType: 'optionalFeature' as const,
        name: 'Available Training',
        source: 'TEST',
      },
      entries: [],
    }
    const advanced: ClassChoiceOptionView = {
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
})
