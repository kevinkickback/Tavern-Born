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
      {
        name: 'Rope',
        source: 'PHB',
        type: 'G',
        srd: true,
        page: 145,
        basicRules: true,
        basicRules2024: true,
        hasFluff: true,
        hasFluffImages: true,
        reprintedAs: ['Rope|XPHB'],
        otherSources: [{ source: 'XGE', page: 9 }],
        additionalSources: [{ source: 'TCE', page: 10 }],
        entries: [{ type: 'entries', name: 'Rope', entries: ['Useful cord.'], page: 146 }],
        additionalEntries: [{ source: 'MOT', entries: ['Non-SRD supplement text.'] }],
        soundClip: 'audio/rope.mp3',
        _versions: [
          {
            name: 'Rope Variant',
            source: 'PHB',
            _mod: { entries: { mode: 'appendArr', items: ['Mechanical variant.'] } },
          },
        ],
      },
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
      {
        name: 'Wizard',
        source: 'PHB',
        srd: true,
        classFeatures: ['Spellcasting|Wizard||1', 'Cantrip Formulas|Wizard||3|TCE'],
      },
      { name: 'Private Class', source: 'PRIVATE' },
    ],
    subclass: [],
    classFeature: [
      {
        name: 'Spellcasting',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        level: 1,
        srd: true,
      },
    ],
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

