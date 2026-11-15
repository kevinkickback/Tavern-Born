import { existsSync, readFileSync } from 'node:fs'
import { PDFDocument } from '@cantoo/pdf-lib'
import { get } from 'idb-keyval'
import { expect, test, vi } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import {
  addManualEquipmentBatchCommand,
  removeManualEquipmentCommand,
} from '@/lib/character/commands/equipmentCommands'
import { useCharacterStore } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { loadMagicTemplates } from '../fixtures/magicVariantFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

vi.unmock('@/lib/storage/idb-storage')

const read = (root: string, file: string) => JSON.parse(readFileSync(`${root}/${file}`, 'utf8'))
const includedRoot = 'resources/srd/data'
const baseItems = read(includedRoot, 'items-base.json')
const configuredRoot = 'data'
const hasConfiguredTemplates = existsSync(`${configuredRoot}/magicvariants.json`)

const classicDragonSlayer = {
  name: 'Dragon Slayer',
  type: 'GV|DMG',
  edition: 'classic',
  requires: [{ sword: true }],
  inherits: {
    source: 'DMG',
    namePrefix: 'Dragon Slayer ',
    rarity: 'rare',
    bonusWeapon: '+1',
    entries: [
      'You gain a +1 bonus to attack and damage rolls made with this magic weapon.',
      "A dragon takes an extra {@damage 3d6} damage of the weapon's type.",
    ],
  },
}
const revisedDragonSlayer = {
  ...classicDragonSlayer,
  type: 'GV|XDMG',
  edition: undefined,
  requires: [{ weaponCategory: 'simple' }, { weaponCategory: 'martial' }],
  inherits: {
    ...classicDragonSlayer.inherits,
    source: 'XDMG',
    entries: [
      'You gain a +1 bonus to attack rolls and damage rolls made with this magic weapon.',
      "The weapon deals an extra {@damage 3d6} damage of the weapon's type if the target is a Dragon.",
    ],
  },
}
const longswords = (baseItems.baseitem as Item5e[]).filter((item) => item.name === 'Longsword')
const loadSlayers = (variants: unknown[], concrete: Item5e[] = []) =>
  loadMagicTemplates(variants, concrete, { baseitem: longswords, itemType: baseItems.itemType })

test('qualified generation respects source editions, exact concrete precedence and fixed-bonus authority', async () => {
  const classic = await loadSlayers([classicDragonSlayer])
  const revised = await loadSlayers([revisedDragonSlayer])
  const printings = composeGameDataLayers([classic, revised]).items.filter(
    (item) => item.name === 'Dragon Slayer Longsword',
  )
  expect(
    printings.map((item) => [
      item.source,
      item.magicVariantGenerated?.base.source,
      item.bonusWeapon,
    ]),
  ).toEqual([
    ['DMG', 'PHB', undefined],
    ['XDMG', 'XPHB', '+1'],
  ])
  for (const entries of [
    ['Only while the blade is glowing, you gain +1 to attack and damage rolls.'],
    [
      'You gain a +1 bonus to attack rolls and damage rolls made with this magic weapon, but only against Dragons.',
    ],
    ['This property applies only against Dragons.', revisedDragonSlayer.inherits.entries[0]],
  ]) {
    const changed = {
      ...revisedDragonSlayer,
      inherits: { ...revisedDragonSlayer.inherits, entries },
    }
    const candidate = await loadSlayers([changed, classicDragonSlayer])
    const weapon = candidate.items.find(
      (item) => item.name === 'Dragon Slayer Longsword' && item.source === 'XDMG',
    )
    expect(weapon?.entries).toEqual(expect.arrayContaining(entries))
    expect(weapon?.bonusWeapon).toBeUndefined()
  }
  const explicit: Item5e = {
    ...printings[1],
    magicVariantGenerated: undefined,
    bonusWeapon: '+2',
  }
  const replaced = await loadSlayers([revisedDragonSlayer, classicDragonSlayer], [explicit])
  expect(
    replaced.items.find((item) => item.name === explicit.name && item.source === 'XDMG'),
  ).toMatchObject({
    bonusWeapon: '+2',
  })
  expect(replaced.items.filter((item) => item.name === explicit.name)).toHaveLength(2)
})

