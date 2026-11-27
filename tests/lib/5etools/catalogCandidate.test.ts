import { afterEach, expect, test, vi } from 'vitest'
import { prepareCatalog } from '@/lib/5etools/catalogCandidate'
import { compareCatalog } from '@/lib/5etools/catalogComparison'
import { type ReadSourceJson, ResourceHttpError } from '@/lib/5etools/resourceReader'

const online = { type: 'remote' as const, path: 'https://backup.example.test/rules', isValid: true }
const signal = () => new AbortController().signal
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const files: Record<string, unknown> = {
  'spells/index.json': { PHB: 'spells-phb.json', XPHB: 'spells-xphb.json' },
  'spells/spells-phb.json': { spell: [{ name: 'Magic Missile', source: 'PHB', level: 1 }] },
  'spells/spells-xphb.json': { spell: [{ name: 'Cure Wounds', source: 'XPHB', level: 1 }] },
}

const subclassWithGrant = (name: string, spell: string) => ({
  name,
  shortName: name,
  source: 'TEST',
  className: 'Guardian',
  classSource: 'TEST',
  additionalSpells: [{ prepared: { 3: [spell] } }],
})

test('previews a verified subset from the same reads, preserving healthy sibling rules', async () => {
  const payloads: Record<string, unknown> = {
    ...files,
    'feats.json': { feat: [{ name: 'Guardian Training', source: 'TEST' }] },
    'languages.json': {
      language: [{ name: 'Guardian Language', source: 'TEST', type: 'standard' }],
    },
    'class/index.json': { test: 'class-test.json' },
    'class/class-test.json': {
      class: [{ name: 'Guardian', source: 'TEST' }],
      subclass: [
        subclassWithGrant('Healthy', 'Cure Wounds|XPHB'),
        subclassWithGrant('Broken', 'Magic Missile|XPHB'),
      ],
    },
  }
  const fetch = vi.fn((url: string) => {
    const key = url.slice(online.path.length + 6)
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  vi.stubGlobal('fetch', fetch)
  const candidate = await prepareCatalog(online, undefined, signal(), undefined, undefined, true)
  expect(candidate.contents).toBe('1 class, 1 subclass entry, 2 spells, 1 feat, and more')
  expect(candidate.contentsDetails).toEqual([
    '1 class',
    '1 subclass entry',
    '2 spells',
    '1 feat',
    '1 language',
  ])
  expect(candidate.partialImport).toEqual({
    skipped: ['Broken (TEST) for Guardian (TEST). Requires Magic Missile (XPHB).'],
  })
  expect(candidate.data.classes[0].subclasses?.map(({ name }) => name)).toEqual(['Healthy'])
  expect(candidate.keys.every((key) => !key.includes('broken'))).toBe(true)
  expect(candidate.config.resourceProof).toBeUndefined()
  const requests = fetch.mock.calls.map(([url]) => url)
  expect(new Set(requests).size).toBe(requests.length)
})

test('rechecks dependents after removing a broken feature owner', async () => {
  const payloads: Record<string, unknown> = {
    'class/index.json': { test: 'class-test.json' },
    'class/class-test.json': {
      class: [
        { name: 'Guardian', source: 'PHB', classFeatures: ['Absent|Guardian|PHB|1|TEST'] },
        { name: 'Follower', source: 'TEST', classFeatures: ['Training|Guardian|PHB|2|TEST'] },
        { name: 'Guardian', source: 'OTHER' },
      ],
      classFeature: [
        { name: 'Training', className: 'Guardian', classSource: ' ', source: 'TEST', level: 2 },
      ],
    },
  }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.slice(online.path.length + 6)
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  const candidate = await prepareCatalog(online, undefined, signal(), undefined, undefined, true)
  expect(candidate.data.classes.map(({ name, source }) => [name, source])).toEqual([
    ['Guardian', 'OTHER'],
  ])
  expect(candidate.data.classFeatures).toEqual([])
  expect(candidate.contentsDetails).toEqual(['1 class'])
  expect(candidate.partialImport).toEqual({
    skipped: [
      'Guardian (PHB). Requires Absent|Guardian|PHB|1|TEST.',
      'Follower (TEST). Requires Training|Guardian|PHB|2|TEST.',
    ],
  })
})

test('keeps supported standalone rules metadata after excluding a class', async () => {
  const payloads: Record<string, unknown> = {
    'items-base.json': {
      itemProperty: [{ abbreviation: 'AZ', name: 'A Test Property', source: 'TEST' }],
    },
    'class/index.json': { TEST: 'class-test.json' },
    'class/class-test.json': {
      class: [{ name: 'Guardian', source: 'TEST', classFeatures: ['Absent|Guardian|TEST|1|TEST'] }],
    },
  }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.slice(online.path.length + 6)
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  const candidate = await prepareCatalog(online, undefined, signal(), undefined, undefined, true)
  expect(candidate.contents).toBe('1 item property')
  expect(candidate.contentsDetails).toEqual(['1 item property'])
  expect(candidate.data.itemProperties).toMatchObject([{ name: 'A Test Property', source: 'TEST' }])
})

test('skips an exact subclass copy when its original is removed on the first pass', async () => {
  const payloads: Record<string, unknown> = {
    'class/index.json': { TEST: 'class-guardian.json', OTHER: 'class-scout.json' },
    'class/class-guardian.json': {
      class: [{ name: 'Guardian', source: 'TEST' }],
      subclass: [subclassWithGrant('Original', 'Missing Spell|TEST')],
    },
    'class/class-scout.json': {
      _meta: { dependencies: { subclass: ['TEST'] } },
      class: [{ name: 'Scout', source: 'OTHER' }],
      subclass: [
        {
          name: 'Variant',
          shortName: 'Variant',
          source: 'OTHER',
          className: 'Scout',
          classSource: 'OTHER',
          additionalSpells: [],
          _copy: {
            name: 'Original',
            shortName: 'Original',
            source: 'TEST',
            className: 'Guardian',
            classSource: 'TEST',
          },
        },
      ],
    },
  }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.slice(online.path.length + 6)
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  const candidate = await prepareCatalog(online, undefined, signal(), undefined, undefined, true)
  expect(
    candidate.data.classes.map(({ name, subclasses }) => [name, subclasses?.length ?? 0]),
  ).toEqual([
    ['Guardian', 0],
    ['Scout', 0],
  ])
  expect(candidate.partialImport?.skipped).toEqual([
    'Original (TEST) for Guardian (TEST). Requires Missing Spell (TEST).',
    'Variant (OTHER) for Scout (OTHER). Could not use the original Original (TEST) subclass for Guardian (TEST).',
  ])
})

test.each([
  'unreadable',
  'incompatible support file',
  'unidentified copy parent',
  'already loaded',
  'empty subset',
])('does not offer a partial catalog for %s', async (fault) => {
  const payloads: Record<string, unknown> = {
    ...(fault === 'empty subset' ? {} : files),
    'class/index.json': { test: 'class-test.json' },
    'class/class-test.json': {
      class: [
        fault === 'unidentified copy parent'
          ? { name: 'Guardian', source: 'TEST', _copy: { name: 'Original' } }
          : { name: 'Guardian', source: 'TEST', classFeatures: ['Absent|Guardian|TEST|1|TEST'] },
      ],
    },
    ...(fault === 'incompatible support file'
      ? { 'book/book-tce.json': { unsupported: 'wrong' } }
      : {}),
  }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.slice(online.path.length + 6)
    if (key === 'fluff-backgrounds.json' && fault === 'unreadable')
      return Promise.resolve(json(null, 503))
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  const config = fault === 'already loaded' ? { ...online, lastLoaded: '2026-01-01' } : online
  await expect(
    prepareCatalog(config, undefined, signal(), undefined, undefined, true),
  ).rejects.toThrow()
})

afterEach(() => vi.unstubAllGlobals())

test('prepares a personal HTTPS source using one read per file and no provider API', async () => {
  const fetch = vi.fn((url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    return Promise.resolve(key in files ? json(files[key]) : json(null, 404))
  })
  vi.stubGlobal('fetch', fetch)
  const candidate = await prepareCatalog(online, undefined, signal())
  expect(candidate.data.spells.map(({ name }) => name)).toEqual(['Magic Missile', 'Cure Wounds'])
  expect(candidate.contents).toBe('2 spells')
  expect(candidate.warnings).toEqual([])
  const urls = fetch.mock.calls.map(([url]) => url)
  expect(new Set(urls).size).toBe(urls.length)
  expect(urls.every((url) => url.startsWith(`${online.path}/data/`))).toBe(true)
})

test.each([
  true,
  false,
])('standalone admission requires the exact cross-file feature target (present: %s)', async (exact) => {
  const target = 'Training|Guardian|XPHB|2|XPHB'
  const feature = {
    name: 'Training',
    className: 'Guardian',
    classSource: 'XPHB',
    source: 'XPHB',
  }
  const payloads: Record<string, unknown> = {
    'class/index.json': { Guardian: 'class-guardian.json', Scout: 'class-scout.json' },
    'class/class-guardian.json': {
      class: [{ name: 'Guardian', source: 'XPHB' }],
      classFeature: [
        { ...feature, level: 1, entries: ['Different gain.'] },
        { ...feature, source: 'PHB', level: 2, entries: ['Different printing.'] },
        ...(exact ? [{ ...feature, level: 2, entries: ['Exact training.'] }] : []),
      ],
    },
    'class/class-scout.json': {
      class: [{ name: 'Scout', source: 'XPHB', classFeatures: [target] }],
    },
  }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  const preparation = prepareCatalog(online, undefined, signal())
  if (!exact) {
    await expect(preparation).rejects.toThrow(target)
    return
  }
  const { data, contents, warnings } = await preparation
  expect(contents).toBe('2 classes and 3 class features')
  expect(warnings).toEqual([])
  expect(data.classes.find(({ name }) => name === 'Scout')?.classFeatureRefs).toMatchObject([
    { ref: target, feature: { ...feature, level: 2, entries: ['Exact training.'] } },
  ])
})

test.each([
  'complete',
  'missing',
  'cycle',
  'ambiguous',
])('background copy chains require complete exact ancestry: %s', async (mode) => {
  const ancestor = {
    name: 'Courtier',
    source: 'PHB',
    page: 50,
    skillProficiencies: [{ insight: true }],
    entries: [{ type: 'entries', name: 'Contact', entries: ['Accepted ancestor.'] }],
  }
  const first = {
    name: 'Informant',
    source: 'PHB',
    _copy: { name: 'Courtier', source: 'PHB' },
    skillProficiencies: null,
  }
  const second = {
    name: 'Agent',
    source: 'XGE',
    _copy: {
      name: 'Informant',
      source: 'PHB',
      _mod: { entries: { mode: 'appendArr', items: ['Exact child addition.'] } },
    },
  }
  const background = [
    { ...ancestor, source: 'XGE', entries: ['Wrong printing.'] },
    first,
    second,
    ...(mode === 'missing'
      ? []
      : [
          mode === 'cycle' ? { ...ancestor, _copy: { name: 'Agent', source: 'XGE' } } : ancestor,
          ...(mode === 'ambiguous' ? [ancestor] : []),
        ]),
  ]
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      url.endsWith('/data/backgrounds.json') ? json({ background }) : json(null, 404),
    ),
  )
  const result = prepareCatalog(online, undefined, signal())
  if (mode !== 'complete') {
    await expect(result).rejects.toThrow(/copied record|duplicate background identity/i)
    return
  }
  const agent = (await result).data.backgrounds.find(({ name }) => name === 'Agent')
  expect(agent).toMatchObject({
    name: 'Agent',
    source: 'XGE',
    entries: [ancestor.entries[0], 'Exact child addition.'],
  })
  expect(agent).not.toHaveProperty('skillProficiencies')
  expect(agent).not.toHaveProperty('page')
  expect(agent).not.toHaveProperty('_copy')
})

