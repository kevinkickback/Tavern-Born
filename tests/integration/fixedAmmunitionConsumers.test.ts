// @vitest-environment jsdom
import { PDFDocument } from '@cantoo/pdf-lib'
import { clear, set } from 'idb-keyval'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import {
  addManualEquipmentBatchCommand,
  updateEquipmentQuantityCommand,
} from '@/lib/character/commands/equipmentCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { readGameDataCache, writeGameDataCache } from '@/lib/storage/dataCache'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { loadMagicTemplates } from '../fixtures/magicVariantFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

const arrow = {
  name: 'Arrow',
  source: 'XPHB',
  edition: 'one',
  type: 'A|XPHB',
  rarity: 'none',
  weight: 0.05,
  srd52: true,
  arrow: true,
}
const bow = {
  name: 'Longbow',
  source: 'XPHB',
  type: 'R|XPHB',
  rarity: 'none',
  dmg1: '1d8',
  dmgType: 'P',
  weaponCategory: 'martial',
  ammoType: 'arrow|xphb',
}
const template = {
  name: '+3 Ammunition',
  type: 'GV|XDMG',
  ammo: true,
  requires: [{ type: 'A|XPHB' }, { type: 'AF|XDMG' }],
  inherits: {
    namePrefix: '+3 ',
    source: 'XDMG',
    srd52: true,
    rarity: 'very rare',
    bonusWeapon: '+3',
    miscTags: ['CNS'],
    entries: [
      'Gain {=bonusWeapon} to attack and damage with this piece of ammunition. Its magic ends when it hits a target.',
    ],
  },
}

test('ammunition uses direct public pieces, exact winning sources and cache authority', async () => {
  const upper = await loadMagicTemplates([template], [], {
    baseitem: [
      arrow,
      { ...arrow, name: 'Arrows (20)', packContents: [{ item: 'arrow|xphb', quantity: 20 }] },
      { ...arrow, name: 'Energy Cell', type: 'AF|XDMG' },
    ],
  })
  const variants = upper.items.filter((item) => item.magicVariantGenerated)
  expect(variants.map((item) => item.name)).toEqual(['+3 Arrow'])
  expect(variants[0]).toMatchObject({
    source: 'XDMG',
    weight: 0.05,
    bonusWeapon: '+3',
    miscTags: ['CNS'],
  })
  const explicit = { ...arrow, name: '+3 Arrow', source: 'XDMG', weight: 0.1 }
  const replacement = await loadMagicTemplates([], [explicit])
  expect(
    composeGameDataLayers([upper, replacement]).items.find((item) => item.name === explicit.name),
  ).toMatchObject({ weight: 0.1 })
  expect(
    composeGameDataLayers([upper, replacement]).items.find((item) => item.name === explicit.name)
      ?.magicVariantGenerated,
  ).toBeUndefined()
  const shadowed = await loadMagicTemplates([], [arrow])
  expect(
    composeGameDataLayers([upper, shadowed]).items.some((item) => item.name === '+3 Arrow'),
  ).toBe(false)
  await clear()
  await writeGameDataCache(upper, { type: 'local', path: '/ammunition-test', isValid: true })
  const cache = await readGameDataCache()
  expect(
    composeGameDataLayers([cache!.data]).items.filter((item) => item.magicVariantGenerated),
  ).toHaveLength(1)
  await set('tb:game-data-cache', { ...cache, cacheSchemaVersion: 101 })
  expect(await readGameDataCache()).toBeNull()
})

test('ammunition quantity and exact rules survive reopen without changing attacks', async () => {
  const data = await loadMagicTemplates([template], [], { baseitem: [arrow, bow] })
  const ammunition = data.items.find((item) => item.name === '+3 Arrow')!
  const longbow = data.itemsBase.find((item) => item.name === 'Longbow')!
  const actor = makeCharacterFixture({
    originSystem: '2024',
    equipment: [],
    allowedSources: ['XPHB'],
  })
  actor.abilityScores.dexterity = 16
  actor.proficiencies.weapons = ['martial weapons']
  const added = applyCharacterCommandResult(
    actor,
    addManualEquipmentBatchCommand(actor, actor.provenance, [longbow, ammunition]),
  )
  const quantity = applyCharacterCommandResult(
    added,
    updateEquipmentQuantityCommand(added, added.provenance, added.equipment[1].id, 4),
  )
  // Even a retained equipped flag cannot turn the shot rule into a standing bonus.
  const saved = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...quantity,
        equipment: quantity.equipment.map((item) => ({ ...item, equipped: true })),
      }),
    ),
  )
  expect(saved.equipment[1]).toMatchObject({
    name: '+3 Arrow',
    source: 'XDMG',
    weight: 0.05,
    quantity: 4,
  })
  const view = createCurrentCharacterSheetViewModel(saved, data.lookups!)
  const withoutAmmo = createCurrentCharacterSheetViewModel(
    { ...saved, equipment: saved.equipment.slice(0, 1) },
    data.lookups!,
  )
  expect(view.weaponRows).toEqual(withoutAmmo.weaponRows)
  expect(view.weaponRows).toHaveLength(1)
  expect(view.magicItems[0].description).toContain('when it hits a target')
  const withoutTemplate = await loadMagicTemplates([], [], { baseitem: [arrow, bow] })
  const withdrawn = createCurrentCharacterSheetViewModel(saved, withoutTemplate.lookups!)
  expect(withdrawn.weaponRows).toEqual(view.weaponRows)
  expect(withdrawn.character.equipment[1]).toEqual(saved.equipment[1])
  expect(withdrawn.magicItems[0].description).toBe('')
  expect(createCurrentCharacterSheetViewModel(saved, data.lookups!).magicItems).toEqual(
    view.magicItems,
  )
  const pdf = await generateTestCharacterSheet(view, '2024-official', {
    pages: { notes: false, spells: false },
  })
  const form = (await PDFDocument.load(pdf)).getForm()
  expect(form.getTextField('Text_90').getText()).toContain('+3 Arrow')
  expect(form.getTextField('Text_67').getText()).toBe(view.weaponRows[0].attackBonus)
  const custom = await generateTestCharacterSheet(view, '2014-custom', {
    pages: { notes: false, spells: false },
  })
  const customForm = (await PDFDocument.load(custom)).getForm()
  expect(customForm.getDropdown('AmmoLeftDisplay.Name').getSelected()).toEqual(['+3 Arrows'])
  expect(customForm.getTextField('AmmoLeftDisplay.Amount').getText()).toBe('4')
}, 15_000)
