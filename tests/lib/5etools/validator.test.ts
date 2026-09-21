import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { validateDataSource } from '@/lib/5etools/validator'

function makeJsonResponse(jsonData: unknown, ok = true) {
  return new Response(JSON.stringify(jsonData), {
    status: ok ? 200 : 404,
    headers: { 'content-type': 'application/json' },
  })
}

const payloadByFile: Record<string, unknown> = {
  'books.json': { book: [{ id: 'PHB', name: 'Players Handbook' }] },
  'adventures.json': { adventure: [] },
  'races.json': { race: [{ name: 'Human', source: 'PHB' }] },
  'fluff-races.json': { raceFluff: [] },
  'fluff-backgrounds.json': { backgroundFluff: [] },
  'class/index.json': { phb: 'class-phb.json' },
  'backgrounds.json': { background: [{ name: 'Acolyte', source: 'PHB' }] },
  'spells/index.json': { phb: 'spells-phb.json' },
  'generated/gendata-spell-source-lookup.json': {},
  'feats.json': { feat: [{ name: 'Alert', source: 'PHB' }] },
  'items.json': { item: [{ name: 'Rope', source: 'PHB' }] },
  'items-base.json': { item: [{ name: 'Longsword', source: 'PHB' }] },
  'actions.json': { action: [{ name: 'Attack', source: 'PHB' }] },
  'conditionsdiseases.json': { condition: [{ name: 'Blinded', source: 'PHB' }] },
  'deities.json': { deity: [{}] },
  'skills.json': { skill: [{}] },
  'senses.json': { sense: [{}] },
  'languages.json': { language: [{ name: 'Common', source: 'PHB' }] },
  'magicvariants.json': { variant: [{}] },
  'optionalfeatures.json': { optionalfeature: [{ name: 'Feature', source: 'PHB' }] },
  'variantrules.json': { variantrule: [{}] },
  'trapshazards.json': { trap: [], hazard: [] },
  'rewards.json': { reward: [] },
  'cultsboons.json': { cult: [], boon: [] },
}

describe('5etools/validator', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  test('rejects empty path', async () => {
    const result = await validateDataSource({
      type: 'remote',
      path: '',
      isValid: false,
    })

    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Path cannot be empty')
  })

  test('rejects non-http remote URL protocol', async () => {
    const result = await validateDataSource({
      type: 'remote',
      path: 'ftp://example.com/data',
      isValid: false,
    })

    expect(result.isValid).toBe(false)
    expect(result.error).toContain('HTTPS')
  })

  test('returns invalid when no required resources are found', async () => {
    globalThis.fetch = vi.fn(async () => makeJsonResponse({}, false)) as unknown as typeof fetch

    const result = await validateDataSource({
      type: 'remote',
      path: 'https://example.com',
      isValid: false,
    })

    expect(result.isValid).toBe(false)
    expect(result.error).toContain('No valid 5etools data files found')
  })

  test('accepts remote source when all required files validate', async () => {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const result = await validateDataSource({
      type: 'remote',
      path: 'https://example.com',
      isValid: false,
    })

    expect(result.isValid).toBe(true)
    expect(result.foundResources?.length).toBe(Object.keys(payloadByFile).length)
    expect(result.normalizedPath).toBe('https://example.com')
  })

  test('accepts a coherent partial external source and inventories the available families', async () => {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      return url.endsWith('/data/feats.json')
        ? makeJsonResponse(payloadByFile['feats.json'])
        : makeJsonResponse({}, false)
    }) as unknown as typeof fetch

    const result = await validateDataSource({
      type: 'remote',
      path: 'https://example.com',
      isValid: false,
    })

    expect(result).toEqual(
      expect.objectContaining({
        isValid: true,
        foundResources: ['feats.json'],
      }),
    )
  })

  test('rejects a malformed resource instead of treating it as an absent family', async () => {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/data/races.json')) return makeJsonResponse({ race: 'invalid' })
      if (url.endsWith('/data/feats.json')) return makeJsonResponse(payloadByFile['feats.json'])
      return makeJsonResponse({}, false)
    }) as unknown as typeof fetch

    const result = await validateDataSource({
      type: 'remote',
      path: 'https://example.com',
      isValid: false,
    })

    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Invalid file: races.json')
  })

  test('validates remote JSON through the shared resource reader', async () => {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      return entry ? makeJsonResponse(entry[1]) : makeJsonResponse({}, false)
    }) as unknown as typeof fetch

    const result = await validateDataSource({
      type: 'remote',
      path: 'https://example.com',
      isValid: false,
    })

    expect(result.isValid).toBe(true)
    expect(result.foundResources).toHaveLength(Object.keys(payloadByFile).length)
    expect(globalThis.fetch).toHaveBeenCalledTimes(Object.keys(payloadByFile).length)
  })

  test('validates bundled resources through the Electron bridge without a network request', async () => {
    const readBundledJson = vi.fn(async (relativePath: string) => payloadByFile[relativePath])
    vi.stubGlobal('electronAPI', { readBundledJson })
    globalThis.fetch = vi.fn() as unknown as typeof fetch

    const result = await validateDataSource({
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: 'test',
      isValid: false,
    })

    expect(result.isValid).toBe(true)
    expect(readBundledJson).toHaveBeenCalledTimes(Object.keys(payloadByFile).length)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test('still requires the complete approved resource set for the bundled source', async () => {
    const readBundledJson = vi.fn((relativePath: string) => {
      if (relativePath === 'feats.json') return Promise.reject(new Error('missing'))
      return Promise.resolve(payloadByFile[relativePath])
    })
    vi.stubGlobal('electronAPI', { readBundledJson })

    const result = await validateDataSource({
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: 'test',
      isValid: false,
    })

    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Missing required file: feats.json')
  })
})