test('a valid external layer cannot mask a metadata-only Included SRD', async () => {
  const itemEntry = [{ name: 'Loose text', source: 'PHB', entriesTemplate: ['Shared text.'] }]
  vi.stubGlobal('window', {
    electronAPI: {
      readBundledJson: (file: string) =>
        Promise.resolve(file === 'items-base.json' ? { itemEntry } : {}),
    },
  })
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    return Promise.resolve(key in files ? json(files[key]) : json(null, 404))
  })
  const bundled = {
    type: 'bundled' as const,
    path: 'srd/core',
    packId: 'tavern-born-srd-core',
    packVersion: '1.0.0',
    isValid: true,
  }
  await expect(prepareCatalog(online, bundled, signal())).rejects.toThrow(
    'The Included SRD could not be loaded.',
  )
  const standalone = await prepareCatalog(online, undefined, signal())
  expect(standalone.data.spells.map(({ name }) => name)).toContain('Magic Missile')
})

test.each([
  {},
  { spell: [{}] },
  { spell: [{ name: 'Cure Wounds', source: 'PHB', level: 1 }] },
])('rejects indexed documents without the declared spell collection/printing', async (body) => {
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    if (key === 'spells/spells-xphb.json') return Promise.resolve(json(body))
    return Promise.resolve(key in files ? json(files[key]) : json(null, 404))
  })
  await expect(prepareCatalog(online, undefined, signal())).rejects.toThrow(
    'spells/spells-xphb.json',
  )
})

