// @vitest-environment jsdom
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import { deriveWeaponActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import {
  applyClassEquipmentChoiceCommand,
  applyClassProgressionUpdate,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setStartingCurrencyCommand } from '@/lib/character/startingEquipmentGrants'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'
import { makeStartingEquipmentScenario } from '../fixtures/startingEquipmentFixtures'

test('owned physical rows reach Actions, Review and actual PDF; removal retains the other owner and manual funds', async () => {
  const scenario = makeStartingEquipmentScenario(),
    data = scenario.data
  let character = scenario.character
  const lookups = buildGameDataLookups(data),
    items = [...data.items, ...data.itemsBase]
  const cls = data.classes[0],
    background = data.backgrounds[0]
  const apply = (result: CharacterCommandResult) => {
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  const policy = (role: 'class' | 'background') => {
    const owner = role === 'class' ? cls : background
    return createStartingEquipmentPolicy(
      character,
      { ...owner, kind: role },
      owner.startingEquipment,
      items,
    )
  }
  apply(
    applyClassEquipmentChoiceCommand(
      character,
      character.provenance,
      cls,
      0,
      'a',
      lookups.itemLookup,
      {
        '0:a:0': [
          { name: 'Longsword', source: 'PHB' },
          { name: 'Longsword', source: 'PHB' },
        ],
      },
      policy('class'),
    ),
  )
  apply(
    applyBackgroundSelectionCommand(
      character,
      character.provenance,
      background,
      ['a'],
      lookups.itemLookup,
      {
        '0:a:0': [
          { name: 'Longsword', source: 'PHB' },
          { name: 'Longsword', source: 'PHB' },
        ],
      },
      policy('background'),
    ),
  )
  const backgroundLot = character.startingEquipmentGrants!.background!.items.find(
    (lot) => lot.reference.name === 'Longsword',
  )!
  const classLot = character.startingEquipmentGrants!.class!.items.find(
    (lot) => lot.reference.name === 'Longsword',
  )!
  expect(backgroundLot.equipmentId).not.toBe(classLot.equipmentId)
  const actions = deriveWeaponActions(character, {
    abilityModifiers: {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    },
    proficiencyBonus: 2,
    itemLookup: lookups.itemLookup,
  })
  expect(actions.filter((action) => action.name === 'Longsword')).toHaveLength(2)
  const context = createCharacterCalculationContext(character, lookups, lookups)
  expect(
    getCharacterReadiness(character, { calculation: context }).issues.filter((issue) =>
      issue.id.startsWith('starting-equipment:'),
    ),
  ).toEqual([])
  const vm = createCharacterSheetViewModel(character, lookups, lookups)
  expect(
    vm.character.equipment.filter((item) => item.name === 'Longsword').map((item) => item.quantity),
  ).toEqual([2, 2])
  expect(vm.weaponRows.filter((row) => row.name === 'Longsword')).toHaveLength(2)
  apply(
    applyClassEquipmentChoiceCommand(
      character,
      character.provenance,
      cls,
      0,
      'b',
      lookups.itemLookup,
      undefined,
      policy('class'),
    ),
  )
  expect(character.currency?.gp).toBe(55)
  character = characterPersistenceSchema.parse({
    ...character,
    ...setStartingCurrencyCommand(character, 'gp', 25),
  })
  apply(applyClassProgressionUpdate(character, character.provenance, []))
  expect(character.currency?.gp).toBe(5)
  expect(character.equipment.find((item) => item.id === backgroundLot.equipmentId)?.quantity).toBe(
    2,
  )
  expect(
    character.equipment.filter((item) => item.name === 'Dagger').map((item) => item.quantity),
  ).toEqual([1])
  const after = createCharacterSheetViewModel(
    characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character))),
    lookups,
    lookups,
  )
  expect(after.weaponRows.filter((row) => row.name === 'Longsword')).toHaveLength(1)
  expect(buildCharacterSheetFieldMap(after, '2014-official').textFields.GP).toBe('5')
  const pdf = await PDFDocument.load(await generateTestCharacterSheet(after, '2014-official'))
  const gold = pdf.getForm().getField('GP')
  expect(gold).toBeInstanceOf(PDFTextField)
  expect((gold as PDFTextField).getText()).toBe('5')
})
