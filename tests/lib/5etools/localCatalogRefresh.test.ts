import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { matchesAcceptedSource } from '@/lib/5etools/additiveCatalogRestore'
import { checkCatalogRevision, prepareCatalog } from '@/lib/5etools/catalogCandidate'
import { compareCatalog } from '@/lib/5etools/catalogComparison'
import type { ReadSourceJson } from '@/lib/5etools/resourceReader'
import { readLocalCatalogResource } from '../../../electron/localCatalogResource'

let root: string
const feat = (name: string) => JSON.stringify({ feat: [{ name, source: 'PHB' }] })
const signal = () => new AbortController().signal

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tavern-refresh-'))
  await writeFile(join(root, 'feats.json'), feat('Original Feat'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function localFixture() {
  const config = { type: 'local', path: root, isValid: true } as const
  const counters = { probes: 0, bytes: 0 }
  const read: ReadSourceJson = async (request) => {
    if (request.kind !== 'local') throw new Error('Unexpected source')
    const probe = !!request.observation?.probe
    if (probe) counters.probes++
    const result = await readLocalCatalogResource(request.path, request.root, probe)
    if (result.text === undefined) return { observed: true, stamp: result.stamp }
    counters.bytes += Buffer.byteLength(result.text)
    return { observed: true, stamp: result.stamp, data: JSON.parse(result.text) }
  }
  const prepare = () => prepareCatalog(config, undefined, signal(), undefined, read)
  return { counters, prepare, read }
}

test('unchanged local source opens metadata only and detects a same-size replacement and a new resource', async () => {
  const { counters, prepare, read } = localFixture()
  const prior = await prepare()
  const proof = prior.config.resourceProof!
  expect(proof).toMatchObject({ kind: 'local' })
  expect(matchesAcceptedSource(prior.config, prior.config)).toBe(true)
  const metadataOnly = {
    ...prior.config,
    resourceProof: {
      kind: 'local' as const,
      entries: proof.entries.map(([path, stamp]): [string, string | null] => [
        path,
        stamp?.split('#')[0] ?? null,
      ]),
    },
  }
  expect(matchesAcceptedSource(metadataOnly, prior.config)).toBe(false)
  const fullBytes = counters.bytes
  expect(fullBytes).toBeGreaterThan(0)
  const check = () =>
    checkCatalogRevision(prior.config, undefined, proof, signal(), undefined, read)
  await expect(check()).resolves.toBeNull()
  expect(counters.probes).toBe(proof.entries.length)
  expect(counters.bytes).toBe(fullBytes)

  const replacement = join(root, 'replacement.json')
  await writeFile(replacement, feat('Replaced Feat'))
  await rename(replacement, join(root, 'feats.json'))
  const replaced = await check()
  expect(matchesAcceptedSource(prior.config, replaced!.config)).toBe(false)
  expect(replaced?.data.feats[0].name).toBe('Replaced Feat')

  await writeFile(join(root, 'feats.json'), feat('Original Feat'))
  const restored = await prepare()
  expect(matchesAcceptedSource(prior.config, restored.config)).toBe(true)
  await mkdir(join(root, 'spells'))
  await writeFile(join(root, 'spells/index.json'), JSON.stringify({ PHB: 'spells-phb.json' }))
  await writeFile(
    join(root, 'spells/spells-phb.json'),
    JSON.stringify({ spell: [{ name: 'New Spell', source: 'PHB', level: 1 }] }),
  )
  const added = await checkCatalogRevision(
    restored.config,
    undefined,
    restored.config.resourceProof!,
    signal(),
    undefined,
    read,
  )
  expect(added?.data.spells[0].name).toBe('New Spell')
})

test('a local unavailable folder or unreadable resource does not become a removal', async () => {
  const { prepare, read } = localFixture()
  await writeFile(
    join(root, 'languages.json'),
    JSON.stringify({
      language: [{ name: 'Test Language', source: 'PHB' }],
    }),
  )
  const prior = await prepare()
  const check = () =>
    checkCatalogRevision(
      prior.config,
      undefined,
      prior.config.resourceProof!,
      signal(),
      undefined,
      read,
    )
  const path = join(root, 'languages.json')
  await rm(path)
  await mkdir(path)
  await expect(check()).rejects.toThrow(/languages.json.*does not reference a file/)
  await rm(path, { recursive: true })
  const candidate = await check()
  expect(
    compareCatalog(candidate!, {
      config: prior.config,
      externalKeys: prior.keys,
      hasExternalData: true,
    }).removals,
  ).toContain('languages.json')
  await rm(root, { recursive: true })
  await expect(check()).rejects.toThrow('The selected data folder is unavailable.')
})