test('rejects a failed mechanical read while omitting absent families', async () => {
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    if (key === 'feats.json') return Promise.resolve(json(null, 503))
    return Promise.resolve(key in files ? json(files[key]) : json(null, 404))
  })
  await expect(prepareCatalog(online, undefined, signal())).rejects.toThrow(/feats.json.*503/)
})

test('counts supplied variants without counting their generated item references', async () => {
  const magicvariant = [
    { name: 'Copper Gizmo', source: 'TEST', type: 'GV', inherits: { source: 'TEST' } },
  ]
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      url.endsWith('/data/magicvariants.json') ? json({ magicvariant }) : json(null, 404),
    ),
  )
  const candidate = await prepareCatalog(online, undefined, signal())
  expect(candidate.keys).toContain('items: entity:copper gizmo|test|')
  expect(candidate.contents).toBe('1 magic item variant')
})

test('reports an indexed read failure before dependencies from that file are audited', async () => {
  const base = {
    type: 'bundled' as const,
    path: 'srd/core',
    packId: 'core',
    packVersion: '1',
    isValid: true,
  }
  const additional: Record<string, unknown> = {
    'class/index.json': { Guardian: 'class-guardian.json', Scout: 'class-scout.json' },
    'class/class-scout.json': {
      class: [{ name: 'Scout', source: 'XPHB', classFeatures: ['Training|Guardian|XPHB|2|XPHB'] }],
    },
  }
  const failed = 'class/class-guardian.json'
  const read: ReadSourceJson = (request) => {
    if (request.kind === 'bundled') return Promise.resolve(files[request.path] ?? {})
    const path = request.kind === 'remote' ? request.url.slice(online.path.length + 6) : ''
    if (path === failed) return Promise.reject(new ResourceHttpError(503, path))
    if (!(path in additional)) return Promise.reject(new ResourceHttpError(404, path))
    return Promise.resolve(additional[path])
  }
  await expect(prepareCatalog(online, base, signal(), undefined, read)).rejects.toMatchObject({
    message: expect.stringMatching(/Could not load required game data.*class-guardian\.json.*503/),
    details: [expect.stringContaining(failed)],
  })
})

