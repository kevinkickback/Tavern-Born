import { describe, expect, test } from 'vitest'
import {
  clampPreviewPosition,
  getAnchoredPreviewFallbackPosition,
  getTitleBarCollisionPadding,
  getTitleBarOverlayHeight,
  getTitleBarSafeTop,
} from '@/lib/overlayPosition'

describe('title-bar-safe overlay positioning', () => {
  test('scales the native title-bar height and includes a viewport margin', () => {
    expect(getTitleBarOverlayHeight(80)).toBe(26)
    expect(getTitleBarOverlayHeight(100)).toBe(32)
    expect(getTitleBarOverlayHeight(120)).toBe(38)
    expect(getTitleBarSafeTop(120)).toBe(46)
  })

  test('enforces the safe top while preserving caller collision padding', () => {
    expect(getTitleBarCollisionPadding(16, 100)).toEqual({
      top: 40,
      right: 16,
      bottom: 16,
      left: 16,
    })
    expect(getTitleBarCollisionPadding({ top: 64, right: 12 }, 100)).toEqual({
      top: 64,
      right: 12,
      bottom: 8,
      left: 8,
    })
  })

  test('clamps freely positioned previews below the title bar and within the viewport', () => {
    expect(
      clampPreviewPosition(
        { left: -40, top: 12 },
        { width: 320, height: 240 },
        { width: 1280, height: 720 },
        40,
      ),
    ).toEqual({ left: 8, top: 40 })
    expect(
      clampPreviewPosition(
        { left: 1200, top: 680 },
        { width: 320, height: 240 },
        { width: 1280, height: 720 },
        40,
      ),
    ).toEqual({ left: 952, top: 472 })
  })

  test('places rules previews beside their trigger before async positioning resolves', () => {
    expect(
      getAnchoredPreviewFallbackPosition(
        { left: 300, top: 180, width: 80, height: 24 },
        { width: 320, height: 240 },
        { width: 1280, height: 720 },
        40,
        'right-start',
        8,
      ),
    ).toEqual({ left: 388, top: 180 })

    expect(
      getAnchoredPreviewFallbackPosition(
        { left: 1080, top: 180, width: 80, height: 24 },
        { width: 320, height: 240 },
        { width: 1280, height: 720 },
        40,
        'right-start',
        8,
      ),
    ).toEqual({ left: 752, top: 180 })
  })

  test('places root previews above or below their trigger without entering the title bar', () => {
    expect(
      getAnchoredPreviewFallbackPosition(
        { left: 120, top: 400, width: 100, height: 24 },
        { width: 320, height: 200 },
        { width: 1280, height: 720 },
        40,
        'top-start',
        4,
      ),
    ).toEqual({ left: 120, top: 196 })

    expect(
      getAnchoredPreviewFallbackPosition(
        { left: 120, top: 60, width: 100, height: 24 },
        { width: 320, height: 200 },
        { width: 1280, height: 720 },
        40,
        'top-start',
        4,
      ),
    ).toEqual({ left: 120, top: 88 })
  })
})
