import { expect, test } from 'vitest'
import { deriveStructuredItemEffects } from '@/lib/calculations/characterEffects'
import { getEffectiveCharacterMovement } from '@/lib/calculations/movement'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import type { Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { loadMagicTemplates } from '../fixtures/magicVariantFixtures'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'

test('qualified armor follows current walk while a charged item stays manual', () => {
  const armor: Item5e = {
    name: "Mariner's Leather Armor",
    source: 'DMG',
    type: 'LA',
    modifySpeed: { equal: { swim: 'walk' } },
    magicVariantGenerated: {
      template: { name: "Mariner's Armor", source: 'DMG' },
      base: { name: 'Leather Armor', source: 'PHB' },
      minimumSwimFromWalk: true,
    },
  }
  const medal: Item5e = {
    name: 'Medal of the Conch',
    source: 'CRCotN',
    type: 'G',
    charges: 1,
    modifySpeed: { equal: { swim: 'walk' } },
  }
  const speedWith = (
    item: Item5e,
    overrides: Partial<Character> = {},
    worn = true,
    attuned = false,
  ) => {
    const equipment = [
      {
        id: 'swim-item',
        name: item.name,
        source: item.source,
        type: item.type,
        quantity: 1,
        equipped: worn,
        attuned,
      },
    ]
    const character = makeCharacterFixture({
      equipment,
      movementOverrides: { walk: 40 },
      ...overrides,
    })
    return getEffectiveCharacterMovement(
      character,
      deriveStructuredItemEffects(equipment, new Map([['swim-item', item]])),
    ).speeds
  }
  expect(speedWith(medal).swim).toBeUndefined()
  expect(speedWith(armor, {}, false).swim).toBeUndefined()
  expect(speedWith(armor)).toMatchObject({ walk: 40, swim: 40 })
  expect(speedWith(armor, { movementOverrides: { walk: 40, swim: 10 } }).swim).toBe(10)
  expect(
    speedWith(armor, {
      movement: { speeds: { walk: 30, swim: 50 }, source: { kind: 'race', name: 'Fixture' } },
      movementOverrides: { walk: 25 },
    }).swim,
  ).toBe(50)
  const enhanced = { ...armor, modifySpeed: { ...armor.modifySpeed, bonus: { '*': 5 } } }
  expect(speedWith(enhanced, { movementOverrides: {} })).toMatchObject({ walk: 35, swim: 35 })
  const attunedArmor = { ...armor, reqAttune: true }
  expect(speedWith(attunedArmor).swim).toBeUndefined()
  expect(speedWith(attunedArmor, {}, true, true).swim).toBe(40)
  expect(
    speedWith(armor, { suppressedEffectIds: ['item:swim-item:speed:minimum-from-walk:swim'] }).swim,
  ).toBeUndefined()
})

test("Mariner's Armor uses final walking speed only while worn", async () => {
  const actor = makeCharacterFixture({
    equipment: [],
    movementOverrides: { walk: 40 },
  })
  const data = await loadMagicTemplates(
    [
      {
        name: "Mariner's Armor",
        type: 'GV|DMG',
        edition: 'classic',
        requires: [{ armor: true }],
        inherits: {
          source: 'DMG',
          namePrefix: "Mariner's ",
          rarity: 'uncommon',
          modifySpeed: { equal: { swim: 'walk' } },
          entries: [
            'While wearing this armor, you have a swimming speed equal to your walking speed.',
          ],
        },
      },
    ],
    [],
    {
      baseitem: [
        {
          name: 'Leather Armor',
          source: 'PHB',
          type: 'LA',
          edition: 'classic',
          rarity: 'none',
          armor: true,
          srd: true,
          ac: 11,
        },
      ],
    },
  )
  const item = data.items.find((row) => row.name === "Mariner's Leather Armor")
  expect(item).toBeDefined()
  const { characterPatch, provenanceUpdate } = addManualEquipmentBatchCommand(
    actor,
    actor.provenance,
    [item!],
  )
  const [saved] = characterPatch.equipment!
  const view = (equipped: boolean, catalog = data) =>
    createCurrentCharacterSheetViewModel(
      { ...actor, provenance: provenanceUpdate, equipment: [{ ...saved, equipped }] },
      catalog.lookups!,
    )
  expect(view(false).movement.speeds.swim ?? 0).toBe(0)
  expect(view(true).movement.speeds.walk).toBe(40)
  expect(view(true).movement.speeds.swim).toBe(40)
  expect(view(true).additionalMovementSummary).toContain('swim 40 ft.')
  expect(view(true, await loadMagicTemplates([])).movement.speeds.swim ?? 0).toBe(0)
})
