import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { filterCharacterItems } from '@/lib/5etools/playerItemAvailability'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import { buildItemDetailFields } from '@/lib/itemDetailFields'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { loadMagicTemplates } from '../fixtures/magicVariantFixtures'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'

const plate = {
  name: 'Plate Armor',
  source: 'XPHB',
  type: 'HA|XPHB',
  edition: 'one',
  rarity: 'none',
  srd52: true,
  ac: 18,
  weight: 65,
  strength: '15',
  stealth: true,
}
const mithral = {
  name: 'Mithral +1 Armor',
  type: 'GV|DMG',
  requires: [{ type: 'HA' }, { type: 'HA|XPHB' }],
  excludes: { name: 'Hide Armor' },
  inherits: {
    source: 'AI',
    namePrefix: 'Mithral +1 ',
    rarity: 'rare',
    strength: null,
    stealth: false,
    bonusAc: '+1',
    entries: ['You have a {=bonusAc} bonus to AC while wearing this armor.'],
  },
}
const baseitem = [
  plate,
  { ...plate, source: 'PHB', type: 'HA', edition: 'classic', srd52: undefined, srd: true },
]
const variantName = 'Mithral +1 Plate Armor'
const find = (data: Awaited<ReturnType<typeof loadMagicTemplates>>) =>
  data.items.find((row) => row.name === variantName && row.source === 'AI')

test('generated supplemented armor keeps its printing, physical fields, and live AC after reopen', async () => {
  const data = await loadMagicTemplates([mithral], [], { baseitem })
  const item = find(data)!
  expect(item.magicVariantGenerated).toEqual({
    base: { name: 'Plate Armor', source: 'XPHB' },
    template: { name: 'Mithral +1 Armor', source: 'AI' },
  })
  const filter = (allowedSources: string[]) =>
    filterCharacterItems([item], { allowedSources, originSystem: '2024' })
  expect(filter(['XPHB', 'AI'])).toEqual([item])
  expect(filter(['XPHB', 'XDMG'])).toEqual([])

  const character = makeCharacterFixture({ originSystem: '2024', equipment: [] })
  const { characterPatch, provenanceUpdate } = addManualEquipmentBatchCommand(
    character,
    character.provenance,
    [item],
  )
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        provenance: provenanceUpdate,
        equipment: [{ ...characterPatch.equipment![0], equipped: true }],
      }),
    ),
  )
  const [saved] = reopened.equipment
  expect(saved).toMatchObject({ name: variantName, source: 'AI', ac: 18, weight: 65 })
  const fields = buildItemDetailFields(saved, item, {})
  expect(fields.map(({ label }) => label)).not.toContain('Strength')
  expect(fields.map(({ label }) => label)).not.toContain('Stealth')
  const view = createCurrentCharacterSheetViewModel(reopened, data.lookups!)
  expect(view.effectiveArmorClass).toBe(19)
  expect(view.magicItems[0]?.description).toContain('+1 bonus to AC')
  const without = await loadMagicTemplates([], [], { baseitem })
  expect(createCurrentCharacterSheetViewModel(reopened, without.lookups!).effectiveArmorClass).toBe(
    18,
  )
  expect(createCurrentCharacterSheetViewModel(reopened, data.lookups!).effectiveArmorClass).toBe(19)
})

test('winning supplemental definitions preserve exact identity and concrete item precedence', async () => {
  const valid = await loadMagicTemplates([mithral], [], { baseitem })
  const malformed = [
    { ...mithral, type: 'GV|XDMG' },
    { ...mithral, inherits: { ...mithral.inherits, nameSuffix: ' of Mithral' } },
    { ...mithral, inherits: { ...mithral.inherits, bonusAc: '+2' } },
    { ...mithral, inherits: { ...mithral.inherits, entries: ['Test {=weight}.'] } },
    { ...mithral, inherits: { ...mithral.inherits, modifySpeed: { equal: { swim: 'walk' } } } },
    { ...mithral, source: 'AI', inherits: { ...mithral.inherits, source: 'XGE' } },
  ]
  for (const template of malformed) {
    const winner = composeGameDataLayers([valid, await loadMagicTemplates([template])])
    expect(find(winner)).toBeUndefined()
    expect(winner.materialArmorDiagnostics).toEqual([
      expect.objectContaining({ path: 'magicVariants.Mithral +1 Armor|AI' }),
    ])
  }
  const concrete = await loadMagicTemplates(
    [],
    [{ name: variantName, source: 'AI', type: plate.type, ac: 19 }],
  )
  const winner = composeGameDataLayers([valid, concrete])
  expect(find(winner)).toMatchObject({ ac: 19 })
  expect(find(winner)?.magicVariantGenerated).toBeUndefined()
  expect(find(composeGameDataLayers([valid]))).toEqual(find(valid))
})
