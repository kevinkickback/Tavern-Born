import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SelectionModal } from '@/components/modals/SelectionModal'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 148,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 148 })),
    measureElement: () => {},
  }),
}))

afterEach(cleanup)

describe('SelectionModal option cards', () => {
  test('announces initial selection and updates it when cards are toggled', () => {
    const items = [
      { id: 'first', name: 'First item' },
      { id: 'second', name: 'Second item' },
    ]

    render(
      <SelectionModal
        open={true}
        onOpenChange={vi.fn()}
        title="Select an item"
        items={items}
        getItemId={(item) => item.id}
        renderCard={(item) => <span>{item.name}</span>}
        matchItem={() => true}
        initialSelectedIds={['first']}
        onConfirm={vi.fn()}
      />,
    )

    const first = screen.getByRole('button', { name: 'First item' })
    const second = screen.getByRole('button', { name: 'Second item' })
    expect(first.getAttribute('aria-pressed')).toBe('true')
    expect(second.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(first)
    fireEvent.click(second)

    expect(first.getAttribute('aria-pressed')).toBe('false')
    expect(second.getAttribute('aria-pressed')).toBe('true')
  })
})
