import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { SelectionModal } from '@/components/modals/SelectionModal'

interface TestItem {
  id: string
  name: string
}

const items: TestItem[] = Array.from({ length: 500 }, (_, index) => ({
  id: String(index),
  name: `Item ${index}`,
}))

describe('SelectionModal', () => {
  test('virtualizes the complete result set without incremental loading', async () => {
    const renderCard = vi.fn((item: TestItem) => <span>{item.name}</span>)

    render(
      <SelectionModal
        open={true}
        onOpenChange={vi.fn()}
        title="Select an item"
        items={items}
        getItemId={(item) => item.id}
        renderCard={renderCard}
        matchItem={(item, search) => item.name.toLowerCase().includes(search.toLowerCase())}
        onConfirm={vi.fn()}
      />,
    )

    await waitFor(() => expect(renderCard).toHaveBeenCalled())
    expect(renderCard.mock.calls.length).toBeLessThan(25)
    expect(renderCard.mock.calls[0][0]).toEqual(items[0])

    const fullList = document.querySelector<HTMLElement>('[data-selection-list-size="500"]')
    expect(fullList).toBeTruthy()
    expect(Number.parseFloat(fullList?.style.height ?? '0')).toBeGreaterThan(50_000)

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'Item 499' },
    })

    const filteredList = document.querySelector<HTMLElement>('[data-selection-list-size="1"]')
    expect(filteredList).toBeTruthy()
  })

  test('preserves selected values when confirming', async () => {
    const onConfirm = vi.fn()

    render(
      <SelectionModal
        open={true}
        onOpenChange={vi.fn()}
        title="Select an item"
        items={items}
        getItemId={(item) => item.id}
        renderCard={(item) => <span>{item.name}</span>}
        matchItem={(item, search) => item.name.toLowerCase().includes(search.toLowerCase())}
        initialSelectedIds={['499']}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(['499'], [items[499]]))
  })
})
