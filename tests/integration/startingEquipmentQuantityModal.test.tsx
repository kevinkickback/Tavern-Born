import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { SelectionModal } from '@/components/modals/SelectionModal'

// jsdom has no row layout. Browser coverage owns real virtualization and narrow-pane behavior.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 148,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 148 })),
    measureElement: () => {},
  }),
}))

afterEach(cleanup)
const items = [
  { name: 'Longsword', id: 'longsword|PHB' },
  { name: 'Warhammer', id: 'warhammer|PHB' },
]
const props = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Starting items',
  items,
  getItemId: (item: (typeof items)[number]) => item.id,
  getItemLabel: (item: (typeof items)[number]) => item.name,
  renderCard: (item: (typeof items)[number]) => <span>{item.name}</span>,
  matchItem: (item: (typeof items)[number], search: string) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
}

test('one card supports two copies; exact Confirm, decrement, search and independent second item', async () => {
  const onConfirm = vi.fn()
  render(<SelectionModal {...props} quantitySelection={{ max: 2 }} onConfirm={onConfirm} />)
  const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }))
  expect(confirm.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Increase Longsword quantity' }))
  expect(confirm.disabled).toBe(false)
  expect(screen.getByLabelText('Longsword quantity').textContent).toBe('2')
  expect(
    (screen.getByRole('button', { name: 'Increase Longsword quantity' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.click(confirm)
  expect(onConfirm).toHaveBeenLastCalledWith(
    ['longsword|PHB'],
    [items[0]],
    {},
    { 'longsword|PHB': 2 },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Longsword quantity' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search starting items' }), {
    target: { value: 'Warhammer' },
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Warhammer' }))
  fireEvent.click(confirm)
  expect(onConfirm).toHaveBeenLastCalledWith(
    ['longsword|PHB', 'warhammer|PHB'],
    items,
    {},
    { 'longsword|PHB': 1, 'warhammer|PHB': 1 },
  )
})

test('saved repeated and unavailable picks initialize counts; Cancel does not commit a draft', async () => {
  const onConfirm = vi.fn(),
    onOpenChange = vi.fn()
  render(
    <SelectionModal
      {...props}
      onOpenChange={onOpenChange}
      initialSelectedIds={['longsword|PHB']}
      quantitySelection={{ max: 2, initialQuantities: { 'longsword|PHB': 2 } }}
      onConfirm={onConfirm}
    />,
  )
  expect(screen.getByLabelText('Longsword quantity').textContent).toBe('2')
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Longsword quantity' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onConfirm).not.toHaveBeenCalled()
  expect(onOpenChange).toHaveBeenCalledWith(false)
  cleanup()
  render(
    <SelectionModal
      {...props}
      initialSelectedIds={['missing|PHB']}
      quantitySelection={{ max: 2, initialQuantities: { 'missing|PHB': 2 } }}
      unavailableSelectionLabels={new Map([['missing|PHB', 'Missing sword']])}
      getConfirmationError={(ids) =>
        ids.has('missing|PHB') ? 'Replace unavailable items.' : undefined
      }
      onConfirm={onConfirm}
    />,
  )
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Remove Missing sword' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }))
  fireEvent.click(screen.getByRole('button', { name: 'Increase Longsword quantity' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() =>
    expect(onConfirm).toHaveBeenCalledWith(
      ['longsword|PHB'],
      [items[0]],
      {},
      { 'longsword|PHB': 2 },
    ),
  )
})
