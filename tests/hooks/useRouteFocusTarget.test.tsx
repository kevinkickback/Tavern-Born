import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'

function RouteFocusTarget() {
  const { ref, highlighted } = useRouteFocusTarget<HTMLDivElement>(true)
  return <div ref={ref} data-testid="target" data-highlighted={highlighted} />
}

function mockAnimationFrames() {
  let nextId = 0
  let callbacks: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback)
    nextId += 1
    return nextId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

  return () => {
    const pending = callbacks
    callbacks = []
    act(() =>
      pending.forEach((callback) => {
        callback(performance.now())
      }),
    )
  }
}

describe('useRouteFocusTarget', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('starts only after the target enters view, then keeps the full highlight interval', () => {
    vi.useFakeTimers()
    const flushAnimationFrame = mockAnimationFrames()
    let intersectionCallback: IntersectionObserverCallback | undefined
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback
        }
        observe() {}
        unobserve() {}
        disconnect = disconnect
        takeRecords = () => []
        root = null
        rootMargin = ''
        thresholds = [0.01]
      },
    )

    render(<RouteFocusTarget />)
    flushAnimationFrame()
    flushAnimationFrame()

    const target = screen.getByTestId('target')
    expect(target.dataset.highlighted).toBe('false')

    act(() =>
      intersectionCallback?.(
        [
          {
            target,
            isIntersecting: true,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRatio: 1,
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: performance.now(),
          },
        ],
        {} as IntersectionObserver,
      ),
    )
    flushAnimationFrame()
    expect(target.dataset.highlighted).toBe('true')
    expect(disconnect).toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1_199))
    expect(target.dataset.highlighted).toBe('true')

    act(() => vi.advanceTimersByTime(1))
    expect(target.dataset.highlighted).toBe('false')
  })

  test('keeps the full attention interval when the system requests reduced motion', () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined)
    const flushAnimationFrame = mockAnimationFrames()
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    )

    render(<RouteFocusTarget />)
    flushAnimationFrame()
    flushAnimationFrame()
    flushAnimationFrame()

    const target = screen.getByTestId('target')
    expect(target.dataset.highlighted).toBe('true')

    act(() => vi.advanceTimersByTime(1_199))
    expect(target.dataset.highlighted).toBe('true')

    act(() => vi.advanceTimersByTime(1))
    expect(target.dataset.highlighted).toBe('false')
  })
})
