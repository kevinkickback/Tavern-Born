import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildItemLookup, resolveClassEquipmentBlocks } from '@/lib/5etools/startingEquipment'
import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import { duplicateCharacter, prepareCharacterImport } from '@/lib/character/characterTransfer'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
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
import { validateCharacterData } from '@/store/characterStore'
import type { Background5e, Class5e, Item5e } from '@/types/5etools'
import type { Character, Currency } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeConfiguredStartingEquipmentScenario } from '../fixtures/configuredStartingEquipmentFixtures'

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
    c = apply(c, updateEquipmentQuantityCommand(c, c.provenance, c.equipment[0].id, 1))
    const before = c.equipment[0]
    const ownedBefore = c.startingEquipmentGrants!.class!.items[0]
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
    expect(c.startingEquipmentGrants!.class!.items[0]).toEqual(ownedBefore)
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
    expect(c.startingEquipmentGrants!.class!.items[0]).toMatchObject({
      key: ownedBefore.key,
      equipmentId: ownedBefore.equipmentId,
      issuedQuantity: ownedBefore.issuedQuantity,
      consumedQuantity: ownedBefore.consumedQuantity,
      remainingQuantity: ownedBefore.remainingQuantity,
    })
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

test.each([
  'class',
  'background',
] as const)('%s changed choices require the exact count without mutating the original', (role) => {
  const ref = { name: 'Longsword', source: 'PHB' }
  const other = { name: 'Warhammer', source: 'PHB' }
  const background = {
    name: 'Quartermaster',
    source: 'PHB',
    entries: [
      {
        name: 'Equipment:',
        entries: ['{@filter martial weapons|items|source=phb|category=basic|type=martial weapon}'],
      },
    ],
    startingEquipment: [{ _: [{ equipmentType: 'weaponMartial', quantity: 2 }] }],
  } as Background5e
  const key = role === 'class' ? '0:a:0' : '0:_:0'
  const edit = (c: Character, refs: (typeof ref)[]) =>
    apply(
      c,
      role === 'class'
        ? applyClassEquipmentChoiceCommand(
            c,
            c.provenance,
            fighter,
            0,
            'a',
            lookup,
            { [key]: refs },
            policy(c),
          )
        : applyBackgroundSelectionCommand(c, c.provenance, background, [], lookup, { [key]: refs }),
    )
  const complete = edit(actor(), [ref, other])
  const before = structuredClone(complete)
  for (const invalid of [[ref], []]) {
    expect(() => edit(complete, invalid)).toThrow(RangeError)
    expect(complete).toEqual(before)
  }
  const pending = edit(actor(), [])
  const savedPartial = characterPersistenceSchema.parse({
    ...pending,
    ...(role === 'class'
      ? { classEquipmentItemChoices: { 'Fighter|PHB': { [key]: [ref] } } }
      : { backgroundEquipmentItemChoices: { [key]: [ref] } }),
  })
  expect(() => edit(savedPartial, [ref])).not.toThrow()
  expect(() => edit(pending, [ref])).toThrow(RangeError)
  const same = edit(complete, [ref, ref])
  expect(
    same.equipment
      .filter((item) => item.name === 'Longsword')
      .reduce((sum, item) => sum + item.quantity, 0),
  ).toBe(2)
})

test.each([
  1, 2,
])('retained consumed count %s survives declared quantity shrink, strict reopen and regrowth', (consumed) => {
  let c = actor()
  const id = c.startingEquipmentGrants!.class!.items[0].equipmentId
  c = apply(c, updateEquipmentQuantityCommand(c, c.provenance, id, 2 - consumed))
  const resize = (quantity: number) => {
    const cls = {
      ...fighter,
      startingEquipment: { defaultData: [{ _: [{ item: 'Dagger|PHB', quantity }] }] },
    }
    const authority = createStartingEquipmentPolicy(
      c,
      { kind: 'class', name: cls.name, source: cls.source },
      cls.startingEquipment,
      items,
    )
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(c, c.provenance, cls, 0, '_', lookup, undefined, authority),
    )
  }
  resize(1)
  expect(c.startingEquipmentGrants!.class!.items[0]).toMatchObject({
    equipmentId: id,
    issuedQuantity: 1,
    consumedQuantity: consumed,
    remainingQuantity: Math.max(0, 1 - consumed),
  })
  c = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(c)))
  resize(2)
  expect(c.startingEquipmentGrants!.class!.items[0]).toMatchObject({
    equipmentId: id,
    issuedQuantity: 2,
    consumedQuantity: consumed,
    remainingQuantity: 2 - consumed,
  })
  expect(c.equipment.find((item) => item.id === id)?.quantity ?? 0).toBe(2 - consumed)
})

