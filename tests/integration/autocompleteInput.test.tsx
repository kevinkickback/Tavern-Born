import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useId, useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const options = Array.from({ length: 80 }, (_, i) => ({
  value: `Race ${String(i).padStart(2, '0')}`,
  label: `Race ${String(i).padStart(2, '0')} (PHB)`,
}))
function Harness({ rows = options }: { rows?: typeof options }) {
  const id = useId()
  const [value, setValue] = useState('')
  return (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>Setup</DialogTitle>
        <DialogDescription>Choose or type a race</DialogDescription>
        <label htmlFor={id}>Race</label>
        <AutocompleteInput
          id={id}
          value={value}
          onValueChange={setValue}
          options={rows}
          suggestionsLabel="Race suggestions"
        />
        <button type="button">Next field</button>
      </DialogContent>
    </Dialog>
  )
}
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
test('keyboard wraps and chooses in the input, scrolls active options, and Escape only closes suggestions', async () => {
  render(<Harness />)
  const input = screen.getByRole('combobox', { name: 'Race' })
  fireEvent.focus(input)
  await screen.findByRole('listbox', { name: 'Race suggestions' })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(document.getElementById(input.getAttribute('aria-activedescendant')!)?.textContent).toBe(
    'Race 79 (PHB)',
  )
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Enter' })
  expect((input as HTMLInputElement).value).toBe('Race 79')
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Show race suggestions' }))
  await screen.findByRole('listbox')
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect((input as HTMLInputElement).value).toBe('Race 79')
})
test('search and pointer selection preserve custom input, and Tab dismisses without choosing', async () => {
  render(<Harness />)
  const input = screen.getByRole('combobox', { name: 'Race' })
  fireEvent.focus(input)
  await screen.findByRole('listbox')
  fireEvent.change(input, { target: { value: 'Race 42' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  fireEvent.click(screen.getByRole('option', { name: 'Race 42 (PHB)' }))
  expect((input as HTMLInputElement).value).toBe('Race 42')
  fireEvent.change(input, { target: { value: 'Campaign people' } })
  expect(screen.getByRole('status').textContent).toBe('No suggestions found')
  fireEvent.keyDown(input, { key: 'Tab' })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect((input as HTMLInputElement).value).toBe('Campaign people')
})
test('an active suggestion removed by refresh cannot choose a different row; IME Enter does not choose', async () => {
  const view = render(<Harness />)
  const input = screen.getByRole('combobox', { name: 'Race' })
  fireEvent.focus(input)
  await screen.findByRole('listbox')
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect((input as HTMLInputElement).value).toBe('')
  view.rerender(<Harness rows={options.slice(1)} />)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect((input as HTMLInputElement).value).toBe('')
  fireEvent.focusIn(screen.getByRole('button', { name: 'Next field' }))
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
})