test('a never-admitted optional file stays a warning on refresh', async () => {
  const optional = 'fluff-backgrounds.json'
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    if (key === optional) return Promise.resolve(json(null, 403))
    return Promise.resolve(key in files ? json(files[key]) : json(null, 404))
  })
  const first = await prepareCatalog(online, undefined, signal())
  const next = await prepareCatalog(
    { ...first.config, lastLoaded: '2026-01-01T00:00:00Z' },
    undefined,
    signal(),
  )
  expect(next.warnings).toEqual([expect.stringContaining(optional)])
  expect(next.config.availableResources).not.toContain(optional)
})

test('requires an index withdrawal before accepting the loss of an indexed spell file', async () => {
  const index = 'spells/index.json'
  const removed = 'spells/spells-xphb.json'
  const payloads = { ...files }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  const accepted = await prepareCatalog(online, undefined, signal())
  delete payloads[removed]
  await expect(prepareCatalog(accepted.config, undefined, signal())).rejects.toThrow(removed)

  payloads[index] = { PHB: 'spells-phb.json' }
  const next = await prepareCatalog(accepted.config, undefined, signal())
  const comparison = compareCatalog(next, {
    config: accepted.config,
    externalKeys: accepted.keys,
    hasExternalData: true,
  })
  expect(comparison.removals).toEqual(accepted.keys.filter((key) => !next.keys.includes(key)))
  expect(comparison.removals).toHaveLength(1)
  expect(comparison.removals[0]).toMatch(/cure wounds.*xphb/i)
})

