import { describe, expect, test } from 'vitest'
import { getViewportBoundedMaxHeight } from '@/lib/layoutHeights'

describe('layoutHeights', () => {
  test('builds the shared spell-list viewport max height', () => {
    expect(getViewportBoundedMaxHeight(18)).toBe('max(12rem, calc(100vh - 18rem - 0px))')
  })

  test('adds extra pixel offset for stacked cards', () => {
    expect(getViewportBoundedMaxHeight(18, 216)).toBe('max(12rem, calc(100vh - 18rem - 216px))')
  })
})
