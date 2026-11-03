import { describe, expect, test, vi } from 'vitest'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { buildItemLookup, resolveClassEquipmentBlocks } from '@/lib/5etools/startingEquipment'
import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import { duplicateCharacter } from '@/lib/character/characterTransfer'
import {
  applyClassEquipmentChoiceCommand,
  applyClassProgressionUpdate,
  applyClassSelectionCommand,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  addManualEquipmentBatchCommand,
  removeManualEquipmentCommand,
  updateEquipmentQuantityCommand,
} from '@/lib/character/commands/equipmentCommands'
import {
  emptyStartingCurrency,
  needsStartingEquipmentApplication,
  reconcileStartingEquipmentGrant,
  setStartingCurrencyCommand,
} from '@/lib/character/startingEquipmentGrants'
import type { Class5e, Item5e } from '@/types/5etools'
import type { Character, Currency } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const gp = (value: number): Currency => ({ ...emptyStartingCurrency(), gp: value })
const apply = (character: Character, result: CharacterCommandResult): Character =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
const items = parseItems({
  baseitem: [
    { name: 'Dagger', source: 'PHB', type: 'M', weaponCategory: 'simple', dmg1: '1d4' },
    { name: 'Longsword', source: 'PHB', type: 'M', weaponCategory: 'martial' },
    { name: 'Warhammer', source: 'PHB', type: 'M', weaponCategory: 'martial' },
    { name: 'Longsword', source: 'XPHB', type: 'M|XPHB', weaponCategory: 'martial' },
  ],
  item: [
    {
      name: 'Enchanted Sword',
      source: 'PHB',
      type: 'M',
      weaponCategory: 'martial',
      rarity: 'rare',
    },
  ],
}) as Item5e[]
const lookup = buildItemLookup(items)
const fighter = {
  name: 'Fighter',
  source: 'PHB',
  startingEquipment: {
    default: ['{@filter martial weapons|items|source=phb|category=basic|type=martial weapon}'],
    defaultData: [
      {
        a: [{ equipmentType: 'weaponMartial', quantity: 2 }],
        b: [{ value: 5000 }],
        _: [{ item: 'Dagger|PHB', quantity: 2 }],
      },
    ],
  },
} as Class5e
const policy = (character: Character) =>
  createStartingEquipmentPolicy(
    character,
    { kind: 'class', name: fighter.name, source: fighter.source },
    fighter.startingEquipment,
    items,
  )
const actor = () => {
  const empty = makeCharacterFixture({
    classProgression: [],
    initialClass: undefined,
    equipment: [],
    currency: gp(5),
  })
  return apply(
    empty,
    applyClassSelectionCommand(empty, empty.provenance, fighter, undefined, lookup),
  )
}

