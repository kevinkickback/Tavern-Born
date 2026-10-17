import { expect, test } from 'vitest'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import type { Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const shield: Item5e = { name: '+2 Shield', source: 'XDMG', type: 'S|XPHB', ac: 2, bonusAc: '+2' }
const other: Item5e = { ...shield, name: '+3 Shield', bonusAc: '+3' }
const armor: Item5e = { name: '+1 Plate Armor', source: 'DMG', type: 'HA', ac: 18, bonusAc: '+1' }
const ring: Item5e = { name: 'Ring', source: 'DMG', type: 'RG', bonusAc: '+1' }
function setup(items: Item5e[] = [shield, other, armor, ring]) {
  const base = makeCharacterFixture({
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
  })
  const added = addManualEquipmentBatchCommand(base, base.provenance!, items)
  return {
    ...base,
    ...added.characterPatch,
    provenance: added.provenanceUpdate,
    equipment: added.characterPatch.equipment!.map((x) => ({ ...x, equipped: true, quantity: 9 })),
  }
}
function total(character: ReturnType<typeof setup>, items: Item5e[]) {
  const calc = createCharacterCalculationContext(character, { itemLookup: buildItemLookup(items) })
  return computeEffectiveCharacterArmorClass(
    character,
    calc.abilityScores.total,
    calc.effects.declarations,
  )
}

test('first saved armor/shield slot owns AC, quantity and ignored slots do not multiply benefits', () => {
  const c = setup()
  expect(total(c, [shield, other, armor, ring])).toBe(24) // 18+2+1 armor+2 shield+1 ring
  c.variantRules = { ...c.variantRules, ignoreEquipRestrictions: true }
  expect(total(c, [shield, other, armor, ring])).toBe(24)
  expect(total(c, [other, armor, ring])).toBe(22) // missing first shield cannot promote second
  const unequipped = {
    ...c,
    equipment: c.equipment.map((x, i) => (i ? x : { ...x, equipped: false })),
  }
  expect(total(unequipped, [shield, other, armor, ring])).toBe(25)
  expect(
    total({ ...c, equipment: [c.equipment[1], c.equipment[0], ...c.equipment.slice(2)] }, [
      shield,
      other,
      armor,
      ring,
    ]),
  ).toBe(25)
})

test('selected owner keeps attunement, suppression, manual adjustments and override; nonarmor remains independent', () => {
  const c = setup([shield, other, ring])
  c.equipment[0].reqAttune = true
  expect(total(c, [shield, other, ring])).toBe(13)
  c.equipment[0].attuned = true
  expect(total(c, [shield, other, ring])).toBe(15)
  c.suppressedEffectIds = [`item:${encodeURIComponent(c.equipment[0].id)}:armor-class`]
  expect(total(c, [shield, other, ring])).toBe(13)
  c.armorClassAdjustments = [
    {
      id: 'manual',
      label: 'Manual',
      amount: 2,
      sourceType: 'manual',
      createdAt: '2026-10-17T00:00:00Z',
    },
  ]
  expect(total(c, [shield, other, ring])).toBe(15)
  c.armorClassOverride = 21
  expect(total(c, [shield, other, ring])).toBe(21)
})

test.each([
  ['raw retained', [], [shield], 0],
  ['both absent', [], [], 1],
  ['wrong printing', [], [{ ...shield, source: 'DMG' }], 1],
  ['case conflict', [], [{ ...shield, source: 'xdmg' }], 1],
  ['exact primary with absent raw rules', [shield], [], 0],
  ['exact restored', [shield], [shield], 0],
] as const)('exact equipment rules recommendation: %s', (_name, primary, raw, count) => {
  const c = setup([shield])
  const calc = createCharacterCalculationContext(
    c,
    { itemLookup: buildItemLookup([...primary]) },
    { itemLookup: buildItemLookup([...raw]) },
  )
  const before = JSON.stringify(c)
  const issues = getCharacterReadiness(c, { calculation: calc }).issues.filter(
    (x) => x.section === 'equipment',
  )
  expect(issues).toHaveLength(count)
  if (count)
    expect(issues[0]).toMatchObject({ severity: 'recommendation', navigationTarget: '/equipment' })
  expect(JSON.stringify(c)).toBe(before)
})

test('loading raw data, source-less customs and existing blocking placeholders remain distinct', () => {
  const c = setup([shield])
  const primary = { itemLookup: new Map() }
  for (const unknown of [
    createCharacterCalculationContext(c, primary),
    createCharacterCalculationContext(c, primary, undefined),
    createCharacterCalculationContext(c, primary, {}),
    createCharacterCalculationContext(c, primary, { itemLookup: undefined }),
  ]) {
    expect(
      getCharacterReadiness(c, { calculation: unknown }).issues.filter(
        (x) => x.section === 'equipment',
      ),
    ).toEqual([])
  }
  expect(total(c, [shield])).toBe(14) // Sole primary data still supplies live calculation rules.
  const missing = createCharacterCalculationContext(c, primary, { itemLookup: new Map() })
  c.equipment[0].source = ''
  expect(
    getCharacterReadiness(c, { calculation: missing }).issues.filter(
      (x) => x.section === 'equipment',
    ),
  ).toEqual([])
  c.equipment[0]._unresolved = true
  expect(
    getCharacterReadiness(c, { calculation: missing }).issues.filter(
      (x) => x.section === 'equipment',
    ),
  ).toEqual([expect.objectContaining({ severity: 'blocking' })])
})
