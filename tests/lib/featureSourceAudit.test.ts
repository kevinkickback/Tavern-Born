import { readFileSync } from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'
import { featureOptionRulesSignature } from '@/lib/5etools/featureRulesSignature'

const hashCalls = vi.hoisted(() => ({ count: 0 }))
vi.mock('@noble/hashes/sha2.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@noble/hashes/sha2.js')>()
  return {
    ...original,
    sha256: Object.assign((...args: Parameters<typeof original.sha256>) => {
      hashCalls.count++
      return original.sha256(...args)
    }, original.sha256),
  }
})
const oracleHash = (
  await vi.importActual<typeof import('@noble/hashes/sha2.js')>('@noble/hashes/sha2.js')
).sha256
const { bytesToHex, utf8ToBytes } = await import('@noble/hashes/utils.js')
const oracle = (entries: unknown[], strip = true) => {
  const signature = featureOptionRulesSignature(entries, strip)
  return signature === undefined ? undefined : bytesToHex(oracleHash(utf8ToBytes(signature)))
}
let digest: typeof import('@/lib/5etools/featureSourceAudit').getFeatureSourceDigest
beforeEach(async () => {
  vi.resetModules()
  digest = (await import('@/lib/5etools/featureSourceAudit')).getFeatureSourceDigest
  hashCalls.count = 0
})

test('native source digests equal uncached SHA across strip modes without changing inputs', () => {
  const source = JSON.parse(readFileSync('tests/fixtures/optionalClassFeatureSources.json', 'utf8'))
  const before = JSON.stringify(source)
  for (const feature of source.classFeature) {
    for (const strip of [true, false]) {
      expect(digest(feature.entries, strip)).toBe(oracle(feature.entries, strip))
      expect(digest(structuredClone(feature.entries), strip)).toBe(oracle(feature.entries, strip))
    }
  }
  expect(JSON.stringify(source)).toBe(before)
})

test('every call observes current mutation, restoration, order and enrichment policy', () => {
  const entries: Record<string, unknown>[] = [{ name: 'Feature', entries: ['First', 'Second'] }]
  const first = digest(entries)
  expect(first).toBe(oracle(entries))
  expect(digest(structuredClone(entries))).toBe(first)
  expect(hashCalls.count).toBe(1)
  entries[0].name = 'Changed'
  expect(digest(entries)).toBe(oracle(entries))
  expect(digest(entries)).not.toBe(first)
  entries[0].name = 'Feature'
  expect(digest(entries)).toBe(first)
  expect(hashCalls.count).toBe(2)
  entries[0].feature = { name: 'Enrichment' }
  entries[0].featureOptionSourceConflict = true
  expect(digest(entries)).toBe(first)
  expect(digest(entries, false)).toBe(oracle(entries, false))
  expect(digest(entries, false)).not.toBe(first)
  expect(digest([{ entries: ['First', 'Second'], name: 'Feature' }])).toBe(first)
  entries[0].entries = ['Second', 'First']
  expect(digest(entries)).toBe(oracle(entries))
  expect(digest(entries)).not.toBe(first)
})

test('cycles and unserializable input never reuse an earlier valid digest', () => {
  const entries: unknown[] = ['Current']
  const first = digest(entries)
  entries.push(entries)
  expect(digest(entries)).toBeUndefined()
  expect(digest(undefined as unknown as unknown[])).toBeUndefined()
  expect(digest([1n])).toBeUndefined()
  entries.pop()
  expect(digest(entries)).toBe(first)
  expect(hashCalls.count).toBe(1)
})

test('entry limit evicts the least recently used signature without changing results', () => {
  for (let i = 0; i < 256; i++) expect(digest([i])).toBe(oracle([i]))
  expect(hashCalls.count).toBe(256)
  expect(digest([0])).toBe(oracle([0]))
  expect(digest([256])).toBe(oracle([256]))
  expect(hashCalls.count).toBe(257)
  expect(digest([0])).toBe(oracle([0]))
  expect(hashCalls.count).toBe(257)
  expect(digest([1])).toBe(oracle([1]))
  expect(hashCalls.count).toBe(258)
})

test('retained string charge evicts before the entry limit and hits never double-charge', () => {
  const rows = Array.from({ length: 9 }, (_, i) => [`${i}${'x'.repeat(32690)}`])
  for (const row of rows.slice(0, 8)) expect(digest(row)).toBe(oracle(row))
  for (let i = 0; i < 10; i++) expect(digest(rows[0])).toBe(oracle(rows[0]))
  expect(hashCalls.count).toBe(8)
  expect(digest(rows[8])).toBe(oracle(rows[8]))
  expect(digest(rows[0])).toBe(oracle(rows[0]))
  expect(hashCalls.count).toBe(9)
  expect(digest(rows[1])).toBe(oracle(rows[1]))
  expect(hashCalls.count).toBe(10)
})

test('oversized signatures hash normally on every call and do not displace retained entries', () => {
  const boundary = ['x'.repeat(32764)] // JSON array/string framing adds four code units.
  expect(featureOptionRulesSignature(boundary)?.length).toBe(32768)
  expect(digest(boundary)).toBe(oracle(boundary))
  expect(digest(boundary)).toBe(oracle(boundary))
  expect(hashCalls.count).toBe(1)
  const oversize = ['x'.repeat(32765)]
  expect(digest(oversize)).toBe(oracle(oversize))
  expect(digest(oversize)).toBe(oracle(oversize))
  expect(hashCalls.count).toBe(3)
  expect(digest(boundary)).toBe(oracle(boundary))
  expect(hashCalls.count).toBe(3)
})
