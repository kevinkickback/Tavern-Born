import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AnchoredHint } from '@/components/workspace/AnchoredHint'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

describe('AnchoredHint', () => {
  test('runs its entrance animation only once when its anchor temporarily disappears', () => {
    const reference = document.createElement('button')
    document.body.append(reference)
    const position = { reference, gap: 12, placement: 'bottom' as const }
    const props = { width: 300, onDismiss: vi.fn() }
    const { rerender } = render(
      <AnchoredHint position={position} {...props}>
        Equipment hint
      </AnchoredHint>,
    )

    expect(screen.getByRole('status').className).toContain('animate-in')
    expect(screen.getByText('Equipment hint').parentElement?.className).toContain(
      'animate-hint-bounce',
    )

    rerender(
      <AnchoredHint position={null} {...props}>
        Equipment hint
      </AnchoredHint>,
    )
    rerender(
      <AnchoredHint position={position} {...props}>
        Equipment hint
      </AnchoredHint>,
    )

    expect(screen.getByRole('status').className).not.toContain('animate-in')
    expect(screen.getByText('Equipment hint').parentElement?.className).not.toContain(
      'animate-hint-bounce',
    )
  })
})
