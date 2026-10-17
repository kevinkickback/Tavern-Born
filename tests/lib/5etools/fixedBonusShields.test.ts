import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { getRawItems } from '@/lib/5etools/itemEntries'
import {
  fixedShieldTemplates,
  loadFixedShields,
  shieldBases,
} from '../../fixtures/fixedShieldFixtures'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

test('six literal concrete identities retain physical AC, own prose and source namespaces', async () => {
  const data = await loadFixedShields()
  const generated = data.items.filter((x) => x.magicVariantGenerated)
  expect(generated.map((x) => `${x.name}|${x.source}`).sort()).toEqual([
    '+1 Shield|DMG',
    '+1 Shield|XDMG',
    '+2 Shield|DMG',
    '+2 Shield|XDMG',
    '+3 Shield|DMG',
    '+3 Shield|XDMG',
  ])
  for (const item of generated) {
    const n = item.name[1]
    expect(item).toMatchObject({
      ac: 2,
      bonusAc: `+${n}`,
      weight: 6,
      type: item.source === 'DMG' ? 'S' : 'S|XPHB',
    })
    expect(item.entries?.[0]).toBe(`While holding this shield, gain +${n} AC.`)
    expect(item.entries).not.toContain('Generic reference-only rules.')
    expect(item.value).toBeUndefined()
    expect(item.reprintedAs).toBeUndefined()
    expect(item.entries?.length).toBe(item.source === 'DMG' ? 2 : 1)
    expect(item.magicVariantReference).toBeUndefined()
  }
  expect(data.items.filter((x) => x.magicVariantReference)).toHaveLength(6)
  expect(getRawItems(data).items).toEqual([])
  expect(getRawItems(structuredClone(data)).items).toEqual([])
})

test.each([
  { charges: 3 },
  { reqAttune: true },
])('unsupported canonical root mechanic fails closed: %j', async (change) => {
  const data = await loadFixedShields([{ ...fixedShieldTemplates[0], ...change }])
  expect(data.items.filter((x) => x.magicVariantGenerated)).toEqual([])
  expect(
    data.fixedShieldDiagnostics?.some((x) =>
      /Unsupported fixed-shield template shape/.test(x.message),
    ),
  ).toBe(true)
})

test.each([
  { bonusAc: '+9' },
  { source: 'XDMG' },
  { source: '' },
  { source: undefined },
  { charges: 3 },
  { namePrefix: 'Super ' },
  { entries: ['{=baseName/a}'] },
])('unsupported inherited shape cannot use a recognized name: %j', async (change) => {
  const template = fixedShieldTemplates[0]
  const data = await loadFixedShields([
    { ...template, inherits: { ...template.inherits, ...change } },
  ])
  expect(data.items.filter((x) => x.magicVariantGenerated)).toEqual([])
  expect(
    (data.fixedShieldDiagnostics?.length ?? 0) + (data.magicVariantDiagnostics?.length ?? 0),
  ).toBeGreaterThan(0)
})

test.each([
  [{ requires: [{ type: 'S', source: 'XPHB' }, { type: 'S|XPHB' }] }, 0],
  [{ requires: [{ type: ['S', 'Other'], source: 'PHB' }] }, 1],
  [{ excludes: { type: 'Other', source: 'PHB' } }, 0],
  [{ excludes: { type: 'Other', source: 'Other' } }, 1],
  [{ edition: 'one' }, 0],
] as const)('requires/excludes/edition obey upstream predicates: %j', async (change, count) => {
  const data = await loadFixedShields([{ ...fixedShieldTemplates[0], ...change }])
  expect(data.items.filter((x) => x.magicVariantGenerated)).toHaveLength(count)
})

test.each([
  { srd: false },
  { source: 'XPHB' },
  { type: 'S|XPHB' },
  { edition: 'one' },
  { charges: 1 },
  { entries: 'bad' },
])('conflicting/nonpublic base is not authorized by template public flags: %j', async (change) => {
  const data = await loadFixedShields([fixedShieldTemplates[0]], [{ ...shieldBases[0], ...change }])
  expect(data.items.filter((x) => x.magicVariantGenerated)).toEqual([])
})

