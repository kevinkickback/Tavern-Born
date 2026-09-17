import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SplitPane } from '@/components/ui/SplitPane'

describe('SplitPane responsive navigation', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('provides a compact pane switcher without changing desktop collapse preferences', async () => {
    const user = userEvent.setup()
    const onLeftCollapsedChange = vi.fn()
    const onRightCollapsedChange = vi.fn()
    const { container } = render(
      <SplitPane
        left={<div>Inventory content</div>}
        right={<div>Item detail content</div>}
        leftCollapsed={false}
        rightCollapsed={false}
        onLeftCollapsedChange={onLeftCollapsedChange}
        onRightCollapsedChange={onRightCollapsedChange}
        rightFixedWidth="24rem"
        compactLeftLabel="Inventory"
        compactRightLabel="Item details"
      />,
    )

    const splitPane = container.querySelector('[data-slot="split-pane"]')
    const paneSwitcher = screen.getByRole('tablist', { name: 'Workspace pane' })
    const inventoryTab = screen.getByRole('tab', { name: 'Inventory' })
    const detailsTab = screen.getByRole('tab', { name: 'Item details' })

    expect(splitPane?.className).toContain('@container')
    expect(paneSwitcher.className).toContain('@min-[840px]:hidden')
    expect(inventoryTab.getAttribute('aria-selected')).toBe('true')

    await user.click(detailsTab)

    expect(detailsTab.getAttribute('aria-selected')).toBe('true')
    expect(inventoryTab.getAttribute('aria-selected')).toBe('false')
    expect(onLeftCollapsedChange).not.toHaveBeenCalled()
    expect(onRightCollapsedChange).not.toHaveBeenCalled()
    expect(screen.getByText('Inventory content').parentElement?.className).toContain('hidden')
    expect(screen.getByText('Item detail content').parentElement?.className).toContain('flex')
    expect(screen.getByText('Item detail content').parentElement?.className).toContain(
      '@min-[840px]:w-[var(--split-pane-right-width)]',
    )
  })

  test('removes a collapsed details pane from desktop flex sizing', () => {
    const { container } = render(
      <SplitPane
        left={<div>Workbench content</div>}
        right={<div>Detail content</div>}
        leftCollapsed={false}
        rightCollapsed={true}
        onLeftCollapsedChange={vi.fn()}
        onRightCollapsedChange={vi.fn()}
        leftWidth="24rem"
      />,
    )

    const leftPane = container.querySelector('[data-slot="split-pane-left"]')
    const rightPane = container.querySelector('[data-slot="split-pane-right"]')
    expect(leftPane?.className).toContain('@min-[840px]:flex-1')
    expect(rightPane?.className).toContain('@min-[840px]:flex-none')
    expect(rightPane?.className).toContain('@min-[840px]:w-0')
  })
})