test('consumption counts owned units only and preserves independent surplus and the other role', () => {
  let c = actor()
  const classId = c.startingEquipmentGrants!.class!.items[0].equipmentId
  c = apply(
    c,
    applyBackgroundSelectionCommand(
      c,
      c.provenance,
      {
        name: 'Quartermaster',
        source: 'PHB',
        startingEquipment: [{ _: [{ item: 'Dagger|PHB', quantity: 2 }] }],
      },
      [],
      lookup,
    ),
  )
  const bgId = c.startingEquipmentGrants!.background!.items[0].equipmentId
  c = apply(c, addManualEquipmentBatchCommand(c, c.provenance, [lookup.get('dagger|phb')!]))
  c = apply(c, updateEquipmentQuantityCommand(c, c.provenance, classId, 5))
  c = apply(c, updateEquipmentQuantityCommand(c, c.provenance, classId, 4))
  expect(c.startingEquipmentGrants!.class!.items[0]).toMatchObject({
    consumedQuantity: 1,
    remainingQuantity: 1,
  })
  expect(c.startingEquipmentGrants!.background!.items[0]).toMatchObject({
    equipmentId: bgId,
    consumedQuantity: 0,
    remainingQuantity: 2,
  })
  c = apply(c, applyClassProgressionUpdate(c, c.provenance, []))
  expect(c.equipment.find((item) => item.id === classId)?.quantity).toBe(3)
  expect(c.equipment.find((item) => item.id === bgId)?.quantity).toBe(2)
  expect(c.equipment.reduce((sum, item) => sum + item.quantity, 0)).toBe(6)
})

test('strict admission requires truthful consumption rather than deriving a missing draft balance', () => {
  const c = actor()
  for (const consumedQuantity of [undefined, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, 1]) {
    const bad = structuredClone(c)
    Object.assign(bad.startingEquipmentGrants!.class!.items[0], { consumedQuantity })
    expect(characterPersistenceSchema.safeParse(bad).success).toBe(false)
  }
})

test.each([
  'class',
  'background',
] as const)('%s strict import rejects missing owned currency even when the wallet has enough funds', (role) => {
  const base = actor()
  const c = apply(
    base,
    role === 'class'
      ? applyClassEquipmentChoiceCommand(
          base,
          base.provenance,
          fighter,
          0,
          'b',
          lookup,
          undefined,
          policy(base),
        )
      : applyBackgroundSelectionCommand(
          base,
          base.provenance,
          {
            name: 'Quartermaster',
            source: 'PHB',
            startingEquipment: [{ _: [{ value: 5000 }] }],
          },
          [],
          lookup,
        ),
  )
  expect(c.currency).toEqual(gp(55))
  for (const remainingCurrency of [emptyStartingCurrency(), { ...gp(49), sp: 9, cp: 9 }, gp(51)]) {
    const bad = structuredClone(c)
    bad.startingEquipmentGrants![role]!.remainingCurrency = remainingCurrency
    expect(characterPersistenceSchema.safeParse(bad).success).toBe(false)
    const imported = prepareCharacterImport(
      JSON.stringify(bad),
      'invalid.tbc',
      validateCharacterData,
    )
    expect(imported.characters).toEqual([])
    expect(imported.failures).toHaveLength(1)
  }
  expect(duplicateCharacter(c).startingEquipmentGrants).toEqual(c.startingEquipmentGrants)
})

test('valid equal-value coin vectors survive refresh and owned spending before canonical package replacement', () => {
  let c = actor()
  const select = (option: string) => {
    c = apply(
      c,
      applyClassEquipmentChoiceCommand(
        c,
        c.provenance,
        fighter,
        0,
        option,
        lookup,
        undefined,
        policy(c),
      ),
    )
  }
  select('b')
  c = characterPersistenceSchema.parse({
    ...c,
    currency: { ...gp(5), sp: 500 },
    startingEquipmentGrants: {
      ...c.startingEquipmentGrants,
      class: { ...c.startingEquipmentGrants!.class!, remainingCurrency: { ...gp(0), sp: 500 } },
    },
  })
  select('b')
  expect(c.startingEquipmentGrants!.class!.remainingCurrency).toEqual({ ...gp(0), sp: 500 })
  for (const amount of [490, 600, 550])
    c = characterPersistenceSchema.parse({ ...c, ...setStartingCurrencyCommand(c, 'sp', amount) })
  expect(c.startingEquipmentGrants!.class).toMatchObject({
    remainingCurrency: { ...gp(0), sp: 440 },
    spentCopper: 600,
  })
  select('a')
  expect(c.currency).toEqual({ ...gp(5), sp: 110 })
  select('b')
  expect(c.startingEquipmentGrants!.class).toMatchObject({
    remainingCurrency: gp(44),
    spentCopper: 600,
  })
  expect(c.currency).toEqual({ ...gp(49), sp: 110 })
})

