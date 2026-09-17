import { describe, expect, test } from 'vitest'
import { mapWithConcurrency } from '@/lib/async'

describe('mapWithConcurrency', () => {
  test('preserves input order while bounding active work', async () => {
    let active = 0
    let peakActive = 0

    const results = await mapWithConcurrency([4, 3, 2, 1, 0], 2, async (value) => {
      active += 1
      peakActive = Math.max(peakActive, active)
      await new Promise((resolve) => setTimeout(resolve, value))
      active -= 1
      return value * 2
    })

    expect(results).toEqual([8, 6, 4, 2, 0])
    expect(peakActive).toBe(2)
  })

  test('rejects invalid concurrency limits', async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(
      'Concurrency must be a positive integer',
    )
  })
})
