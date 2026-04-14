import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'

function makeJsonResponse(jsonData: unknown, ok = true) {
  return new Response(JSON.stringify(jsonData), {
    status: ok ? 200 : 404,
    headers: { 'content-type': 'application/json' },
  })
}

describe('5etools/dataLoader', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('buildUrl always resolves to data path in remote mode', () => {
    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const buildUrl = (filename: string) =>
      (loader as unknown as { buildUrl: (f: string) => string }).buildUrl(filename)

    expect(buildUrl('class/class-wizard.json')).toBe(
      'https://example.com/5etools-src/main/data/class/class-wizard.json',
    )
    expect(buildUrl('spells/spells-phb.json')).toBe(
      'https://example.com/5etools-src/main/data/spells/spells-phb.json',
    )
    expect(buildUrl('books.json')).toBe('https://example.com/5etools-src/main/data/books.json')
  })

  test('buildUrl does not inject data prefix in local mode', () => {
    const loader = new FiveEToolsDataLoader({
      type: 'local',
      path: 'C:\\5etools',
      isValid: true,
    })

    const buildUrl = (filename: string) =>
      (loader as unknown as { buildUrl: (f: string) => string }).buildUrl(filename)

    expect(buildUrl('class/class-wizard.json')).toBe('C:\\5etools/class/class-wizard.json')
  })

  test('loads classes from class files and filters spells by index source while enriching lookup data', async () => {
    const payloadByFile: Record<string, unknown> = {
      'books.json': {
        book: [{ id: 'PHB', name: 'Players Handbook', group: 'core' }],
      },
      'adventures.json': { adventure: [] },
      'races.json': { race: [{ name: 'Human', source: 'PHB' }] },
      'class/index.json': {
        PHB: 'class-phb.json',
      },
      'class/class-phb.json': {
        class: [
          { name: 'Wizard', source: 'PHB' },
          { name: 'Wrong Source Class', source: 'XPHB' },
        ],
        classFeature: [
          {
            name: 'Spellcasting',
            source: 'PHB',
            className: 'Wizard',
            classSource: 'PHB',
            level: 1,
          },
          {
            name: 'Wrong Feature',
            source: 'XPHB',
            className: 'Wrong Source Class',
            classSource: 'XPHB',
            level: 1,
          },
        ],
      },
      'backgrounds.json': { background: [{ name: 'Acolyte', source: 'PHB' }] },
      'spells/index.json': {
        PHB: 'spells-phb.json',
      },
      'spells/spells-phb.json': {
        spell: [
          { name: 'Magic Missile', source: 'PHB', level: 1, school: 'E' },
          { name: 'Wrong Spell', source: 'XPHB', level: 1, school: 'E' },
        ],
      },
      'generated/gendata-spell-source-lookup.json': {
        phb: {
          'magic missile': {
            class: {
              PHB: { Wizard: true },
            },
            subclass: {
              PHB: {
                Wizard: {
                  PHB: {
                    Evoker: { name: 'School of Evocation' },
                  },
                },
              },
            },
          },
        },
      },
      'feats.json': { feat: [{ name: 'Alert', source: 'PHB' }] },
      'items.json': { item: [{ name: 'Rope', source: 'PHB', type: 'G' }] },
      'items-base.json': {
        baseitem: [{ name: 'Longsword', source: 'PHB', type: 'M' }],
      },
      'actions.json': { action: [{ name: 'Attack', source: 'PHB' }] },
      'conditionsdiseases.json': {
        condition: [{ name: 'Blinded', source: 'PHB' }],
      },
      'deities.json': { deity: [{ name: 'Pelor', source: 'PHB' }] },
      'skills.json': { skill: [{ name: 'Arcana', source: 'PHB' }] },
      'senses.json': { sense: [{ name: 'Darkvision', source: 'PHB' }] },
      'languages.json': { language: [{ name: 'Common', source: 'PHB' }] },
      'magicvariants.json': { magicvariant: [] },
      'optionalfeatures.json': { optionalfeature: [] },
      'variantrules.json': { variantrule: [] },
    }

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const gameData = await loader.loadAllData()

    expect(gameData.classes.map((it) => it.name)).toEqual(['Wizard', 'Wrong Source Class'])
    expect(gameData.classFeatures.map((it) => it.name)).toEqual(['Spellcasting', 'Wrong Feature'])

    expect(gameData.spells.map((it) => it.name)).toEqual(['Magic Missile'])
    expect(gameData.spells[0]?.classes?.fromClassList).toEqual(
      expect.arrayContaining([{ name: 'Wizard', source: 'PHB' }]),
    )
    expect(gameData.spells[0]?.classes?.fromSubclass).toEqual(
      expect.arrayContaining([
        {
          class: { name: 'Wizard', source: 'PHB' },
          subclass: {
            name: 'School of Evocation',
            shortName: 'Evoker',
            source: 'PHB',
          },
        },
      ]),
    )
  })

  test('loads classes from slug-keyed class index entries without source filtering them out', async () => {
    const payloadByFile: Record<string, unknown> = {
      'books.json': {
        book: [{ id: 'PHB', name: 'Players Handbook', group: 'core' }],
      },
      'adventures.json': { adventure: [] },
      'races.json': { race: [] },
      'class/index.json': {
        wizard: 'class-wizard.json',
        fighter: 'class-fighter.json',
      },
      'class/class-wizard.json': {
        class: [{ name: 'Wizard', source: 'PHB' }],
        classFeature: [
          {
            name: 'Spellcasting',
            source: 'PHB',
            className: 'Wizard',
            classSource: 'PHB',
            level: 1,
          },
        ],
      },
      'class/class-fighter.json': {
        class: [{ name: 'Fighter', source: 'PHB' }],
        classFeature: [
          {
            name: 'Fighting Style',
            source: 'PHB',
            className: 'Fighter',
            classSource: 'PHB',
            level: 1,
          },
        ],
      },
      'backgrounds.json': { background: [] },
      'spells/index.json': {},
      'generated/gendata-spell-source-lookup.json': {},
      'feats.json': { feat: [] },
      'items.json': { item: [] },
      'items-base.json': { baseitem: [] },
      'actions.json': { action: [] },
      'conditionsdiseases.json': { condition: [] },
      'deities.json': { deity: [] },
      'skills.json': { skill: [] },
      'senses.json': { sense: [] },
      'languages.json': { language: [] },
      'magicvariants.json': { magicvariant: [] },
      'optionalfeatures.json': { optionalfeature: [] },
      'variantrules.json': { variantrule: [] },
    }

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const gameData = await loader.loadAllData()

    expect(gameData.classes.map((it) => it.name)).toEqual(['Wizard', 'Fighter'])
    expect(gameData.classFeatures.map((it) => it.name)).toEqual(['Spellcasting', 'Fighting Style'])
  })

  test('continues ingestion when an indexed class file is missing', async () => {
    const payloadByFile: Record<string, unknown> = {
      'books.json': {
        book: [{ id: 'PHB', name: 'Players Handbook', group: 'core' }],
      },
      'adventures.json': { adventure: [] },
      'races.json': { race: [] },
      'class/index.json': {
        wizard: 'class-wizard.json',
        missing: 'class-missing.json',
      },
      'class/class-wizard.json': {
        class: [{ name: 'Wizard', source: 'PHB' }],
        classFeature: [
          {
            name: 'Spellcasting',
            source: 'PHB',
            className: 'Wizard',
            classSource: 'PHB',
            level: 1,
          },
        ],
      },
      'backgrounds.json': { background: [] },
      'spells/index.json': {},
      'generated/gendata-spell-source-lookup.json': {},
      'feats.json': { feat: [] },
      'items.json': { item: [] },
      'items-base.json': { baseitem: [] },
      'actions.json': { action: [] },
      'conditionsdiseases.json': { condition: [] },
      'deities.json': { deity: [] },
      'skills.json': { skill: [] },
      'senses.json': { sense: [] },
      'languages.json': { language: [] },
      'magicvariants.json': { magicvariant: [] },
      'optionalfeatures.json': { optionalfeature: [] },
      'variantrules.json': { variantrule: [] },
    }

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const gameData = await loader.loadAllData()

    expect(gameData.classes.map((it) => it.name)).toEqual(['Wizard'])
    expect(gameData.classFeatures.map((it) => it.name)).toEqual(['Spellcasting'])
  })

  test('drops malformed non-array payloads without failing ingestion', async () => {
    const payloadByFile: Record<string, unknown> = {
      'books.json': {
        book: [{ id: 'PHB', name: 'Players Handbook', group: 'core' }],
      },
      'adventures.json': { adventure: [] },
      'races.json': { race: [] },
      'class/index.json': {
        wizard: 'class-wizard.json',
      },
      'class/class-wizard.json': {
        class: [{ name: 'Wizard', source: 'PHB' }],
        classFeature: [
          {
            name: 'Spellcasting',
            source: 'PHB',
            className: 'Wizard',
            classSource: 'PHB',
            level: 1,
          },
        ],
      },
      'backgrounds.json': { background: { name: 'Acolyte', source: 'PHB' } },
      'spells/index.json': {},
      'generated/gendata-spell-source-lookup.json': {},
      'feats.json': { feat: { name: 'Alert', source: 'PHB' } },
      'items.json': { item: { name: 'Rope', source: 'PHB' } },
      'items-base.json': { baseitem: { name: 'Longsword', source: 'PHB' } },
      'actions.json': { action: { name: 'Attack', source: 'PHB' } },
      'conditionsdiseases.json': { condition: { name: 'Blinded', source: 'PHB' } },
      'deities.json': { deity: { name: 'Pelor', source: 'PHB' } },
      'skills.json': { skill: { name: 'Arcana', source: 'PHB' } },
      'senses.json': { sense: { name: 'Darkvision', source: 'PHB' } },
      'languages.json': { language: { name: 'Common', source: 'PHB' } },
      'magicvariants.json': { magicvariant: {} },
      'optionalfeatures.json': { optionalfeature: {} },
      'variantrules.json': { variantrule: {} },
    }

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const gameData = await loader.loadAllData()

    // Valid class resources still parse normally.
    expect(gameData.classes.map((it) => it.name)).toEqual(['Wizard'])

    // Malformed non-array resources are dropped to empty collections.
    expect(gameData.backgrounds).toEqual([])
    expect(gameData.feats).toEqual([])
    expect(gameData.items).toEqual([])
    expect(gameData.itemsBase).toEqual([])
    expect(gameData.actions).toEqual([])
    expect(gameData.conditions).toEqual([])
    expect(gameData.deities).toEqual([])
    expect(gameData.skills).toEqual([])
    expect(gameData.senses).toEqual([])
    expect(gameData.languages).toEqual([])
    expect(gameData.magicvariants).toEqual([])
    expect(gameData.optionalfeatures).toEqual([])
    expect(gameData.variantrules).toEqual([])
  })

  test('treats completely absent entity keys as empty collections', async () => {
    // Resources return `{}` — no entity key at all (different from the
    // non-array test which returns e.g. `{ background: { … } }`).
    const payloadByFile: Record<string, unknown> = {
      'books.json': {},
      'adventures.json': {},
      'races.json': {},
      'fluff-races.json': {},
      'class/index.json': { wizard: 'class-wizard.json' },
      'class/class-wizard.json': {},
      'backgrounds.json': {},
      'spells/index.json': {},
      'generated/gendata-spell-source-lookup.json': {},
      'feats.json': {},
      'items.json': {},
      'items-base.json': {},
      'actions.json': {},
      'conditionsdiseases.json': {},
      'deities.json': {},
      'skills.json': {},
      'senses.json': {},
      'languages.json': {},
      'magicvariants.json': {},
      'optionalfeatures.json': {},
      'variantrules.json': {},
    }

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const gameData = await loader.loadAllData()

    expect(gameData.classes).toEqual([])
    expect(gameData.classFeatures).toEqual([])
    expect(gameData.races).toEqual([])
    expect(gameData.backgrounds).toEqual([])
    expect(gameData.spells).toEqual([])
    expect(gameData.feats).toEqual([])
    expect(gameData.items).toEqual([])
    expect(gameData.itemsBase).toEqual([])
    expect(gameData.actions).toEqual([])
    expect(gameData.conditions).toEqual([])
    expect(gameData.deities).toEqual([])
    expect(gameData.skills).toEqual([])
    expect(gameData.senses).toEqual([])
    expect(gameData.languages).toEqual([])
    expect(gameData.magicvariants).toEqual([])
    expect(gameData.optionalfeatures).toEqual([])
    expect(gameData.variantrules).toEqual([])
  })

  test('loads valid spell files when some indexed spell files are malformed', async () => {
    const payloadByFile: Record<string, unknown> = {
      'books.json': { book: [{ id: 'PHB', name: 'Players Handbook', group: 'core' }] },
      'adventures.json': { adventure: [] },
      'races.json': { race: [] },
      'fluff-races.json': { raceFluff: [] },
      'class/index.json': {},
      'backgrounds.json': { background: [] },
      'spells/index.json': {
        PHB: 'spells-phb.json',
        XPHB: 'spells-xphb.json',
      },
      // Valid spell file
      'spells/spells-phb.json': {
        spell: [{ name: 'Magic Missile', source: 'PHB', level: 1, school: 'E' }],
      },
      // Malformed spell file — object instead of array
      'spells/spells-xphb.json': { spell: { name: 'Chromatic Orb', source: 'XPHB', level: 1 } },
      'generated/gendata-spell-source-lookup.json': {},
      'feats.json': { feat: [] },
      'items.json': { item: [] },
      'items-base.json': { baseitem: [] },
      'actions.json': { action: [] },
      'conditionsdiseases.json': { condition: [] },
      'deities.json': { deity: [] },
      'skills.json': { skill: [] },
      'senses.json': { sense: [] },
      'languages.json': { language: [] },
      'magicvariants.json': { magicvariant: [] },
      'optionalfeatures.json': { optionalfeature: [] },
      'variantrules.json': { variantrule: [] },
    }

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const gameData = await loader.loadAllData()

    // Valid file loaded; malformed file contributes nothing.
    expect(gameData.spells.map((s) => s.name)).toEqual(['Magic Missile'])
  })

  test('handles class file with null entity arrays without throwing', async () => {
    const payloadByFile: Record<string, unknown> = {
      'books.json': { book: [{ id: 'PHB', name: 'Players Handbook', group: 'core' }] },
      'adventures.json': { adventure: [] },
      'races.json': { race: [] },
      'fluff-races.json': { raceFluff: [] },
      'class/index.json': { wizard: 'class-wizard.json' },
      // Null values for entity arrays — parsers must handle gracefully.
      'class/class-wizard.json': { class: null, classFeature: null },
      'backgrounds.json': { background: [] },
      'spells/index.json': {},
      'generated/gendata-spell-source-lookup.json': {},
      'feats.json': { feat: [] },
      'items.json': { item: [] },
      'items-base.json': { baseitem: [] },
      'actions.json': { action: [] },
      'conditionsdiseases.json': { condition: [] },
      'deities.json': { deity: [] },
      'skills.json': { skill: [] },
      'senses.json': { sense: [] },
      'languages.json': { language: [] },
      'magicvariants.json': { magicvariant: [] },
      'optionalfeatures.json': { optionalfeature: [] },
      'variantrules.json': { variantrule: [] },
    }

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const gameData = await loader.loadAllData()

    expect(gameData.classes).toEqual([])
    expect(gameData.classFeatures).toEqual([])
  })

  test('drops malformed spell payloads while preserving other resources', async () => {
    const payloadByFile: Record<string, unknown> = {
      'books.json': {
        book: [{ id: 'PHB', name: 'Players Handbook', group: 'core' }],
      },
      'adventures.json': { adventure: [] },
      'races.json': { race: [] },
      'class/index.json': {
        wizard: 'class-wizard.json',
      },
      'class/class-wizard.json': {
        class: [{ name: 'Wizard', source: 'PHB' }],
        classFeature: [
          {
            name: 'Spellcasting',
            source: 'PHB',
            className: 'Wizard',
            classSource: 'PHB',
            level: 1,
          },
        ],
      },
      'backgrounds.json': { background: [] },
      'spells/index.json': {
        PHB: 'spells-phb.json',
      },
      // Invalid shape: parser expects { spell: [] } or []
      'spells/spells-phb.json': { spell: { name: 'Magic Missile', source: 'PHB', level: 1 } },
      'generated/gendata-spell-source-lookup.json': {
        phb: {
          'magic missile': {
            class: {
              PHB: { Wizard: true },
            },
          },
        },
      },
      'feats.json': { feat: [] },
      'items.json': { item: [] },
      'items-base.json': { baseitem: [] },
      'actions.json': { action: [] },
      'conditionsdiseases.json': { condition: [] },
      'deities.json': { deity: [] },
      'skills.json': { skill: [] },
      'senses.json': { sense: [] },
      'languages.json': { language: [] },
      'magicvariants.json': { magicvariant: [] },
      'optionalfeatures.json': { optionalfeature: [] },
      'variantrules.json': { variantrule: [] },
    }

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      const entry = Object.entries(payloadByFile).find(([name]) => url.endsWith(`/data/${name}`))
      if (!entry) return makeJsonResponse({}, false)
      return makeJsonResponse(entry[1], true)
    }) as unknown as typeof fetch

    const loader = new FiveEToolsDataLoader({
      type: 'remote',
      path: 'https://example.com/5etools-src/main',
      isValid: true,
    })

    const gameData = await loader.loadAllData()

    expect(gameData.classes.map((it) => it.name)).toEqual(['Wizard'])
    expect(gameData.classFeatures.map((it) => it.name)).toEqual(['Spellcasting'])
    expect(gameData.spells).toEqual([])
  })
})