test('raw duplicate/invalid winning base state survives cache composition and exact restoration', async () => {
  const initial = await loadFixedShields()
  const duplicate = makeGameDataFixture({
    itemsBase: [shieldBases[0], { ...shieldBases[0], weight: 8 }],
  })
  const merged = composeGameDataLayers([initial, duplicate])
  expect(merged.items.filter((x) => x.magicVariantGenerated && x.source === 'DMG')).toEqual([])
  expect(merged.fixedShieldBases).toHaveLength(3)
  const cached = structuredClone(merged)
  expect(composeGameDataLayers([cached]).items.filter((x) => x.magicVariantGenerated)).toHaveLength(
    3,
  )
  const invalid = makeGameDataFixture({ itemsBase: [{ ...shieldBases[0], ac: undefined }] })
  expect(
    composeGameDataLayers([initial, invalid]).items.filter((x) => x.magicVariantGenerated),
  ).toHaveLength(3)
  const restored = composeGameDataLayers([
    cached,
    makeGameDataFixture({ itemsBase: [shieldBases[0]] }),
  ])
  expect(restored.items.filter((x) => x.magicVariantGenerated)).toHaveLength(6)
  expect(restored.items.filter((x) => x.name === '+1 Shield' && x.source === 'DMG')).toHaveLength(1)
  expect(composeGameDataLayers([makeGameDataFixture()]).items).toEqual([])
})

test('concrete tuples have priority; template removal/restoration regenerates from raw inputs', async () => {
  const initial = await loadFixedShields()
  const concrete = { name: '+1 Shield', source: 'DMG', type: 'S', ac: 5 }
  const changed = composeGameDataLayers([
    structuredClone(initial),
    makeGameDataFixture({ items: [concrete] }),
  ])
  expect(
    changed.items.find((x) => x.name === concrete.name && x.source === concrete.source),
  ).toMatchObject(concrete)
  const without = await loadFixedShields([])
  expect(without.items).toEqual([])
  expect((await loadFixedShields()).items.filter((x) => x.magicVariantGenerated)).toHaveLength(6)
})

test('copied bases remain outside generation while concrete copy handling remains intact', async () => {
  const data = await loadFixedShields(
    [fixedShieldTemplates[0]],
    [
      { ...shieldBases[0], name: 'Parent' },
      { name: 'Shield', source: 'PHB', _copy: { name: 'Parent', source: 'PHB' } },
    ],
  )
  expect(data.itemsBase.find((x) => x.name === 'Shield')?.ac).toBe(2)
  expect(data.items.filter((x) => x.magicVariantGenerated)).toEqual([])
  expect(data.fixedShieldDiagnostics?.some((x) => /unsupported direct/.test(x.message))).toBe(true)
})

test('a supported canonical template copy still generates its exact fixed shield', async () => {
  const data = await loadFixedShields([
    { ...fixedShieldTemplates[0], name: 'Shield template parent' },
    {
      name: '+1 Shield (*)',
      source: 'DMG',
      _copy: { name: 'Shield template parent', source: 'DMG' },
    },
  ])
  expect(data.items.filter((x) => x.magicVariantGenerated)).toMatchObject([
    { name: '+1 Shield', source: 'DMG', bonusAc: '+1', ac: 2 },
  ])
  expect(data.fixedShieldDiagnostics).toEqual([])
})

test('winning template duplicates and invalid overrides suppress derived output until exact restoration', async () => {
  const initial = await loadFixedShields(),
    template = fixedShieldTemplates[0]
  for (const templates of [
    [template, template],
    [{ ...template, charges: 3 }],
    [{ ...template, inherits: { ...template.inherits, charges: 3 } }],
  ]) {
    const overlay = makeGameDataFixture({ magicVariants: templates })
    const missing = composeGameDataLayers([initial, overlay])
    expect(missing.items.some((x) => x.name === '+1 Shield' && x.source === 'DMG')).toBe(false)
    expect(
      composeGameDataLayers([
        structuredClone(missing),
        makeGameDataFixture({ magicVariants: [template] }),
      ]).items.filter((x) => x.magicVariantGenerated),
    ).toHaveLength(6)
  }
})

test('explicit empty generation authority is not reconstructed from cached normalized bases', async () => {
  const cached = structuredClone(await loadFixedShields())
  cached.fixedShieldBases = []
  expect(cached.itemsBase).toHaveLength(2)
  expect(composeGameDataLayers([cached]).items.filter((x) => x.magicVariantGenerated)).toEqual([])
})

test('a generated item cannot become an ordinary concrete copy parent', async () => {
  await expect(
    loadFixedShields(undefined, undefined, [
      { name: 'Replica', source: 'TST', type: 'S', _copy: { name: '+1 Shield', source: 'DMG' } },
    ]),
  ).rejects.toThrow(/missing parent/)
})
