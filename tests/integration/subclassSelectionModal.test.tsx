import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SubclassSelectionModal } from '@/components/modals/SubclassSelectionModal'

afterEach(cleanup)

vi.mock('@/components/modals/SelectionModal', () => ({
  SelectionModal: ({
    items,
    renderCard,
  }: {
    items: unknown[]
    renderCard: (item: unknown, isSelected: boolean) => ReactNode
  }) => renderCard(items[0], false),
}))

describe('SubclassSelectionModal', () => {
  test('renders formatted subclass summary entries', () => {
    const subclasses = [
      {
        name: 'Arcane Archer',
        shortName: 'Arcane Archer',
        source: 'XPHB',
        className: 'Fighter',
        classSource: 'XPHB',
        entries: ['{@i Deploy Magical Effects Through Enchanted Ammunition}'],
      },
    ]

    render(
      <SubclassSelectionModal
        open
        onOpenChange={vi.fn()}
        title="Choose Martial Archetype"
        subclasses={subclasses}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Deploy Magical Effects Through Enchanted Ammunition')).toBeTruthy()
    expect(screen.queryByText(/\{@i/)).toBeNull()
  })
})
