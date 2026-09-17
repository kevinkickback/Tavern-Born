import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  isHintDismissed,
  resetAllHints,
  setHintDismissed,
  subscribeToHintReset,
} from '@/lib/storage/hints'

const storage = new Map<string, string>()
const localStorageMock = {
  get length() {
    return storage.size
  },
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
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

  test('resets every dismissed hint without removing unrelated local storage', () => {
    setHintDismissed('class-level-up-banner', true)
    setHintDismissed('equipment-equip-toggle', true)
    localStorage.setItem('unrelated-setting', 'keep-me')

    resetAllHints()

    expect(isHintDismissed('class-level-up-banner')).toBe(false)
    expect(isHintDismissed('equipment-equip-toggle')).toBe(false)
    expect(localStorage.getItem('unrelated-setting')).toBe('keep-me')
  })

  test('notifies active listeners once per reset and supports unsubscription', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToHintReset(listener)

    resetAllHints()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    resetAllHints()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('fails closed when browser storage is unavailable', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage disabled')
    })
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('storage disabled')
    })

    expect(isHintDismissed('equipment-equip-toggle')).toBe(false)
    expect(() => setHintDismissed('equipment-equip-toggle', true)).not.toThrow()
  })
})
