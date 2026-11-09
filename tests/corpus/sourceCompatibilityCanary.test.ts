// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { prepareCatalog } from '@/lib/5etools/catalogCandidate'

const source = process.env.TB_5ETOOLS_CANARY
const bundled = resolve('resources/srd')
test.skipIf(!source)(
  'the candidate pipeline admits a complete, revision-pinned 5etools catalog',
  async () => {
    const manifest = JSON.parse(readFileSync(resolve(bundled, 'manifest.json'), 'utf8'))
    vi.stubGlobal('electronAPI', {
      readBundledJson: (file: string) =>
        JSON.parse(readFileSync(resolve(bundled, 'data', file), 'utf8')),
    })
    try {
      const candidate = await prepareCatalog(
        { type: 'remote', path: source!, isValid: false },
        {
          type: 'bundled',
          path: 'srd/core',
          packId: manifest.packId,
          packVersion: manifest.packVersion,
          isValid: true,
        },
        AbortSignal.timeout(120_000),
      )
      expect(candidate.revision).toMatch(/^[a-f\d]{40}$/i)
      expect(candidate.data.classes.length).toBeGreaterThan(15)
      expect(candidate.data.spells.length).toBeGreaterThan(500)
      console.log('Admitted 5etools revision', candidate.revision)
    } finally {
      vi.unstubAllGlobals()
    }
  },
  125_000,
)
