import { afterEach, describe, expect, test, vi } from 'vitest'
import { resolveDefaultBundledSource } from '@/lib/5etools/bundledSource'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('default bundled source', () => {
  test('derives stable source identity from an approved packaged manifest', async () => {
    vi.stubGlobal('electronAPI', {
      getBundledManifest: vi.fn(async () => ({
        schemaVersion: 1,
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        distributionStatus: 'approved-for-distribution',
      })),
    })

    await expect(resolveDefaultBundledSource()).resolves.toEqual({
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    })
  })

  test('does not expose an unreviewed or unavailable pack as the default', async () => {
    const getBundledManifest = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: 1,
        packId: 'tavern-born-srd-core',
        packVersion: '0.1.0-dev',
        distributionStatus: 'provenance-review-required',
      })
      .mockRejectedValueOnce(new Error('manifest missing'))
    vi.stubGlobal('electronAPI', { getBundledManifest })

    await expect(resolveDefaultBundledSource()).resolves.toBeNull()
    await expect(resolveDefaultBundledSource()).resolves.toBeNull()
  })
})