describe('starting equipment source, quantities and ownership', () => {
  test('equivalent filter ordering stays valid; unknown and conflicting constraints remain unresolved', () => {
    const c = actor()
    const pool = (text: string) => {
      const eq = { ...(fighter.startingEquipment as object), default: [text] }
      const rules = createStartingEquipmentPolicy(
        c,
        { kind: 'class', name: fighter.name, source: fighter.source },
        eq,
        items,
      )
      return resolveClassEquipmentBlocks(eq, lookup, {}, rules)[0].options.a.genericChoices![0]
    }
    expect(
      pool(
        '{@filter weapon|items|source=PHB|category=Basic|type=martial weapon} or {@filter weapon|items|type=martial weapon|category=basic|source=phb}',
      ).candidates,
    ).toHaveLength(2)
    for (const clause of ['weight=1', 'property=H', 'source=PHB|source=XPHB']) {
      const slot = pool(
        `{@filter weapon|items|source=PHB|category=Basic|type=martial weapon|${clause}}`,
      )
      expect(slot.candidates).toEqual([])
      expect(slot.diagnostic).toBeTruthy()
    }
  })
  test('shares exact Basic/source eligibility and rejects wrong, magic and excessive selections', () => {
    const c = actor()
    const slot = resolveClassEquipmentBlocks(fighter.startingEquipment, lookup, {}, policy(c))[0]
      .options.a.genericChoices![0]
    expect(slot.candidates).toEqual([
      { name: 'Longsword', source: 'PHB' },
      { name: 'Warhammer', source: 'PHB' },
    ])
    for (const refs of [
      [{ name: 'Dagger', source: 'PHB' }],
      [{ name: 'Enchanted Sword', source: 'PHB' }],
      [{ name: 'Longsword', source: 'XPHB' }],
      Array.from({ length: 3 }, () => ({ name: 'Longsword', source: 'PHB' })),
    ]) {
      expect(() =>
        applyClassEquipmentChoiceCommand(
          c,
          c.provenance,
          fighter,
          0,
          'a',
          lookup,
          { [slot.key]: refs },
          policy(c),
        ),
      ).toThrow(RangeError)
    }
    expect(() =>
      applyClassEquipmentChoiceCommand(c, c.provenance, fighter, 0, 'missing', lookup),
    ).toThrow(RangeError)
    expect(c.equipment.map((item) => [item.name, item.quantity])).toEqual([['Dagger', 2]])
  })

  test.each([
    true,
    false,
  ])('two units allow repeated or independent items; refresh and replacement preserve manual copies (%s)', (repeat) => {
    let c = actor()
    const refs = [
      { name: 'Longsword', source: 'PHB' },
      { name: repeat ? 'Longsword' : 'Warhammer', source: 'PHB' },
    ]
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        fighter,
        0,
        'a',
        lookup,
        { '0:a:0': refs },
        policy(c),
      ),
    )
    expect(
      c.equipment
        .filter((item) => item.weaponCategory === 'martial')
        .reduce((sum, item) => sum + item.quantity, 0),
    ).toBe(2)
    c = apply(
      c,
      addManualEquipmentBatchCommand(c, c.provenance, [
        lookup.get('dagger|phb')!,
        lookup.get('longsword|phb')!,
      ]),
    )
    const ids = c.equipment.map((item) => item.id)
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        fighter,
        0,
        'a',
        lookup,
        undefined,
        policy(c),
      ),
    )
    expect(c.equipment.map((item) => item.id)).toEqual(ids)
    expect(
      c.equipment
        .filter((item) => item.name === 'Dagger')
        .reduce((sum, item) => sum + item.quantity, 0),
    ).toBe(3)
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        fighter,
        0,
        'b',
        lookup,
        undefined,
        policy(c),
      ),
    )
    expect(c.equipment.filter((item) => item.name === 'Longsword')).toHaveLength(1)
    expect(c.currency!.gp).toBe(55)
    expect(characterPersistenceSchema.parse(duplicateCharacter(c)).startingEquipmentGrants).toEqual(
      c.startingEquipmentGrants,
    )
  })

  test('quantity consumption survives refresh; manual surplus survives initial Class removal', () => {
    let c = actor()
    const dagger = c.equipment[0]
    c = apply(c, updateEquipmentQuantityCommand(c, c.provenance, dagger.id, 1))
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        fighter,
        0,
        'a',
        lookup,
        undefined,
        policy(c),
      ),
    )
    expect(c.equipment[0].quantity).toBe(1)
    c = apply(c, updateEquipmentQuantityCommand(c, c.provenance, dagger.id, 3))
    c = apply(c, applyClassProgressionUpdate(c, c.provenance, []))
    expect(c.initialClass).toBeUndefined()
    expect(c.equipment[0]).toMatchObject({ id: dagger.id, quantity: 2 })
    expect(c.startingEquipmentGrants?.class?.items).toEqual([])
  })

  test('removed copies remain consumed after strict reopen and unchanged package refresh', () => {
    let c = actor()
    const id = c.equipment[0].id
    c = apply(c, removeManualEquipmentCommand(c, c.provenance, id))
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        fighter,
        0,
        'a',
        lookup,
        undefined,
        policy(c),
      ),
    )
    expect(c.equipment).toEqual([])
    expect(c.startingEquipmentGrants?.class?.items[0]).toMatchObject({
      equipmentId: id,
      issuedQuantity: 2,
      remainingQuantity: 0,
    })
  })

  test('reordering retains explicit initial Class; another viewed or added Class cannot claim a package', () => {
    let c = actor()
    c = {
      ...c,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }, ...c.classProgression],
    }
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        fighter,
        0,
        'b',
        lookup,
        undefined,
        policy(c),
      ),
    )
    expect(c.initialClass).toEqual({ name: 'Fighter', source: 'PHB' })
    expect(() =>
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        { ...fighter, name: 'Wizard' },
        0,
        'b',
        lookup,
      ),
    ).toThrow(RangeError)
  })

  test('exact source loss/restoration and item casing retain the owned ID, quantity and summary', () => {
    let c = actor()
    const before = c.equipment[0]
    const missing = createStartingEquipmentPolicy(
      c,
      { kind: 'class', name: fighter.name, source: fighter.source },
      fighter.startingEquipment,
      items.filter((item) => item.name !== 'Dagger'),
    )
    c = apply(
      c,
      applyClassSelectionCommand(c, c.provenance, fighter, undefined, lookup, {
        startingEquipmentPolicy: missing,
      }),
    )
    expect(c.equipment[0]).toEqual(before)
    expect(c.provenance.equipment.dagger).toHaveLength(1)
    const changed = items.map((item) =>
      item.name === 'Dagger' ? { ...item, name: ' DAGGER ', source: ' phb ' } : item,
    )
    const restored = createStartingEquipmentPolicy(
      c,
      { kind: 'class', name: fighter.name, source: fighter.source },
      fighter.startingEquipment,
      changed,
    )
    c = apply(
      c,
      applyClassSelectionCommand(c, c.provenance, fighter, undefined, lookup, {
        startingEquipmentPolicy: restored,
      }),
    )
    expect(c.equipment[0]).toEqual(before)
  })

  test('never-issued restored grants need explicit application; consumed grants do not', () => {
    const empty = makeCharacterFixture({
      classProgression: [],
      initialClass: undefined,
      equipment: [],
    })
    let c = apply(
      empty,
      applyClassSelectionCommand(empty, empty.provenance, fighter, undefined, new Map()),
    )
    const pkg = resolveClassEquipmentBlocks(fighter.startingEquipment, lookup, {}, policy(c))[0]
      .options.a
    expect(needsStartingEquipmentApplication(c, 'class', pkg)).toBe(true)
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        fighter,
        0,
        'a',
        lookup,
        undefined,
        policy(c),
      ),
    )
    c = apply(c, removeManualEquipmentCommand(c, c.provenance, c.equipment[0].id))
    expect(needsStartingEquipmentApplication(c, 'class', pkg)).toBe(false)
  })

  test('occupied inventory and consumed IDs remain distinct even when timestamp/random repeat', () => {
    const time = vi.spyOn(Date, 'now').mockReturnValue(100)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      let c = actor()
      c = apply(c, removeManualEquipmentCommand(c, c.provenance, c.equipment[0].id))
      c = apply(c, addManualEquipmentBatchCommand(c, c.provenance, [items[0], items[0]]))
      const ids = [
        ...c.equipment.map((item) => item.id),
        ...c.startingEquipmentGrants!.class!.items.map((lot) => lot.equipmentId),
      ]
      expect(new Set(ids).size).toBe(ids.length)
    } finally {
      time.mockRestore()
      random.mockRestore()
    }
  })
})