test('rejects an ambiguous generated identity across weapon and ammunition families', async () => {
  const weapon = {
    name: 'Flame Tongue',
    type: 'GV|XDMG',
    requires: [{ name: 'Longsword' }],
    inherits: {
      source: 'XDMG',
      namePrefix: 'Arrow ',
      rarity: 'rare',
      entries: ['A weapon template.'],
    },
  }
  const ammo = {
    name: 'Ammunition of Slaying',
    type: 'GV|XDMG',
    ammo: true,
    requires: [{ name: 'Arrow' }],
    inherits: {
      source: 'XDMG',
      nameSuffix: ' Longsword',
      rarity: 'rare',
      entries: ['An ammunition template.'],
    },
  }
  const name = 'Arrow Longsword'
  const support = {
    baseitem: (baseItems.baseitem as Item5e[]).filter(
      ({ name, source }) => source === 'XPHB' && ['Longsword', 'Arrow'].includes(name),
    ),
    itemType: baseItems.itemType,
  }
  const load = (templates: unknown[], items: Item5e[] = []) =>
    loadMagicTemplates(templates, items, support)
  const only = (await load([weapon])).items.find((item) => item.name === name)
  expect(only?.type).toBe('M|XPHB')
  const conflict = await load([weapon, ammo])
  expect(conflict.items.some((item) => item.name === name)).toBe(false)
  expect(conflict.magicVariantDiagnostics).toContainEqual({
    path: 'magicVariants.Arrow Longsword|XDMG',
    message: 'Ambiguous generated equipment across template families.',
  })
  const explicit = await load([weapon, ammo], [{ name, source: 'XDMG', type: 'G' }])
  expect(explicit.items.filter((item) => item.name === name)).toEqual([
    expect.objectContaining({ type: 'G' }),
  ])
})

test('a saved Slayer keeps its physical weapon through source withdrawal and reopens with its restored bonus', async () => {
  const catalog = await loadSlayers([revisedDragonSlayer, classicDragonSlayer])
  const withdrawn = await loadSlayers([classicDragonSlayer])
  const item = catalog.items.find(
    (row) => row.name === 'Dragon Slayer Longsword' && row.source === 'XDMG',
  )!
  await useCharacterStore.getState().setCharacters([])
  const actor = await useCharacterStore.getState().addCharacter(
    makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['XPHB', 'XDMG'],
      equipment: [],
    }),
  )
  useCharacterStore.getState().setActiveCharacter(actor.id)
  const added = addManualEquipmentBatchCommand(actor, actor.provenance, [item])
  const equipment = added.characterPatch.equipment!.map((row) => ({
    ...row,
    equipped: true,
    quantity: 2,
  }))
  useCharacterStore
    .getState()
    .updateCharacter(actor.id, { equipment, provenance: added.provenanceUpdate })
  await useCharacterStore.getState().saveActiveCharacter()
  const stored = await get<{ state: { characters: Character[] } }>('character-storage')
  const saved = characterPersistenceSchema.parse(stored!.state.characters[0])
  useCharacterStore.getState().setActiveCharacter(null)
  await useCharacterStore.persist.rehydrate()
  useCharacterStore.getState().setActiveCharacter(actor.id)
  expect(useCharacterStore.getState().activeCharacter).toEqual(saved)
  const row = saved.equipment[0]
  expect(row).toMatchObject({
    name: item.name,
    source: 'XDMG',
    quantity: 2,
    dmg1: '1d8',
    dmg2: '1d10',
  })
  const view = createCurrentCharacterSheetViewModel(saved, catalog.lookups!)
  const missing = createCurrentCharacterSheetViewModel(saved, withdrawn.lookups!)
  const weaponId = `weapon:${row.id}`
  const index = view.weaponRows.findIndex((weapon) => weapon.id === weaponId)
  const weapon = view.weaponRows[index]
  const withoutRules = missing.weaponRows.find((weapon) => weapon.id === weaponId)!
  expect(Number(weapon.attackBonus)).toBe(Number(withoutRules.attackBonus) + 1)
  expect(weapon.damage).not.toContain('3d6')
  expect(withoutRules.damage).toContain('1d8')
  expect(view.magicItems[0].description).toContain('3d6')
  expect(missing.magicItems[0].description).toBe('')
  expect(createCurrentCharacterSheetViewModel(saved, catalog.lookups!).weaponRows[index]).toEqual(
    weapon,
  )
  const form = (
    await PDFDocument.load(await generateTestCharacterSheet(view, '2024-official'))
  ).getForm()
  expect(form.getTextField(`Text_${61 + index}`).getText()).toBe(item.name)
  expect(form.getTextField(`Text_${67 + index}`).getText()).toBe(weapon.attackBonus)
  expect(form.getTextField('Text_90').getText()).toContain(item.name)
  expect(
    removeManualEquipmentCommand(saved, saved.provenance, row.id).characterPatch.equipment,
  ).toEqual([])
}, 30_000)

