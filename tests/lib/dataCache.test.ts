import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { DataSourceConfig, GameData } from '@/types/5etools'

const { idbGetMock, idbSetMock } = vi.hoisted(() => ({
  idbGetMock: vi.fn<() => Promise<unknown>>(async () => null),
  idbSetMock: vi.fn(async () => undefined),
}))

vi.mock('idb-keyval', () => ({
  get: idbGetMock,
  set: idbSetMock,
  del: vi.fn(async () => undefined),
}))

import { writeGameDataCache } from '@/lib/storage/dataCache'

function makeGameData(seed = 'a'): GameData {
  return {
    races: [{ name: seed } as never],
    classes: [],
    backgrounds: [],
    spells: [],
    feats: [],
    items: [],
    itemsBase: [],
    itemProperties: [],
    itemTypes: [],
    classFeatures: [],
    actions: [],
    conditions: [],
    deities: [],
    skills: [],
    senses: [],
    languages: [],
    magicvariants: [],
    optionalfeatures: [],
    variantrules: [],
    trapHazards: [],
    rewards: [],
    cultsBoons: [],
    organizations: [],
    sources: [],
  }
}

const config: DataSourceConfig = { type: 'remote', path: 'https://example.com', isValid: true }

describe('writeGameDataCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    idbGetMock.mockResolvedValue(null)
  })

  test('sets lastDataChangedAt to now on first write (no previous cache, no fallback)', async () => {
    const before = Date.now()
    const entry = await writeGameDataCache(makeGameData(), config)
    const after = Date.now()

    expect(entry.lastDataChangedAt).toBeDefined()
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeGreaterThanOrEqual(before)
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeLessThanOrEqual(after)
  })

  test('preserves lastDataChangedAt when fingerprint matches existing cache', async () => {
    const data = makeGameData()
    // First write to establish a cache entry
    const first = await writeGameDataCache(data, config)

    // Simulate the IDB cache having been written
    idbGetMock.mockResolvedValue({
      ...first,
      sourceSnapshot: { type: config.type, path: config.path },
    })

    // Second write with identical data — should not bump the timestamp
    const second = await writeGameDataCache(data, config)

    expect(second.lastDataChangedAt).toBe(first.lastDataChangedAt)
  })

  test('updates lastDataChangedAt when content actually changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const first = await writeGameDataCache(makeGameData('a'), config)

    idbGetMock.mockResolvedValue({
      ...first,
      sourceSnapshot: { type: config.type, path: config.path },
    })

    // Advance time so the new "now" differs from the first write
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))

    const second = await writeGameDataCache(makeGameData('b'), config)

    vi.useRealTimers()

    expect(second.lastDataChangedAt).toBe('2026-06-01T12:00:00.000Z')
    expect(second.lastDataChangedAt).not.toBe(first.lastDataChangedAt)
  })

  test('preserves lastDataChangedAt via fallback when cache was cleared but data unchanged', async () => {
    // Simulate: cache was cleared (idbGet returns null) but we know the fingerprint
    const data = makeGameData('x')

    // Get the fingerprint by doing a first write
    const first = await writeGameDataCache(data, config)
    const knownFingerprint = first.contentFingerprint as string
    const knownChangedAt = first.lastDataChangedAt

    // Clear the mock — no cache exists now
    idbGetMock.mockResolvedValue(null)

    // Re-write with same data and provide the fallback
    const second = await writeGameDataCache(data, config, {
      fingerprint: knownFingerprint,
      lastDataChangedAt: knownChangedAt,
    })

    expect(second.lastDataChangedAt).toBe(knownChangedAt)
  })

  test('ignores fallback when fingerprints differ (data actually changed)', async () => {
    const dataA = makeGameData('a')
    const dataB = makeGameData('b')

    const firstA = await writeGameDataCache(dataA, config)

    idbGetMock.mockResolvedValue(null)

    const before = Date.now()
    const entry = await writeGameDataCache(dataB, config, {
      fingerprint: firstA.contentFingerprint,
      lastDataChangedAt: firstA.lastDataChangedAt,
    })
    const after = Date.now()

    expect(entry.lastDataChangedAt).toBeDefined()
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeGreaterThanOrEqual(before)
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeLessThanOrEqual(after)
  })

  test('ignores fallback when lastDataChangedAt is null', async () => {
    const data = makeGameData('x')
    const first = await writeGameDataCache(data, config)

    idbGetMock.mockResolvedValue(null)

    const before = Date.now()
    const entry = await writeGameDataCache(data, config, {
      fingerprint: first.contentFingerprint,
      lastDataChangedAt: null,
    })
    const after = Date.now()

    expect(entry.lastDataChangedAt).toBeDefined()
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeGreaterThanOrEqual(before)
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeLessThanOrEqual(after)
  })

  test('preserves lastDataChangedAt via fallback when existing cache lacks a fingerprint (legacy cache)', async () => {
    const data = makeGameData('y')

    // First write to get the real fingerprint and changed-at
    const first = await writeGameDataCache(data, config)
    const knownFingerprint = first.contentFingerprint as string
    const knownChangedAt = first.lastDataChangedAt

    // Simulate a legacy cache entry — same source, same data, but no contentFingerprint
    idbGetMock.mockResolvedValue({
      data,
      cachedAt: first.cachedAt,
      // contentFingerprint intentionally absent (legacy)
      lastDataChangedAt: knownChangedAt,
      sourceSnapshot: { type: config.type, path: config.path },
    })

    // Re-write with the same data, passing the fallback fingerprint from the store
    const second = await writeGameDataCache(data, config, {
      fingerprint: knownFingerprint,
      lastDataChangedAt: knownChangedAt,
    })

    // Should preserve the old timestamp even though the cache lacked a fingerprint
    expect(second.lastDataChangedAt).toBe(knownChangedAt)
  })
})
