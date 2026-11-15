// @vitest-environment jsdom
import { PDFDocument } from '@cantoo/pdf-lib'
import { clear, set } from 'idb-keyval'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import { readGameDataCache, writeGameDataCache } from '@/lib/storage/dataCache'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { fixedShieldTemplates, shieldBases } from '../fixtures/fixedShieldFixtures'
import { loadMagicTemplates } from '../fixtures/magicVariantFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

const leather = {
  name: 'Leather Armor',
  source: 'PHB',
  edition: 'classic',
  type: 'LA',
  armor: true,
  rarity: 'none',
  srd: true,
  ac: 11,
  weight: 10,
}
const plate = {
  name: 'Plate Armor',
  source: 'XPHB',
  edition: 'one',
  type: 'HA|XPHB',
  rarity: 'none',
  srd52: true,
  ac: 18,
  weight: 65,
  strength: '15',
  stealth: true,
}
const armorTemplates = [
  {
    name: '+1 Armor',
    type: 'GV|DMG',
    edition: 'classic',
    requires: [{ armor: true }],
    inherits: {
      namePrefix: '+1 ',
      source: 'DMG',
      srd: true,
      rarity: 'rare',
      bonusAc: '+1',
      entries: ['Gain {=bonusAc} AC while wearing this armor.'],
    },
  },
  {
    name: '+2 Armor',
    type: 'GV|XDMG',
    requires: [{ type: 'LA|XPHB' }, { type: 'MA|XPHB' }, { type: 'HA|XPHB' }],
    inherits: {
      namePrefix: '+2 ',
      source: 'XDMG',
      srd52: true,
      rarity: 'very rare',
      bonusAc: '+2',
      entries: ['Gain {=bonusAc} AC while wearing this armor.'],
    },
  },
]

test('body armor follows each edition’s declaration and rejects shadowed authority', async () => {
  const classicShield = { ...shieldBases[0], armor: true }
  const ignoredLeather = { ...leather, name: 'Unmarked Armor', armor: false }
  const typedPlate = { ...plate, armor: false }
  const data = await loadMagicTemplates(armorTemplates, [], {
    baseitem: [leather, typedPlate, classicShield, ignoredLeather],
  })
  expect(data.items.filter((item) => item.magicVariantGenerated).map((item) => item.name)).toEqual([
    '+1 Leather Armor',
    '+2 Plate Armor',
  ])
  const blocked = await loadMagicTemplates([], [], { baseitem: [{ ...plate, ac: '18' }] })
  expect(
    composeGameDataLayers([data, blocked]).items.some((item) => item.name === '+2 Plate Armor'),
  ).toBe(false)
  const explicit = { ...plate, name: '+2 Plate Armor', source: 'XDMG', bonusAc: '+3' }
  const restored = await loadMagicTemplates([], [explicit], { baseitem: [plate] })
  expect(
    composeGameDataLayers([data, blocked, restored]).items.find(
      (item) => item.name === explicit.name,
    ),
  ).toMatchObject({ bonusAc: '+3' })
  expect(
    composeGameDataLayers([data, blocked, restored]).items.find(
      (item) => item.name === explicit.name,
    )?.magicVariantGenerated,
  ).toBeUndefined()
  await clear()
  await writeGameDataCache(data, { type: 'local', path: '/armor-test', isValid: true })
  const cached = await readGameDataCache()
  expect(
    composeGameDataLayers([cached!.data]).items.filter((item) => item.magicVariantGenerated),
  ).toHaveLength(2)
  await set('tb:game-data-cache', { ...cached, cacheSchemaVersion: 100 })
  expect(await readGameDataCache()).toBeNull()
})

test('first equipped body armor owns its base and bonus across save, withdrawal, and PDF', async () => {
  const revisedMail = { ...plate, name: 'Chain Mail', ac: 16, strength: '13' }
  const bases = [plate, revisedMail, shieldBases[1]]
  const templates = [
    ...armorTemplates.slice(1),
    ...fixedShieldTemplates.filter(
      (template) => template.name === '+1 Shield (*)' && template.inherits.source === 'XDMG',
    ),
  ]
  const data = await loadMagicTemplates(templates, [], { baseitem: bases })
  const chosen = ['+2 Plate Armor', '+2 Chain Mail', '+1 Shield'].map(
    (name) => data.items.find((item) => item.name === name)!,
  )
  const actor = makeCharacterFixture({ originSystem: '2024', equipment: [] })
  actor.abilityScores.dexterity = 18
  const add = addManualEquipmentBatchCommand(actor, actor.provenance, chosen)
  const equipment = add.characterPatch.equipment!.map((row) => ({
    ...row,
    equipped: true,
    quantity: 2,
  }))
  const saved = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify({ ...actor, equipment, provenance: add.provenanceUpdate })),
  )
  const withoutPlate = await loadMagicTemplates(templates, [], { baseitem: bases.slice(1) })
  const view = createCurrentCharacterSheetViewModel(saved, data.lookups!)
  // Plate 18 + 2, separate shield 2 + 1. The second body slot contributes nothing.
  expect(view.effectiveArmorClass).toBe(23)
  expect(
    createCurrentCharacterSheetViewModel(saved, withoutPlate.lookups!).effectiveArmorClass,
  ).toBe(21)
  const reordered = {
    ...saved,
    equipment: [saved.equipment[1], saved.equipment[0], saved.equipment[2]],
  }
  expect(createCurrentCharacterSheetViewModel(reordered, data.lookups!).effectiveArmorClass).toBe(
    21,
  )
  const bytes = await generateTestCharacterSheet(view, '2024-official', {
    pages: { notes: false, spells: false },
  })
  expect((await PDFDocument.load(bytes)).getForm().getTextField('Text_8').getText()).toBe('23')
  expect(createCurrentCharacterSheetViewModel(saved, data.lookups!).effectiveArmorClass).toBe(23)
  expect(saved.equipment[0]).toMatchObject({
    name: '+2 Plate Armor',
    source: 'XDMG',
    ac: 18,
    armorType: 'heavy',
  })
  expect(saved.equipment[0]).not.toHaveProperty('magicVariantGenerated')
}, 15_000)