test.skipIf(!hasConfiguredTemplates)(
  'materializes the supported weapon and ammunition printings from the configured source',
  async () => {
    const included = await loadMagicTemplates(
      read(includedRoot, 'magicvariants.json').magicvariant,
      [],
      baseItems,
    )
    expect(included.items.some((item) => item.magicVariantGenerated)).toBe(false)

    const configured = await loadMagicTemplates(
      read('data', 'magicvariants.json').magicvariant,
      read('data', 'items.json').item,
      read('data', 'items-base.json'),
    )
    const data = composeGameDataLayers([included, configured])
    const generated = data.items.filter((item) => item.magicVariantGenerated)
    expect(
      generated,
      JSON.stringify([
        ...(data.fixedWeaponDiagnostics ?? []),
        ...(data.fixedAmmunitionDiagnostics ?? []),
      ]),
    ).toHaveLength(2339)
    const find = (name: string, source: string) =>
      generated.find((item) => item.name === name && item.source === source)
    expect(find('Dragon Slayer Blowgun', 'XDMG')?.bonusWeapon).toBe('+1')
    expect(find('Flame Tongue Light Hammer', 'DMG')).toBeUndefined()
    expect(JSON.stringify(find('Flame Tongue Light Hammer', 'XDMG')?.entries)).toContain('2d6')
    const quarterstaff = find('Enspelled (Level 3) Quarterstaff', 'XDMG')
    expect(quarterstaff).toMatchObject({
      reqAttune: true,
      dmg1: '1d6',
      dmg2: '1d8',
      magicVariantGenerated: { base: { name: 'Quarterstaff', source: 'XPHB' } },
    })
    expect(JSON.stringify(quarterstaff?.entries)).toContain('6 charges')
    expect(quarterstaff?.bonusWeapon).toBeUndefined()
    expect(find('Enspelled (Level 3) Staff', 'XDMG')).toBeUndefined()
    expect(find('Adamantine Arrow', 'XDMG')?.type).toBe('A|XPHB')
    expect(find('Adamantine Light Hammer', 'XDMG')?.type).toBe('M|XPHB')
    expect(JSON.stringify(find('Arrow of Slaying', 'XDMG')?.entries)).toContain('Creature Type')
    expect(JSON.stringify(find('Arrow of Slaying', 'DMG')?.entries)).toContain(
      'An arrow of slaying',
    )
    expect(JSON.stringify(find('Crossbow Bolt of Slaying', 'DMG')?.entries)).toContain(
      'A crossbow bolt of slaying',
    )
    expect(JSON.stringify(find('Vicious Longsword', 'DMG')?.entries)).toContain('7 slashing damage')
  },
  30_000,
)