function createAllowlist() {
  return {
    allowedSources: ['PHB', 'DMG', 'MM', 'XPHB', 'XDMG', 'XMM'],
    referenceExclusions: [
      {
        collection: 'classFeature',
        source: 'TCE',
        reason: 'Fixture non-SRD optional feature.',
      },
    ],
    dependencies: [
      {
        collection: 'itemType',
        srdVersion: '5.1',
        officialSection: 'Equipment',
        reason: 'Fixture item type.',
        identities: ['G|PHB', 'M|PHB'],
      },
    ],
  }
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
      allowlist: createAllowlist(),
      upstreamRevision: 'fixture-revision',
    }

    const first = await buildSrdSnapshot(options)
    const second = await buildSrdSnapshot(options)

    expect([...first.files.entries()]).toEqual([...second.files.entries()])
    expect(JSON.parse(first.files.get('data/items.json') ?? '{}').item).toEqual([
      expect.objectContaining({ name: 'Rope', source: 'PHB' }),
    ])
    expect(first.files.get('data/items.json')).not.toMatch(
      /additionalEntries|basicRules|hasFluff|reprintedAs|otherSources|additionalSources|soundClip|"page"/,
    )
    expect(JSON.parse(first.files.get('data/items.json') ?? '{}').item[0]._versions).toEqual([
      expect.objectContaining({ name: 'Rope Variant', source: 'PHB' }),
    ])
    expect(first.manifest.coverage.strippedMetadata).toEqual({
      additionalEntries: 1,
      additionalSources: 1,
      basicRules: 1,
      basicRules2024: 1,
      hasFluff: 1,
      hasFluffImages: 1,
      otherSources: 1,
      page: 2,
      reprintedAs: 1,
      soundClip: 1,
    })
    expect(JSON.parse(first.files.get('data/class/class-wizard.json') ?? '{}').class).toEqual([
      expect.objectContaining({
        name: 'Wizard',
        source: 'PHB',
        classFeatures: ['Spellcasting|Wizard||1'],
      }),
    ])
    expect(JSON.parse(first.files.get('data/fluff-races.json') ?? '{}')).toEqual({ raceFluff: [] })
    expect(JSON.parse(first.files.get('data/fluff-backgrounds.json') ?? '{}')).toEqual({
      backgroundFluff: [],
    })
    expect(JSON.parse(first.files.get('data/class/fluff-class-wizard.json') ?? '{}')).toEqual({
      classFluff: [],
    })
    expect(
      JSON.parse(first.files.get('data/generated/gendata-spell-source-lookup.json') ?? '{}').phb
        .light.class,
    ).toEqual({ PHB: { Wizard: true } })
    expect(first.manifest.coverage.dependencies.map((entry) => entry.identity)).toEqual([
      'G|PHB',
      'M|PHB',
    ])
    expect(first.manifest.coverage.records).toHaveLength(8)
    expect(first.manifest.coverage.records).toContainEqual({
      relativePath: 'data/items.json',
      collection: 'item',
      identity: 'Rope|PHB',
      recordSha256: sha256(
        stableJson(JSON.parse(first.files.get('data/items.json') ?? '{}').item[0]),
      ),
      provenanceType: 'root-marker',
      marker: 'srd',
      srdVersion: '5.1',
    })
    expect(first.manifest.coverage.records).toContainEqual(
      expect.objectContaining({
        relativePath: 'data/spells/spells-xphb.json',
        collection: 'spell',
        identity: 'Light|XPHB',
        provenanceType: 'root-marker',
        marker: 'srd52',
        srdVersion: '5.2.1',
      }),
    )
    expect(first.manifest.coverage.records).toContainEqual(
      expect.objectContaining({
        relativePath: 'data/items-base.json',
        collection: 'itemType',
        identity: 'G|PHB',
        provenanceType: 'approved-dependency',
        srdVersion: '5.1',
        officialSection: 'Equipment',
      }),
    )
    expect(first.manifest.coverage.references['class/class-wizard.json#classFeatures']).toEqual({
      resolved: 1,
      excluded: 1,
    })
    expect(first.manifest.coverage.referenceExclusions).toEqual([
      {
        collection: 'classFeature',
        reference: 'Cantrip Formulas|Wizard||3|TCE',
        owner: 'Wizard|PHB',
        reason: 'Fixture non-SRD optional feature.',
      },
    ])
    expect(first.manifest.files['data/items.json']).toBe(
      sha256(first.files.get('data/items.json') ?? ''),
    )

    for (const [relativePath, contents] of first.files) {
      if (!relativePath.startsWith('data/') || relativePath === 'data/items-base.json') continue
      const payload = JSON.parse(contents) as Record<string, unknown>
      for (const records of Object.values(payload)) {
        if (!Array.isArray(records)) continue
        expect(records.every(isSrdRoot), `${relativePath} contains an unmarked root`).toBe(true)
      }
    }
  })

  test('fails closed when a selected record has an unaudited missing feature reference', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'class/class-wizard.json', {
      class: [
        {
          name: 'Wizard',
          source: 'PHB',
          srd: true,
          classFeatures: ['Missing Feature|Wizard||2'],
        },
      ],
      subclass: [],
      classFeature: [],
      subclassFeature: [],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Missing classFeature dependency Missing Feature|Wizard||2')
  })

  test('closes embedded feature references and removes only audited non-SRD options', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'optionalfeatures.json', {
      optionalfeature: [{ name: 'Archery', source: 'PHB', srd: true }],
    })
    await writeJson(sourceRoot, 'feats.json', {
      feat: [{ name: 'Alert', source: 'PHB' }],
    })
    await writeJson(sourceRoot, 'class/class-wizard.json', {
      class: [
        {
          name: 'Wizard',
          source: 'PHB',
          srd: true,
          classFeatures: ['Fighting Style|Wizard||1'],
        },
      ],
      subclass: [],
      classFeature: [
        {
          name: 'Fighting Style',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
          srd: true,
          entries: [
            { type: 'refClassFeature', classFeature: 'Helper|Wizard||2' },
            { type: 'refOptionalfeature', optionalfeature: 'Archery' },
            { type: 'refOptionalfeature', optionalfeature: 'Blind Fighting|TCE' },
            { type: 'refFeat', feat: 'Alert|PHB' },
          ],
        },
        {
          name: 'Helper',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 2,
          srd: true,
        },
      ],
      subclassFeature: [],
    })
    const allowlist = createAllowlist()
    allowlist.referenceExclusions = [
      {
        collection: 'optionalfeature',
        source: 'TCE',
        reason: 'Fixture non-SRD fighting style.',
      },
    ]
    allowlist.dependencies.push({
      collection: 'feat',
      srdVersion: '5.1',
      officialSection: 'Feats',
      reason: 'Fixture referenced feat.',
      identities: ['Alert|PHB'],
    })

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist,
      upstreamRevision: 'fixture-revision',
    })
    const classPayload = JSON.parse(snapshot.files.get('data/class/class-wizard.json') ?? '{}')

    expect(classPayload.classFeature[0].entries).toEqual([
      { type: 'refClassFeature', classFeature: 'Helper|Wizard||2' },
      { type: 'refOptionalfeature', optionalfeature: 'Archery' },
      { type: 'refFeat', feat: 'Alert|PHB' },
    ])
    expect(
      snapshot.manifest.coverage.references['class/class-wizard.json#inlineClassFeature'],
    ).toEqual({ resolved: 1, excluded: 0 })
    expect(
      snapshot.manifest.coverage.references['class/class-wizard.json#inlineOptionalfeature'],
    ).toEqual({ resolved: 1, excluded: 1 })
    expect(snapshot.manifest.coverage.references['class/class-wizard.json#inlineFeat']).toEqual({
      resolved: 1,
      excluded: 0,
    })
    expect(JSON.parse(snapshot.files.get('data/feats.json') ?? '{}').feat).toEqual([
      expect.objectContaining({ name: 'Alert', source: 'PHB' }),
    ])
    expect(snapshot.manifest.coverage.dependencies).toContainEqual({
      collection: 'feat',
      identity: 'Alert|PHB',
      reason: 'Fixture referenced feat.',
      reference: 'Alert|PHB',
      srdVersion: '5.1',
      officialSection: 'Feats',
    })
    expect(snapshot.manifest.coverage.referenceExclusions).toContainEqual({
      collection: 'optionalfeature',
      reference: 'Blind Fighting|TCE',
      owner: 'Fighting Style|PHB',
      reason: 'Fixture non-SRD fighting style.',
    })
  })

  test('fails closed on an unaudited unflagged embedded dependency', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'optionalfeatures.json', {
      optionalfeature: [{ name: 'Missing Option', source: 'PHB' }],
    })
    await writeJson(sourceRoot, 'class/class-wizard.json', {
      class: [
        {
          name: 'Wizard',
          source: 'PHB',
          srd: true,
          classFeatures: ['Fighting Style|Wizard||1'],
        },
      ],
      subclass: [],
      classFeature: [
        {
          name: 'Fighting Style',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
          srd: true,
          entries: [{ type: 'refOptionalfeature', optionalfeature: 'Missing Option' }],
        },
      ],
      subclassFeature: [],
    })
    const allowlist = createAllowlist()
    allowlist.referenceExclusions = []

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist,
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unapproved optionalfeature dependency Missing Option|PHB')
  })

  test('rejects presentation assets in selected records', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'actions.json', {
      action: [{ name: 'Attack', source: 'PHB', srd: true, images: [] }],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Prohibited presentation field images in data/actions.json')
  })

  test('rejects roots with ambiguous SRD version markers', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'actions.json', {
      action: [{ name: 'Attack', source: 'PHB', srd: true, srd52: true }],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Ambiguous SRD markers on data/actions.json#action:Attack|PHB: srd, srd52')
  })

  test('rejects source-qualified data outside the audited source set', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'actions.json', {
      action: [
        {
          name: 'Attack',
          source: 'PHB',
          srd: true,
          entries: [{ type: 'entries', source: 'TCE', entries: ['Not SRD content.'] }],
        },
      ],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unexpected source TCE in data/actions.json')
  })

  test('fails closed when an untagged support dependency is not approved', async () => {
    const sourceRoot = await createFixture()
    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: {
          ...createAllowlist(),
          dependencies: [],
        },
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unapproved itemType dependency')
  })

  test('rejects stale audit approvals that no longer match the source corpus', async () => {
    const sourceRoot = await createFixture()
    const allowlist = createAllowlist()
    allowlist.dependencies.push({
      collection: 'itemType',
      srdVersion: '5.1',
      officialSection: 'Equipment',
      reason: 'Stale fixture approval.',
      identities: ['UNUSED|PHB'],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist,
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unused dependency approvals: itemType:UNUSED|PHB')
  })
})
