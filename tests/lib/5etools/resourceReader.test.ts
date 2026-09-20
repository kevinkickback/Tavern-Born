import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildRemoteResourceUrl, createJsonResourceReader } from '@/lib/5etools/resourceReader'

function makeJsonResponse(data: unknown, ok = true) {
  return new Response(JSON.stringify(data), { status: ok ? 200 : 404 })
}

describe('5etools resource readers', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('builds remote resource URLs below the data root', () => {
    expect(
      buildRemoteResourceUrl('https://example.com/5etools-src/main', 'class/class-wizard.json'),
    ).toBe('https://example.com/5etools-src/main/data/class/class-wizard.json')
  })

  test('reads remote JSON with normalized repository URLs', async () => {
    globalThis.fetch = vi.fn(async () => makeJsonResponse({ ok: true })) as unknown as typeof fetch
    const reader = createJsonResourceReader({
      type: 'remote',
      path: 'https://github.com/example/5etools-src/tree/main',
      isValid: true,
    })

    await expect(reader.readJson('spells/index.json')).resolves.toEqual({ ok: true })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/example/5etools-src/main/data/spells/index.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  test('reads local JSON using the configured platform separator', async () => {
    const readLocalJson = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('electronAPI', { readLocalJson })
    const reader = createJsonResourceReader({
      type: 'local',
      path: 'C:\\5etools\\data',
      isValid: true,
    })

    await expect(reader.readJson('class/index.json')).resolves.toEqual({ ok: true })
    expect(readLocalJson).toHaveBeenCalledWith('C:\\5etools\\data\\class\\index.json')
  })

  test('reads bundled JSON without exposing a filesystem path', async () => {
    const readBundledJson = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('electronAPI', { readBundledJson })
    const reader = createJsonResourceReader({
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: 'test',
      isValid: true,
    })

    await expect(reader.readJson('items.json')).resolves.toEqual({ ok: true })
    expect(readBundledJson).toHaveBeenCalledWith('items.json')
  })

  test('rejects traversal and non-JSON paths before calling a transport', async () => {
    const readBundledJson = vi.fn()
    vi.stubGlobal('electronAPI', { readBundledJson })
    const reader = createJsonResourceReader({
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: 'test',
      isValid: true,
    })

    await expect(reader.readJson('../manifest.json')).rejects.toThrow('Invalid JSON resource path')
    await expect(reader.readJson('class/readme.txt')).rejects.toThrow('Invalid JSON resource path')
    expect(readBundledJson).not.toHaveBeenCalled()
  })
})
