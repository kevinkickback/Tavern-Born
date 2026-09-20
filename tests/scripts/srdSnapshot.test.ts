import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { buildSrdSnapshot, isSrdRoot, sha256, stableJson } from '../../scripts/srd/snapshot.mjs'

const ROOT_FIXTURES: Record<string, object> = {
  'actions.json': { action: [] },
  'backgrounds.json': { background: [] },
  'conditionsdiseases.json': { condition: [], disease: [], status: [] },
  'cultsboons.json': { cult: [], boon: [] },
  'deities.json': { deity: [] },
  'feats.json': { feat: [] },
  'items.json': {
    item: [
      { name: 'Rope', source: 'PHB', type: 'G', srd: true },
      { name: 'Private Item', source: 'PRIVATE', type: 'G' },
    ],
    itemGroup: [],
  },
  'languages.json': { language: [] },
  'optionalfeatures.json': { optionalfeature: [] },
  'races.json': { race: [], subrace: [] },
  'rewards.json': { reward: [] },
  'senses.json': { sense: [] },
  'skills.json': { skill: [] },
  'trapshazards.json': { trap: [], hazard: [] },
  'variantrules.json': { variantrule: [] },
}

const provenance = {
  packVersion: 'test-pack',
  distributionStatus: 'test-only',
  snapshotGeneratedAt: '2026-09-19T00:00:00.000Z',
  documents: [
    {
      version: '5.1',
      downloadUrl: 'https://example.com/srd-5.1.pdf',
      sha256: 'a'.repeat(64),
      attribution: 'Test attribution 5.1.',
    },
    {
      version: '5.2.1',
      downloadUrl: 'https://example.com/srd-5.2.1.pdf',
      sha256: 'b'.repeat(64),
      attribution: 'Test attribution 5.2.1.',
    },
  ],
  license: { identifier: 'CC-BY-4.0' },
  transformationNotice: 'Test transformation.',
}

let temporaryRoots: string[] = []

async function writeJson(root: string, relativePath: string, value: unknown) {
  const path = join(root, ...relativePath.split('/'))
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value), 'utf8')
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'tavern-born-srd-'))
  temporaryRoots.push(root)
  for (const [relativePath, value] of Object.entries(ROOT_FIXTURES)) {
    await writeJson(root, relativePath, value)
  }
  await writeJson(root, 'items-base.json', {
    baseitem: [{ name: 'Club', source: 'PHB', type: 'M', srd: true }],
    itemMastery: [],
    itemProperty: [],
    itemType: [
      { name: 'Adventuring Gear', abbreviation: 'G', source: 'PHB' },
      { name: 'Melee Weapon', abbreviation: 'M', source: 'PHB' },
    ],
  })
  await writeJson(root, 'class/index.json', { wizard: 'class-wizard.json' })
  await writeJson(root, 'class/class-wizard.json', {
    class: [
      { name: 'Wizard', source: 'PHB', srd: true },
      { name: 'Private Class', source: 'PRIVATE' },
    ],
    subclass: [],
    classFeature: [],
    subclassFeature: [],
  })
  await writeJson(root, 'spells/index.json', {
    PHB: 'spells-phb.json',
    XPHB: 'spells-xphb.json',
  })
  await writeJson(root, 'spells/spells-phb.json', {
    spell: [{ name: 'Light', source: 'PHB', srd: true }],
  })
  await writeJson(root, 'spells/spells-xphb.json', {
    spell: [{ name: 'Light', source: 'XPHB', srd52: true }],
  })
  await writeJson(root, 'generated/gendata-spell-source-lookup.json', {
    phb: {
      light: {
        class: { PHB: { Wizard: true }, TCE: { Artificer: true } },
      },
    },
    xphb: {
      light: {
        class: { XPHB: { Wizard: true } },
      },
    },
  })
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })))
  temporaryRoots = []
})

describe('bundled SRD snapshot generator', () => {
  test('recognizes only explicit SRD root markers', () => {
    expect(isSrdRoot({ srd: true })).toBe(true)
    expect(isSrdRoot({ srd52: true })).toBe(true)
    expect(isSrdRoot({ srd: false, basicRules: true })).toBe(false)
  })

  test('serializes objects deterministically', () => {
    expect(stableJson({ z: 1, a: { d: 2, b: 1 } })).toBe(
      '{\n  "a": {\n    "b": 1,\n    "d": 2\n  },\n  "z": 1\n}\n',
    )
  })

  test('filters roots and spell associations while recording approved dependencies', async () => {
    const sourceRoot = await createFixture()
    const options = {
      sourceRoot,
      provenance,
      allowlist: {
        dependencies: [
          {
            collection: 'itemType',
            srdVersion: '5.1',
            officialSection: 'Equipment',
            identities: ['G|PHB', 'M|PHB'],
          },
        ],
      },
      upstreamRevision: 'fixture-revision',
    }

    const first = await buildSrdSnapshot(options)
    const second = await buildSrdSnapshot(options)

    expect([...first.files.entries()]).toEqual([...second.files.entries()])
    expect(JSON.parse(first.files.get('data/items.json') ?? '{}').item).toEqual([
      expect.objectContaining({ name: 'Rope', source: 'PHB' }),
    ])
    expect(JSON.parse(first.files.get('data/class/class-wizard.json') ?? '{}').class).toEqual([
      expect.objectContaining({ name: 'Wizard', source: 'PHB' }),
    ])
    expect(
      JSON.parse(first.files.get('data/generated/gendata-spell-source-lookup.json') ?? '{}').phb
        .light.class,
    ).toEqual({ PHB: { Wizard: true } })
    expect(first.manifest.coverage.dependencies.map((entry) => entry.identity)).toEqual([
      'G|PHB',
      'M|PHB',
    ])
    expect(first.manifest.files['data/items.json']).toBe(
      sha256(first.files.get('data/items.json') ?? ''),
    )
  })

  test('fails closed when an untagged support dependency is not approved', async () => {
    const sourceRoot = await createFixture()
    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: { dependencies: [] },
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unapproved itemType dependency')
  })
})
