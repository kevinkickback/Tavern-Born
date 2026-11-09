import { afterEach, expect, test, vi } from 'vitest'
import { prepareCatalog } from '@/lib/5etools/catalogCandidate'

const online = { type: 'remote' as const, path: 'https://backup.example.test/rules', isValid: true }
const signal = () => new AbortController().signal
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const files: Record<string, unknown> = {
  'spells/index.json': { PHB: 'spells-phb.json', XPHB: 'spells-xphb.json' },
  'spells/spells-phb.json': { spell: [{ name: 'Magic Missile', source: 'PHB', level: 1 }] },
  'spells/spells-xphb.json': { spell: [{ name: 'Cure Wounds', source: 'XPHB', level: 1 }] },
}

afterEach(() => vi.unstubAllGlobals())

test('prepares a personal HTTPS source using one read per file and no provider API', async () => {
  const fetch = vi.fn((url: string) => {
    const key = url.replace(`${online.path}/data/`, '')
    return Promise.resolve(key in files ? json(files[key]) : json(null, 404))
  })
  vi.stubGlobal('fetch', fetch)
  const candidate = await prepareCatalog(online, undefined, signal())
  expect(candidate.data.spells.map(({ name }) => name)).toEqual(['Magic Missile', 'Cure Wounds'])
  const urls = fetch.mock.calls.map(([url]) => url)
  expect(new Set(urls).size).toBe(urls.length)
  expect(urls.every((url) => url.startsWith(`${online.path}/data/`))).toBe(true)
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
    'Magic Missile|XPHB',
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
    'Magic Missile|XPHB',
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
  await expect(prepareCatalog(online, undefined, signal())).rejects.toThrow('Cure Wounds|XPHB')
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