test('spent starting currency remains debited through lower/higher budgets, remove/readd and independent providers', () => {
  let c = makeCharacterFixture({ currency: gp(5), equipment: [] })
  const replace = (value: number, active = true) => {
    c = characterPersistenceSchema.parse({
      ...c,
      ...reconcileStartingEquipmentGrant(
        c,
        'class',
        active ? c.initialClass : undefined,
        [],
        gp(value),
      ),
      ...(active ? {} : { initialClass: undefined }),
    })
  }
  replace(100)
  c = characterPersistenceSchema.parse({
    ...c,
    ...reconcileStartingEquipmentGrant(
      c,
      'background',
      { name: 'Soldier', source: 'PHB' },
      [],
      gp(10),
    ),
  })
  expect(c.currency!.gp).toBe(115)
  c = characterPersistenceSchema.parse({ ...c, ...setStartingCurrencyCommand(c, 'gp', 85) })
  expect(c.startingEquipmentGrants?.class).toMatchObject({
    spentCopper: 3000,
    remainingCurrency: gp(70),
  })
  replace(20)
  expect(c.currency!.gp).toBe(15)
  replace(100)
  expect(c.currency!.gp).toBe(85)
  replace(100)
  expect(c.currency!.gp).toBe(85)
  replace(0, false)
  expect(c.currency!.gp).toBe(15)
  c = { ...c, initialClass: { name: 'Fighter', source: 'PHB' } }
  replace(100)
  expect(c.currency!.gp).toBe(85)
  const corrupt = structuredClone(c)
  corrupt.currency!.gp = 1
  expect(characterPersistenceSchema.safeParse(corrupt).success).toBe(false)
  expect(() => setStartingCurrencyCommand(c, 'gp', Number.MAX_SAFE_INTEGER)).toThrow(RangeError)
})
