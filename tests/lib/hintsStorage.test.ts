import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'

const storage = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key)
  }),
  clear: vi.fn(() => {
    storage.clear()
  }),
}

describe('hint storage', () => {
  beforeEach(() => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(localStorageMock as unknown as Storage)
    localStorageMock.clear()
  })

  afterEach(() => {
    localStorageMock.clear()
    vi.restoreAllMocks()
  })

  test('returns false when hint has never been dismissed', () => {
    expect(isHintDismissed('class-level-up-banner')).toBe(false)
  })

  test('persists dismissed hint state', () => {
    setHintDismissed('class-level-up-banner', true)

    expect(isHintDismissed('class-level-up-banner')).toBe(true)
  })

  test('clears dismissed hint state', () => {
    setHintDismissed('class-level-up-banner', true)
    setHintDismissed('class-level-up-banner', false)

    expect(isHintDismissed('class-level-up-banner')).toBe(false)
  })
})
