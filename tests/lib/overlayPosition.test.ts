import { describe, expect, test } from 'vitest'
import {
  clampPreviewPosition,
  getFloatingPreviewPosition,
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

  test('places a tall preview below a trigger when above would cross the title bar', () => {
    expect(
      getFloatingPreviewPosition(
        { top: 48, right: 140, bottom: 68, left: 80 },
        { width: 320, height: 360 },
        { width: 1280, height: 720 },
        40,
      ),
    ).toEqual({ left: 80, top: 72 })
  })

  test('never places a preview above the title-bar safe inset', () => {
    expect(
      getFloatingPreviewPosition(
        { top: 0, right: 0, bottom: 0, left: 0 },
        { width: 320, height: 240 },
        { width: 1280, height: 720 },
        40,
      ),
    ).toEqual({ left: 8, top: 40 })
  })

  test('clamps a measured preview inside the safe viewport when neither side fits', () => {
    expect(
      getFloatingPreviewPosition(
        { top: 300, right: 140, bottom: 320, left: 1100 },
        { width: 320, height: 500 },
        { width: 1280, height: 600 },
        46,
      ),
    ).toEqual({ left: 952, top: 92 })
  })
})