test('warns about absent optional bundled descriptions without admitting a read failure as a removal', async () => {
  const base = {
    type: 'bundled' as const,
    path: 'srd/core',
    packId: 'core',
    packVersion: '1',
    isValid: true,
  }
  const config = { ...online, lastLoaded: '2026-01-01T00:00:00Z' }
  const description = 'class/fluff-class-fighter.json'
  const read: ReadSourceJson = (request) => {
    if (request.kind === 'bundled') {
      if (request.path === description) return Promise.reject(new Error(`ENOENT: ${description}`))
      if (request.path === 'class/index.json') return Promise.resolve({ PHB: 'class-fighter.json' })
      if (request.path === 'class/class-fighter.json')
        return Promise.resolve({ class: [{ name: 'Fighter', source: 'PHB' }] })
      return Promise.resolve({})
    }
    const path = request.kind === 'remote' ? request.url.slice(online.path.length + 6) : ''
    if (!(path in files)) return Promise.reject(new ResourceHttpError(404, path))
    return Promise.resolve(files[path])
  }
  const candidate = await prepareCatalog(config, base, signal(), undefined, read)
  expect(candidate.data.classes.map(({ name }) => name)).toContain('Fighter')
  expect(candidate.warnings.some((warning) => warning.includes(description))).toBe(true)
  expect(candidate.unavailableResources).toBeUndefined()
})

test('a classes-only source can use a spell already available in the Included SRD', async () => {
  const base = {
    type: 'bundled' as const,
    path: 'srd/core',
    packId: 'core',
    packVersion: '1',
    isValid: true,
  }
  const additional: Record<string, unknown> = {
    'class/index.json': { TEST: 'class-test.json' },
    'class/class-test.json': {
      class: [{ name: 'Wizard', source: 'TEST' }],
      subclass: [
        {
          name: 'Example',
          shortName: 'Example',
          source: 'TEST',
          className: 'Wizard',
          classSource: 'TEST',
          additionalSpells: [{ prepared: { 3: ['Cure Wounds|XPHB'] } }],
        },
      ],
    },
  }
  const read: ReadSourceJson = (request) => {
    if (request.kind === 'bundled') return Promise.resolve(files[request.path] ?? {})
    const path = request.kind === 'remote' ? request.url.slice(online.path.length + 6) : ''
    if (!(path in additional)) return Promise.reject(new ResourceHttpError(404, path))
    return Promise.resolve(additional[path])
  }
  const candidate = await prepareCatalog(online, base, signal(), undefined, read)
  expect(candidate.contents).toBe('1 class and 1 subclass entry')
  expect(candidate.warnings).toEqual([])
  expect(candidate.dependencyWarnings).toBeUndefined()
})

test('counts a supplied subrace that attaches to an Included SRD species', async () => {
  const base = {
    type: 'bundled' as const,
    path: 'srd/core',
    packId: 'core',
    packVersion: '1',
    isValid: true,
  }
  const additional: Record<string, unknown> = {
    'feats.json': { feat: [{ name: 'Wanderer', source: 'TEST' }] },
    'races.json': {
      race: [],
      subrace: [
        { name: 'Tides', source: 'TEST', raceName: 'Elf', raceSource: 'PHB', entries: ['Tides.'] },
      ],
    },
  }
  const read: ReadSourceJson = (request) => {
    if (request.kind === 'bundled')
      return Promise.resolve(
        request.path === 'races.json' ? { race: [{ name: 'Elf', source: 'PHB' }] } : {},
      )
    const path = request.kind === 'remote' ? request.url.slice(online.path.length + 6) : ''
    if (!(path in additional)) return Promise.reject(new ResourceHttpError(404, path))
    return Promise.resolve(additional[path])
  }
  const candidate = await prepareCatalog(online, base, signal(), undefined, read)
  expect(candidate.data.races[0].subraces?.map(({ name }) => name)).toEqual(['Tides'])
  expect(candidate.contents).toBe('1 subrace and 1 feat')
})

test('a malformed spell source package reports a missing subclass spell', async () => {
  const payloads: Record<string, unknown> = {
    ...files,
    'spells/spells-xphb.json': {
      spell: [{ name: 'Cure Wounds', source: 'XPHB', level: 1, classSpellRouteSource: {} }],
    },
    'class/index.json': { test: 'class-test.json' },
    'class/class-test.json': {
      class: [{ name: 'Wizard', source: 'TEST' }],
      subclass: [
        {
          name: 'Example',
          shortName: 'Example',
          source: 'TEST',
          className: 'Wizard',
          classSource: 'TEST',
          additionalSpells: [{ prepared: { 3: ['Cure Wounds|XPHB'] } }],
        },
      ],
    },
  }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  await expect(prepareCatalog(online, undefined, signal())).rejects.toMatchObject({
    message:
      'Example (TEST) needs the spell Cure Wounds (XPHB). Include that spell and check again.',
    details: ['Example|TEST needs Cure Wounds|XPHB'],
  })
})

