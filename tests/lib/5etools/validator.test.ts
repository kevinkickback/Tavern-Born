import { expect, test, vi } from 'vitest'
import { type JsonResourceReader, ResourceHttpError } from '@/lib/5etools/resourceReader'
import { inspectCatalogResources } from '@/lib/5etools/validator'

const feats = { feat: [{ name: 'Alert', source: 'PHB' }] }
const bookPath = 'book/book-tce.json'
const signal = () => new AbortController().signal

function makeReader(files: Record<string, unknown>, type: JsonResourceReader['type'] = 'remote') {
  return {
    type,
    readJson: vi.fn((path: string) => {
      if (!(path in files)) {
        return Promise.reject(
          type === 'local'
            ? new Error(`ENOENT: no such file ${path}`)
            : new ResourceHttpError(404, path),
        )
      }
      const value = files[path]
      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value)
    }),
  }
}

test.each([
  ['current TCE', { bookData: [{ id: 'TCE', source: 'TCE', data: [] }] }, true],
  ['malformed data', { data: 'malformed' }, false],
  ['foreign book', { bookData: [{ id: 'PHB', source: 'PHB', data: [] }] }, false],
  [
    'conflicting envelopes',
    { data: [], bookData: [{ id: 'TCE', source: 'TCE', data: [] }] },
    false,
  ],
])('inventories optional book support and diagnoses an incompatible envelope: %s', async (_label, book, valid) => {
  const reader = makeReader({ [bookPath]: book, 'feats.json': feats })
  const result = await inspectCatalogResources(reader, [], signal())
  expect(result.resources).toEqual([bookPath, 'feats.json'])
  expect(result.warnings).toEqual(valid ? [] : [`Incompatible ${bookPath}`])
})

test('a newly unavailable optional book warns, while a previously supplied book blocks the candidate', async () => {
  const reader = makeReader({
    [bookPath]: new ResourceHttpError(503, bookPath),
    'feats.json': feats,
  })
  await expect(inspectCatalogResources(reader, [], signal())).resolves.toMatchObject({
    resources: ['feats.json'],
    warnings: [expect.stringContaining(bookPath)],
  })
  await expect(inspectCatalogResources(reader, [bookPath], signal())).rejects.toThrow(
    /Could not read book\/book-tce\.json.*503/,
  )
})

test.each([
  ['conditionsdiseases.json', { status: {} }],
  ['trapshazards.json', { hazard: [{ source: 'DMG' }] }],
  ['items-base.json', { itemEntry: [{ name: 'Broken', source: 'DMG' }] }],
  ['items-base.json', { baseitem: [], itemTypeAdditionalEntries: {} }],
  ['races.json', { race: 'invalid' }],
])('rejects malformed supported collections in %s', async (file, invalid) => {
  const reader = makeReader({ 'feats.json': feats, [file]: invalid })
  await expect(inspectCatalogResources(reader, [], signal())).rejects.toThrow(
    `Incompatible ${file}`,
  )
})

test('keeps malformed optional category prose inside a valid item collection for parser diagnostics', async () => {
  const reader = makeReader({
    'items-base.json': {
      baseitem: [{ name: 'Longsword', source: 'PHB' }],
      itemTypeAdditionalEntries: [{ source: 'XGE', appliesTo: 'INS|PHB', entries: 'broken' }],
    },
  })
  await expect(inspectCatalogResources(reader, [], signal())).resolves.toMatchObject({
    resources: ['items-base.json'],
    warnings: [],
  })
})

test.each([
  'remote',
  'local',
] as const)('accepts a partial %s source and reuses its inventoried read', async (type) => {
  const reader = makeReader({ 'feats.json': feats }, type)
  const result = await inspectCatalogResources(reader, [], signal())
  expect(result.resources).toEqual(['feats.json'])
  await expect(result.reader.readJson('feats.json')).resolves.toBe(feats)
  expect(reader.readJson.mock.calls.filter(([path]) => path === 'feats.json')).toHaveLength(1)
})

test('rejects an empty inventory and does not treat access errors as missing files', async () => {
  await expect(inspectCatalogResources(makeReader({}), [], signal())).rejects.toThrow(
    'No compatible game data files were found',
  )
  const blocked = makeReader({ 'feats.json': new Error('EACCES: permission denied') }, 'local')
  await expect(inspectCatalogResources(blocked, [], signal())).rejects.toThrow(
    'Could not read feats.json — EACCES: permission denied',
  )
})

test('recognizes a partial psionic family and rejects malformed mode costs', async () => {
  const valid = makeReader({
    'psionics.json': {
      psionic: [{ name: 'Test Talent', source: 'TEST', type: 'T', entries: ['Test rules.'] }],
    },
  })
  await expect(inspectCatalogResources(valid, [], signal())).resolves.toMatchObject({
    resources: ['psionics.json'],
  })
  const invalid = makeReader({
    'psionics.json': {
      psionic: [
        {
          name: 'Bad Discipline',
          source: 'TEST',
          type: 'D',
          entries: [],
          modes: [{ name: 'Mode', entries: [], cost: { min: 3, max: 1 } }],
        },
      ],
    },
  })
  await expect(inspectCatalogResources(invalid, [], signal())).rejects.toThrow(
    'Incompatible psionics.json',
  )
})
