import { act, renderHook, waitFor } from '@testing-library/react'
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
  document.body.replaceChildren()
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

    const { result } = renderHook(() =>
      useAnchoredHintPosition({
        enabled: true,
        selector: '[data-hint-anchor="true"]',
        width: 300,
      }),
    )

    await waitFor(() =>
      expect(result.current).toEqual({
        top: 152,
        left: 16,
        arrowLeft: 124,
        anchorTop: 100,
        gap: 12,
      }),
    )

    covered = true
    act(() => window.dispatchEvent(new Event('scroll')))
    await waitFor(() => expect(result.current).toBeNull())

    covered = false
    act(() => window.dispatchEvent(new Event('scroll')))
    await waitFor(() =>
      expect(result.current).toEqual({
        top: 152,
        left: 16,
        arrowLeft: 124,
        anchorTop: 100,
        gap: 12,
      }),
    )
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
})