test.each([
  ['items-base.json', {}, 'Incompatible items-base.json'],
  ['items-base.json', { baseitem: [], itemType: {} }, 'Incompatible items-base.json'],
  ['races.json', { race: [], subrace: {} }, 'Incompatible races.json'],
  [
    'class/class-test.json',
    {
      subclass: [{ name: 'Orphan', source: 'TEST', className: 'Wizard', classSource: 'XPHB' }],
    },
    'Orphan requires Wizard|XPHB',
  ],
  [
    'class/class-test.json',
    {
      class: [{ name: 'Wizard', source: 'TEST', classFeatures: ['Missing|Wizard|TEST|1|TEST'] }],
    },
    'Missing|Wizard|TEST|1|TEST',
  ],
  [
    'class/class-test.json',
    {
      class: [{ name: 'Wizard', source: 'TEST' }],
      subclass: [
        {
          name: 'Example',
          shortName: 'Example',
          source: 'TEST',
          className: 'Wizard',
          classSource: 'TEST',
          additionalSpells: [{ prepared: { 3: ['Magic Missile|XPHB'] } }],
        },
      ],
    },
    'Example (TEST) needs the spell Magic Missile (XPHB).',
  ],
  [
    'class/class-test.json',
    {
      class: [{ name: 'Wizard', source: 'TEST' }],
      subclass: [
        {
          name: 'Spell choice',
          shortName: 'Spell choice',
          source: 'TEST',
          className: 'Wizard',
          classSource: 'TEST',
          additionalSpells: [
            { known: { 3: [{ choose: { from: ['Magic Missile|XPHB', 'Cure Wounds|XPHB'] } }] } },
          ],
        },
      ],
    },
    'Spell choice (TEST) needs the spell Magic Missile (XPHB).',
  ],
  [
    'magicvariants.json',
    {
      magicvariant: [{ name: 'Child', source: 'TEST', _copy: { name: 'Parent', source: 'TEST' } }],
    },
    'Parent|TEST',
  ],
])('rejects invalid or incomplete mechanical data in %s', async (resource, body, message) => {
  const payloads: Record<string, unknown> = {
    ...files,
    ...(resource.startsWith('class/') ? { 'class/index.json': { test: 'class-test.json' } } : {}),
    [resource]: body,
  }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  await expect(prepareCatalog(online, undefined, signal())).rejects.toThrow(message)
})

test('rejects a spell grant when its exact printing is ambiguous', async () => {
  const payloads: Record<string, unknown> = {
    ...files,
    'spells/spells-xphb.json': {
      spell: [
        { name: 'Cure Wounds', source: 'XPHB', level: 1 },
        { name: 'Cure Wounds', source: 'XPHB', level: 2 },
      ],
    },
    'class/index.json': { test: 'class-test.json' },
    'class/class-test.json': {
      class: [{ name: 'Wizard', source: 'TEST' }],
      subclass: [
        {
          name: 'Spell grant',
          shortName: 'Spell grant',
          source: 'TEST',
          className: 'Wizard',
          classSource: 'TEST',
          additionalSpells: [{ prepared: { 3: ['Cure Wounds|XPHB'] } }],
        },
      ],
    },
  }
  vi.stubGlobal('fetch', (url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    return Promise.resolve(key in payloads ? json(payloads[key]) : json(null, 404))
  })
  await expect(prepareCatalog(online, undefined, signal())).rejects.toMatchObject({
    message: expect.stringContaining('Spell grant (TEST) needs the spell Cure Wounds (XPHB).'),
    details: ['Spell grant|TEST needs Cure Wounds|XPHB'],
  })
})

test('a GitHub branch resolves once and all candidate reads use the pinned commit', async () => {
  const revision = 'a'.repeat(40)
  const raw = `https://raw.githubusercontent.com/owner/repo/${revision}/data/`
  const api = 'https://api.github.com/repos/owner/repo/commits/main'
  const fetch = vi.fn((url: string) => {
    if (url === api) return Promise.resolve(json({ sha: revision }))
    const key = url.replace(raw, '')
    return Promise.resolve(key in files ? json(files[key]) : json(null, 404))
  })
  vi.stubGlobal('fetch', fetch)
  const path = 'https://github.com/owner/repo/tree/main'
  const candidate = await prepareCatalog({ ...online, path }, undefined, signal())
  expect(candidate).toMatchObject({ revision, config: { path } })
  expect(fetch.mock.calls.filter(([url]) => url === api)).toHaveLength(1)
  expect(
    fetch.mock.calls.filter(([url]) => url !== api).every(([url]) => url.startsWith(raw)),
  ).toBe(true)
})
