import { expect, test } from 'vitest'
import { deriveWeaponActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  addManualEquipmentBatchCommand,
  removeManualEquipmentCommand,
} from '@/lib/character/commands/equipmentCommands'
import type { Item5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'
import { createCurrentCharacterSheetViewModel } from '../../fixtures/pdfTemplates'

test('equipment producers retain exact printings through projections, strict reopen and removal', () => {
  const first: Item5e = {
    name: 'Test Relic',
    source: 'A',
    type: 'M',
    rarity: 'rare',
    dmg1: '1d6',
    bonusAc: '+1',
    mastery: ['First Mastery|A'],
    entries: ['First rules.'],
  }
  const second: Item5e = {
    ...first,
    source: 'B',
    bonusAc: '+3',
    mastery: ['Second Mastery|B'],
    entries: ['Second rules.'],
  }
  const initial = makeCharacterFixture()
  const added = addManualEquipmentBatchCommand(initial, initial.provenance!, [first, second])
  const character = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...initial,
        ...added.characterPatch,
        provenance: added.provenanceUpdate,
        equipment: added.characterPatch.equipment!.map((item) => ({ ...item, equipped: true })),
        classChoiceSelections: [
          {
            choiceId: 'relics',
            label: 'Relics',
            kind: 'item',
            className: 'Fighter',
            classSource: 'PHB',
            classLevel: 1,
            selected: [
              { entityType: 'item', name: first.name, source: 'A', slotLevel: 1 },
              { entityType: 'item', name: second.name, source: 'B', slotLevel: 1 },
            ],
          },
        ],
      }),
    ),
  )
  const unchanged = JSON.stringify(character)
  const raw = new Map([
    ['arbitrary-first', first],
    ['arbitrary-second', second],
  ])
  const primary = new Map([['primary', { ...first, bonusAc: '+2' }]])
  const context = createCharacterCalculationContext(
    character,
    { itemLookup: primary },
    { itemLookup: raw },
  )
  expect(
    context.effects.sourceDeclarations
      .filter((effect) => effect.target.kind === 'armor-class')
      .map((effect) => [effect.source.source, effect.operation]),
  ).toEqual([
    ['A', { kind: 'add', value: 2 }],
    ['B', { kind: 'add', value: 3 }],
  ])
  const actions = () =>
    deriveWeaponActions(character, {
      abilityModifiers: context.abilityScores.modifiers,
      proficiencyBonus: 2,
      itemLookup: raw,
    })
  expect(actions().find((action) => action.source.source === 'A')?.mastery).toEqual([
    { name: 'First Mastery', source: 'A' },
  ])
  const descriptions = () =>
    createCurrentCharacterSheetViewModel(character, { itemLookup: raw }).magicItems.map((entry) => [
      entry.source,
      entry.description,
    ])
  expect(descriptions()).toEqual([
    ['A', 'First rules.'],
    ['B', 'Second rules.'],
  ])
  raw.delete('arbitrary-first')
  expect(descriptions()).toEqual([
    ['A', ''],
    ['B', 'Second rules.'],
  ])
  expect(actions().find((action) => action.source.source === 'A')?.mastery).toEqual([])
  raw.set('restored-first', first)
  expect(descriptions()).toEqual([
    ['A', 'First rules.'],
    ['B', 'Second rules.'],
  ])
  expect(JSON.stringify(character)).toBe(unchanged)

  const removed = removeManualEquipmentCommand(
    character,
    character.provenance!,
    character.equipment[0].id,
  )
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        ...removed.characterPatch,
        provenance: removed.provenanceUpdate,
      }),
    ),
  )
  expect(reopened.equipment.map((entry) => entry.source)).toEqual(['B'])
  expect(reopened.provenance?.equipment['test relic']).toHaveLength(1)
  expect(
    createCurrentCharacterSheetViewModel(reopened, { itemLookup: raw }).magicItems[0].description,
  ).toBe('Second rules.')
})

test('PDF descriptions prefer saved text and leave source-less or missing printings unresolved', () => {
  const base = { type: 'WO', rarity: 'rare', quantity: 1, equipped: true }
  const character = makeCharacterFixture({
    equipment: [
      { ...base, id: 'saved', name: 'Relic', source: 'A', description: '  Saved prose.  ' },
      { ...base, id: 'qualified', name: 'Relic', source: 'A' },
      { ...base, id: 'manual', name: 'Relic' },
      { ...base, id: 'missing', name: 'Relic', source: 'MISSING' },
    ],
  })
  const lookup = new Map([
    ['arbitrary', { name: 'Relic', source: 'A', type: 'WO', entries: ['Catalog prose.'] }],
  ])
  expect(
    createCurrentCharacterSheetViewModel(character, { itemLookup: lookup }).magicItems.map(
      (entry) => entry.description,
    ),
  ).toEqual(['Saved prose.', 'Catalog prose.', '', ''])
})