test.skipIf(
  !['data/class/class-fighter.json', 'data/items.json', 'data/items-base.json'].every(existsSync),
)(
  'configured Fighter retains consumption when repeated weapons are redistributed and restored',
  () => {
    const { data, character } = makeConfiguredStartingEquipmentScenario('2014')
    const cls = data.classes.find((row) => row.name === 'Fighter' && row.source === 'PHB')!
    const actualItems = [...data.items, ...data.itemsBase]
    const actualLookup = buildItemLookup(actualItems)
    const authority = (c: Character) =>
      createStartingEquipmentPolicy(
        c,
        { kind: 'class', name: cls.name, source: cls.source },
        cls.startingEquipment,
        actualItems,
      )
    const slots = resolveClassEquipmentBlocks(
      cls.startingEquipment,
      actualLookup,
      {},
      authority(character),
    ).flatMap((block) =>
      Object.entries(block.options).flatMap(([option, pkg]) =>
        (pkg.genericChoices ?? []).map((choice) => ({ block: block.index, option, choice })),
      ),
    )
    const target = slots.find(
      ({ choice }) =>
        choice.quantity === 2 &&
        ['Longsword', 'Warhammer'].every((name) =>
          choice.candidates.some((ref) => ref.name === name && ref.source === 'PHB'),
        ),
    )!
    expect(target).toBeDefined()
    const ref = { name: 'Longsword', source: 'PHB' },
      other = { name: 'Warhammer', source: 'PHB' }
    const edit = (c: Character, refs: (typeof ref)[]) =>
      apply(
        c,
        applyClassEquipmentChoiceCommand(
          c,
          c.provenance,
          cls,
          target.block,
          target.option,
          actualLookup,
          { ...(c.classEquipmentItemChoices?.['Fighter|PHB'] ?? {}), [target.choice.key]: refs },
          authority(c),
        ),
      )
    const lot = (c: Character) =>
      c.startingEquipmentGrants!.class!.items.find((item) => item.reference.name === 'Longsword')!
    let c = edit(character, [ref, ref])
    const id = lot(c).equipmentId
    c = apply(c, updateEquipmentQuantityCommand(c, c.provenance, id, 0))
    c = edit(c, [ref, other])
    expect(lot(c)).toMatchObject({
      equipmentId: id,
      issuedQuantity: 1,
      consumedQuantity: 2,
      remainingQuantity: 0,
    })
    c = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(c)))
    c = edit(c, [ref, ref])
    expect(lot(c)).toMatchObject({
      equipmentId: id,
      issuedQuantity: 2,
      consumedQuantity: 2,
      remainingQuantity: 0,
    })
    expect(c.equipment.some((item) => item.id === id)).toBe(false)
  },
)

