import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { validateDataSource } from '@/lib/5etools/validator'

function makeJsonResponse(jsonData: unknown, ok = true) {
  return new Response(JSON.stringify(jsonData), {
    status: ok ? 200 : 404,
    headers: { 'content-type': 'application/json' },
  })
}

describe('5etools/validator', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
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
    expect(result.error).toContain('HTTP or HTTPS')
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
    const payloadByFile: Record<string, unknown> = {
      'books.json': { book: [{ id: 'PHB', name: 'Players Handbook' }] },
      'races.json': { race: [{ name: 'Human', source: 'PHB' }] },
      'class/index.json': { phb: 'class-phb.json' },
      'backgrounds.json': { background: [{ name: 'Acolyte', source: 'PHB' }] },
      'spells/index.json': { phb: 'spells-phb.json' },
      'feats.json': { feat: [{ name: 'Alert', source: 'PHB' }] },
      'items.json': { item: [{ name: 'Rope', source: 'PHB' }] },
      'items-base.json': { item: [{ name: 'Longsword', source: 'PHB' }] },
      'actions.json': { action: [{ name: 'Attack', source: 'PHB' }] },
      'conditionsdiseases.json': {
        condition: [{ name: 'Blinded', source: 'PHB' }],
      },
      'deities.json': { deity: [{}] },
      'skills.json': { skill: [{}] },
      'senses.json': { sense: [{}] },
      'languages.json': { language: [{ name: 'Common', source: 'PHB' }] },
      'magicvariants.json': { variant: [{}] },
      'optionalfeatures.json': {
        optionalfeature: [{ name: 'Feature', source: 'PHB' }],
      },
      'variantrules.json': { variantrule: [{}] },
    }

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
    expect(result.foundResources?.length).toBe(17)
    expect(result.normalizedPath).toBe('https://example.com')
  })
})
