import { describe, expect, test } from 'vitest'
import { getPortraitCssTransform } from '@/lib/portraitConstants'

describe('portrait card transforms', () => {
  test('uses card-relative offsets so the crop stays aligned at every rendered size', () => {
    expect(getPortraitCssTransform({ zoom: 150, panX: 20, panY: -10, rotation: 12 })).toBe(
      'translate(calc(-50% - 20%), calc(-50% - 4.166667%)) scale(1.5) rotate(12deg)',
    )
  })

  test('preserves the original neutral portrait placement on a standard card', () => {
    expect(getPortraitCssTransform()).toBe(
      'translate(calc(-50% - 25.555556%), calc(-50% + 0%)) scale(1) rotate(0deg)',
    )
  })
})