test('retains the fixed revised Druid focus lot through missing or ambiguous source rules', () => {
  const root = 'resources/srd/core/data'
  const read = (file: string) => JSON.parse(readFileSync(`${root}/${file}`, 'utf8'))
  const cls = (parseClassDocument(read('class/class-druid.json')).classes as Class5e[]).find(
    (row) => row.name === 'Druid' && row.source === 'XPHB',
  )
  if (!cls) throw new Error('Missing bundled revised Druid')
  const raw = [
    ...parseItems(read('items.json')),
    ...parseItems(read('items-base.json')),
  ] as Item5e[]
  const itemLookup = buildItemLookup(raw)
  const empty = makeCharacterFixture({
    originSystem: '2024',
    allowedSources: ['XPHB'],
    classProgression: [],
    initialClass: undefined,
    equipment: [],
    currency: gp(5),
  })
  const initial = apply(
    empty,
    applyClassSelectionCommand(empty, empty.provenance, cls, undefined, itemLookup),
  )
  const staff = initial.equipment.find((row) => row.name === 'Wooden Staff')
  if (!staff) throw new Error('Missing granted Wooden Staff')
  expect(staff).toMatchObject({ source: 'XPHB', quantity: 1, type: 'SCF|XPHB', dmg1: '1d6' })
  const lot = initial.startingEquipmentGrants?.class?.items.find(
    (row) => row.equipmentId === staff.id,
  )
  expect(lot).toMatchObject({ key: '[0,"a",3,"item","wooden staff","xphb"]', remainingQuantity: 1 })
  const choose = (character: Character, branch: 'a' | 'b', items: readonly Item5e[] = raw) => {
    const policy = createStartingEquipmentPolicy(
      character,
      { ...cls, kind: 'class' },
      cls.startingEquipment,
      items,
    )
    return apply(
      character,
      applyClassEquipmentChoiceCommand(
        character,
        character.provenance,
        cls,
        0,
        branch,
        itemLookup,
        undefined,
        policy,
      ),
    )
  }
  const exactMember = raw.find((row) => row.name === staff.name && row.source === staff.source)
  if (!exactMember) throw new Error('Missing Wooden Staff rules')
  const withdrawn = raw.filter((row) => row.name !== 'Druidic Focus' || row.source !== 'XPHB')
  for (const rules of [withdrawn, [...raw, exactMember]]) {
    const pending = choose(initial, 'a', rules)
    expect(pending.equipment.find((row) => row.id === staff.id)).toEqual(staff)
    expect(
      pending.startingEquipmentGrants?.class?.items.find((row) => row.equipmentId === staff.id),
    ).toEqual(lot)
    expect(choose(pending, 'a').equipment.find((row) => row.id === staff.id)).toEqual(staff)
  }
  const declared = cls.startingEquipment as {
    defaultData: Array<{ A: unknown[]; B: unknown[] }>
    entries: string[]
  }
  const [originalBlock] = declared.defaultData
  const lostSlot = {
    ...cls,
    startingEquipment: {
      ...declared,
      defaultData: [{ ...originalBlock, A: originalBlock.A.filter((_, index) => index !== 3) }],
    },
  }
  const lostPackage = { ...cls, startingEquipment: undefined }
  for (const missing of [lostSlot, lostPackage]) {
    const policy = createStartingEquipmentPolicy(
      initial,
      { ...missing, kind: 'class' },
      missing.startingEquipment,
      raw,
    )
    const pkg = resolveClassEquipmentBlocks(missing.startingEquipment, itemLookup, {}, policy)[0]
      .options.a
    expect(pkg.issues).toContain('Restore the exact Wooden Staff starting focus rules.')
    expect(pkg.items.some((row) => row.name === 'Wooden Staff')).toBe(false)
    const pending = apply(
      initial,
      applyClassSelectionCommand(initial, initial.provenance, missing, undefined, itemLookup),
    )
    expect(pending.equipment.find((row) => row.id === staff.id)).toEqual(staff)
  }
  for (const insertion of ['except ', '{@item Druidic Focus|PHB}, ']) {
    const conflict = {
      ...declared,
      entries: declared.entries.map((line) =>
        line.replace('{@item Druidic Focus|XPHB|', `${insertion}{@item Druidic Focus|XPHB|`),
      ),
    }
    const policy = createStartingEquipmentPolicy(empty, { ...cls, kind: 'class' }, conflict, raw)
    const pkg = resolveClassEquipmentBlocks(conflict, itemLookup, {}, policy)[0].options.a
    expect(pkg.issues).toContain('Restore the exact Wooden Staff starting focus rules.')
    expect(pkg.items.some((row) => row.name === 'Wooden Staff')).toBe(false)
  }
  const bothMissing = {
    ...lostSlot,
    startingEquipment: { ...lostSlot.startingEquipment, entries: [] },
  }
  const stalePolicy = createStartingEquipmentPolicy(
    empty,
    { ...bothMissing, kind: 'class' },
    bothMissing.startingEquipment,
    raw,
  )
  const reissued = apply(
    initial,
    applyClassEquipmentChoiceCommand(
      initial,
      initial.provenance,
      bothMissing,
      0,
      'a',
      itemLookup,
      undefined,
      stalePolicy,
    ),
  )
  expect(reissued.equipment.find((row) => row.id === staff.id)).toEqual(staff)
  const noA = {
    ...cls,
    startingEquipment: { ...declared, defaultData: [{ ...originalBlock, A: [] }] },
  }
  const onB = choose(initial, 'b')
  expect(() =>
    applyClassEquipmentChoiceCommand(onB, onB.provenance, noA, 0, 'a', itemLookup),
  ).toThrow('Restore the exact starting equipment rules before switching packages.')
  const consumed = apply(
    initial,
    updateEquipmentQuantityCommand(initial, initial.provenance, staff.id, 0),
  )
  expect(choose(consumed, 'a').equipment.some((row) => row.id === staff.id)).toBe(false)
  expect(choose(initial, 'b').equipment.some((row) => row.id === staff.id)).toBe(false)
  expect(choose(initial, 'b').currency).toEqual(gp(55))
})
