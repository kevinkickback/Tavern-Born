import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { autoUpdateMock, computePositionMock } = vi.hoisted(() => ({
  autoUpdateMock: vi.fn((_reference: Element, _floating: HTMLElement, update: () => void) => {
    update()
    return vi.fn()
  }),
  computePositionMock: vi.fn(() => new Promise<never>(() => {})),
}))

vi.mock('@floating-ui/react-dom', () => ({
  autoUpdate: autoUpdateMock,
  computePosition: computePositionMock,
  flip: vi.fn(() => ({ name: 'flip' })),
  offset: vi.fn(() => ({ name: 'offset' })),
  shift: vi.fn(() => ({ name: 'shift' })),
}))

import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { buildRecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('rules preview positioning', () => {
  beforeEach(() => {
    useAppPreferencesStore.setState({ uiScale: 100 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    autoUpdateMock.mockClear()
    computePositionMock.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('uses a synchronous collision-safe position instead of the viewport origin', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.hoverName === 'Prone') return rect(940, 80, 60, 24)
      if (this.dataset.rulesPreviewLayer) return rect(0, 0, 320, 240)
      return rect(0, 0, 0, 0)
    })

    render(
      <RulesPreviewManager>
        <RenderedEntryWithTooltip
          entry="Read {@condition Prone|PHB}."
          recursiveLookup={buildRecursiveLookup({
            conditions: [{ name: 'Prone', source: 'PHB', entries: ['Details.'] }],
          })}
        />
      </RulesPreviewManager>,
    )
    fireEvent.mouseMove(screen.getByRole('button', { name: 'Prone' }))

    const preview = screen.getByRole('dialog', { name: 'Prone preview' })
    expect(preview.style.left).toBe('696px')
    expect(preview.style.top).toBe('108px')
    expect(preview.parentElement).toBe(document.body)
  })

  test('anchors a pinned preview child beside the pinned shell and ignores its inner scroll', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.hoverName === 'First') return rect(100, 400, 60, 24)
      if (this.dataset.rulesPreviewLayer === 'pinned') return rect(100, 120, 320, 240)
      if (this.dataset.rulesPreviewLayer === 'transient') return rect(428, 120, 320, 240)
      return rect(0, 0, 0, 0)
    })
    const lookup = buildRecursiveLookup({
      conditions: [
        { name: 'First', source: 'PHB', entries: ['See {@condition Second|PHB}.'] },
        { name: 'Second', source: 'PHB', entries: ['Second details.'] },
      ],
    })

    render(
      <RulesPreviewManager>
        <RenderedEntryWithTooltip entry="Read {@condition First|PHB}." recursiveLookup={lookup} />
      </RulesPreviewManager>,
    )
    fireEvent.mouseMove(screen.getByRole('button', { name: 'First' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByTitle('Pin tooltip'))
    const pinned = screen.getByRole('dialog', { name: 'First preview' })
    fireEvent.mouseMove(within(pinned).getByRole('button', { name: 'Second' }))

    const child = await screen.findByRole('dialog', { name: 'Second preview' })
    expect(child.style.left).toBe('428px')
    expect(child.style.top).toBe('120px')
    expect(autoUpdateMock).toHaveBeenLastCalledWith(pinned, child, expect.any(Function))

    fireEvent.scroll(within(pinned).getByText(/See/).parentElement as Element)
    expect(child.style.left).toBe('428px')
    expect(child.style.top).toBe('120px')
  })

  test('keeps the spawning shell fixed and reuses the other physical slot for deeper content', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.hoverName === 'First') return rect(100, 400, 60, 24)
      if (this.getAttribute('aria-label') === 'First preview') return rect(100, 120, 320, 240)
      if (this.getAttribute('aria-label') === 'Second preview') return rect(428, 120, 320, 180)
      return rect(0, 0, 320, 120)
    })
    const lookup = buildRecursiveLookup({
      conditions: [
        { name: 'First', source: 'PHB', entries: ['See {@condition Second|PHB}.'] },
        { name: 'Second', source: 'PHB', entries: ['See {@condition Third|PHB}.'] },
        { name: 'Third', source: 'PHB', entries: ['Short details.'] },
      ],
    })

    render(
      <RulesPreviewManager>
        <RenderedEntryWithTooltip entry="Read {@condition First|PHB}." recursiveLookup={lookup} />
      </RulesPreviewManager>,
    )
    fireEvent.mouseMove(screen.getByRole('button', { name: 'First' }))
    const first = screen.getByRole('dialog', { name: 'First preview' })
    fireEvent.focus(within(first).getByRole('button', { name: 'Second' }))
    const second = screen.getByRole('dialog', { name: 'Second preview' })
    const firstPosition = { left: first.style.left, top: first.style.top }
    const secondPosition = { left: second.style.left, top: second.style.top }

    fireEvent.focus(within(second).getByRole('button', { name: 'Third' }))
    const third = screen.getByRole('dialog', { name: 'Third preview' })

    expect(screen.getByRole('dialog', { name: 'Second preview' })).toBe(second)
    expect(third).toBe(first)
    expect({ left: second.style.left, top: second.style.top }).toEqual(secondPosition)
    expect({ left: third.style.left, top: third.style.top }).toEqual(firstPosition)
    expect(third.style.left).not.toBe('0px')
    expect(third.style.top).not.toBe('0px')
  })

  test('keeps a third preview clear when its pinned ancestor forced the parent to the left', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.hoverName === 'First') return rect(100, 400, 60, 24)
      if (this.getAttribute('aria-label') === 'First preview') return rect(400, 120, 320, 240)
      if (this.getAttribute('aria-label') === 'Second preview') return rect(72, 120, 320, 180)
      if (this.getAttribute('aria-label') === 'Third preview') {
        return rect(
          Number.parseFloat(this.style.left) || 0,
          Number.parseFloat(this.style.top) || 0,
          320,
          160,
        )
      }
      return rect(0, 0, 0, 0)
    })
    const lookup = buildRecursiveLookup({
      conditions: [
        { name: 'First', source: 'PHB', entries: ['See {@condition Second|PHB}.'] },
        { name: 'Second', source: 'PHB', entries: ['See {@condition Third|PHB}.'] },
        { name: 'Third', source: 'PHB', entries: ['Third details.'] },
      ],
    })

    render(
      <RulesPreviewManager>
        <RenderedEntryWithTooltip entry="Read {@condition First|PHB}." recursiveLookup={lookup} />
      </RulesPreviewManager>,
    )
    fireEvent.mouseMove(screen.getByRole('button', { name: 'First' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'First preview' })).getByTitle('Pin tooltip'),
    )
    const pinned = screen.getByRole('dialog', { name: 'First preview' })
    fireEvent.focus(within(pinned).getByRole('button', { name: 'Second' }))
    const second = screen.getByRole('dialog', { name: 'Second preview' })
    fireEvent.focus(within(second).getByRole('button', { name: 'Third' }))
    const third = screen.getByRole('dialog', { name: 'Third preview' })

    expect(pinned.getAttribute('data-preview-pinned')).toBe('true')
    expect(second.style.left).toBe('72px')
    expect(second.style.top).toBe('120px')
    expect(third.style.left).toBe('72px')
    expect(third.style.top).toBe('308px')
  })

  test('keeps the chain open while the pointer crosses its safe corridor', () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.dataset.hoverName === 'First') return rect(100, 400, 60, 24)
        if (this.getAttribute('aria-label') === 'First preview') return rect(100, 120, 320, 240)
        if (this.getAttribute('aria-label') === 'Second preview') return rect(428, 120, 320, 100)
        return rect(0, 0, 0, 0)
      })
      const lookup = buildRecursiveLookup({
        conditions: [
          { name: 'First', source: 'PHB', entries: ['See {@condition Second|PHB}.'] },
          { name: 'Second', source: 'PHB', entries: ['Short details.'] },
        ],
      })

      render(
        <RulesPreviewManager>
          <RenderedEntryWithTooltip entry="Read {@condition First|PHB}." recursiveLookup={lookup} />
        </RulesPreviewManager>,
      )
      fireEvent.mouseMove(screen.getByRole('button', { name: 'First' }))
      const parent = screen.getByRole('dialog', { name: 'First preview' })
      fireEvent.focus(within(parent).getByRole('button', { name: 'Second' }))
      const child = screen.getByRole('dialog', { name: 'Second preview' })
      const corridor = document.querySelector('[data-rules-preview-corridor]') as HTMLElement

      expect(corridor).toBeTruthy()
      expect(corridor.style.width).toBe('12px')
      fireEvent.mouseLeave(parent)
      fireEvent.mouseEnter(corridor)
      vi.advanceTimersByTime(250)

      expect(parent.isConnected).toBe(true)
      expect(child.isConnected).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
