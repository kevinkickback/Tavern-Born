import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { isHintAnchorVisible, useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'

const anchorRect = {
  bottom: 140,
  height: 40,
  left: 100,
  right: 180,
  top: 100,
  width: 80,
  x: 100,
  y: 100,
  toJSON: () => ({}),
} as DOMRect

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useAnchoredHintPosition', () => {
  test('hides a hint while its anchor is covered and restores it when exposed', async () => {
    const anchor = document.createElement('button')
    anchor.dataset.hintAnchor = 'true'
    anchor.getBoundingClientRect = () => anchorRect
    document.body.append(anchor)

    const cover = document.createElement('div')
    let covered = false
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => (covered ? [cover, anchor] : [anchor])),
    })

    const { result, unmount } = renderHook(() =>
      useAnchoredHintPosition({
        enabled: true,
        selector: '[data-hint-anchor="true"]',
      }),
    )

    await waitFor(() => expect(result.current?.reference).toBe(anchor))
    expect(result.current).toMatchObject({ gap: 12, placement: 'bottom' })

    covered = true
    act(() => window.dispatchEvent(new Event('scroll')))
    await waitFor(() => expect(result.current).toBeNull())

    covered = false
    act(() => window.dispatchEvent(new Event('scroll')))
    await waitFor(() => expect(result.current?.reference).toBe(anchor))

    unmount()
  })

  test('rejects CSS-hidden and clipped anchors', () => {
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => anchorRect
    document.body.append(anchor)

    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [anchor]),
    })

    anchor.style.display = 'none'
    expect(isHintAnchorVisible(anchor)).toBe(false)

    anchor.style.display = 'block'
    anchor.getBoundingClientRect = () => ({ ...anchorRect, top: -60, bottom: -20 }) as DOMRect
    expect(isHintAnchorVisible(anchor)).toBe(false)
  })

  test('rechecks a responsive anchor when the window resizes', async () => {
    const anchor = document.createElement('button')
    anchor.dataset.hintAnchor = 'true'
    anchor.style.display = 'none'
    anchor.getBoundingClientRect = () => anchorRect
    document.body.append(anchor)
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [anchor]),
    })

    const { result } = renderHook(() =>
      useAnchoredHintPosition({
        enabled: true,
        selector: '[data-hint-anchor="true"]',
      }),
    )

    await waitFor(() => expect(result.current).toBeNull())
    anchor.style.display = 'block'
    act(() => window.dispatchEvent(new Event('resize')))
    await waitFor(() => expect(result.current?.reference).toBe(anchor))
  })

  test('coalesces rapid layout signals into one visibility check and cancels pending work', async () => {
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    const anchor = document.createElement('button')
    anchor.dataset.hintAnchor = 'true'
    const getBounds = vi.fn(() => anchorRect)
    anchor.getBoundingClientRect = getBounds
    document.body.append(anchor)
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [anchor]),
    })

    let frameId = 0
    const frames = new Map<number, FrameRequestCallback>()
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameId += 1
        frames.set(frameId, callback)
        return frameId
      })
    const cancelFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => void frames.delete(id))

    const { unmount } = renderHook(() =>
      useAnchoredHintPosition({
        enabled: true,
        selector: '[data-hint-anchor="true"]',
      }),
    )

    for (const [id, callback] of frames) {
      frames.delete(id)
      act(() => callback(performance.now()))
    }
    await act(async () => Promise.resolve())
    for (const [id, callback] of frames) {
      frames.delete(id)
      act(() => callback(performance.now()))
    }
    getBounds.mockClear()
    requestFrame.mockClear()
    cancelFrame.mockClear()

    act(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
      document.dispatchEvent(new Event('transitionend', { bubbles: true }))
    })

    expect(frames.size).toBe(1)
    const [[pendingId, pendingCallback]] = Array.from(frames.entries())
    frames.delete(pendingId)
    act(() => pendingCallback(performance.now()))
    expect(getBounds).toHaveBeenCalledTimes(1)
    expect(requestFrame).toHaveBeenCalledTimes(3)
    expect(cancelFrame).toHaveBeenCalledTimes(2)

    act(() => window.dispatchEvent(new Event('resize')))
    expect(frames.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
  })
})
