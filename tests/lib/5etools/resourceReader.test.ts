// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  buildRemoteResourceUrl,
  createJsonResourceReader,
  readRemoteResourceBytes,
} from '@/lib/5etools/resourceReader'

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

  test('preserves the complete response at the 50 MiB limit', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    chunk[0] = 17
    chunk[chunk.length - 1] = 23
    let remaining = 50
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(chunk)
          if (--remaining === 0) controller.close()
        },
      }),
    )
    const bytes = new Uint8Array(await readRemoteResourceBytes(response))
    expect(bytes.byteLength).toBe(50 * 1024 * 1024)
    expect(bytes[0]).toBe(17)
    expect(bytes[bytes.length - 1]).toBe(23)
  })

  test.each([
    undefined,
    'e"current"',
  ])('cancels an over-limit response during a remote read with validator %s', async (stamp) => {
    const chunk = new Uint8Array(1024 * 1024)
    const cancel = vi.fn()
    let remaining = 54
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(chunk)
          if (--remaining === 0) controller.close()
        },
        cancel,
      }),
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const reader = createJsonResourceReader(
      { type: 'remote', path: 'https://example.com/5etools', isValid: true },
      undefined,
      stamp ? () => ({ stamp }) : undefined,
    )

    await expect(reader.readJson('items.json')).rejects.toThrow('50 MiB size limit')
    expect(cancel).toHaveBeenCalledOnce()
    expect(response.body?.locked).toBe(false)
  })

  test('retains a conditional 304 without reading a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 304 })))
    const reader = createJsonResourceReader(
      { type: 'remote', path: 'https://example.com/5etools', isValid: true },
      undefined,
      () => ({ stamp: 'e"current"' }),
    )

    await expect(reader.readJson('items.json')).resolves.toEqual({
      observed: true,
      unchanged: true,
    })
    expect(globalThis.fetch).toHaveBeenCalledOnce()
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
    expect(readLocalJson).toHaveBeenCalledWith(
      'C:\\5etools\\data\\class\\index.json',
      'C:\\5etools\\data',
    )
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
